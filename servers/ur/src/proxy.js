import { always, compose } from 'ramda'
/**
 * See https://github.com/http-party/node-http-proxy/pull/1559
 * the PR that fixes the memory was not merged, so a fork
 * was created with the fix
 */
import httpProxy from 'http-proxy-node16'
import https from 'https'

/**
 * TODO: we could inject these, but just keeping simple for now
 */
import { determineHostWith, bailoutWith } from './domain.js'
import { logger } from './logger.js'
import { metricsService } from './metrics.js'

import { mountRoutesWithByAoUnit } from './routes/byAoUnit.js'

export function proxyWith ({ aoUnit, hosts, surUrl, processToHost, ownerToHost }) {
  const _logger = logger.child('proxy')
  _logger('Configuring to reverse proxy ao %s units...', aoUnit)

  // Create a custom HTTPS agent that properly verifies certificates with timeouts
  const httpsAgent = new https.Agent({
    keepAlive: true,
    rejectUnauthorized: true, // Properly verify SSL certificates
    timeout: 8000, // 8 second socket timeout
    keepAliveMsecs: 1000 // Keep-alive ping time
  })

  // Configure the proxy server with secure TLS/HTTPS options
  const proxy = httpProxy.createProxyServer({
    secure: true, // Verify SSL certificates
    changeOrigin: true, // Change the origin of the host header to the target URL
    agent: httpsAgent, // Use our secure agent
    xfwd: true, // Add x-forwarded headers
    proxyTimeout: 20000, // 20 second proxy timeout (increased for slow networks)
    timeout: 10000, // 10 second connection timeout
    followRedirects: true, // Follow redirects
    // Default buffer behavior can be problematic
    buffer: undefined, // Don't use default buffering
    // Don't automatically set headers that might cause conflicts
    preserveHeaderKeyCase: true,
    // Support websockets if needed
    ws: false
  })
  
  // Handle proxy errors at the global level
  proxy.on('error', (err, req, res) => {
    _logger('Global proxy error handler caught: %s', err.message)
    // Only attempt to send a response if it hasn't been sent already
    if (!res.headersSent && !res.writableEnded) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Proxy connection error', message: err.message }))
    }
  })

  const bailout = aoUnit === 'cu' ? bailoutWith({ fetch, surUrl, processToHost, ownerToHost }) : undefined
  const determineHost = determineHostWith({ hosts, bailout })

  async function trampoline (init) {
    let result = init
    /**
     * Call the next iteration, as long it is provided.
     *
     * This prevents overflowing the callback, and gives us our trampoline
     */
    while (typeof result === 'function') result = await result()
    return result
  }

  /**
   * A middleware that simply calls the next handler in the chain.
   *
   * If no errors are thrown, then this middleware simply returns the response.
   * If an error is thrown, it is caught, logged, then used to respond to the request.
   *
   * This is useful for handling thrown errors, and prevents having to call
   * next explictly. Instead, a more idiomatic thrown error can be used in subsequent handlers
   */
  const withErrorHandler = (handler) => (req, res) => {
    return Promise.resolve()
      .then(() => handler(req, res))
      .catch((err) => {
        _logger(err)
        if (res.writableEnded) return
        return res.status(err.status || 500).send(err || 'Internal Server Error')
      })
  }

  /**
   * A middleware that will reverse proxy the request to the host determined
   * by the injected business logic, using the provided proxy server instance.
   *
   * If the failoverAttempts for a request are exhausted, then simply bubble the error
   * in the response.
   */
  const withRevProxyHandler = ({ processIdFromRequest, restreamBody }) => {
    return compose(
      withErrorHandler,
      always(async (req, res) => {
        const processId = await processIdFromRequest(req)

        if (!processId) return res.status(404).send({ error: 'Process id not found on request' })

        async function revProxy ({ failoverAttempt, err }) {
          /**
           * In cases where we have to consume the request stream before proxying
           * it, we allow passing a restreamBody to get a fresh stream to send along
           * on the proxied request.
           *
           * If not needed, then this is simply set to undefined, which uses the unconsumed
           * request stream from the original request object
           *
           * See buffer option on https://www.npmjs.com/package/http-proxy#options
           */
          // We should only use restreamBody if needed and leave buffer undefined otherwise
          // http-proxy needs req to have pipe function and our Buffer object doesn't have that
          let buffer;
          if (restreamBody) {
            // Only use restreamBody if explicitly needed
            buffer = await restreamBody(req);
            _logger('Using provided restream buffer');
          } else {
            // Don't set buffer, let http-proxy use req directly
            buffer = undefined;
            _logger('Using request object directly for proxying');
          }

          const host = await determineHost({ processId, failoverAttempt })

          return new Promise((resolve, reject) => {
            /**
             * There are no more hosts to failover to -- we've tried them all
             */
            if (!host) {
              _logger('Exhausted all failover attempts for process %s. Bubbling final error', processId, err)
              return reject(err)
            }

            _logger('Reverse Proxying process %s to host %s', processId, host)
            /**
             * Reverse proxy the request to the underlying selected host.
             * If an error occurs, return the next iteration for our trampoline to invoke.
             */
            const isHttps = host.startsWith('https://')
            // Ensure content-length is set for JSON bodies
            if (req.body && req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
              const bodyStr = JSON.stringify(req.body);
              const contentLength = Buffer.byteLength(bodyStr, 'utf8');
              
              if (!req.headers['content-length'] || parseInt(req.headers['content-length']) === 0) {
                req.headers['content-length'] = contentLength.toString();
                _logger('Set content-length header to %d for JSON request', contentLength);
              }
            }
            
            const proxyOptions = { 
              target: host, 
              buffer,
              secure: true, // Properly verify SSL certificates
              changeOrigin: true, // Change the origin of the host header to the target URL
              xfwd: true, // Add x-forwarded headers
              prependPath: false, // Don't prepend the target path to the requested path
              hostRewrite: true, // Rewrite the host header to match the target
              autoRewrite: true, // Automatically rewrite the location header
              // Tell proxy to suppress connection errors on the source (client) socket
              // This prevents socket hangups when target server closes connection
              suppressErrorsOnSource: true,
              // Pass proper headers from client request
              headers: {
                // Explicit host header for target
                host: new URL(host).host,
                // Accept all content types
                accept: req.headers.accept || '*/*'
              }
            }
            
            // For HTTPS targets, ensure we're using proper TLS
            if (isHttps) {
              proxyOptions.agent = httpsAgent
              _logger('Using secure HTTPS options for proxying to %s', host)
            }
            
            // Record start time for metrics
            const startTime = Date.now()
            
            // Create metrics data object
            const metricsData = {
              method: req.method,
              path: req.path || req.url,
              endpoint: req.method + ' ' + (req.path || req.url),
              processId,
              query: req.query,
              timestamp: startTime,
            }
            
            // Extract tags and action data from request body if available
            if (req.body) {
              try {
                if (req.body.Id) metricsData.body = { id: req.body.Id, target: req.body.Target, owner: req.body.Owner }
                
                if (Array.isArray(req.body.Tags)) {
                  const actionTag = req.body.Tags.find(tag => tag.name === 'Action')
                  const addressTag = req.body.Tags.find(tag => tag.name === 'Address')
                  
                  if (actionTag) {
                    metricsData.action = actionTag.value
                  }
                  
                  if (addressTag) {
                    metricsData.address = addressTag.value
                  }
                }
              } catch (bodyErr) {
                _logger('Error parsing request body for metrics:', bodyErr)
              }
            }
            
            // Monitor proxy events for metrics
            let proxyMetricsRecorded = false
            
            const recordProxyMetrics = (statusCode = 200) => {
              if (proxyMetricsRecorded) return
              proxyMetricsRecorded = true
              
              const responseTime = Date.now() - startTime
              metricsData.responseTime = responseTime
              metricsData.statusCode = statusCode
              metricsData.targetHost = host
              
              // Record metrics
              metricsService.recordRequest(metricsData)
              _logger('Recorded metrics for process %s - %dms', processId, responseTime)
            }
            
            // Record metrics on proxy response
            const originalWrite = res.write
            const originalEnd = res.end
            
            res.write = function(data) {
              recordProxyMetrics(res.statusCode)
              return originalWrite.apply(res, arguments)
            }
            
            res.end = function(data) {
              recordProxyMetrics(res.statusCode)
              return originalEnd.apply(res, arguments)
            }
            
            proxy.web(req, res, proxyOptions, (err) => {
              /**
               * No error occurred, so we're done
               */
              if (!err) {
                // Ensure metrics are recorded in case no write/end was called yet
                recordProxyMetrics(res.statusCode)
                return resolve()
              }
              
              /**
               * Record error metrics
               */
              metricsData.error = err.message || 'Proxy error'
              metricsData.statusCode = err.statusCode || 502 // Use 502 Bad Gateway as default for proxy errors
              metricsData.errorCode = err.code
              recordProxyMetrics(metricsData.statusCode)
              
              // Log detailed error information
              _logger('Proxy error details for %s:\n  Message: %s\n  Code: %s\n  Host: %s', 
                processId, err.message, err.code, host)
                
                /**
                 * Return the thunk for our next iteration, incrementing our failoverAttempt,
                 * so the next host in the list will be used
                 */
              _logger('Error occurred for host %s and process %s', host, processId, err)
              return resolve(() => revProxy({ failoverAttempt: failoverAttempt + 1, err }))
            })
          })
        }

        /**
         * Our initial thunk that performs the first revProxy to the process' primary host.
         *
         * By using a trampoline, we sideskirt any issues with our tailcall recursion overflowing
         * the callstack, no matter how many underlying hosts exist
         */
        return trampoline(() => revProxy({ failoverAttempt: 0 }))
      })
    )()
  }

  const mountRoutesWith = mountRoutesWithByAoUnit[aoUnit]

  return (app) => {
    mountRoutesWith({ app, middleware: withRevProxyHandler })
    return app
  }
}
