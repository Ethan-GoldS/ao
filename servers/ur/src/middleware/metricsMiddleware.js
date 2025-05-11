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
    
    // Safely capture raw request data
    let rawRequestData = null;
    try {
      // Create a copy of important request data for metrics
      rawRequestData = JSON.stringify({
        headers: req.headers,
        method: req.method,
        url: req.url,
        query: req.query,
        // Don't directly access req.body as it breaks proxy
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      _logger('Error capturing raw request data: %O', err);
    }
    
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
      contentType: req.headers['content-type'] || 'unknown',
      rawBody: rawRequestData // Store raw request data
    };
    
    // Store request details for dashboard
    recordRequestDetails(requestDetails);
    
    // Start tracking request for performance metrics
    const tracking = {
      startTime: Date.now(),
      processId,
      ip: clientIp,
      rawBody: rawRequestData // Include raw request data in tracking
    };
    
    // Capture original end method to intercept when response is sent
    const originalEnd = res.end;
    
    // Override end method to collect metrics before completing the response
    res.end = function(...args) {
      try {
        // Measure request duration
        const duration = Date.now() - tracking.startTime;
        
        // Get raw action from response data if possible (advanced attempt)
        let action = null;
        try {
          // Try to get action from response, if it contains a successfully processed request
          if (args[0] && typeof args[0] === 'string' && args[0].includes('"Action"')) {
            const responseData = JSON.parse(args[0]);
            if (responseData.Tags) {
              const actionTag = responseData.Tags.find(tag => 
                tag.name === 'Action' || tag.name === 'action'
              );
              if (actionTag) action = actionTag.value;
            }
          }
        } catch (e) {
          // Silent catch - don't affect proxy
        }
        
        // Attempt to capture request body from args if available
        let requestBody = null;
        
        if (args[0] && typeof args[0] === 'string') {
          // Try to capture the body for metrics
          requestBody = args[0];
        }
        
        // Update metrics with duration and captured body
        finishTracking({
          ...tracking,
          processId, // Ensure processId is correctly passed
          duration,
          rawBody: tracking.rawBody || null,
          // Add the response body if we have it
          responseBody: requestBody
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
