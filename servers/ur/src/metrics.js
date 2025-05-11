/**
 * Metrics service for the AO Router
 * Tracks request metrics without interfering with core proxy functionality
 * Includes persistent storage when METRICS_STORAGE_PATH is set
 */
import { logger } from './logger.js'
import fs from 'fs'
import path from 'path'
import { config } from './config.js'

const _logger = logger.child('metrics')

// Storage settings
const STORAGE_PATH = process.env.METRICS_STORAGE_PATH || null
// Default save interval is 60 seconds, but can be overridden with env var (in seconds)
const STORAGE_INTERVAL_MS = (parseInt(process.env.METRICS_SAVE_INTERVAL) || 60) * 1000

// Check if persistent storage is enabled
const isPersistentStorageEnabled = !!STORAGE_PATH

if (isPersistentStorageEnabled) {
  _logger('Persistent metrics storage enabled at: %s', STORAGE_PATH)
  // Create directory if it doesn't exist
  try {
    if (!fs.existsSync(STORAGE_PATH)) {
      fs.mkdirSync(STORAGE_PATH, { recursive: true })
      _logger('Created metrics storage directory: %s', STORAGE_PATH)
    }
  } catch (err) {
    _logger('Error creating metrics storage directory: %O', err)
  }
} else {
  _logger('Persistent metrics storage disabled. Set METRICS_STORAGE_PATH to enable.')
}

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
  const now = new Date();
  metrics.timeSeriesData = [];
  
  // Start with current hour, rounded to the hour
  const currentHour = new Date(now);
  currentHour.setMinutes(0, 0, 0); // Set to start of hour
  
  _logger('Initializing time series buckets starting from %s', currentHour.toISOString());
  
  // Create hourly buckets going back in time
  for (let i = 0; i < TIME_SERIES_BUCKETS; i++) {
    const bucketTime = new Date(currentHour);
    bucketTime.setHours(currentHour.getHours() - i);
    
    // Add bucket (most recent first in array)
    metrics.timeSeriesData.unshift({
      timestamp: bucketTime.toISOString(),
      hour: bucketTime.getHours(),
      totalRequests: 0,
      processCounts: {}
    });
  }
  
  // Log the time range covered by our buckets
  if (metrics.timeSeriesData.length > 0) {
    const firstBucket = new Date(metrics.timeSeriesData[0].timestamp);
    const lastBucket = new Date(metrics.timeSeriesData[metrics.timeSeriesData.length - 1].timestamp);
    _logger('Created %d time buckets covering %s to %s', 
            metrics.timeSeriesData.length,
            firstBucket.toISOString(),
            lastBucket.toISOString());
  }
}

// Initialize time series data
initTimeSeriesBuckets()

// Load persisted metrics if available
loadMetricsFromDisk()

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
    // Debug incoming timestamp
    _logger('Processing timestamp for metrics: %s (processId: %s)', timestamp, processId);
    
    // Ensure we have a valid timestamp
    if (!timestamp) {
      _logger('WARNING: Missing timestamp for request from process %s, using current time', processId);
      timestamp = new Date().toISOString();
    }
    
    const requestTime = new Date(timestamp);
    const now = new Date();
    
    // Debug timestamps after parsing
    _logger('Request time parsed: %s', requestTime.toISOString());
    
    // Find the appropriate time bucket for this request's actual timestamp
    // Don't place requests in buckets based on relative time to now
    // Instead, find which absolute time bucket this belongs to
    
    // Find or create the correct bucket based on the requestTime
    // Round to the nearest hour boundary
    const bucketTime = new Date(requestTime);
    // Round to the hour
    bucketTime.setMinutes(0, 0, 0);
    
    // Find the matching bucket or the closest one
    let targetBucket = null;
    let closestDiff = Infinity;
    
    for (const bucket of metrics.timeSeriesData) {
      const bucketDate = new Date(bucket.timestamp);
      const diff = Math.abs(bucketDate - bucketTime);
      
      if (diff < closestDiff) {
        closestDiff = diff;
        targetBucket = bucket;
      }
    }
    
    if (!targetBucket) {
      _logger('No suitable bucket found for timestamp %s', timestamp);
      return;
    }
    
    // Update bucket counts
    targetBucket.totalRequests += 1;
    
    // Update process count in bucket
    if (!targetBucket.processCounts[processId]) {
      targetBucket.processCounts[processId] = 0;
    }
    targetBucket.processCounts[processId] += 1;
    
    _logger('Updated metrics bucket at %s with request from %s', 
            targetBucket.timestamp, processId);
    
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
    timestamp: new Date(tracking.startTime).toISOString(), // Use the actual request start time
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
  const now = new Date();
  
  // Create a new bucket at the current hour boundary
  const newBucketTime = new Date(now);
  newBucketTime.setMinutes(0, 0, 0);
  
  _logger('Refreshing time buckets at %s', now.toISOString());
  
  // Check if we already have a bucket for this hour
  const mostRecentBucket = metrics.timeSeriesData[metrics.timeSeriesData.length - 1];
  if (mostRecentBucket) {
    const mostRecentTime = new Date(mostRecentBucket.timestamp);
    const hourDiff = (newBucketTime - mostRecentTime) / (60 * 60 * 1000);
    
    // If we already have a bucket for the current hour, nothing to do
    if (hourDiff < 1) {
      _logger('Most recent bucket is still current (%s), not refreshing yet', 
              mostRecentBucket.timestamp);
      return;
    }
  }
  
  // Remove oldest bucket if we've reached the limit
  if (metrics.timeSeriesData.length >= TIME_SERIES_BUCKETS) {
    const oldestBucket = metrics.timeSeriesData.shift();
    _logger('Removed oldest bucket from %s', oldestBucket.timestamp);
  }
  
  // Add new bucket
  metrics.timeSeriesData.push({
    timestamp: newBucketTime.toISOString(),
    hour: newBucketTime.getHours(),
    totalRequests: 0,
    processCounts: {}
  });
  
  _logger('Added new bucket for %s', newBucketTime.toISOString());
}

// Refresh time series data every hour
setInterval(refreshTimeSeriesData, TIME_BUCKET_SIZE_MS);

// Save metrics to disk periodically if storage is enabled
if (isPersistentStorageEnabled) {
  // Save immediately on startup
  setTimeout(() => {
    _logger('Performing initial metrics save...');
    saveMetricsToDisk();
  }, 5000); // Wait 5 seconds for initial metrics collection
  
  // Then set up the regular interval
  setInterval(saveMetricsToDisk, STORAGE_INTERVAL_MS);
  
  // Log the save interval for debugging
  _logger('Metrics will be saved every %d seconds to: %s', STORAGE_INTERVAL_MS / 1000, STORAGE_PATH);
}

/**
 * Save current metrics to disk for persistence
 */
function saveMetricsToDisk() {
  if (!isPersistentStorageEnabled) return;
  
  try {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    
    // Save main metrics file
    const metricsFilePath = path.join(STORAGE_PATH, 'metrics.json');
    const metricsBackupPath = path.join(STORAGE_PATH, `metrics-backup-${timestamp}.json`);
    
    // Create metrics data for storage
    const storageData = {
      version: '1.0',
      savedAt: new Date().toISOString(),
      startTime: metrics.startTime,
      totalRequests: metrics.totalRequests,
      processCounts: metrics.processCounts,
      actionCounts: metrics.actionCounts,
      processTiming: metrics.processTiming,
      actionTiming: metrics.actionTiming,
      ipCounts: metrics.ipCounts,
      referrerCounts: metrics.referrerCounts,
      timeSeriesData: metrics.timeSeriesData
    };
    
    // Save main file
    fs.writeFileSync(metricsFilePath, JSON.stringify(storageData, null, 2));
    
    // Save backup file (once per hour)
    if (new Date().getMinutes() === 0) {
      fs.writeFileSync(metricsBackupPath, JSON.stringify(storageData, null, 2));
      
      // Clean up old backups (keep last 24)
      cleanupOldBackups();
    }
    
    _logger('Metrics saved to disk successfully');
  } catch (err) {
    _logger('Error saving metrics to disk: %O', err);
  }
}

/**
 * Load metrics from disk if available
 */
function loadMetricsFromDisk() {
  if (!isPersistentStorageEnabled) return;
  
  try {
    const metricsFilePath = path.join(STORAGE_PATH, 'metrics.json');
    
    if (fs.existsSync(metricsFilePath)) {
      const fileContent = fs.readFileSync(metricsFilePath, 'utf8');
      const savedData = JSON.parse(fileContent);
      
      // Merge saved data with current metrics
      metrics.startTime = savedData.startTime || metrics.startTime;
      metrics.totalRequests = savedData.totalRequests || 0;
      metrics.processCounts = savedData.processCounts || {};
      metrics.actionCounts = savedData.actionCounts || {};
      metrics.processTiming = savedData.processTiming || {};
      metrics.actionTiming = savedData.actionTiming || {};
      metrics.ipCounts = savedData.ipCounts || {};
      metrics.referrerCounts = savedData.referrerCounts || {};
      
      // Only load time series data if format matches
      if (Array.isArray(savedData.timeSeriesData) && savedData.timeSeriesData.length === TIME_SERIES_BUCKETS) {
        metrics.timeSeriesData = savedData.timeSeriesData;
      }
      
      _logger('Loaded metrics from disk: %d total requests restored', metrics.totalRequests);
    } else {
      _logger('No saved metrics file found, starting with empty metrics');
    }
  } catch (err) {
    _logger('Error loading metrics from disk: %O', err);
  }
}

/**
 * Clean up old backup files, keeping only the most recent 24
 */
function cleanupOldBackups() {
  try {
    const backupFiles = fs.readdirSync(STORAGE_PATH)
      .filter(file => file.startsWith('metrics-backup-'))
      .sort()
      .reverse(); // Most recent first
    
    // Keep the 24 most recent backups
    if (backupFiles.length > 24) {
      const filesToDelete = backupFiles.slice(24);
      
      filesToDelete.forEach(file => {
        fs.unlinkSync(path.join(STORAGE_PATH, file));
      });
      
      _logger('Cleaned up %d old backup files', filesToDelete.length);
    }
  } catch (err) {
    _logger('Error cleaning up old backup files: %O', err);
  }
}

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
