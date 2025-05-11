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
    
    // Capture original end method to intercept when response is sent
    const originalEnd = res.end
    
    // Override end method to collect metrics before completing the response
    res.end = function(...args) {
      try {
        let action = null
        
        // Try to extract action from different sources
        if (req.body && req.body.Tags) {
          action = extractAction(req.body)
        } else if (res.locals && res.locals.requestBody) {
          // For proxied requests where body might be in res.locals
          action = extractAction(res.locals.requestBody)
        }
        
        // Finish tracking and record metrics
        finishTracking(tracking, action)
      } catch (err) {
        // Never let metrics collection affect the actual response
        _logger('Error in metrics collection: %O', err)
      }
      
      // Call the original end method to complete the response
      return originalEnd.apply(this, args)
    }
    
    // For POST requests, especially /dry-run, try to capture body for action extraction
    if (req.method === 'POST' && req.body) {
      try {
        // If body is already parsed as JSON, use it
        if (typeof req.body === 'object' && req.body !== null) {
          res.locals.requestBody = req.body
        }
        // If body is a buffer, try to parse it
        else if (Buffer.isBuffer(req.body)) {
          const bodyString = req.body.toString()
          if (bodyString) {
            const bodyJson = JSON.parse(bodyString)
            // Store parsed body for metrics extraction without affecting request
            res.locals.requestBody = bodyJson
          }
        }
      } catch (err) {
        // Silently continue if body parsing fails - don't affect the request
        _logger('Error parsing request body for metrics: %O', err)
      }
    }
    
    next()
  }
}
