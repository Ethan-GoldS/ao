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
    if (req.path === '/dashboard' || req.path.startsWith('/new-dashboard')) {
      return next()
    }

    // Get process ID from query params
    const processId = req.query['process-id'] || null;
    
    // Get proper client IP
    const clientIp = getClientIp(req);
    
    // Safely capture raw request data including headers and other metadata
    let rawRequestData = null;
    let capturedBody = null; // For storing the actual request body/payload
    
    try {
      // Create a copy of important request data for metrics
      rawRequestData = JSON.stringify({
        headers: req.headers,
        method: req.method,
        url: req.url,
        query: req.query,
        timestamp: new Date().toISOString()
      });
      
      // The trick: For POST and PUT requests, we want to capture the body
      // but without disrupting the proxy functionality
      if ((req.method === 'POST' || req.method === 'PUT') && 
          req.headers['content-type'] && 
          req.headers['content-type'].includes('application/json')) {
          
        // Create a buffer to collect chunks of the request body
        const chunks = [];
        
        // Listen to data events to collect body chunks without consuming the stream
        req.on('data', chunk => {
          chunks.push(chunk);
        });
        
        // When the entire body has been received
        req.on('end', () => {
          try {
            // Convert the buffer to a string
            const bodyString = Buffer.concat(chunks).toString();
            
            // Try to parse as JSON
            try {
              capturedBody = JSON.parse(bodyString);
              
              // Update metrics with the captured body asynchronously
              // This won't block the request processing
              if (capturedBody) {
                _logger('Successfully captured request body for metrics: %s', processId);
                
                // Store the captured body in our metrics system
                recordRequestDetails({
                  processId,
                  timestamp: new Date().toISOString(),
                  requestBody: bodyString,
                  rawBody: JSON.stringify({
                    ...JSON.parse(rawRequestData),
                    body: capturedBody
                  })
                });
              }
            } catch (jsonErr) {
              _logger('Could not parse request body as JSON: %s', jsonErr.message);
              capturedBody = bodyString;
            }
          } catch (bodyErr) {
            _logger('Error processing request body: %s', bodyErr.message);
          }
        });
      }
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
        let responseData = null;
        let responseRaw = null;
        
        // Try to capture and parse response body
        if (args[0] && typeof args[0] === 'string') {
          // Store the raw response text
          responseRaw = args[0];
          
          try {
            // Try to parse as JSON
            responseData = JSON.parse(args[0]);
            
            // Look for Action tag in various locations
            if (responseData.Tags) {
              const actionTag = responseData.Tags.find(tag => 
                tag.name === 'Action' || tag.Name === 'Action' || 
                tag.value === 'Action' || tag.Value === 'Action'
              );
              if (actionTag) {
                action = actionTag.value || actionTag.Value;
              }
            }
            
            // Look for Action in Messages
            if (!action && responseData.Messages && Array.isArray(responseData.Messages)) {
              // Try to extract action from first message
              const firstMsg = responseData.Messages[0];
              if (firstMsg && firstMsg.Tags) {
                const msgActionTag = firstMsg.Tags.find(tag => 
                  tag.name === 'Action' || tag.Name === 'Action'
                );
                if (msgActionTag) {
                  action = msgActionTag.value || msgActionTag.Value;
                }
              }
            }
        
            // Look for action directly in the object
            if (!action && (responseData.Action || responseData.action)) {
              action = responseData.Action || responseData.action;
            }
          } catch (e) {
            // Silent catch - don't affect proxy
            _logger('Could not parse response as JSON: %s', e.message);
          }
        }
        
        // Try to extract action from URL or path if not found in response
        if (!action && req.path) {
          // Extract action from path parts
          const pathParts = req.path.split('/');
          if (pathParts.length > 0) {
            // Use the last meaningful part of the path
            const lastPart = pathParts[pathParts.length - 1];
            if (lastPart && lastPart !== 'dry-run') {
              action = lastPart;
            }
          }
        }
        
        // Create a comprehensive metadata record with everything we know
        const metadataRecord = {
          ...tracking,
          processId, // Ensure processId is correctly passed
          duration,
          action: action || 'unknown',
          // Include enhanced metadata about the request/response
          metadata: {
            request: {
              headers: req.headers,
              method: req.method,
              url: req.url,
              path: req.path,
              query: req.query
            },
            response: {
              statusCode: res.statusCode,
              statusMessage: res.statusMessage,
              headers: res._headers || {}
            }
          },
          // Add the response body if we have it
          responseBody: responseRaw
        };
        
        // Update metrics with duration and captured body
        finishTracking(metadataRecord, action);
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
