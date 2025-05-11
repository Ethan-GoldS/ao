/**
 * Metrics database service for the AO Router
 * Uses SQLite for robust storage and querying of metrics data
 */
import fs from 'fs'
import path from 'path'
import { logger } from './logger.js'
import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import { config } from './config.js'

const _logger = logger.child('metrics-db')

// Storage settings
const STORAGE_PATH = process.env.METRICS_DB_PATH || './data/metrics'
const DB_FILE = path.join(STORAGE_PATH, 'metrics.db')

// Database connection instance
let db = null

// Transaction queue to ensure only one transaction at a time
const transactionQueue = []
let isProcessingQueue = false

/**
 * Execute a database operation with transaction support in a serialized manner
 * @param {Function} operation Function that performs the database operation
 * @returns {Promise<any>} Result of the operation
 */
async function executeSerializedTransaction(operation) {
  return new Promise((resolve, reject) => {
    // Add this operation to the queue
    transactionQueue.push({ operation, resolve, reject })
    
    // Start processing the queue if it's not already being processed
    if (!isProcessingQueue) {
      processTransactionQueue()
    }
  })
}

/**
 * Process the transaction queue one operation at a time
 */
async function processTransactionQueue() {
  if (isProcessingQueue || transactionQueue.length === 0) {
    return
  }
  
  isProcessingQueue = true
  
  try {
    // Get the next operation from the queue
    const { operation, resolve, reject } = transactionQueue.shift()
    
    // Execute the operation
    try {
      const result = await operation()
      resolve(result)
    } catch (err) {
      reject(err)
    }
    
    // Continue processing the queue
    isProcessingQueue = false
    processTransactionQueue()
  } catch (err) {
    _logger('Error processing transaction queue: %O', err)
    isProcessingQueue = false
    processTransactionQueue()
  }
}

/**
 * Initialize the metrics database
 * Creates necessary tables and indexes
 */
export async function initMetricsDb() {
  try {
    // Create directory if it doesn't exist
    if (!fs.existsSync(STORAGE_PATH)) {
      fs.mkdirSync(STORAGE_PATH, { recursive: true })
      _logger('Created metrics storage directory: %s', STORAGE_PATH)
    }

    // Open database connection
    db = await open({
      filename: DB_FILE,
      driver: sqlite3.Database
    })
    
    _logger('Connected to metrics database: %s', DB_FILE)
    
    // Enable foreign keys
    await db.run('PRAGMA foreign_keys = ON')
    
    // Create tables if they don't exist
    await createTables()
    
    // Return db instance for external use
    return db
  } catch (err) {
    _logger('Error initializing metrics database: %O', err)
    throw err
  }
}

/**
 * Create database tables and indexes
 */
async function createTables() {
  // For transaction safety
  await db.exec('BEGIN TRANSACTION')
  
  try {
    // Requests table - stores all request data
    await db.exec(`
      CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        process_id TEXT,
        ip TEXT,
        action TEXT,
        duration INTEGER,
        unix_timestamp INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)
    
    // Process table - stores process-specific metadata
    await db.exec(`
      CREATE TABLE IF NOT EXISTS processes (
        process_id TEXT PRIMARY KEY,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        total_requests INTEGER DEFAULT 0,
        avg_duration REAL DEFAULT 0
      )
    `)
    
    // IP addresses table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS ip_addresses (
        ip TEXT PRIMARY KEY,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        total_requests INTEGER DEFAULT 0
      )
    `)
    
    // Actions table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS actions (
        action TEXT PRIMARY KEY,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        total_requests INTEGER DEFAULT 0,
        avg_duration REAL DEFAULT 0
      )
    `)
    
    // Request details table - for storing additional metadata
    await db.exec(`
      CREATE TABLE IF NOT EXISTS request_details (
        request_id INTEGER,
        key TEXT NOT NULL,
        value TEXT,
        PRIMARY KEY (request_id, key),
        FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
      )
    `)
    
    // Create indexes for performance
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON requests(timestamp);
      CREATE INDEX IF NOT EXISTS idx_requests_process_id ON requests(process_id);
      CREATE INDEX IF NOT EXISTS idx_requests_ip ON requests(ip);
      CREATE INDEX IF NOT EXISTS idx_requests_action ON requests(action);
      CREATE INDEX IF NOT EXISTS idx_requests_unix_timestamp ON requests(unix_timestamp);
      CREATE INDEX IF NOT EXISTS idx_request_details_key ON request_details(key);
    `)
    
    await db.exec('COMMIT')
    _logger('Database tables and indexes created successfully')
  } catch (err) {
    await db.exec('ROLLBACK')
    _logger('Error creating database tables: %O', err)
    throw err
  }
}

/**
 * Record a request in the metrics database
 * @param {Object} requestData Request data object
 * @returns {Promise<number>} The ID of the inserted request
 */
export async function recordRequest(requestData) {
  if (!db) {
    _logger('Database not initialized')
    return null
  }
  
  if (!requestData || !requestData.timestamp) {
    _logger('Invalid request data')
    return null
  }
  
  // Use serialized transaction system to prevent concurrent transaction issues
  return executeSerializedTransaction(async () => {
    const { 
      timestamp, 
      processId, 
      ip = 'unknown', 
      action = null, 
      duration = 0,
      details = {} 
    } = requestData
    
    let transactionStarted = false
    let requestId = null
    
    try {
      // Begin transaction for data consistency
      await db.exec('BEGIN TRANSACTION')
      transactionStarted = true
      
      // Convert timestamp to Unix timestamp for easier querying
      const unixTimestamp = new Date(timestamp).getTime()
      
      // Insert request record
      const result = await db.run(
        `INSERT INTO requests 
          (timestamp, process_id, ip, action, duration, unix_timestamp)
         VALUES 
          (?, ?, ?, ?, ?, ?)`,
        [timestamp, processId, ip, action, duration, unixTimestamp]
      )
      
      requestId = result.lastID
      
      // Update processes table
      if (processId) {
        await db.run(`
          INSERT INTO processes (process_id, first_seen, last_seen, total_requests, avg_duration)
          VALUES (?, ?, ?, 1, ?)
          ON CONFLICT (process_id) DO UPDATE SET
            last_seen = ?,
            total_requests = total_requests + 1,
            avg_duration = ((avg_duration * total_requests) + ?) / (total_requests + 1)
        `, [processId, timestamp, timestamp, duration, timestamp, duration])
      }
      
      // Update IP addresses table
      if (ip && ip !== 'unknown') {
        await db.run(`
          INSERT INTO ip_addresses (ip, first_seen, last_seen, total_requests)
          VALUES (?, ?, ?, 1)
          ON CONFLICT (ip) DO UPDATE SET
            last_seen = ?,
            total_requests = total_requests + 1
        `, [ip, timestamp, timestamp, timestamp])
      }
      
      // Update actions table
      if (action) {
        await db.run(`
          INSERT INTO actions (action, first_seen, last_seen, total_requests, avg_duration)
          VALUES (?, ?, ?, 1, ?)
          ON CONFLICT (action) DO UPDATE SET
            last_seen = ?,
            total_requests = total_requests + 1,
            avg_duration = ((avg_duration * total_requests) + ?) / (total_requests + 1)
        `, [action, timestamp, timestamp, duration, timestamp, duration])
      }
      
      // Insert any additional details
      if (details && Object.keys(details).length > 0) {
        const stmt = await db.prepare(`
          INSERT INTO request_details (request_id, key, value) VALUES (?, ?, ?)
        `)
        
        for (const [key, value] of Object.entries(details)) {
          // Skip undefined or null values
          if (value === undefined || value === null) continue
          
          // Convert objects to JSON strings and ensure other values are converted to strings
          let valueString
          try {
            valueString = typeof value === 'object' 
              ? JSON.stringify(value).substring(0, 1000) // Limit object size
              : String(value).substring(0, 1000) // Limit string size
          } catch (jsonErr) {
            // If JSON stringify fails, use a simple string representation
            valueString = `[Unstringifiable Object: ${Object.prototype.toString.call(value)}]`
          }
          
          await stmt.run(requestId, key, valueString)
        }
        
        await stmt.finalize()
      }
      
      // Commit the transaction
      await db.exec('COMMIT')
      transactionStarted = false
      
      _logger('Recorded request metrics for %s', processId || 'unknown process')
      return requestId
    } catch (err) {
      // Only try to rollback if we successfully started a transaction
      if (transactionStarted) {
        try {
          await db.exec('ROLLBACK')
        } catch (rollbackErr) {
          // Ignore rollback errors, but log them
          _logger('Error during transaction rollback: %O', rollbackErr)
        }
      }
      
      _logger('Error recording request metrics: %O', err)
      return null
    }
  }).catch(err => {
    // This will catch any errors from the serialized transaction system itself
    _logger('Error in serialized transaction system: %O', err)
    return null
  })
}

/**
 * Get the most recent requests
 * @param {number} limit Maximum number of requests to return
 * @returns {Promise<Array>} Array of recent requests
 */
export async function getRecentRequests(limit = 100) {
  if (!db) {
    _logger('Database not initialized')
    return []
  }
  
  try {
    const requests = await db.all(`
      SELECT 
        id, timestamp, process_id as processId, ip, action, duration
      FROM 
        requests 
      ORDER BY 
        id DESC 
      LIMIT ?
    `, [limit])
    
    return requests
  } catch (err) {
    _logger('Error fetching recent requests: %O', err)
    return []
  }
}

/**
 * Get time series data for charting
 * @param {Object} options Query options
 * @param {Date} options.startTime Start time for the range
 * @param {Date} options.endTime End time for the range
 * @param {string} options.interval Time grouping interval (minute, hour, day)
 * @param {string} [options.processId] Optional process ID filter
 * @returns {Promise<Array>} Array of time series data points
 */
export async function getTimeSeriesData(options) {
  if (!db) {
    _logger('Database not initialized')
    return []
  }
  
  const { 
    startTime = new Date(Date.now() - (24 * 60 * 60 * 1000)), // Default to last 24 hours
    endTime = new Date(),
    interval = 'hour',
    processId = null
  } = options
  
  // Convert to Unix timestamps for querying
  const startUnix = startTime.getTime()
  const endUnix = endTime.getTime()
  
  // Determine the appropriate SQL time format string
  let timeFormat
  let intervalMs
  
  switch (interval) {
    case 'minute':
      timeFormat = '%Y-%m-%dT%H:%M:00.000Z'
      intervalMs = 60 * 1000
      break
    case '5min':
      timeFormat = '%Y-%m-%dT%H:%M:00.000Z' // Group by minute then aggregate
      intervalMs = 5 * 60 * 1000
      break
    case '10min':
      timeFormat = '%Y-%m-%dT%H:%M:00.000Z' // Group by minute then aggregate
      intervalMs = 10 * 60 * 1000
      break
    case '15min':
      timeFormat = '%Y-%m-%dT%H:%M:00.000Z' // Group by minute then aggregate
      intervalMs = 15 * 60 * 1000
      break
    case '30min':
      timeFormat = '%Y-%m-%dT%H:%M:00.000Z' // Group by minute then aggregate
      intervalMs = 30 * 60 * 1000
      break
    case 'hour':
      timeFormat = '%Y-%m-%dT%H:00:00.000Z'
      intervalMs = 60 * 60 * 1000
      break
    case 'day':
      timeFormat = '%Y-%m-%dT00:00:00.000Z'
      intervalMs = 24 * 60 * 60 * 1000
      break
    default:
      timeFormat = '%Y-%m-%dT%H:00:00.000Z' // Default to hourly
      intervalMs = 60 * 60 * 1000
  }
  
  try {
    let query
    let params = [startUnix, endUnix]
    
    if (processId) {
      query = `
        SELECT 
          strftime('${timeFormat}', datetime(unix_timestamp / 1000, 'unixepoch')) as timestamp,
          COUNT(*) as totalRequests
        FROM 
          requests
        WHERE 
          unix_timestamp >= ? AND 
          unix_timestamp <= ? AND
          process_id = ?
        GROUP BY 
          strftime('${timeFormat}', datetime(unix_timestamp / 1000, 'unixepoch'))
        ORDER BY 
          timestamp ASC
      `
      params.push(processId)
    } else {
      query = `
        SELECT 
          strftime('${timeFormat}', datetime(unix_timestamp / 1000, 'unixepoch')) as timestamp,
          COUNT(*) as totalRequests
        FROM 
          requests
        WHERE 
          unix_timestamp >= ? AND 
          unix_timestamp <= ?
        GROUP BY 
          strftime('${timeFormat}', datetime(unix_timestamp / 1000, 'unixepoch'))
        ORDER BY 
          timestamp ASC
      `
    }
    
    let results = await db.all(query, params)
    
    // For specific intervals like 5min, 10min, 15min, 30min, we need to do additional aggregation
    if (['5min', '10min', '15min', '30min'].includes(interval)) {
      const aggregated = []
      // Group by the custom interval
      for (let time = startUnix; time <= endUnix; time += intervalMs) {
        const intervalTime = new Date(time)
        const nextIntervalTime = new Date(time + intervalMs)
        
        // Find all results that fall within this interval
        const intervalData = results.filter(r => {
          const rowTime = new Date(r.timestamp)
          return rowTime >= intervalTime && rowTime < nextIntervalTime
        })
        
        // Sum the requests in this interval
        const totalRequests = intervalData.reduce((sum, row) => sum + row.totalRequests, 0)
        
        aggregated.push({
          timestamp: new Date(time).toISOString(),
          totalRequests
        })
      }
      
      results = aggregated
    }
    
    // Now get process-specific data if no specific process was requested
    if (!processId) {
      // For each time bucket, get process breakdown
      for (const row of results) {
        const bucketStartTime = new Date(row.timestamp).getTime()
        const bucketEndTime = new Date(bucketStartTime + intervalMs).getTime()
        
        const processData = await db.all(`
          SELECT 
            process_id as processId,
            COUNT(*) as count
          FROM 
            requests
          WHERE 
            unix_timestamp >= ? AND 
            unix_timestamp < ? AND
            process_id IS NOT NULL
          GROUP BY 
            process_id
        `, [bucketStartTime, bucketEndTime])
        
        // Convert to object format for easier use in frontend
        const processCounts = {}
        processData.forEach(p => {
          if (p.processId) {
            processCounts[p.processId] = p.count
          }
        })
        
        row.processCounts = processCounts
      }
    }
    
    // Add UTC hour for backward compatibility
    results.forEach(row => {
      row.hour = new Date(row.timestamp).getUTCHours()
    })
    
    // Fill in any missing time buckets with zeros
    const completeResults = []
    for (let time = startUnix; time <= endUnix; time += intervalMs) {
      const bucketTime = new Date(time).toISOString()
      const existingBucket = results.find(r => r.timestamp === bucketTime)
      
      if (existingBucket) {
        completeResults.push(existingBucket)
      } else {
        completeResults.push({
          timestamp: bucketTime,
          hour: new Date(time).getUTCHours(),
          totalRequests: 0,
          processCounts: {}
        })
      }
    }
    
    return completeResults
  } catch (err) {
    _logger('Error fetching time series data: %O', err)
    return []
  }
}

/**
 * Get statistics for all processes
 * @returns {Promise<Object>} Process statistics 
 */
export async function getProcessStats() {
  if (!db) {
    _logger('Database not initialized')
    return {}
  }
  
  try {
    const processes = await db.all(`
      SELECT 
        process_id as processId,
        first_seen as firstSeen,
        last_seen as lastSeen,
        total_requests as totalRequests,
        avg_duration as avgDuration
      FROM 
        processes
      ORDER BY 
        total_requests DESC
    `)
    
    return processes
  } catch (err) {
    _logger('Error fetching process statistics: %O', err)
    return []
  }
}

/**
 * Get statistics for all IP addresses
 * @returns {Promise<Array>} IP address statistics
 */
export async function getIpStats() {
  if (!db) {
    _logger('Database not initialized')
    return []
  }
  
  try {
    const ips = await db.all(`
      SELECT 
        ip,
        first_seen as firstSeen,
        last_seen as lastSeen,
        total_requests as totalRequests
      FROM 
        ip_addresses
      ORDER BY 
        total_requests DESC
    `)
    
    return ips
  } catch (err) {
    _logger('Error fetching IP statistics: %O', err)
    return []
  }
}

/**
 * Get statistics for all actions
 * @returns {Promise<Array>} Action statistics
 */
export async function getActionStats() {
  if (!db) {
    _logger('Database not initialized')
    return []
  }
  
  try {
    const actions = await db.all(`
      SELECT 
        action,
        first_seen as firstSeen,
        last_seen as lastSeen,
        total_requests as totalRequests,
        avg_duration as avgDuration
      FROM 
        actions
      ORDER BY 
        total_requests DESC
    `)
    
    return actions
  } catch (err) {
    _logger('Error fetching action statistics: %O', err)
    return []
  }
}

/**
 * Get all metrics data for dashboard display
 * @returns {Promise<Object>} All metrics data
 */
export async function getAllMetrics() {
  try {
    const recentRequests = await getRecentRequests(100)
    const processCounts = {}
    const processTimings = {}
    const actionCounts = {}
    const actionTimings = {}
    const ipCounts = {}
    
    // Get process statistics
    const processes = await getProcessStats()
    processes.forEach(p => {
      processCounts[p.processId] = p.totalRequests
      processTimings[p.processId] = {
        totalDuration: p.avgDuration * p.totalRequests,
        count: p.totalRequests
      }
    })
    
    // Get action statistics
    const actions = await getActionStats()
    actions.forEach(a => {
      actionCounts[a.action] = a.totalRequests
      actionTimings[a.action] = {
        totalDuration: a.avgDuration * a.totalRequests,
        count: a.totalRequests
      }
    })
    
    // Get IP statistics
    const ips = await getIpStats()
    ips.forEach(i => {
      ipCounts[i.ip] = i.totalRequests
    })
    
    // Get time series data for the last 24 hours
    const endTime = new Date()
    const startTime = new Date(endTime.getTime() - (24 * 60 * 60 * 1000))
    const timeSeriesData = await getTimeSeriesData({
      startTime,
      endTime,
      interval: 'hour'
    })
    
    // Calculate total requests
    const totalRequests = await db.get(`
      SELECT COUNT(*) as count FROM requests
    `)
    
    // Get server start time (first request time or current time if no requests)
    const startTimeResult = await db.get(`
      SELECT timestamp FROM requests ORDER BY timestamp ASC LIMIT 1
    `)
    
    return {
      recentRequests,
      processCounts,
      processTiming: processTimings,
      actionCounts,
      actionTiming: actionTimings,
      ipCounts,
      timeSeriesData,
      totalRequests: totalRequests.count,
      startTime: startTimeResult ? startTimeResult.timestamp : new Date().toISOString()
    }
  } catch (err) {
    _logger('Error getting all metrics: %O', err)
    return {
      recentRequests: [],
      processCounts: {},
      processTiming: {},
      actionCounts: {},
      actionTiming: {},
      ipCounts: {},
      timeSeriesData: [],
      totalRequests: 0,
      startTime: new Date().toISOString()
    }
  }
}

/**
 * Search metrics by various criteria
 * @param {Object} criteria Search criteria
 * @returns {Promise<Array>} Matching requests
 */
export async function searchMetrics(criteria) {
  if (!db) {
    _logger('Database not initialized')
    return []
  }
  
  const {
    processId = null,
    ip = null,
    action = null,
    startTime = null,
    endTime = null,
    limit = 1000
  } = criteria
  
  try {
    // Build query conditions
    const conditions = []
    const params = []
    
    if (processId) {
      conditions.push('process_id = ?')
      params.push(processId)
    }
    
    if (ip) {
      conditions.push('ip = ?')
      params.push(ip)
    }
    
    if (action) {
      conditions.push('action = ?')
      params.push(action)
    }
    
    if (startTime) {
      const startUnix = new Date(startTime).getTime()
      conditions.push('unix_timestamp >= ?')
      params.push(startUnix)
    }
    
    if (endTime) {
      const endUnix = new Date(endTime).getTime()
      conditions.push('unix_timestamp <= ?')
      params.push(endUnix)
    }
    
    // Add limit parameter
    params.push(limit)
    
    // Build and execute query
    const query = `
      SELECT 
        id, timestamp, process_id as processId, ip, action, duration
      FROM 
        requests
      ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}
      ORDER BY 
        timestamp DESC
      LIMIT ?
    `
    
    const results = await db.all(query, params)
    return results
  } catch (err) {
    _logger('Error searching metrics: %O', err)
    return []
  }
}

/**
 * Get detailed information for a request
 * @param {number} requestId Request ID
 * @returns {Promise<Object>} Complete request details
 */
export async function getRequestDetails(requestId) {
  if (!db) {
    _logger('Database not initialized')
    return null
  }
  
  try {
    // Get basic request information
    const request = await db.get(`
      SELECT 
        id, timestamp, process_id as processId, ip, action, duration
      FROM 
        requests
      WHERE 
        id = ?
    `, [requestId])
    
    if (!request) {
      return null
    }
    
    // Get additional details
    const details = await db.all(`
      SELECT key, value
      FROM request_details
      WHERE request_id = ?
    `, [requestId])
    
    // Convert details to object
    const detailsObj = {}
    details.forEach(d => {
      try {
        // Attempt to parse JSON values
        detailsObj[d.key] = JSON.parse(d.value)
      } catch (e) {
        // Fall back to string if not valid JSON
        detailsObj[d.key] = d.value
      }
    })
    
    return {
      ...request,
      details: detailsObj
    }
  } catch (err) {
    _logger('Error getting request details: %O', err)
    return null
  }
}

/**
 * Close the database connection
 */
export async function closeDatabase() {
  if (db) {
    await db.close()
    db = null
    _logger('Closed metrics database connection')
  }
}

// Export database instance for direct access if needed
export function getDatabase() {
  return db
}
