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

  // Configure a simple HTTPS agent for secure connections
  const httpsAgent = new https.Agent({
    keepAlive: true,
    rejectUnauthorized: true, // Properly verify SSL certificates
    timeout: 15000 // 15 second socket timeout
  })

  // Create a very simple proxy server with minimal options
  const proxy = httpProxy.createProxyServer({
    // Core options needed for HTTPS proxying
    secure: true,
    changeOrigin: true,
    xfwd: true,
    followRedirects: true,
    // Set reasonable timeouts
    proxyTimeout: 30000,
    // Use our secure agent for HTTPS connections
    agent: httpsAgent
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
          // Let http-proxy handle the streaming directly
          const buffer = undefined

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
            
            // Record start time for metrics
            const requestStartTime = Date.now()
            
            // Configure proxy options with minimal settings to avoid complications
            const proxyOptions = { 
              target: host,
              secure: true
            }
            
            // For HTTPS targets, ensure proper TLS
            if (host.startsWith('https://')) {
              proxyOptions.agent = httpsAgent
              _logger('Using secure HTTPS options for proxying to %s', host)
            }
            
            // Create metrics data object
            const metricsData = {
              method: req.method,
              path: req.path || req.url,
              endpoint: req.method + ' ' + (req.path || req.url),
              processId,
              query: req.query,
              timestamp: requestStartTime
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
            
            // Execute the proxy request with basic error handling
            proxy.web(req, res, proxyOptions, (err) => {
              const responseTime = Date.now() - requestStartTime
              
              if (err) {
                _logger('Proxy error for %s: %s', processId, err.message)
                
                // Record error in metrics
                metricsService.recordRequest({
                  method: req.method,
                  path: req.path || req.url,
                  processId,
                  error: err.message,
                  statusCode: 502,
                  responseTime,
                  timestamp: requestStartTime
                })
                
                // Try next host in failover chain
                return resolve(() => revProxy({ failoverAttempt: failoverAttempt + 1, err }))
              }
              
              // Record successful request in metrics
              metricsService.recordRequest({
                method: req.method,
                path: req.path || req.url,
                processId,
                statusCode: res.statusCode || 200,
                responseTime,
                timestamp: requestStartTime
              })
              
              // Successfully completed proxy - resolve the promise
              return resolve()
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
