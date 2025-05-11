/**
 * Metrics middleware
 * Collects metrics for all requests without affecting the proxy functionality
 */
import { startTracking, finishTracking, extractAction, recordRequestDetails } from '../metrics.js'
import { logger } from '../logger.js'

const _logger = logger.child('metrics-middleware')

/**
 * Get the real client IP address from request
 */
function getClientIp(req) {
  // Check for proxy headers first
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    // Get the first IP in the list which is the client's IP
    const ips = xForwardedFor.split(',').map(ip => ip.trim());
    return ips[0];
  }
  
  // Get from req.ip but remove IPv6 prefix if present
  if (req.ip) {
    return req.ip.replace(/^::ffff:/, '');
  }
  
  // Fallback to remote address
  return req.connection?.remoteAddress?.replace(/^::ffff:/, '') || 'unknown';
}

/**
 * Create middleware to collect metrics for all requests
 */
export function metricsMiddleware() {
  return (req, res, next) => {
    // Skip tracking for dashboard requests to avoid recursion
    if (req.path === '/dashboard') {
      return next()
    }

    // Get process ID from query params
    const processId = req.query['process-id'] || null;
    
    // Get proper client IP
    const clientIp = getClientIp(req);
    
    // Record basic request details immediately (without parsing body)
    const requestDetails = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      processId,
      ip: clientIp,
      referer: req.headers.referer || req.headers.referrer || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      origin: req.headers.origin || 'unknown',
      contentType: req.headers['content-type'] || 'unknown'
    };
    
    // Store request details for dashboard
    recordRequestDetails(requestDetails);
    
    // Try to extract action from request body (if it exists)
    let action = null;
    if (req.body) {
      action = extractAction(req.body);
    }
    
    // Store the action in requestDetails if available
    if (action) {
      requestDetails.action = action;
    }
    
    // Start tracking request for performance metrics
    const tracking = {
      startTime: Date.now(),
      processId,
      ip: clientIp,
      action // Store extracted action in tracking object
    };
    
    // Capture original end method to intercept when response is sent
    const originalEnd = res.end;
    
    // Override end method to collect metrics before completing the response
    res.end = function(...args) {
      try {
        // Measure request duration
        const duration = Date.now() - tracking.startTime;
        
        // If we haven't found an action yet, try to get it from response data
        if (!action && args[0] && typeof args[0] === 'string') {
          try {
            // Parse response JSON if possible
            if (args[0].includes('"Action"') || args[0].includes('"Tags"')) {
              const responseData = JSON.parse(args[0]);
              action = extractAction(responseData);
            }
          } catch (e) {
            // Silent catch - don't affect proxy
          }
        }
        
        // Update metrics with duration
        finishTracking({
          ...tracking,
          processId, // Ensure processId is correctly passed
          duration
        }, action);
      } catch (err) {
        // Never let metrics collection affect the actual response
        _logger('Error in metrics collection: %O', err);
      }
      
      // Call the original end method to complete the response
      return originalEnd.apply(this, args);
    };
    
    // DO NOT attempt to read the request body directly
    // as it will break the proxy functionality
    
    next();
  };
}
