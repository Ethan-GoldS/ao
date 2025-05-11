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

  // Create a simple proxy server with minimal options
  const proxy = httpProxy.createProxyServer({
    secure: true,
    changeOrigin: true,
    xfwd: true,
    followRedirects: true,
    proxyTimeout: 30000
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
  const withRevProxyHandler = ({ processIdFromRequest }) => {
    return compose(
      withErrorHandler,
      always(async (req, res) => {
        const processId = await processIdFromRequest(req)

        if (!processId) return res.status(404).send({ error: 'Process id not found on request' })

        async function revProxy ({ failoverAttempt, err }) {
          // Determine target host with failover support
          const host = await determineHost({ processId, failoverAttempt })

          return new Promise((resolve, reject) => {
            // Check if we've exhausted all hosts
            if (!host) {
              _logger('Exhausted all failover attempts for process %s', processId)
              return reject(err || new Error('No available hosts'))
            }

            // Log the proxy attempt
            _logger('Proxying to %s for process %s', host, processId)

            // Setup proxy options - keep it simple
            const proxyOptions = { 
              target: host,
              secure: true
            }

            // Apply HTTPS agent for secure connections
            if (host.startsWith('https://')) {
              proxyOptions.agent = httpsAgent
            }

            // Start time for metrics
            const startTime = Date.now()

            // Prepare metrics data object
            const metricsData = {
              processId,
              method: req.method,
              path: req.path || req.url,
              host
            }

            // Extract request details for metrics
            if (req.body && req.body.Tags) {
              try {
                const actionTag = req.body.Tags.find(t => t.name === 'Action')
                if (actionTag) metricsData.action = actionTag.value
              } catch (e) {
                // Ignore parsing errors
              }
            }

            // Execute the proxy request
            proxy.web(req, res, proxyOptions, (err) => {
              // Calculate response time
              const responseTime = Date.now() - startTime

              if (err) {
                // Log error details
                _logger('Proxy error: %s, code: %s', err.message, err.code || 'unknown')

                // Record error metrics
                metricsService.recordRequest({
                  ...metricsData,
                  error: err.message,
                  statusCode: 502,
                  responseTime,
                  timestamp: startTime
                })

                // Try next host
                return resolve(() => revProxy({ 
                  failoverAttempt: failoverAttempt + 1, 
                  err 
                }))
              }

              // Record successful metrics
              metricsService.recordRequest({
                ...metricsData,
                statusCode: res.statusCode || 200,
                responseTime,
                timestamp: startTime
              })

              // Success - we're done
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
