/**
 * Metrics service for the AO Router
 * Tracks request metrics without interfering with core proxy functionality
 */
import { logger } from './logger.js'

const _logger = logger.child('metrics')

// Store metrics in memory (will reset on server restart)
const metrics = {
  // Track recent requests with timestamp, process ID, IP, action, duration
  recentRequests: [],
  // Track detailed request info including headers and payload summaries
  requestDetails: {},
  // Track counts by process ID
  processCounts: {},
  // Track counts by action
  actionCounts: {},
  // Track average duration by process ID
  processTiming: {},
  // Track average duration by action
  actionTiming: {},
  // Track counts by IP address
  ipCounts: {},
  // Track counts by referrer
  referrerCounts: {},
  // Track counts by time period (hourly)
  timeSeriesData: [],
  // Number of total requests
  totalRequests: 0,
  // Server start time
  startTime: new Date().toISOString()
}

// Maximum number of recent requests to keep
const MAX_RECENT_REQUESTS = 100

// Store a time series of request counts (last 24 hours with hourly buckets)
const TIME_SERIES_BUCKETS = 24
const TIME_BUCKET_SIZE_MS = 60 * 60 * 1000 // 1 hour

// Initialize time series buckets
function initTimeSeriesBuckets() {
  const now = Date.now()
  metrics.timeSeriesData = []
  
  for (let i = TIME_SERIES_BUCKETS - 1; i >= 0; i--) {
    const bucketTime = new Date(now - (i * TIME_BUCKET_SIZE_MS))
    metrics.timeSeriesData.push({
      timestamp: bucketTime.toISOString(),
      hour: bucketTime.getHours(),
      totalRequests: 0,
      processCounts: {}
    })
  }
}

// Initialize time series data
initTimeSeriesBuckets()

/**
 * Record detailed information about a request
 * @param {Object} details Request details object
 */
export function recordRequestDetails(details) {
  if (!details || !details.processId) return;
  
  const { processId, ip, referer, timestamp } = details;
  
  // Store detailed request info keyed by processId
  if (!metrics.requestDetails[processId]) {
    metrics.requestDetails[processId] = [];
  }
  
  // Add to details list and limit to 20 requests per process ID
  metrics.requestDetails[processId].unshift(details);
  if (metrics.requestDetails[processId].length > 20) {
    metrics.requestDetails[processId].length = 20;
  }
  
  // Update IP counts
  if (ip && ip !== 'unknown') {
    metrics.ipCounts[ip] = (metrics.ipCounts[ip] || 0) + 1;
  }
  
  // Update referrer counts
  if (referer && referer !== 'unknown') {
    metrics.referrerCounts[referer] = (metrics.referrerCounts[referer] || 0) + 1;
  }
  
  // Update time series data
  updateTimeSeriesData(processId, timestamp);
  
  // Increment total requests
  metrics.totalRequests += 1;
  
  _logger('Recorded request details for process %s', processId);
}

/**
 * Update time series data with a new request
 * @param {String} processId Process ID
 * @param {String} timestamp ISO timestamp string
 */
function updateTimeSeriesData(processId, timestamp) {
  try {
    const requestTime = new Date(timestamp);
    const now = new Date();
    
    // Find the right time bucket for this request
    const timeDiff = now - requestTime;
    if (timeDiff > TIME_SERIES_BUCKETS * TIME_BUCKET_SIZE_MS) {
      // Request is older than our tracking window
      return;
    }
    
    const bucketIndex = Math.floor(timeDiff / TIME_BUCKET_SIZE_MS);
    if (bucketIndex < 0 || bucketIndex >= metrics.timeSeriesData.length) {
      return;
    }
    
    // Update bucket counts
    const bucket = metrics.timeSeriesData[bucketIndex];
    bucket.totalRequests += 1;
    
    // Update process count in bucket
    if (!bucket.processCounts[processId]) {
      bucket.processCounts[processId] = 0;
    }
    bucket.processCounts[processId] += 1;
    
  } catch (err) {
    _logger('Error updating time series data: %O', err);
  }
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
  
  // Add to recent requests (limit size and keep most recent)
  metrics.recentRequests.unshift({
    timestamp: new Date().toISOString(),
    processId,
    ip,
    action,
    duration
  });
  
  if (metrics.recentRequests.length > MAX_RECENT_REQUESTS) {
    metrics.recentRequests.length = MAX_RECENT_REQUESTS;
  }
  
  // Update process counts
  metrics.processCounts[processId] = (metrics.processCounts[processId] || 0) + 1;
  
  // Update action counts if action exists
  if (action) {
    metrics.actionCounts[action] = (metrics.actionCounts[action] || 0) + 1;
  }
  
  // Update timing metrics for process
  if (!metrics.processTiming[processId]) {
    metrics.processTiming[processId] = {
      totalDuration: 0,
      count: 0
    };
  }
  metrics.processTiming[processId].totalDuration += duration;
  metrics.processTiming[processId].count += 1;
  
  // Update timing metrics for action if action exists
  if (action) {
    if (!metrics.actionTiming[action]) {
      metrics.actionTiming[action] = {
        totalDuration: 0,
        count: 0
      };
    }
    metrics.actionTiming[action].totalDuration += duration;
    metrics.actionTiming[action].count += 1;
  }
  
  _logger('Recorded metrics for process %s, action %s, duration %dms', processId, action, duration);
}

/**
 * Refresh time series data by adding a new bucket and removing oldest
 */
function refreshTimeSeriesData() {
  const now = Date.now();
  const newBucketTime = new Date(now);
  
  // Remove oldest bucket
  if (metrics.timeSeriesData.length >= TIME_SERIES_BUCKETS) {
    metrics.timeSeriesData.shift();
  }
  
  // Add new bucket
  metrics.timeSeriesData.push({
    timestamp: newBucketTime.toISOString(),
    hour: newBucketTime.getHours(),
    totalRequests: 0,
    processCounts: {}
  });
}

// Refresh time series data every hour
setInterval(refreshTimeSeriesData, TIME_BUCKET_SIZE_MS);

/**
 * Get all metrics for dashboard display
 * @returns {Object} All metrics
 */
export function getMetrics() {
  // Calculate average durations for easier display
  const processTimingWithAvg = {};
  Object.keys(metrics.processTiming).forEach(processId => {
    const { totalDuration, count } = metrics.processTiming[processId];
    processTimingWithAvg[processId] = {
      totalDuration,
      count,
      avgDuration: count > 0 ? totalDuration / count : 0
    };
  });
  
  const actionTimingWithAvg = {};
  Object.keys(metrics.actionTiming).forEach(action => {
    const { totalDuration, count } = metrics.actionTiming[action];
    actionTimingWithAvg[action] = {
      totalDuration,
      count,
      avgDuration: count > 0 ? totalDuration / count : 0
    };
  });
  
  // Get top IPs and top referrers
  const topIps = Object.entries(metrics.ipCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
    
  const topReferrers = Object.entries(metrics.referrerCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  return {
    startTime: metrics.startTime,
    totalRequests: metrics.totalRequests,
    recentRequests: metrics.recentRequests,
    requestDetails: metrics.requestDetails,
    processCounts: metrics.processCounts,
    actionCounts: metrics.actionCounts,
    processTiming: processTimingWithAvg,
    actionTiming: actionTimingWithAvg,
    ipCounts: topIps,
    referrerCounts: topReferrers,
    timeSeriesData: metrics.timeSeriesData
  };
}
