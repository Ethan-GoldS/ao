/**
 * Metrics service for the AO Router
 * Tracks request metrics using PostgreSQL database
 * Captures detailed request information including process ID, IP, referrer, 
 * request body, action, and timing data
 */
import { logger } from './logger.js'
import { config } from './config.js'
import { initializeDatabase } from './database/db.js'
// Use the new metricsServiceV2 with improved structure for dry runs and results with messageID tracking
import * as legacyMetricsService from './database/metricsService.js'
import * as metricsServiceV2 from './database/metricsServiceV2.js'

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
  
  // Check if this is a 'meaningful' metrics record with proper duration
  const hasDuration = typeof details.duration === 'number' && details.duration > 0;
  const hasRequestBody = details.requestBody || 
                        (details.rawBody && details.rawBody.includes('body'));
                        
  // Log detailed diagnostics to track the issue
  _logger('Recording metrics for process %s: duration=%dms, hasBody=%s, action=%s', 
    details.processId,
    details.duration || 0,
    hasRequestBody ? 'yes' : 'no',
    details.action || 'unknown'
  );
  
  // If timing is available, log it for troubleshooting
  if (details.timing) {
    _logger('Timing details: start=%d, end=%d, calculated=%d', 
      details.timing.startTime,
      details.timing.endTime,
      details.timing.calculatedDuration
    );
  }
  
  // Store metrics in PostgreSQL database using the new structure
  // First try the new V2 service
  metricsServiceV2.storeMetrics(details).catch(err => {
    _logger('Error storing metrics in PostgreSQL V2: %O', err);
    
    // Fall back to legacy service if V2 fails
    legacyMetricsService.storeMetrics(details).catch(legacyErr => {
      _logger('Error storing metrics in legacy PostgreSQL: %O', legacyErr);
    });
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
  if (!tracking || !tracking.startTime) {
    _logger('Skipping metrics for invalid tracking data');
    return;
  }
  
  let duration = tracking.duration || (Date.now() - tracking.startTime);
  // Ensure we never have a 0ms duration - this indicates a timing issue
  if (duration <= 0) {
    _logger('Detected 0ms duration, setting to minimum of 1ms');
    duration = 1; // Minimum duration of 1ms to avoid confusion
  }
  
  const timeCompleted = new Date().toISOString();
  const { processId } = tracking;
  
  if (!processId) {
    _logger('Skipping metrics for missing processId');
    return;
  }
  
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
    // Use new metricsServiceV2 to get metrics
    const metrics = await metricsServiceV2.getAllMetrics();
    return metrics;
  } catch (err) {
    _logger('Error getting metrics from V2 service: %O', err);
    
    try {
      // Fall back to legacy metrics service
      _logger('Falling back to legacy metrics service');
      const legacyMetrics = await legacyMetricsService.getAllMetrics();
      return legacyMetrics;
    } catch (legacyErr) {
      _logger('Error getting metrics from legacy service: %O', legacyErr);
      return {
        totalRequests: 0,
        dryRunCount: 0,
        resultCount: 0,
        processCount: 0,
        uniqueDryRuns: 0,
        uniqueResults: 0,
        uniqueMessageIds: 0,
        processCounts: {},
        actionCounts: {},
        messageIdCounts: {},
        ipCounts: [],
        referrerCounts: [],
        timeSeriesData: [],
        recentRequests: []
      };
    }
  }
}
