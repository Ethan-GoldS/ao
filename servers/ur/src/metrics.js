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
    // Parse the body if it's a string
    const parsedBody = typeof body === 'string' ? JSON.parse(body) : body
    
    // Check for Tags array with Action
    if (parsedBody?.Tags && Array.isArray(parsedBody.Tags)) {
      const actionTag = parsedBody.Tags.find(tag => 
        tag.name === 'Action' || tag.Name === 'Action'
      )
      
      if (actionTag) {
        return actionTag.value || actionTag.Value
      }
    }
    
    return null
  } catch (err) {
    _logger('Error extracting action from body: %O', err)
    return null
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
