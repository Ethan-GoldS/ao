/**
 * Metrics service for the AO Router
 * Tracks request metrics without interfering with core proxy functionality
 * Uses SQLite for robust storage and querying capabilities
 */
import { logger } from './logger.js'
import * as MetricsDb from './metrics-db.js'
import { config } from './config.js'

const _logger = logger.child('metrics')

// Initialize database when this module is loaded
MetricsDb.initMetricsDb().then(() => {
  _logger('SQLite metrics database initialized successfully')
}).catch(err => {
  _logger('Failed to initialize SQLite metrics database: %O', err)
})

/**
 * Constants for metrics configuration
 */
const TIME_SERIES_BUCKETS = 24 // Default number of time buckets (24 hours)
const TIME_BUCKET_SIZE_MS = 60 * 60 * 1000 // Default bucket size (1 hour)

/**
 * Record detailed information about a request
 * @param {Object} details Request details object
 * @returns {Promise<number|null>} The ID of the inserted record or null if failed
 */
export async function recordRequestDetails(details) {
  if (!details || !details.processId) return null;
  
  const { processId, ip, referer, timestamp } = details;
  
  try {
    // Store in SQLite database
    const requestId = await MetricsDb.recordRequest({
      timestamp,
      processId,
      ip: ip || 'unknown',
      action: null,
      duration: 0,
      details: details  // Save all details for future reference
    });
    
    _logger('Recorded request details for process %s', processId);
    return requestId;
  } catch (err) {
    _logger('Error recording request details to SQLite: %O', err);
    return null;
  }
}

/**
 * Helper function to normalize timestamps consistently
 * @param {Date|String} date - Date object or ISO string
 * @returns {Date} Date object normalized to consistent timezone
 */
function normalizeTimestamp(date) {
  // Convert to Date object if it's a string
  return typeof date === 'string' ? new Date(date) : date;
}

/**
 * Extract action from request body tags
 * @param {Object} body Request body
 * @returns {String|null} Action or null if not found
 */
export function extractAction(body) {
  try {
    if (!body || !body.Tags) return null;
    
    const actionTag = body.Tags.find(tag => 
      tag.name === 'Action' || tag.name === 'action'
    );
    
    return actionTag ? actionTag.value : null;
  } catch (err) {
    _logger('Error extracting action from request body: %O', err);
    return null;
  }
}

/**
 * Start tracking a request
 * @param {Object} req Express request object
 * @returns {Object} Request tracking object with start time
 */
export function startTracking(req) {
  return {
    startTime: Date.now(),
    processId: req.query['process-id'] || null,
    ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
    headers: req.headers,
    path: req.path,
    method: req.method,
    query: req.query,
    body: req.body
  };
}

/**
 * Finish tracking a request and record metrics
 * @param {Object} tracking Request tracking object from startTracking
 * @param {String} action Action from request
 * @returns {Promise<number|null>} The ID of the inserted record or null if failed
 */
export async function finishTracking(tracking, action) {
  if (!tracking || !tracking.startTime) return null;
  
  const duration = tracking.duration || (Date.now() - tracking.startTime);
  const { processId, ip, headers, path, method, query, body } = tracking;
  
  if (!processId) return null;
  
  // Create timestamp from the actual request start time
  const timestamp = new Date(tracking.startTime).toISOString();
  
  try {
    // Store in SQLite database with all metadata
    const requestId = await MetricsDb.recordRequest({
      timestamp,
      processId,
      ip,
      action,
      duration,
      details: {
        headers,
        path,
        method,
        query,
        body: body ? JSON.stringify(body).substring(0, 1000) : null // Truncate to avoid overly large storage
      }
    });
    
    _logger('Recorded metrics for process %s, action %s, duration %dms', processId, action, duration);
    return requestId;
  } catch (err) {
    _logger('Error recording request metrics to SQLite: %O', err);
    return null;
  }
}

/**
 * Get time series data from the SQLite database
 * @param {Object} options Time series options
 * @param {Date} [options.startTime] Start time for the range
 * @param {Date} [options.endTime] End time for the range
 * @param {string} [options.interval='hour'] Time grouping interval (minute, 5min, 10min, 15min, 30min, hour, day)
 * @param {string} [options.processId] Optional filter by process ID
 * @returns {Promise<Array>} Array of time series data points
 */
export async function getTimeSeriesData(options = {}) {
  try {
    // Default to last 24 hours if not specified
    const endTime = options.endTime || new Date();
    const startTime = options.startTime || new Date(endTime.getTime() - (TIME_SERIES_BUCKETS * TIME_BUCKET_SIZE_MS));
    
    // Get time series data from database
    const timeSeriesData = await MetricsDb.getTimeSeriesData({
      startTime,
      endTime,
      interval: options.interval || 'hour',
      processId: options.processId
    });
    
    _logger('Retrieved time series data from SQLite: %d data points', timeSeriesData.length);
    return timeSeriesData;
  } catch (err) {
    _logger('Error retrieving time series data: %O', err);
    return [];  
  }
}

/**
 * Search for metrics data with complex criteria
 * @param {Object} criteria Search criteria
 * @returns {Promise<Array>} Matching requests
 */
export async function searchMetrics(criteria) {
  return MetricsDb.searchMetrics(criteria);
}

/**
 * Get detailed information for a specific request
 * @param {number} requestId Request ID
 * @returns {Promise<Object>} Complete request details
 */
export async function getRequestDetails(requestId) {
  return MetricsDb.getRequestDetails(requestId);
}

/**
 * Get all metrics for dashboard display
 * @returns {Promise<Object>} All metrics data from the database
 */
export async function getMetrics() {
  try {
    // Get fresh metrics from SQLite
    const metrics = await MetricsDb.getAllMetrics();
    return metrics;
  } catch (err) {
    _logger('Error getting metrics from SQLite: %O', err);
    // Return empty data in case of error
    return {
      startTime: new Date().toISOString(),
      totalRequests: 0,
      recentRequests: [],
      processCounts: {},
      actionCounts: {},
      processTiming: {},
      actionTiming: {},
      ipCounts: [],
      referrerCounts: [],
      timeSeriesData: []
    };
  }
}
