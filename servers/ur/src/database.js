/**
 * SQLite database manager for AO Router metrics
 * Handles database connection, table creation, and query operations
 */
import BetterSqlite3 from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { logger } from './logger.js'
import { config } from './config.js'

const _logger = logger.child('database')

// Determine appropriate database path with fallbacks for different environments
function getDatabasePath() {
  // First try from config
  if (config.metricsStoragePath) {
    const configPath = config.metricsStoragePath;
    _logger('Config specified database path: %s', configPath);
    
    // Check if the path is a directory or includes a filename
    let dbPath;
    
    try {
      if (fs.existsSync(configPath)) {
        const stats = fs.statSync(configPath);
        
        if (stats.isDirectory()) {
          // It's a directory, append the default filename
          dbPath = path.join(configPath, 'metrics.db');
          _logger('Config path is a directory, using file: %s', dbPath);
        } else {
          // It's a file path, use as is
          dbPath = configPath;
          _logger('Using specified file path: %s', dbPath);
        }
        
        // Verify we can write to this location
        const testFile = path.join(path.dirname(dbPath), '.write-test');
        try {
          fs.writeFileSync(testFile, 'test');
          fs.unlinkSync(testFile);
          _logger('Confirmed write access to: %s', path.dirname(dbPath));
          return dbPath;
        } catch (err) {
          _logger('Cannot write to specified path %s: %s', dbPath, err.message);
        }
      } else {
        // Path doesn't exist yet, try to create the directory structure
        const dirPath = path.dirname(configPath);
        
        try {
          fs.mkdirSync(dirPath, { recursive: true });
          _logger('Created directory: %s', dirPath);
          
          // If it's a directory path (ends with / or \), append filename
          if (configPath.endsWith('/') || configPath.endsWith('\\')) {
            dbPath = path.join(configPath, 'metrics.db');
          } else {
            dbPath = configPath;
          }
          
          // Test we can write to it
          const testFile = path.join(dirPath, '.write-test');
          fs.writeFileSync(testFile, 'test');
          fs.unlinkSync(testFile);
          _logger('Confirmed write access to created directory: %s', dirPath);
          return dbPath;
        } catch (err) {
          _logger('Failed to create or write to directory %s: %s', dirPath, err.message);
        }
      }
    } catch (err) {
      _logger('Error checking config path %s: %s', configPath, err.message);
    }
    
    _logger('WARNING: Could not use specified database path from config, falling back to alternatives');
  }
  
  // If we get here, the config path didn't work, try fallbacks
  let dbPath;
  
  // Try standard locations with different fallbacks depending on platform
  if (process.platform === 'win32') {
    // Windows - use current directory
    dbPath = './data/metrics.db';
    _logger('Using Windows fallback path: %s', path.resolve(dbPath));
  } else {
    // Linux/Unix - try multiple locations with permission checks
    const possiblePaths = [
      './data/metrics.db',                // Current directory
      '/tmp/aorouter-metrics.db',        // System temp directory
      path.join(process.env.HOME || '.', '.ao-router-metrics.db') // User home directory
    ];
    
    _logger('Trying Unix/Linux fallback paths...');
    
    // Find first writable path
    for (const testPath of possiblePaths) {
      const testDir = path.dirname(testPath);
      try {
        // Check if directory exists and is writable
        if (fs.existsSync(testDir)) {
          // Try to write a test file
          const testFile = path.join(testDir, '.write-test');
          fs.writeFileSync(testFile, 'test');
          fs.unlinkSync(testFile); // Remove test file
          dbPath = testPath;
          _logger('Using fallback path with confirmed write access: %s', path.resolve(dbPath));
          break;
        } else {
          // Try to create directory
          fs.mkdirSync(testDir, { recursive: true });
          dbPath = testPath;
          _logger('Created directory for fallback path: %s', path.resolve(dbPath));
          break;
        }
      } catch (e) {
        _logger('Path %s is not writable: %s', testDir, e.message);
        // Continue to next option
      }
    }
  }
  
  // If we still don't have a path, use in-memory database as last resort
  if (!dbPath) {
    _logger('WARNING: No writable location found for SQLite database, using in-memory database');
    return ':memory:';
  }
  
  return dbPath;
}

// Get appropriate database path
const DB_PATH = getDatabasePath();

// Create directory if it doesn't exist
if (DB_PATH !== ':memory:') {
  const dbDir = path.dirname(DB_PATH);
  try {
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      _logger('Created database directory: %s', dbDir);
    }
  } catch (err) {
    _logger('Error creating database directory: %O', err);
    // Continue - we'll handle the error during connection
  }
}

// Initialize database connection
let db;
let connectionAttempts = 0;
const MAX_ATTEMPTS = 3;

while (connectionAttempts < MAX_ATTEMPTS) {
  try {
    connectionAttempts++;
    db = new BetterSqlite3(DB_PATH, { 
      fileMustExist: false,
      verbose: process.env.DEBUG ? console.log : null
    });
    _logger('Connected to SQLite database at %s', DB_PATH);
    break; // Success, exit the loop
  } catch (err) {
    _logger('Attempt %d: Error connecting to SQLite database at %s: %O', 
      connectionAttempts, DB_PATH, err);
    
    if (connectionAttempts >= MAX_ATTEMPTS) {
      _logger('All connection attempts failed, falling back to in-memory database');
      try {
        db = new BetterSqlite3(':memory:');
        _logger('Connected to in-memory SQLite database (WARNING: data will not persist)');
      } catch (memErr) {
        _logger('Fatal error: Could not even create in-memory database: %O', memErr);
        throw memErr;
      }
    }
  }
}

// Create tables if they don't exist
function initializeDatabase() {
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  
  // Create requests table for storing individual request records
  db.exec(`
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      process_id TEXT NOT NULL,
      action TEXT,
      ip TEXT,
      duration INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)
  
  // Create process_counts table for aggregated process statistics
  db.exec(`
    CREATE TABLE IF NOT EXISTS process_counts (
      process_id TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      total_duration INTEGER NOT NULL DEFAULT 0
    )
  `)
  
  // Create action_counts table for aggregated action statistics
  db.exec(`
    CREATE TABLE IF NOT EXISTS action_counts (
      action TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      total_duration INTEGER NOT NULL DEFAULT 0
    )
  `)
  
  // Create ip_counts table for aggregated IP statistics
  db.exec(`
    CREATE TABLE IF NOT EXISTS ip_counts (
      ip TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0
    )
  `)
  
  // Create referrer_counts table for tracking referrers
  db.exec(`
    CREATE TABLE IF NOT EXISTS referrer_counts (
      referrer TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0
    )
  `)
  
  // Create time_series table for storing aggregated time-based metrics
  db.exec(`
    CREATE TABLE IF NOT EXISTS time_series (
      bucket_time TEXT PRIMARY KEY,
      total_requests INTEGER NOT NULL DEFAULT 0,
      hour INTEGER NOT NULL,
      process_counts TEXT     -- JSON string of process counts
    )
  `)
  
  // Create request_details table for storing detailed request information
  db.exec(`
    CREATE TABLE IF NOT EXISTS request_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      process_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      ip TEXT,
      referer TEXT,
      details TEXT,          -- JSON string of additional details
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)
  
  // Create meta table for storing server metadata
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)
  
  _logger('Database tables initialized')
  
  // Initialize meta data for server start time if not exists
  const startTime = db.prepare('SELECT value FROM meta WHERE key = ?').get('start_time')
  if (!startTime) {
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('start_time', new Date().toISOString())
    _logger('Server start time initialized in database')
  }
}

// Initialize the database
initializeDatabase()

/**
 * Get the server start time from the database
 * @returns {string} ISO timestamp string of server start time
 */
export function getServerStartTime() {
  const result = db.prepare('SELECT value FROM meta WHERE key = ?').get('start_time')
  return result ? result.value : new Date().toISOString()
}

/**
 * Record a new request in the database
 * @param {Object} requestData Request data to record
 * @returns {number} ID of the inserted request
 */
export function recordRequest(requestData) {
  const { timestamp, processId, action, ip, duration } = requestData
  
  // Insert request record
  const insertRequest = db.prepare(`
    INSERT INTO requests (timestamp, process_id, action, ip, duration)
    VALUES (?, ?, ?, ?, ?)
  `)
  
  const result = insertRequest.run(timestamp, processId, action, ip, duration)
  
  // Update process counts (upsert)
  const updateProcessCount = db.prepare(`
    INSERT INTO process_counts (process_id, count, total_duration)
    VALUES (?, 1, ?)
    ON CONFLICT(process_id) DO UPDATE 
    SET count = count + 1,
        total_duration = total_duration + ?
  `)
  
  updateProcessCount.run(processId, duration, duration)
  
  // Update action counts if action exists
  if (action) {
    const updateActionCount = db.prepare(`
      INSERT INTO action_counts (action, count, total_duration)
      VALUES (?, 1, ?)
      ON CONFLICT(action) DO UPDATE 
      SET count = count + 1,
          total_duration = total_duration + ?
    `)
    
    updateActionCount.run(action, duration, duration)
  }
  
  // Update IP counts if IP exists
  if (ip) {
    const updateIpCount = db.prepare(`
      INSERT INTO ip_counts (ip, count)
      VALUES (?, 1)
      ON CONFLICT(ip) DO UPDATE SET count = count + 1
    `)
    
    updateIpCount.run(ip)
  }
  
  return result.lastInsertRowid
}

/**
 * Record detailed information about a request
 * @param {Object} details Request details
 */
export function recordRequestDetails(details) {
  if (!details || !details.processId) return
  
  const { processId, ip, referer, timestamp } = details
  
  // Store as JSON string for additional details
  const detailsJson = JSON.stringify(details)
  
  // Insert request details
  const insertDetails = db.prepare(`
    INSERT INTO request_details (process_id, timestamp, ip, referer, details)
    VALUES (?, ?, ?, ?, ?)
  `)
  
  insertDetails.run(processId, timestamp, ip, referer, detailsJson)
  
  // Update referrer counts if referrer exists
  if (referer) {
    const updateRefererCount = db.prepare(`
      INSERT INTO referrer_counts (referrer, count)
      VALUES (?, 1)
      ON CONFLICT(referrer) DO UPDATE SET count = count + 1
    `)
    
    updateRefererCount.run(referer)
  }
  
  // Update time series data with timestamp
  updateTimeSeriesData(processId, timestamp)
}

/**
 * Update time series data with a new request
 * @param {String} processId Process ID
 * @param {String} timestamp ISO timestamp string
 */
export function updateTimeSeriesData(processId, timestamp) {
  try {
    if (!timestamp) return
    
    // Parse the timestamp as UTC
    const requestDate = new Date(timestamp)
    
    // Create bucket time string rounded to the hour, ensuring UTC consistency
    // by using UTC methods throughout
    const bucketDate = new Date(Date.UTC(
      requestDate.getUTCFullYear(),
      requestDate.getUTCMonth(),
      requestDate.getUTCDate(),
      requestDate.getUTCHours(),
      0, 0, 0
    ))
    
    const bucketTime = bucketDate.toISOString()
    const hour = bucketDate.getUTCHours()
    
    _logger('Request time %s mapped to bucket %s', timestamp, bucketTime)
    
    // Get current process counts for this bucket if exists
    const currentBucket = db.prepare('SELECT process_counts FROM time_series WHERE bucket_time = ?').get(bucketTime)
    
    let processCounts = {}
    if (currentBucket && currentBucket.process_counts) {
      processCounts = JSON.parse(currentBucket.process_counts)
    }
    
    // Update process count
    processCounts[processId] = (processCounts[processId] || 0) + 1
    
    // Upsert time series bucket
    const upsertBucket = db.prepare(`
      INSERT INTO time_series (bucket_time, hour, total_requests, process_counts)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(bucket_time) DO UPDATE 
      SET total_requests = total_requests + 1,
          process_counts = ?
    `)
    
    const processCountsJson = JSON.stringify(processCounts)
    upsertBucket.run(bucketTime, hour, processCountsJson, processCountsJson)
    
  } catch (err) {
    _logger('Error updating time series data: %O', err)
  }
}

/**
 * Get recent requests from the database
 * @param {number} limit Max number of requests to retrieve
 * @returns {Array} Array of recent request objects
 */
export function getRecentRequests(limit = 100) {
  const stmt = db.prepare(`
    SELECT timestamp, process_id as processId, action, ip, duration
    FROM requests
    ORDER BY timestamp DESC
    LIMIT ?
  `)
  
  return stmt.all(limit)
}

/**
 * Get process counts from the database
 * @returns {Object} Object with process IDs as keys and counts as values
 */
export function getProcessCounts() {
  const rows = db.prepare('SELECT process_id, count FROM process_counts').all()
  
  // Convert to object format
  const processCounts = {}
  rows.forEach(row => {
    processCounts[row.process_id] = row.count
  })
  
  return processCounts
}

/**
 * Get action counts from the database
 * @returns {Object} Object with actions as keys and counts as values
 */
export function getActionCounts() {
  const rows = db.prepare('SELECT action, count FROM action_counts').all()
  
  // Convert to object format
  const actionCounts = {}
  rows.forEach(row => {
    actionCounts[row.action] = row.count
  })
  
  return actionCounts
}

/**
 * Get process timing metrics from the database
 * @returns {Object} Object with process IDs as keys and timing stats as values
 */
export function getProcessTiming() {
  const rows = db.prepare('SELECT process_id, count, total_duration FROM process_counts').all()
  
  // Convert to object with timing stats
  const processTiming = {}
  rows.forEach(row => {
    processTiming[row.process_id] = {
      totalDuration: row.total_duration,
      count: row.count
    }
  })
  
  return processTiming
}

/**
 * Get action timing metrics from the database
 * @returns {Object} Object with actions as keys and timing stats as values
 */
export function getActionTiming() {
  const rows = db.prepare('SELECT action, count, total_duration FROM action_counts').all()
  
  // Convert to object with timing stats
  const actionTiming = {}
  rows.forEach(row => {
    actionTiming[row.action] = {
      totalDuration: row.total_duration,
      count: row.count
    }
  })
  
  return actionTiming
}

/**
 * Get IP address counts from the database
 * @returns {Object} Object with IPs as keys and counts as values
 */
export function getIpCounts() {
  const rows = db.prepare('SELECT ip, count FROM ip_counts').all()
  
  // Convert to object format
  const ipCounts = {}
  rows.forEach(row => {
    ipCounts[row.ip] = row.count
  })
  
  return ipCounts
}

/**
 * Get referrer counts from the database
 * @returns {Object} Object with referrers as keys and counts as values
 */
export function getReferrerCounts() {
  const rows = db.prepare('SELECT referrer, count FROM referrer_counts').all()
  
  // Convert to object format
  const referrerCounts = {}
  rows.forEach(row => {
    referrerCounts[row.referrer] = row.count
  })
  
  return referrerCounts
}

/**
 * Get time series data from the database
 * @param {number} hours Number of hours of data to retrieve
 * @returns {Array} Array of time series bucket objects
 */
export function getTimeSeriesData(hours = 24) {
  // Calculate cutoff time
  const cutoffTime = new Date()
  cutoffTime.setHours(cutoffTime.getHours() - hours)
  
  const stmt = db.prepare(`
    SELECT bucket_time as timestamp, hour, total_requests, process_counts
    FROM time_series
    WHERE bucket_time >= ?
    ORDER BY bucket_time ASC
  `)
  
  const rows = stmt.all(cutoffTime.toISOString())
  
  // Convert process_counts from JSON string to object
  return rows.map(row => ({
    timestamp: row.timestamp,
    hour: row.hour,
    totalRequests: row.total_requests,
    processCounts: JSON.parse(row.process_counts || '{}')
  }))
}

/**
 * Get request details for a specific process
 * @param {string} processId Process ID to get details for
 * @param {number} limit Maximum number of details to retrieve
 * @returns {Array} Array of detail objects
 */
export function getRequestDetails(processId, limit = 20) {
  const stmt = db.prepare(`
    SELECT details
    FROM request_details
    WHERE process_id = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `)
  
  const rows = stmt.all(processId, limit)
  
  // Parse JSON details
  return rows.map(row => JSON.parse(row.details))
}

/**
 * Get total request count from the database
 * @returns {number} Total number of requests
 */
export function getTotalRequests() {
  const result = db.prepare('SELECT COUNT(*) as count FROM requests').get()
  return result ? result.count : 0
}

/**
 * Close the database connection
 * Should be called when the application shuts down
 */
export function closeDatabase() {
  if (db) {
    db.close()
    _logger('Database connection closed')
  }
}

// Ensure database is closed on process exit
process.on('exit', closeDatabase)
process.on('SIGINT', () => {
  closeDatabase()
  process.exit(0)
})
