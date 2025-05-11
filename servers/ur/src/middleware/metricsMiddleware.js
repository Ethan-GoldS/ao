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
      
      // For POST requests to dry-run, capture the body without consuming the stream
      if ((req.method === 'POST' || req.method === 'PUT') && 
          req.path.includes('dry-run')) {

        // Save original request data handlers to avoid interfering with the proxy
        const originalWrite = req.write;
        const originalEnd = req.end;
        
        // Create a buffer to collect data as it passes through
        const bodyChunks = [];
        
        // Create a clone of the request to capture the data without consuming it
        const reqClone = {};
        
        // Implement a data event that just watches and doesn't consume
        req.on('data', function(chunk) {
          // Add this chunk to our collection
          bodyChunks.push(chunk);
        });
        
        // When the request ends, process the body data
        req.on('end', function() {
          if (bodyChunks.length > 0) {
            try {
              // Join all the chunks to create the full body content
              const bodyBuffer = Buffer.concat(bodyChunks);
              const bodyString = bodyBuffer.toString('utf8');
              
              // Store the raw body for metrics
              capturedBody = bodyString;
              
              // Try to parse as JSON
              try {
                const bodyJson = JSON.parse(bodyString);
                
                // Update rawRequestData with the parsed body
                const updatedRawData = JSON.parse(rawRequestData);
                updatedRawData.body = bodyJson;
                rawRequestData = JSON.stringify(updatedRawData);
                
                _logger('Successfully captured request body for metrics');
              } catch (parseErr) {
                // If it's not JSON, just store the string
                _logger('Request body is not JSON: %s', parseErr.message);
              }
            } catch (bodyErr) {
              _logger('Error processing captured body chunks: %s', bodyErr.message);
            }
          }
        });
      }
      
      // Set a flag to indicate we're trying to capture the body
      req._captureBodyForMetrics = true;
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
        let requestBodyData = null;
        
        // Extract the request body from the response, since the request body may contain important metadata
        // that we couldn't safely capture earlier without breaking the proxy
        if (args[0] && typeof args[0] === 'string') {
          // Store the raw response text
          responseRaw = args[0];

          try {
            // Try to parse the response as JSON
            responseData = JSON.parse(args[0]);

            // Extract request body from the response if this is a dry-run request
            // The requestBody is often echoed in the response
            if (responseData && req.path && req.path.includes('dry-run')) {
              // Try to extract request body data
              if (responseData.Input && responseData.Input.Data) {
                requestBodyData = responseData.Input.Data;
              } else if (responseData.Body || responseData.body) {
                requestBodyData = responseData.Body || responseData.body;
              } else if (responseData.Tags && Array.isArray(responseData.Tags)) {
                // If response has Tags directly, this is likely the request echoed back
                requestBodyData = responseData;
              }
            }
            
            // Look for Action tag in various locations
            if (responseData.Tags) {
              const actionTag = responseData.Tags.find(tag => 
                (tag.name === 'Action' || tag.Name === 'Action') ||
                (tag.name?.toLowerCase() === 'action' || tag.Name?.toLowerCase() === 'action')
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
                  tag.name === 'Action' || tag.Name === 'Action' ||
                  tag.name?.toLowerCase() === 'action' || tag.Name?.toLowerCase() === 'action'
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
        
        // Create an enhanced raw request data object
        let enhancedRawData = tracking.rawBody;
        
        // First try to use any captured body data from the request phase
        if (capturedBody && (!requestBodyData || typeof requestBodyData !== 'object')) {
          try {
            // Use the directly captured body from earlier
            const rawDataObj = JSON.parse(tracking.rawBody || rawRequestData || '{}');
            
            // Try to parse the captured body if it's JSON
            try {
              const parsedBody = JSON.parse(capturedBody);
              rawDataObj.body = parsedBody;
            } catch (parseErr) {
              // If parsing fails, use the raw string
              rawDataObj.bodyRaw = capturedBody;
            }
            
            enhancedRawData = JSON.stringify(rawDataObj);
            _logger('Enhanced raw data with captured request body');
          } catch (e) {
            _logger('Error enhancing raw request data with captured body: %s', e.message);
          }
        }
        // Then fall back to request body data extracted from response
        else if (requestBodyData) {
          try {
            // Add the extracted request body to our raw data
            const rawDataObj = JSON.parse(tracking.rawBody || rawRequestData || '{}');
            rawDataObj.body = requestBodyData;
            enhancedRawData = JSON.stringify(rawDataObj);
            _logger('Enhanced raw data with body extracted from response');
          } catch (e) {
            _logger('Error enhancing raw request data: %s', e.message);
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
          // Add our enhanced raw data
          rawBody: enhancedRawData,
          // Add the full request body if we extracted it
          requestBody: requestBodyData ? JSON.stringify(requestBodyData) : undefined,
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
