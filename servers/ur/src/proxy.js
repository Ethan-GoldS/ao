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

  /**
   * Default HTTPS agent with secure settings
   */
  const httpsAgent = new https.Agent({
    keepAlive: true,
    rejectUnauthorized: true // Verify SSL certificates
  })

  /**
   * Create proxy server with default settings
   * Let the library handle most decisions by default
   */
  const proxy = httpProxy.createProxyServer()
  
  // Handle proxy errors at the global level to ensure no unhandled errors
  proxy.on('error', (err, req, res) => {
    _logger('Global proxy error: %s', err.message)
    // Only send a response if none has been sent yet
    if (!res.headersSent && !res.writableEnded) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Proxy error', message: err.message || 'Unknown error' }))
    }
  })
  
  // Listen for successful responses to capture metrics
  proxy.on('proxyRes', (proxyRes, req, res) => {
    _logger('Received response from target with status: %d', proxyRes.statusCode)
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
          // For the proxy to work correctly, avoid buffering the request
          // Let http-proxy handle the streaming directly
          const buffer = undefined;

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
            
            // Create metrics data object
            const metricsData = {
              method: req.method,
              path: req.path || req.url,
              endpoint: req.method + ' ' + (req.path || req.url),
              processId: processId,
              query: req.query,
              timestamp: requestStartTime
            }
            
            /**
             * Configure proxy options with only essential settings
             * Using a fresh options object per request to avoid cross-contamination
             */
            const proxyOptions = {
              target: host,
              changeOrigin: true,
              xfwd: true,
              // Preserve host headers and SSL settings
              secure: true,
              // Don't buffer to avoid stream issues
              buffer: undefined
            }
            
            // Add agent only for HTTPS to handle SSL correctly
            if (host.startsWith('https://')) {
              proxyOptions.agent = httpsAgent
              _logger('Using HTTPS settings for %s', host)
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
            
            /**
             * Direct proxy with minimal intervention
             * Let http-proxy do all the stream handling directly
             */
            try {
              // Set up success handler
              const onProxyComplete = function(e) {
                const responseTime = Date.now() - requestStartTime
                
                // Record metrics for success
                metricsService.recordRequest({
                  ...metricsData,
                  statusCode: res.statusCode || 200,
                  responseTime: responseTime
                })
                
                // Clean up event listener - only need it once
                proxy.removeListener('proxyRes', onProxyComplete)
                
                // Successfully completed proxy request
                resolve()
              }
              
              // Set up error handler
              const onProxyError = function(err) {
                const responseTime = Date.now() - requestStartTime
                
                _logger('Proxy error for %s: %s', processId, err.message)
                
                // Record metrics for error
                metricsService.recordRequest({
                  ...metricsData,
                  error: err.message,
                  statusCode: 502,
                  responseTime: responseTime
                })
                
                // Clean up event listener
                proxy.removeListener('error', onProxyError)
                
                // Try next host in failover chain
                resolve(() => revProxy({ failoverAttempt: failoverAttempt + 1, err }))
              }
              
              // Add one-time listeners specifically for this request
              proxy.once('proxyRes', onProxyComplete)
              proxy.once('error', onProxyError)
              
              // Forward the request
              proxy.web(req, res, proxyOptions)
            } catch (err) {
              _logger('Unexpected proxy error: %s', err.message)
              reject(err)
            }
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
