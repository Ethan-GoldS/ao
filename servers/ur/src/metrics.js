/**
 * Metrics service for the AO Router
 * Tracks request metrics without interfering with core proxy functionality
 * Supports both file-based storage and PostgreSQL database storage
 */
import { logger } from './logger.js'
import fs from 'fs'
import path from 'path'
import { config } from './config.js'
import * as db from './database.js'

const _logger = logger.child('metrics')

// Storage settings
const STORAGE_PATH = process.env.METRICS_STORAGE_PATH || null
// Default save interval is 60 seconds, but can be overridden with env var (in seconds)
const STORAGE_INTERVAL_MS = (parseInt(process.env.METRICS_SAVE_INTERVAL) || 60) * 1000

// Check which storage system to use
const isPersistentStorageEnabled = !!STORAGE_PATH
const usePostgres = config.usePostgres && !!config.dbUrl

// CRITICAL STARTUP CHECK: Output detailed configuration information
console.log('===== METRICS STORAGE CONFIGURATION =====')
console.log(`USE_POSTGRES = ${process.env.USE_POSTGRES || 'not set'}`)
console.log(`DB_URL = ${process.env.DB_URL ? (process.env.DB_URL.replace(/:\/\/[^:]+:[^@]+@/, '://****:****@')) : 'not set'}`)
console.log(`METRICS_STORAGE_PATH = ${process.env.METRICS_STORAGE_PATH || 'not set'}`)
console.log(`Configuration decision: ${usePostgres ? 'USING POSTGRES' : (isPersistentStorageEnabled ? 'USING FILE STORAGE' : 'IN-MEMORY ONLY')}`)
console.log('=======================================')

// Initialize database if enabled
if (usePostgres) {
  console.log('ATTEMPTING POSTGRES CONNECTION...')
  _logger('Explicitly attempting PostgreSQL connection with config:')
  _logger('usePostgres=%s, dbUrl=%s', config.usePostgres, config.dbUrl ? 'provided' : 'missing')
  
  // Check for common configuration issues
  if (process.env.USE_POSTGRES !== 'true') {
    const errorMsg = 'ERROR: USE_POSTGRES must be exactly "true" (string), not just truthy. Current value: ' + process.env.USE_POSTGRES
    console.error(errorMsg)
    _logger(errorMsg)
    // Intentionally crash the server with a clear message
    throw new Error(errorMsg)
  }
  
  if (!process.env.DB_URL) {
    const errorMsg = 'ERROR: DB_URL must be provided when USE_POSTGRES=true'
    console.error(errorMsg)
    _logger(errorMsg)
    // Intentionally crash the server with a clear message
    throw new Error(errorMsg)
  }
  
  db.initDatabase().then(success => {
    if (success) {
      _logger('PostgreSQL metrics storage initialized successfully')
      console.log('SUCCESS: PostgreSQL metrics storage initialized')
      
      // Load metrics from database into memory on startup
      loadMetricsFromDatabase().then(loaded => {
        if (loaded) {
          _logger('Successfully loaded metrics from PostgreSQL database')
          console.log('SUCCESS: Loaded metrics from PostgreSQL database')
        } else {
          _logger('Failed to load metrics from PostgreSQL, using empty metrics')
          console.error('WARNING: Failed to load metrics from PostgreSQL, using empty metrics')
        }
      })
    } else {
      const errorMsg = 'FATAL ERROR: Failed to initialize PostgreSQL metrics storage; check database connection and permissions'
      _logger(errorMsg)
      console.error(errorMsg)
      // Intentionally crash with clear message
      throw new Error(errorMsg)
    }
  }).catch(err => {
    const errorMsg = `FATAL DATABASE ERROR: ${err.message}`
    _logger(errorMsg)
    console.error(errorMsg)
    // Intentionally crash with clear message
    throw err
  })
} else if (isPersistentStorageEnabled) {
  _logger('File-based metrics storage enabled at: %s', STORAGE_PATH)
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
  _logger('Persistent metrics storage disabled. Set METRICS_STORAGE_PATH or DB_URL to enable.')
}

// Store metrics in memory (will reset on server restart or will be populated from storage)
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
      hour: bucketTime.getUTCHours(), // Use UTC hours for consistency
      totalRequests: 0,
      processCounts: {}
    })
  }
  
  _logger('Initialized %d time series buckets from %s to %s',
    metrics.timeSeriesData.length,
    metrics.timeSeriesData[0].timestamp,
    metrics.timeSeriesData[metrics.timeSeriesData.length - 1].timestamp);
}

// Initialize time series data
initTimeSeriesBuckets()

// Load persisted metrics if available
loadMetricsFromDisk()

/**
 * Record detailed information about a request
 * @param {Object} details Request details object
 */
export async function recordRequestDetails(details) {
  if (!details || !details.processId) return;
  
  const { processId, ip, referer, timestamp } = details;
  
  if (usePostgres && db.isConnected()) {
    // Store in PostgreSQL
    try {
      // Save request details
      await db.insertRequestDetails(details);
      
      // Update IP counts
      if (ip && ip !== 'unknown') {
        await db.updateIpCount(ip);
      }
      
      // Update referrer counts
      if (referer && referer !== 'unknown') {
        await db.updateReferrerCount(referer);
      }
      
      // Update time series data
      await db.updateTimeSeriesData(processId, timestamp);
      
      // Increment total requests
      await db.incrementTotalRequests();
      
      _logger('Recorded request details for process %s in PostgreSQL', processId);
    } catch (err) {
      _logger('Error recording request details in PostgreSQL: %O', err);
    }
  } else {
    // In-memory storage
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
    
    _logger('Recorded request details for process %s in memory', processId);
  }
}

/**
 * Get a consistent timestamp regardless of timezone
 * Ensures all timestamps use the same timezone rules
 * @param {Date|String} date - Date object or ISO string
 * @returns {Date} Date object normalized to consistent timezone
 */
function normalizeTimestamp(date) {
  // Convert to Date object if it's a string
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  // Return the date object directly - consistent handling will be through
  // toISOString() when storing and parsing back with new Date() when needed
  return dateObj;
}

/**
 * Update time series data with a new request
 * @param {String} processId Process ID
 * @param {String} timestamp ISO timestamp string
 */
function updateTimeSeriesData(processId, timestamp) {
  // PostgreSQL implementation is handled in recordRequestDetails function
  // This in-memory implementation is only used when not using PostgreSQL
  if (usePostgres && db.isConnected()) return;
  
  try {
    if (!timestamp) {
      _logger('Warning: Missing timestamp in updateTimeSeriesData');
      return;
    }

    const requestTime = normalizeTimestamp(timestamp);
    
    // Instead of using current time for bucket calculation,
    // we'll calculate based on the actual bucket windows
    
    // The most recent bucket's end time
    const newestBucketTime = normalizeTimestamp(metrics.timeSeriesData[metrics.timeSeriesData.length - 1].timestamp);
    
    // Is this request newer than our newest bucket? If so, we need new buckets
    if (requestTime > newestBucketTime) {
      // Force refresh time series to ensure we have buckets up to current time
      refreshTimeSeriesData(requestTime);
    }
    
    // Find which bucket this request belongs in by iterating through buckets
    for (let i = 0; i < metrics.timeSeriesData.length; i++) {
      const bucketTime = normalizeTimestamp(metrics.timeSeriesData[i].timestamp);
      const nextBucketTime = i < metrics.timeSeriesData.length - 1 ?
        normalizeTimestamp(metrics.timeSeriesData[i + 1].timestamp) :
        new Date(bucketTime.getTime() + TIME_BUCKET_SIZE_MS);
        
      if (requestTime >= bucketTime && requestTime < nextBucketTime) {
        // We found the right bucket, update the counts
        metrics.timeSeriesData[i].totalRequests += 1;
        
        // Update process count in bucket
        if (!metrics.timeSeriesData[i].processCounts[processId]) {
          metrics.timeSeriesData[i].processCounts[processId] = 0;
        }
        metrics.timeSeriesData[i].processCounts[processId] += 1;
        
        _logger('Added request from %s to time bucket %s', 
          requestTime.toISOString(), 
          bucketTime.toISOString());
        return;
      }
    }
    
    // If we get here, the request must be too old for our buckets
    _logger('Request time %s outside of current bucket range', requestTime.toISOString());
    
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
export async function finishTracking(tracking, action) {
  if (!tracking || !tracking.startTime) return;
  
  const duration = tracking.duration || (Date.now() - tracking.startTime);
  const { processId, ip } = tracking;
  
  if (!processId) return;
  
  // Create request object with consistent timestamp
  const requestData = {
    timestamp: new Date(tracking.startTime).toISOString(), // Use the actual request start time
    processId,
    ip,
    action,
    duration
  };
  
  if (usePostgres && db.isConnected()) {
    // Store in PostgreSQL
    try {
      // Insert the request metrics
      await db.insertRequestMetrics(requestData);
      
      // Update process counts and timing
      await db.updateProcessCount(processId, duration);
      
      // Update action counts and timing if action exists
      if (action) {
        await db.updateActionCount(action, duration);
      }
      
      _logger('Recorded metrics for process %s, action %s, duration %dms in PostgreSQL', 
        processId, action, duration);
    } catch (err) {
      _logger('Error recording metrics in PostgreSQL: %O', err);
      // Fall back to in-memory storage if database operation fails
      storeMetricsInMemory(requestData, duration);
    }
  } else {
    // Store in memory
    storeMetricsInMemory(requestData, duration);
  }
}

/**
 * Store metrics in memory (fallback for when database is not available)
 * @param {Object} requestData Request data object
 * @param {number} duration Request duration in milliseconds
 */
function storeMetricsInMemory(requestData, duration) {
  const { timestamp, processId, ip, action } = requestData;
  
  // Add to recent requests (limit size and keep most recent)
  metrics.recentRequests.unshift(requestData);
  
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
  
  _logger('Recorded metrics for process %s, action %s, duration %dms in memory', 
    processId, action, duration);
}

/**
 * Refresh time series data by adding a new bucket and removing oldest
 * @param {Date} [upToTime] Optional timestamp to ensure buckets exist up to
 */
function refreshTimeSeriesData(upToTime) {
  // Use either the provided time or current time
  const now = upToTime ? upToTime.getTime() : Date.now();
  
  // If we have no buckets, initialize the full set
  if (metrics.timeSeriesData.length === 0) {
    initTimeSeriesBuckets();
    return;
  }
  
  // Get the time of the newest bucket
  const lastBucketTime = new Date(metrics.timeSeriesData[metrics.timeSeriesData.length - 1].timestamp);
  
  // Calculate how many new buckets we need to add to reach the current time
  const timeSinceLastBucket = now - lastBucketTime.getTime();
  const bucketsToAdd = Math.max(1, Math.ceil(timeSinceLastBucket / TIME_BUCKET_SIZE_MS));
  
  _logger('Adding %d new time buckets', bucketsToAdd);
  
  // Add the required number of new buckets
  for (let i = 0; i < bucketsToAdd; i++) {
    // Calculate the time for this new bucket
    const newBucketTime = new Date(lastBucketTime.getTime() + ((i + 1) * TIME_BUCKET_SIZE_MS));
    
    // Remove oldest bucket if we're at capacity
    if (metrics.timeSeriesData.length >= TIME_SERIES_BUCKETS) {
      metrics.timeSeriesData.shift();
    }
    
    // Add new bucket with proper formatting
    metrics.timeSeriesData.push({
      timestamp: newBucketTime.toISOString(),
      hour: newBucketTime.getUTCHours(), // Use UTC hours for consistency
      totalRequests: 0,
      processCounts: {}
    });
  }
}

// Refresh time series data every hour
setInterval(refreshTimeSeriesData, TIME_BUCKET_SIZE_MS);

// Metrics request buffer for batching in high-volume scenarios
let pendingMetricsBuffer = [];
let lastFlushTime = Date.now();
const BUFFER_FLUSH_THRESHOLD = 100; // Flush after 100 requests
const BUFFER_TIME_THRESHOLD = 5000; // Flush after 5 seconds

// Set up persistence based on configuration
if (usePostgres && config.dbUrl) {
  // Using PostgreSQL storage with batching for high traffic
  _logger('Using PostgreSQL for metrics storage with batching - no local files will be used');
  
  // Set up periodic batch processing to avoid overwhelming the database in high-traffic scenarios
  setInterval(() => {
    if (pendingMetricsBuffer.length > 0) {
      const now = Date.now();
      if (pendingMetricsBuffer.length >= BUFFER_FLUSH_THRESHOLD || (now - lastFlushTime) >= BUFFER_TIME_THRESHOLD) {
        const batchSize = pendingMetricsBuffer.length;
        // Process the current batch (would implement batch DB insertion here)
        // For now we're just tracking the metrics in memory and individual DB writes
        _logger('Flushing metrics buffer with %d items', batchSize);
        lastFlushTime = now;
        pendingMetricsBuffer = []; // Clear buffer after processing
      }
    }
  }, 1000); // Check buffer every second
} else if (isPersistentStorageEnabled) {
  // Only use file-based storage if PostgreSQL is not enabled, writing only to the configured path
  _logger('Using file-based metrics storage at %s with %d second intervals', 
    STORAGE_PATH, STORAGE_INTERVAL_MS / 1000);
  
  // Set up the save interval
  setInterval(saveMetricsToDisk, STORAGE_INTERVAL_MS);
} else {
  _logger('No persistent storage configured. Metrics will be kept in memory only.');
}

/**
 * Save current metrics to disk for persistence
 * Only writes to the configured METRICS_STORAGE_PATH, nowhere else
 */
function saveMetricsToDisk() {
  // Strict checks to ensure we only write to disk when explicitly configured
  if (!STORAGE_PATH) {
    _logger('No storage path configured, skipping save operation');
    return;
  }
  
  // If PostgreSQL is enabled and connected, don't save to disk at all
  if (usePostgres && db.isConnected()) {
    _logger('Using PostgreSQL for metrics storage, skipping disk save operation');
    return;
  }
  
  try {
    // Verify storage path exists before attempting to write
    if (!fs.existsSync(STORAGE_PATH)) {
      _logger('Storage path %s does not exist, attempting to create it', STORAGE_PATH);
      fs.mkdirSync(STORAGE_PATH, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const metricsFilePath = path.join(STORAGE_PATH, 'metrics.json');
    
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
    
    // Save hourly backup file only at the top of the hour
    if (new Date().getMinutes() === 0) {
      const metricsBackupPath = path.join(STORAGE_PATH, `metrics-backup-${timestamp}.json`);
      fs.writeFileSync(metricsBackupPath, JSON.stringify(storageData, null, 2));
      
      // Clean up old backups (keep last 24)
      cleanupOldBackups();
      _logger('Created hourly backup of metrics data');
    }
    
    _logger('Metrics saved to configured storage path: %s', STORAGE_PATH);
  } catch (err) {
    _logger('Error saving metrics to disk: %O', err);
  }
}

/**
 * Load metrics from storage (either PostgreSQL or disk)
 */
async function loadMetricsFromDisk() {
  // If using PostgreSQL, load initial data from the database
  if (usePostgres && db.isConnected()) {
    try {
      _logger('Loading initial metrics data from PostgreSQL...');
      
      // Get server info for start time and total requests
      const serverInfo = await db.getServerInfo();
      metrics.startTime = serverInfo.startTime || metrics.startTime;
      metrics.totalRequests = serverInfo.totalRequests || 0;
      
      // We don't need to load other metrics as they'll be queried directly from the database
      // when needed through the getMetrics function
      
      _logger('Loaded metrics from PostgreSQL: %d total requests', metrics.totalRequests);
      return;
    } catch (err) {
      _logger('Error loading metrics from PostgreSQL: %O', err);
      _logger('Falling back to file-based storage if available');
    }
  }
  
  // Fall back to file-based storage if PostgreSQL failed or is not enabled
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
 * Load metrics from PostgreSQL database into memory on startup
 * This ensures we have data available for the dashboard even when using PostgreSQL
 */
async function loadMetricsFromDatabase() {
  if (!usePostgres || !db.isConnected()) {
    return false;
  }
  
  try {
    _logger('Loading metrics from PostgreSQL into memory...');
    
    // Load server info
    const serverInfo = await db.getServerInfo();
    if (serverInfo) {
      metrics.startTime = serverInfo.startTime;
      metrics.totalRequests = serverInfo.totalRequests;
      _logger('Loaded server info: %d total requests', metrics.totalRequests);
    }
    
    // Load process counts
    const processCounts = await db.getProcessCounts();
    if (processCounts) {
      metrics.processCounts = processCounts;
      _logger('Loaded %d process counts', Object.keys(processCounts).length);
    }
    
    // Load action counts
    const actionCounts = await db.getActionCounts();
    if (actionCounts) {
      metrics.actionCounts = actionCounts;
      _logger('Loaded %d action counts', Object.keys(actionCounts).length);
    }
    
    // Load IP counts
    const ipCounts = await db.getIpCounts();
    if (ipCounts) {
      metrics.ipCounts = ipCounts;
      _logger('Loaded %d IP counts', Object.keys(ipCounts).length);
    }
    
    // Load referrer counts
    const referrerCounts = await db.getReferrerCounts();
    if (referrerCounts) {
      metrics.referrerCounts = referrerCounts;
      _logger('Loaded %d referrer counts', Object.keys(referrerCounts).length);
    }
    
    // Load time series data
    const timeSeriesData = await db.getTimeSeriesData();
    if (timeSeriesData && timeSeriesData.length > 0) {
      metrics.timeSeriesData = timeSeriesData;
      _logger('Loaded %d time series data points', timeSeriesData.length);
    } else {
      // Initialize time series if none exists
      _logger('No time series data found in database, initializing empty time series');
      // Initialize the time series data with empty buckets
      const now = new Date();
      metrics.timeSeriesData = [];
      
      // Create empty time buckets going back in time
      for (let i = 0; i < TIME_SERIES_BUCKETS; i++) {
        const bucketTime = new Date(now.getTime() - ((TIME_SERIES_BUCKETS - i - 1) * TIME_BUCKET_SIZE_MS));
        metrics.timeSeriesData.push({
          timestamp: bucketTime.toISOString(),
          hour: bucketTime.getUTCHours(),
          totalRequests: 0,
          processCounts: {}
        });
      }
    }
    
    // Load recent requests and details
    const recentRequests = await db.getRecentRequests();
    if (recentRequests && recentRequests.length > 0) {
      metrics.recentRequests = recentRequests;
      _logger('Loaded %d recent requests', recentRequests.length);
    }
    
    return true;
  } catch (err) {
    _logger('Error loading metrics from database: %O', err);
    return false;
  }
}

/**
 * Get all metrics for dashboard display
 * @returns {Promise<Object>} All metrics
 */
export async function getMetrics() {
  if (usePostgres && db.isConnected()) {
    try {
      // Get metrics from PostgreSQL
      const [recentRequests, processCounts, actionCounts, ipCounts, referrerCounts, 
             processTiming, actionTiming, timeSeriesData, serverInfo] = await Promise.all([
        db.getRecentRequests(MAX_RECENT_REQUESTS),
        db.getProcessCounts(),
        db.getActionCounts(),
        db.getIpCounts(),
        db.getReferrerCounts(),
        db.getProcessTiming(),
        db.getActionTiming(),
        db.getTimeSeriesData(TIME_SERIES_BUCKETS),
        db.getServerInfo()
      ]);
      
      // Calculate average durations for database results
      const processTimingWithAvg = {};
      Object.keys(processTiming).forEach(processId => {
        const { totalDuration, count } = processTiming[processId];
        processTimingWithAvg[processId] = {
          totalDuration,
          count,
          avgDuration: count > 0 ? totalDuration / count : 0
        };
      });
      
      const actionTimingWithAvg = {};
      Object.keys(actionTiming).forEach(action => {
        const { totalDuration, count } = actionTiming[action];
        actionTimingWithAvg[action] = {
          totalDuration,
          count,
          avgDuration: count > 0 ? totalDuration / count : 0
        };
      });
      
      // Get top IPs and top referrers
      const topIps = Object.entries(ipCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
        
      const topReferrers = Object.entries(referrerCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      
      return {
        recentRequests,
        processCounts,
        actionCounts,
        processTiming: processTimingWithAvg,
        actionTiming: actionTimingWithAvg,
        ipCounts: topIps,
        referrerCounts: topReferrers,
        timeSeriesData,
        totalRequests: serverInfo.totalRequests || 0,
        startTime: serverInfo.startTime || new Date().toISOString(),
        serverTime: new Date().toISOString(),
        storageType: 'postgresql'
      };
    } catch (err) {
      _logger('Error getting metrics from PostgreSQL: %O', err);
      // Fall back to in-memory metrics if database query fails
      return getInMemoryMetrics();
    }
  } else {
    // Return in-memory metrics
    return getInMemoryMetrics();
  }
}

/**
 * Get metrics from in-memory storage
 * @returns {Object} In-memory metrics
 */
function getInMemoryMetrics() {
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
    recentRequests: metrics.recentRequests,
    processCounts: metrics.processCounts,
    actionCounts: metrics.actionCounts,
    processTiming: processTimingWithAvg,
    actionTiming: actionTimingWithAvg,
    ipCounts: topIps,
    referrerCounts: topReferrers,
    timeSeriesData: metrics.timeSeriesData,
    totalRequests: metrics.totalRequests,
    startTime: metrics.startTime,
    serverTime: new Date().toISOString(),
    storageType: 'memory'
  };
}
