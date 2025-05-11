/**
 * Metrics middleware
 * Collects metrics for all requests without affecting the proxy functionality
 */
import { startTracking, finishTracking, extractAction } from '../metrics.js'
import { logger } from '../logger.js'

const _logger = logger.child('metrics-middleware')

/**
 * Create middleware to collect metrics for all requests
 */
export function metricsMiddleware() {
  return (req, res, next) => {
    // Skip tracking for dashboard requests to avoid recursion
    if (req.path === '/dashboard') {
      return next()
    }

    // Start tracking request
    const tracking = startTracking(req)
    
    // DO NOT try to access or parse req.body here as it will break proxy functionality
    
    // Capture original end method to intercept when response is sent
    const originalEnd = res.end
    
    // Override end method to collect metrics before completing the response
    res.end = function(...args) {
      try {
        // Get processId from query parameter
        const processId = req.query['process-id'] || null
        // We can't extract action directly since we can't parse the body
        // Just record the metrics with the information we have
        finishTracking({
          ...tracking,
          processId: processId // Ensure processId is correctly passed
        }, null) // We can't safely extract action
      } catch (err) {
        // Never let metrics collection affect the actual response
        _logger('Error in metrics collection: %O', err)
      }
      
      // Call the original end method to complete the response
      return originalEnd.apply(this, args)
    }
    
    // DO NOT attempt to read the request body in any way
    // as it will break the proxy functionality
    
    next()
  }
}
