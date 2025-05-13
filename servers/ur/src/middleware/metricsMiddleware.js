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
    let rawBodyBuffer = null;
    
    try {
      // Create a copy of important request data for metrics
      rawRequestData = JSON.stringify({
        headers: req.headers,
        method: req.method,
        url: req.url,
        query: req.query,
        timestamp: new Date().toISOString()
      });
      
      // NEW APPROACH: Capture request body without consuming the stream
      // This uses a non-invasive technique to copy request data
      if ((req.method === 'POST' || req.method === 'PUT') && 
          req.headers['content-type']?.includes('application/json')) {
        
        // Set up a data buffer to collect chunks
        let chunks = [];
        let totalLength = 0;
        
        // Original request handlers
        const originalOn = req.on;
        const originalAddListener = req.addListener;
        
        // Override on/addListener methods to spy on data without consuming it
        function spyOn(eventName, listener) {
          if (eventName === 'data' || eventName === 'end') {
            // Create wrapper that allows us to peek at the data
            const wrapper = function(chunk) {
              if (eventName === 'data' && chunk) {
                // Make a copy of the chunk
                const copy = Buffer.from(chunk);
                chunks.push(copy);
                totalLength += copy.length;
              } else if (eventName === 'end') {
                // Process collected data when the request ends
                try {
                  if (totalLength > 0) {
                    rawBodyBuffer = Buffer.concat(chunks, totalLength);
                    const bodyString = rawBodyBuffer.toString('utf-8');
                    
                    // Try to parse as JSON
                    if (bodyString.trim().startsWith('{')) {
                      try {
                        capturedBody = JSON.parse(bodyString);
                        
                        // Update the rawRequestData with the captured body
                        const rawDataObj = JSON.parse(rawRequestData);
                        rawDataObj.body = capturedBody;
                        rawRequestData = JSON.stringify(rawDataObj);
                        
                        // Store raw body for later use
                        req._rawBodyForMetrics = bodyString;
                        req._parsedBodyForMetrics = capturedBody;
                        
                        _logger('Successfully captured request body for metrics');
                      } catch (jsonErr) {
                        _logger('Error parsing request body as JSON: %s', jsonErr.message);
                        req._rawBodyForMetrics = bodyString;
                      }
                    }
                  }
                } catch (e) {
                  _logger('Error processing captured request body: %s', e.message);
                }
              }
              
              // Always call the original listener
              return listener.apply(this, arguments);
            };
            
            // Call the original method with our wrapper
            return originalOn.call(req, eventName, wrapper);
          } else {
            // For other events, use the original behavior
            return originalOn.call(req, eventName, listener);
          }
        }
        
        // Install our spy methods
        req.on = spyOn;
        req.addListener = spyOn;
      }
      
      // Set a flag to indicate we're capturing metrics
      req._captureBodyForMetrics = true;
    } catch (err) {
      _logger('Error capturing raw request data: %O', err);
    }
    
    // Prepare initial request details (but don't store yet to avoid duplicate entries)
    // We'll store the complete record after the request is processed
    const initialDetails = {
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
    
    // IMPORTANT: Not recording metrics here anymore to avoid duplicate/incomplete entries
    // Instead, we'll only store a complete record at the end of the request
    _logger('Tracking started for request to %s, processId: %s', req.path, processId);
    
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
        
        // Get previously captured request body if available
        if (req._parsedBodyForMetrics) {
          requestBodyData = req._parsedBodyForMetrics;
        } else if (req._rawBodyForMetrics) {
          // Try to parse the raw body if we have it
          try {
            requestBodyData = JSON.parse(req._rawBodyForMetrics);
          } catch (e) {
            requestBodyData = req._rawBodyForMetrics;
          }
        }
        
        // Extract response data
        if (args[0] && typeof args[0] === 'string') {
          // Store the raw response text
          responseRaw = args[0];

          try {
            // Try to parse the response as JSON
            responseData = JSON.parse(args[0]);

            // If we didn't get request body earlier, try extracting it from response
            // The requestBody is often echoed in the response
            if (!requestBodyData && responseData && req.path && req.path.includes('dry-run')) {
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
        
        // Extract messageId and action from URL or path
        let messageId = null;
        if (req.path) {
          // Extract action from path parts
          const pathParts = req.path.split('/');
          if (pathParts.length > 1) {
            // Check if this is a result request with a message ID
            if (pathParts.includes('result') && pathParts.length > pathParts.indexOf('result') + 1) {
              // Get the message ID which follows 'result' in the path
              const messageIdIndex = pathParts.indexOf('result') + 1;
              if (messageIdIndex < pathParts.length) {
                messageId = pathParts[messageIdIndex];
                action = 'result'; // Set the action to 'result' not the message ID
              }
            }
            // If no action found yet, and not a result request, use the last path segment as action
            else if (!action && pathParts.length > 0) {
              const lastPart = pathParts[pathParts.length - 1];
              if (lastPart && lastPart !== 'dry-run') {
                action = lastPart;
              } else if (pathParts.includes('dry-run')) {
                action = 'dry-run';
              }
            }
          }
        }
        
        // Create an enhanced raw request data object with all available information
        let enhancedRawData = tracking.rawBody;
        // First use directly captured request body if available
        if (req._parsedBodyForMetrics || req._rawBodyForMetrics || requestBodyData) {
          try {
            // Add all data we have to our raw data object
            const rawDataObj = JSON.parse(rawRequestData);
            
            // Add the body data we've collected
            if (req._parsedBodyForMetrics) {
              rawDataObj.body = req._parsedBodyForMetrics;
            } else if (requestBodyData) {
              rawDataObj.body = requestBodyData;
            } else if (req._rawBodyForMetrics && typeof req._rawBodyForMetrics === 'string') {
              // Try to parse or use as string
              try {
                if (req._rawBodyForMetrics.trim().startsWith('{')) {
                  rawDataObj.body = JSON.parse(req._rawBodyForMetrics);
                } else {
                  rawDataObj.rawBodyText = req._rawBodyForMetrics;
                }
              } catch (parseErr) {
                rawDataObj.rawBodyText = req._rawBodyForMetrics;
              }
            }
            
            // Include full response data if available - this is useful for debugging
            if (responseData) {
              rawDataObj.responseData = responseData;
            } else if (responseRaw) {
              rawDataObj.responseRaw = responseRaw.substring(0, 1000); // Limit size
            }
            
            enhancedRawData = JSON.stringify(rawDataObj);
            _logger('Enhanced raw data created with request and response information');
          } catch (e) {
            _logger('Error enhancing raw request data: %s', e.message);
          }
        }
        
        // Extract action from request body if possible
        if (!action && requestBodyData) {
          try {
            // Try to extract action from Tags in the request body
            if (requestBodyData.Tags && Array.isArray(requestBodyData.Tags)) {
              const actionTag = requestBodyData.Tags.find(tag => 
                (tag.name === 'Action' || tag.Name === 'Action') ||
                (tag.name?.toLowerCase() === 'action' || tag.Name?.toLowerCase() === 'action')
              );
              if (actionTag) {
                action = actionTag.value || actionTag.Value;
                _logger('Successfully extracted action %s from request body Tags', action);
              }
            }
          } catch (e) {
            _logger('Error extracting action from request body: %s', e.message);
          }
        }
        
        // Record detailed diagnostics for debugging this issue
        _logger('Completing metrics for processId %s, duration %dms, action %s, bodySize %d bytes', 
          processId, 
          duration, 
          action || 'unknown',
          requestBodyData ? JSON.stringify(requestBodyData).length : 0
        );
        
        // Create a comprehensive metadata record with everything we know
        const metadataRecord = {
          ...initialDetails, // Include all fields from initial details
          ...tracking,       // Include tracking data
          processId,         // Ensure processId is correctly passed
          duration,          // Include the calculated duration
          action: action || 'unknown',
          messageId,         // Include the message ID if present
          // Add timing details for debugging
          timing: {
            startTime: tracking.startTime,
            endTime: Date.now(),
            calculatedDuration: duration,
            timeReceived: initialDetails.timestamp,
            timeCompleted: new Date().toISOString()
          },
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
        
        // ONLY record metrics here, at the end of the request processing
        // This eliminates the duplicate/incomplete entries with 0ms duration
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
