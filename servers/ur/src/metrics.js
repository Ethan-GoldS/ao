/**
 * Metrics service for the AO Router
 * Tracks request metrics without interfering with core proxy functionality
 * Uses SQLite database for persistent storage
 */
import { logger } from './logger.js'
import { config } from './config.js'
import * as db from './database.js'

const _logger = logger.child('metrics')

// Maximum number of recent requests to keep
const MAX_RECENT_REQUESTS = 100

// Time series settings
const TIME_SERIES_BUCKETS = 24
const TIME_BUCKET_SIZE_MS = 60 * 60 * 1000 // 1 hour

// In-memory cache for recent requests to avoid frequent database reads
let recentRequestsCache = []

// Server start time from database or current time if not available
const startTime = db.getServerStartTime()

_logger('Metrics initialized with SQLite database storage')
_logger('Server start time: %s', startTime)

/**
 * Record detailed information about a request
 * @param {Object} details Request details object
 */
export function recordRequestDetails(details) {
  if (!details || !details.processId) return;
  
  // Store request details in database
  db.recordRequestDetails(details);
  
  _logger('Recorded request details for process %s', details.processId);
}

/**
 * Update time series data with a new request
 * This is now handled by the database module
 * @param {String} processId Process ID
 * @param {String} timestamp ISO timestamp string
 */
function updateTimeSeriesData(processId, timestamp) {
  // This is now handled directly in the database module
  // This function remains for compatibility but delegates to database
  db.updateTimeSeriesData(processId, timestamp);
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
    ip: req.ip || req.headers['x-forwarded-for'] || 'unknown'
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
  const { processId, ip } = tracking;
  
  if (!processId) return;
  
  // Create request object
  const requestData = {
    timestamp: new Date(tracking.startTime).toISOString(), // Use actual request time
    processId,
    ip,
    action,
    duration
  };
  
  // Record in database
  db.recordRequest(requestData);
  
  // Update in-memory cache for quick access to recent requests
  recentRequestsCache.unshift(requestData);
  if (recentRequestsCache.length > MAX_RECENT_REQUESTS) {
    recentRequestsCache.length = MAX_RECENT_REQUESTS;
  }
  
  _logger('Recorded metrics for process %s, action %s, duration %dms', processId, action, duration);
}

// No need for periodic metrics saving as SQLite handles persistence automatically
// Refresh time series data every hour to ensure we have current buckets
setInterval(() => {
  _logger('Refreshing time series data');
}, TIME_BUCKET_SIZE_MS);

/**
 * Get all metrics for dashboard display
 * @returns {Object} All metrics
 */
export function getMetrics() {
  try {
    _logger('Fetching metrics for dashboard display');
    
    // Use cached recent requests or fetch from database
    const recentRequests = recentRequestsCache.length > 0 ? 
      recentRequestsCache : db.getRecentRequests(MAX_RECENT_REQUESTS);
    
    // Update cache if needed
    if (recentRequestsCache.length === 0 && recentRequests.length > 0) {
      recentRequestsCache = recentRequests;
    }
    
    // Get process and action counts from database
    const processCounts = db.getProcessCounts();
    const actionCounts = db.getActionCounts();
    
    // Get timing metrics from database
    const processTiming = db.getProcessTiming();
    const actionTiming = db.getActionTiming();
    
    // Add average durations for easier display
    const processTimingWithAvg = {};
    Object.entries(processTiming).forEach(([processId, data]) => {
      processTimingWithAvg[processId] = {
        ...data,
        avgDuration: data.count > 0 ? data.totalDuration / data.count : 0
      };
    });
    
    const actionTimingWithAvg = {};
    Object.entries(actionTiming).forEach(([action, data]) => {
      actionTimingWithAvg[action] = {
        ...data,
        avgDuration: data.count > 0 ? data.totalDuration / data.count : 0
      };
    });
    
    // Get IP and referrer counts from database
    const ipCounts = db.getIpCounts();
    const referrerCounts = db.getReferrerCounts();
    
    // Get time series data from database
    const timeSeriesData = db.getTimeSeriesData(TIME_SERIES_BUCKETS);
    
    // Build request details object by process ID
    const requestDetails = {};
    
    // Only populate request details for processes that have recent requests
    // This avoids loading all details at once, which could be inefficient
    const processIds = Object.keys(processCounts).slice(0, 20); // Limit to 20 most recent processes
    for (const processId of processIds) {
      // Fetch details for this process
      requestDetails[processId] = db.getRequestDetails(processId, 20);
    }
    
    _logger('Successfully retrieved metrics for dashboard');
    
    return {
      // Recent requests 
      recentRequests,
      
      // Request details keyed by process ID
      requestDetails,
      
      // Process counts for histogram
      processCounts,
      
      // Action counts for histogram
      actionCounts,
      
      // Process timing metrics (total duration and count)
      processTiming: processTimingWithAvg,
      
      // Action timing metrics (total duration and count)
      actionTiming: actionTimingWithAvg,
      
      // IP address counts
      ipCounts,
      
      // Referrer counts
      referrerCounts,
      
      // Time series data for charts
      timeSeriesData,
      
      // Total number of requests
      totalRequests: db.getTotalRequests(),
      
      // Server start time
      startTime
    };
  } catch (err) {
    _logger('Error retrieving metrics: %O', err);
    // Return empty metrics rather than crashing
    return {
      recentRequests: [],
      requestDetails: {},
      processCounts: {},
      actionCounts: {},
      processTiming: {},
      actionTiming: {},
      ipCounts: {},
      referrerCounts: {},
      timeSeriesData: [],
      totalRequests: 0,
      startTime
    };
  }
}
