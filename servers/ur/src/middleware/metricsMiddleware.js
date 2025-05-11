/**
 * Metrics middleware
 * Collects metrics for all requests without affecting the proxy functionality
 */
import { metrics, processRequest } from '../metrics.js'
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
    
    // Capture request body without interfering with the request processing
    let rawBody = '';
    let jsonBody = null;
    let tags = [];
    let action = null;
    
    // Only do body capture for specific content types to avoid breaking functionality
    const shouldCaptureBody = req.headers['content-type']?.includes('application/json');
    
    if (shouldCaptureBody && processId) {
      // Save original data event listeners
      const originalListeners = req.listeners('data');
      req.removeAllListeners('data');
      
      // Add our own data listener to capture the body
      req.on('data', (chunk) => {
        // Capture up to 64kb of data
        if (rawBody.length < 65536) {
          rawBody += chunk.toString('utf8');
        }
        
        // Call original listeners with the chunk
        originalListeners.forEach(listener => listener(chunk));
      });
      
      // Save original end event listeners
      const originalEndListeners = req.listeners('end');
      req.removeAllListeners('end');
      
      // Add our own end listener to parse the body
      req.on('end', () => {
        if (rawBody) {
          try {
            jsonBody = JSON.parse(rawBody);
            
            // Extract tags and action if they exist
            if (jsonBody.Tags && Array.isArray(jsonBody.Tags)) {
              tags = jsonBody.Tags;
              
              // Find the Action tag
              const actionTag = tags.find(tag => 
                (tag.name === 'Action' || tag.Name === 'Action')
              );
              
              if (actionTag) {
                action = actionTag.value || actionTag.Value;
              }
            }
            
            _logger('Captured request with action: %s', action || 'none');
          } catch (err) {
            _logger('Error parsing request body: %O', err);
          }
        }
        
        // Call original listeners
        originalEndListeners.forEach(listener => listener());
      });
    }
    
    // Create enhanced details object
    const requestDetails = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      processId,
      ip: clientIp,
      referer: req.headers.referer || req.headers.referrer || '',
      userAgent: req.headers['user-agent'] || '',
      origin: req.headers.origin || '',
      contentType: req.headers['content-type'] || ''
    };
    
    // Store request details for dashboard
    recordRequestDetails(requestDetails);
    
    // Start tracking request for performance metrics
    const tracking = {
      startTime: Date.now(),
      processId,
      ip: clientIp
    };
    
    // Capture original end method to intercept when response is sent
    const originalEnd = res.end;
    
    // Override end method to collect metrics before completing the response
    res.end = function(...args) {
      try {
        // Measure request duration
        const duration = Date.now() - tracking.startTime;
        
        // Try to extract action from the response if not found in request
        if (!action && args[0] && typeof args[0] === 'string') {
          try {
            if (args[0].includes('"Action"') || args[0].includes('"Tags"')) {
              const responseData = JSON.parse(args[0]);
              if (responseData.Tags && Array.isArray(responseData.Tags)) {
                // Find the Action tag in response
                const respActionTag = responseData.Tags.find(tag => 
                  (tag.name === 'Action' || tag.Name === 'Action')
                );
                
                if (respActionTag) {
                  action = respActionTag.value || respActionTag.Value;
                }
              }
            }
          } catch (e) {
            // Silent catch - don't affect proxy operation
          }
        }
        
        // Enhanced request details with body and parsed data
        const fullRequestDetails = {
          ...requestDetails,
          action: action,
          tags: tags,
          rawBody: rawBody ? rawBody.substring(0, 5000) : null, // Limit size
          jsonBody: jsonBody,
          duration: duration
        };
        
        // Update metrics with all details
        finishTracking({
          ...tracking,
          processId,
          duration,
          details: fullRequestDetails
        }, action);
      } catch (err) {
        // Never let metrics collection affect the actual response
        _logger('Error in metrics collection: %O', err);
      }
      
      // Call the original end method to complete the response
      return originalEnd.apply(this, args);
    };
    
    next();
  };
}
