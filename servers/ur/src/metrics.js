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
  
  // Parse request body if present and capture raw body as well
  let requestBody = req.body || null;
  let rawBody = null;
  
  // Capture the raw request body for debugging
  if (req.rawBody) {
    rawBody = req.rawBody.toString();
  } else if (req.body) {
    // If we have a body but no rawBody, store the original body as raw
    rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }
  
  // Handle string body (common with fetch API)
  if (requestBody && typeof requestBody === 'string') {
    try {
      // Try to parse as JSON if it looks like JSON
      if (requestBody.trim().startsWith('{') || requestBody.trim().startsWith('[')) {
        requestBody = JSON.parse(requestBody);
        _logger('Successfully parsed request body as JSON');
      }
    } catch (e) {
      _logger('Error parsing request body: %O', e);
      // If we have a raw body, try parsing that instead
      if (rawBody) {
        try {
          requestBody = JSON.parse(rawBody);
          _logger('Successfully parsed raw body as JSON');
        } catch (innerErr) {
          _logger('Error parsing raw body: %O', innerErr);
          // Keep as string if all parsing fails
        }
      }
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
    requestBody,
    rawBody
  };
}

/**
 * Finish tracking a request and record metrics
 * @param {Object} tracking Request tracking object from startTracking
 * @param {String} action Action from request
 */
export function finishTracking(tracking, action) {
  if (!tracking || !tracking.startTime) return;
  
  const duration = tracking.duration || (Date.now() - tracking.startTime);
  const timeCompleted = new Date().toISOString();
  const { processId } = tracking;
  
  if (!processId) return;
  
  // Create a complete metrics record
  const metricsRecord = {
    ...tracking,
    action,
    duration,
    timeCompleted
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
