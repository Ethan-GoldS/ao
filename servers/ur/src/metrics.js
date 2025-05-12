/**
 * Metrics service for the AO Router
 * Tracks request metrics using PostgreSQL database
 * Captures detailed request information including process ID, IP, referrer, 
 * request body, action, and timing data
 */
import { logger } from './logger.js'
import { config } from './config.js'
import { initializeDatabase } from './database/db.js'
import { storeMetrics, getAllMetrics } from './database/metricsService.js'

const _logger = logger.child('metrics')

// Initialize the database
initializeDatabase()
  .then(() => _logger('PostgreSQL metrics database initialized'))
  .catch(err => _logger('Error initializing PostgreSQL metrics database: %O', err))


// No in-memory metrics storage anymore - using PostgreSQL for persistent storage

/**
 * Extract action from request body tags
 * @param {Object} body Request body
 * @returns {String|null} Action or null if not found
 */
export function extractAction(body) {
  try {
    // Handle null or undefined body
    if (!body) return null;
    
    // Parse the body if it's a string
    const parsedBody = typeof body === 'string' ? JSON.parse(body) : body;
    
    // Case 1: Check for Tags array with Action (common AO format)
    if (parsedBody?.Tags && Array.isArray(parsedBody.Tags)) {
      const actionTag = parsedBody.Tags.find(tag => 
        tag.name === 'Action' || tag.Name === 'Action'
      );
      
      if (actionTag) {
        return actionTag.value || actionTag.Value || null;
      }
    }
    
    // Case 2: Check for direct 'Action' property
    if (parsedBody?.Action || parsedBody?.action) {
      return parsedBody.Action || parsedBody.action;
    }
    
    // Case 3: Check for Data.Action pattern
    if (parsedBody?.Data?.Action || parsedBody?.data?.action) {
      return parsedBody.Data?.Action || parsedBody.data?.action;
    }
    
    // Case 4: Check in Input field (sometimes used in AO processes)
    if (parsedBody?.Input?.Action || parsedBody?.input?.action) {
      return parsedBody.Input?.Action || parsedBody.input?.action;
    }
    
    // Case 5: Look for function property which is often the action
    if (parsedBody?.function) {
      return parsedBody.function;
    }
    
    // Case 6: If Tags exist but no specific Action tag, use first Tag's name as action
    if (parsedBody?.Tags && Array.isArray(parsedBody.Tags) && parsedBody.Tags.length > 0) {
      const firstTag = parsedBody.Tags[0];
      return firstTag.name || firstTag.Name || null;
    }
    
    // Last resort: look for any property that might indicate an action
    const actionIndicators = ['type', 'method', 'op', 'operation', 'command'];
    for (const indicator of actionIndicators) {
      if (parsedBody[indicator]) {
        return parsedBody[indicator];
      }
    }
    
    return null;
  } catch (err) {
    _logger('Error extracting action from body: %O', err);
    return null;
  }
}

/**
 * Record detailed information about a request
 * @param {Object} details Request details object
 */
export function recordRequestDetails(details) {
  if (!details || !details.processId) {
    _logger('Invalid request details for metrics storage');
    return;
  }
  
  // Store metrics in PostgreSQL database
  storeMetrics(details)
    .then(success => {
      if (success) {
        _logger('Recorded request details for process %s', details.processId);
      } else {
        _logger('Failed to store metrics for process %s', details.processId);
      }
    })
    .catch(err => {
      _logger('Error storing metrics: %O', err);
    });
}

/**
 * Get a consistent timestamp
 * @param {Date|String} date - Date object or ISO string
 * @returns {Date} Date object
 */
function normalizeTimestamp(date) {
  return typeof date === 'string' ? new Date(date) : date;
}

// Second extractAction function removed - was a duplicate

/**
 * Start tracking a request
 * @param {Object} req Express request object
 * @returns {Object} Request tracking object with start time
 */
export function startTracking(req) {
  // Extract process ID from query string or URL path
  const processId = req.query['process-id'] || 
    (req.path.match(/process-id=([^&]+)/) || [])[1] || 
    null;
  
  // Parse request body if present
  let requestBody = req.body || null;
  if (requestBody && typeof requestBody === 'string' && requestBody.trim().startsWith('{')) {
    try {
      requestBody = JSON.parse(requestBody);
    } catch (e) {
      // Keep as string if parsing fails
    }
  }
  
  return {
    startTime: Date.now(),
    timeReceived: new Date().toISOString(),
    processId,
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown',
    referer: req.headers.referer || req.headers.referrer || 'unknown',
    origin: req.headers.origin || 'unknown',
    contentType: req.headers['content-type'] || 'unknown',
    requestBody
  };
}

/**
 * Finish tracking a request and record metrics
 * @param {Object} tracking Request tracking object from startTracking
 * @param {String} action Action from request
 */
export function finishTracking(tracking, action) {
  // Enhanced validation with diagnostic logging
  if (!tracking) {
    _logger('ERROR: finishTracking called with null tracking object');
    return;
  }
  
  if (!tracking.startTime) {
    _logger('ERROR: finishTracking called with missing startTime, tracking=%j', 
      Object.keys(tracking).reduce((obj, key) => {
        obj[key] = typeof tracking[key] === 'object' ? '[Object]' : tracking[key];
        return obj;
      }, {}));
    return;
  }
  
  const { processId, path, method } = tracking;
  if (!processId) {
    _logger('ERROR: Skipping metrics for missing processId, path=%s', path || 'unknown');
    return;
  }
  
  const endTime = Date.now();
  const startTime = tracking.startTime;
  let duration = tracking.duration;
  
  // Use provided duration or calculate with timeout protection
  if (duration === undefined) {
    // Implement timeout protection similar to other components
    const calculatedDuration = endTime - startTime;
    
    // Apply safeguards and detect abnormal timing
    if (calculatedDuration <= 0) {
      _logger('WARNING: Calculated duration is 0ms for process %s (path: %s), using fallback', 
        processId, path || 'unknown');
      duration = 1; // Minimum 1ms fallback (similar to timeout handling in other modules)
    } else if (calculatedDuration > 15000) { // 15 seconds matches the timeout pattern in your other modules
      _logger('WARNING: Request took unusually long: %dms for %s, method=%s, path=%s', 
        calculatedDuration, processId, method || 'unknown', path || 'unknown');
      duration = calculatedDuration;
    } else {
      duration = calculatedDuration;
    }
  }
  
  // Log detailed timing information for diagnostics
  _logger('TIMING: process=%s, start=%d, end=%d, duration=%dms, path=%s, action=%s', 
    processId, startTime, endTime, duration, path || 'unknown', action || 'unknown');
  
  const timeCompleted = new Date().toISOString();
  
  // Final tracking ID to prevent creating duplicate records
  const trackingId = `${processId}-${path || ''}-${action || 'unknown'}-${startTime}`;
  
  // Track this record in memory to prevent duplicate submissions
  // This is in addition to the database-level check
  if (global._metricsTrackingCache === undefined) {
    global._metricsTrackingCache = new Map();
    
    // Set up cleanup
    setInterval(() => {
      if (global._metricsTrackingCache) {
        const now = Date.now();
        global._metricsTrackingCache.forEach((timestamp, key) => {
          // Clean up entries older than 1 minute
          if (now - timestamp > 60000) {
            global._metricsTrackingCache.delete(key);
          }
        });
      }
    }, 300000); // Clean every 5 minutes
  }
  
  // Check if we've already recorded this specific tracking event
  if (global._metricsTrackingCache.has(trackingId)) {
    _logger('Preventing duplicate record for tracking ID %s (already recorded)', trackingId);
    return;
  }
  
  // Mark as recorded
  global._metricsTrackingCache.set(trackingId, Date.now());
  
  // Create a complete metrics record
  const metricsRecord = {
    ...tracking,
    action,
    duration,
    timeCompleted,
    // Ensure raw body is included in metrics record
    rawBody: tracking.rawBody || null,
    // Include response data if available
    responseBody: tracking.responseBody || null
  };
  
  // Store metrics in PostgreSQL
  recordRequestDetails(metricsRecord);
  
  _logger('Recorded metrics for process %s, action %s, duration %dms', processId, action, duration);
}

/**
 * Get all metrics for dashboard display
 * @returns {Promise<Object>} All metrics
 */
export async function getMetrics() {
  try {
    // Use the PostgreSQL metrics service to fetch all metrics
    return await getAllMetrics();
  } catch (err) {
    _logger('Error getting metrics: %O', err);
    return {
      recentRequests: [],
      requestDetails: {},
      processCounts: {},
      processTiming: {},
      actionCounts: {},
      actionTiming: {},
      ipCounts: [],
      referrerCounts: [],
      timeSeriesData: [],
      timeLabels: [],
      topProcessIds: [],
      totalRequests: 0,
      startTime: new Date().toISOString()
    };
  }
}
