/**
 * PostgreSQL database connection and operations for AO Universal Router
 */
import pg from 'pg'
import format from 'pg-format'
import { logger } from './logger.js'
import { config } from './config.js'

const _logger = logger.child('database')

let pool = null

/**
 * Initialize the database connection pool
 */
export async function initDatabase() {
  if (!config.usePostgres || !config.dbUrl) {
    _logger('PostgreSQL storage disabled. Set USE_POSTGRES=true and DB_URL to enable.')
    return false
  }

  _logger('POSTGRES CONFIG: Attempting to connect with URL: %s', config.dbUrl.replace(/:\/\/[^:]+:[^@]+@/, '://****:****@'))
  console.log('POSTGRES CONFIG: Attempting to connect with URL:', config.dbUrl.replace(/:\/\/[^:]+:[^@]+@/, '://****:****@'))
  
  try {
    // First connect to default postgres DB to create our metrics database if needed
    const adminPool = new pg.Pool({
      connectionString: config.dbUrl,
      max: 1
    })
    
    try {
      const adminClient = await adminPool.connect()
      _logger('POSTGRES: Connected to admin database to check/create metrics database')
      console.log('POSTGRES: Connected to admin database to check/create metrics database')
      
      // The ur_metrics database already exists - we'll validate it
      _logger('POSTGRES: Checking if ur_metrics database exists')
      console.log('POSTGRES: Checking if ur_metrics database exists')
      
      const dbCheckResult = await adminClient.query(
        "SELECT 1 FROM pg_database WHERE datname = 'ur_metrics'"
      )
      
      if (dbCheckResult.rows.length > 0) {
        _logger('POSTGRES: Confirmed ur_metrics database exists')
        console.log('POSTGRES: Confirmed ur_metrics database exists')
      } else {
        _logger('POSTGRES ERROR: The ur_metrics database does not exist')
        console.error('POSTGRES ERROR: The ur_metrics database does not exist. Please create it first.')
        throw new Error('ur_metrics database does not exist - it must be created in AWS RDS console')
      }
      
      adminClient.release()
    } catch (err) {
      _logger('POSTGRES ERROR: Failed to create database: %O', err)
      console.error('POSTGRES ERROR: Failed to create database:', err)
    } finally {
      await adminPool.end()
    }
    
    // Connect to the existing ur_metrics database directly
    let dbUrl = config.dbUrl
    
    // Modify the connection URL to use the ur_metrics database
    try {
      // Parse the URL and change the database name
      const parsedUrl = new URL(dbUrl)
      parsedUrl.pathname = '/ur_metrics'
      dbUrl = parsedUrl.toString()
      _logger('POSTGRES: Modified URL to connect to ur_metrics database')
      console.log('POSTGRES: Modified URL to connect to ur_metrics database')
    } catch (err) {
      // Fallback to string replacement
      if (dbUrl.includes('/postgres')) {
        dbUrl = dbUrl.replace('/postgres', '/ur_metrics')
        _logger('POSTGRES: Changed connection string to use ur_metrics database')
        console.log('POSTGRES: Changed connection string to use ur_metrics database')
      } else {
        _logger('POSTGRES ERROR: Could not modify connection URL')
        console.error('POSTGRES ERROR: Could not modify connection URL:', err.message)
      }
    }
    
    _logger('POSTGRES: Connecting to metrics database at %s', dbUrl.replace(/:\/\/[^:]+:[^@]+@/, '://****:****@'))
    console.log('POSTGRES: Connecting to metrics database at', dbUrl.replace(/:\/\/[^:]+:[^@]+@/, '://****:****@'))
    
    // Create connection pool to the metrics database
    pool = new pg.Pool({
      connectionString: dbUrl,
      max: config.dbPoolSize,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
    
    // Handle pool errors
    pool.on('error', (err) => {
      _logger('POSTGRES ERROR: Unexpected database pool error: %O', err)
      console.error('POSTGRES ERROR: Unexpected database pool error:', err)
    })

    // Pool is now initialized

    // Test connection to metrics database
    const client = await pool.connect()
    _logger('POSTGRES: Successfully acquired connection to metrics database')
    console.log('POSTGRES: Successfully acquired connection to metrics database')
    
    const result = await client.query('SELECT NOW(), current_database() as db_name, current_schema as schema_name')
    client.release()

    _logger('POSTGRES: Connected to database %s using schema %s at %s', 
      result.rows[0].db_name,
      result.rows[0].schema_name, 
      result.rows[0].now)
    console.log('POSTGRES: Connected to database', result.rows[0].db_name, 
                'using schema', result.rows[0].schema_name,
                'at', result.rows[0].now)
    
    // Initialize tables
    const tablesCreated = await createTables()
    _logger('POSTGRES: Database tables initialized: %s', tablesCreated ? 'SUCCESS' : 'FAILED')
    console.log('POSTGRES: Database tables initialized:', tablesCreated ? 'SUCCESS' : 'FAILED')
    
    return true
  } catch (err) {
    _logger('Failed to connect to PostgreSQL: %O', err)
    return false
  }
}

/**
 * Create necessary database tables if they don't exist
 */
/**
 * For diagnostic purposes - checks database connection and returns info about tables
 */
export async function getDatabaseDiagnostics() {
  if (!pool) return { connected: false, message: 'No database pool created' }
  
  try {
    const client = await pool.connect()
    try {
      // Check connection
      const connectionInfo = await client.query('SELECT current_database() as db_name, current_schema as schema_name')
      
      // Check tables
      const tablesQuery = await client.query(
        "SELECT table_name, (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count " + 
        "FROM information_schema.tables t WHERE table_schema = current_schema() AND table_name LIKE 'ur_metrics_%'"
      )
      
      // Check record counts
      const recordCounts = []
      for (const table of tablesQuery.rows) {
        try {
          const countResult = await client.query(`SELECT COUNT(*) FROM ${table.table_name}`)
          recordCounts.push({ table: table.table_name, count: parseInt(countResult.rows[0].count) })
        } catch (err) {
          recordCounts.push({ table: table.table_name, error: err.message })
        }
      }
      
      return {
        connected: true,
        database: connectionInfo.rows[0].db_name,
        schema: connectionInfo.rows[0].schema_name,
        tables: tablesQuery.rows,
        recordCounts
      }
    } finally {
      client.release()
    }
  } catch (err) {
    return { connected: false, error: err.message }
  }
}

async function createTables() {
  const client = await pool.connect()
  
  try {
    // Start transaction
    await client.query('BEGIN')
    
    // Ensure we're using the public schema in the ur_metrics database
    await client.query('SET search_path TO public')
    
    _logger('POSTGRES: Creating tables in ur_metrics database')
    console.log('POSTGRES: Creating tables in ur_metrics database')
    
    // Drop existing tables to recreate with improved schema
    await client.query(`
      DROP TABLE IF EXISTS ur_metrics_requests CASCADE;
      DROP TABLE IF EXISTS ur_metrics_process_counts CASCADE;
      DROP TABLE IF EXISTS ur_metrics_action_counts CASCADE;
      DROP TABLE IF EXISTS ur_metrics_ip_counts CASCADE;
      DROP TABLE IF EXISTS ur_metrics_referrer_counts CASCADE;
      DROP TABLE IF EXISTS ur_metrics_time_series CASCADE;
      DROP TABLE IF EXISTS ur_metrics_request_details CASCADE;
      DROP TABLE IF EXISTS ur_metrics_server_info CASCADE;
    `)
    
    _logger('POSTGRES: Dropped existing tables for fresh schema')
    console.log('POSTGRES: Dropped existing tables for fresh schema')
    
    // Create improved requests table with more details
    await client.query(`
      CREATE TABLE IF NOT EXISTS ur_metrics_requests (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL,
        process_id TEXT,
        ip TEXT,
        action TEXT,
        duration INTEGER,
        method TEXT,
        path TEXT,
        referer TEXT,
        origin TEXT,
        user_agent TEXT,
        content_type TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    
    // Create process counts table with more statistics
    await client.query(`
      CREATE TABLE IF NOT EXISTS ur_metrics_process_counts (
        process_id TEXT PRIMARY KEY,
        count INTEGER DEFAULT 0,
        total_duration BIGINT DEFAULT 0,
        min_duration INTEGER,
        max_duration INTEGER,
        first_seen TIMESTAMPTZ,
        last_seen TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    
    // Create action counts table with more statistics
    await client.query(`
      CREATE TABLE IF NOT EXISTS ur_metrics_action_counts (
        action TEXT PRIMARY KEY,
        count INTEGER DEFAULT 0,
        total_duration BIGINT DEFAULT 0,
        min_duration INTEGER,
        max_duration INTEGER,
        first_seen TIMESTAMPTZ,
        last_seen TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    
    // Create IP counts table with more details
    await client.query(`
      CREATE TABLE IF NOT EXISTS ur_metrics_ip_counts (
        ip TEXT PRIMARY KEY,
        count INTEGER DEFAULT 0,
        first_seen TIMESTAMPTZ,
        last_seen TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    
    // Create referrer counts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ur_metrics_referrer_counts (
        referrer TEXT PRIMARY KEY,
        count INTEGER DEFAULT 0,
        first_seen TIMESTAMPTZ,
        last_seen TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    
    // Create improved time series data table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ur_metrics_time_series (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL,
        hour INTEGER NOT NULL,
        total_requests INTEGER DEFAULT 0,
        process_counts JSONB DEFAULT '{}'::jsonb,
        action_counts JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(timestamp)
      )
    `)
    
    // Create enhanced request details table for rich data
    await client.query(`
      CREATE TABLE IF NOT EXISTS ur_metrics_request_details (
        id SERIAL PRIMARY KEY,
        process_id TEXT NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL,
        ip TEXT,
        referer TEXT,
        action TEXT,
        method TEXT,
        path TEXT,
        tags JSONB,
        body JSONB,
        duration INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    
    // Create server info table for metadata
    await client.query(`
      CREATE TABLE IF NOT EXISTS ur_metrics_server_info (
        id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Only one row allowed
        start_time TIMESTAMPTZ NOT NULL,
        total_requests BIGINT DEFAULT 0,
        last_updated TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    
    // Create indexes for better query performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_request_details_process_id ON ur_metrics_request_details(process_id);
      CREATE INDEX IF NOT EXISTS idx_request_details_timestamp ON ur_metrics_request_details(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_requests_timestamp ON ur_metrics_requests(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_requests_process_id ON ur_metrics_requests(process_id);
      CREATE INDEX IF NOT EXISTS idx_requests_action ON ur_metrics_requests(action);
      CREATE INDEX IF NOT EXISTS idx_time_series_timestamp ON ur_metrics_time_series(timestamp DESC);
    `)
    
    // Commit transaction
    await client.query('COMMIT')
    
    _logger('Database tables initialized successfully')
  } catch (err) {
    await client.query('ROLLBACK')
    _logger('Error initializing database tables: %O', err)
    throw err
  } finally {
    client.release()
  }
}

/**
 * Insert enhanced request metrics with all available fields
 * @param {Object} request Enhanced request metrics object
 * @returns {Promise<boolean>} Success flag
 */
export async function insertRequestMetrics(request) {
  if (!pool) return false
  
  try {
    const { 
      timestamp, 
      processId, 
      ip, 
      action, 
      duration,
      method,
      path,
      referer,
      origin,
      userAgent,
      contentType
    } = request
    
    // Use parameterized query with all fields from our enhanced schema
    const result = await pool.query(`
      INSERT INTO ur_metrics_requests(
        timestamp, 
        process_id, 
        ip, 
        action, 
        duration, 
        method, 
        path, 
        referer, 
        origin, 
        user_agent, 
        content_type
      ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
      RETURNING id
    `, [
      new Date(timestamp), 
      processId, 
      ip || null, 
      action || null, 
      duration || 0,
      method || null,
      path || null,
      referer || null,
      origin || null,
      userAgent || null,
      contentType || null
    ])
    
    return result.rows.length > 0
  } catch (err) {
    _logger('Error inserting enhanced request metrics: %O', err)
    return false
  }
}

/**
 * Insert or update process count with enhanced statistics
 * @param {string} processId Process ID
 * @param {number} duration Request duration in ms
 * @returns {Promise<boolean>} Success flag
 */
export async function updateProcessCount(processId, duration) {
  if (!pool || !processId) return false
  
  try {
    // Use proper timestamps for first_seen and last_seen
    const now = new Date();
    
    await pool.query(`
      INSERT INTO ur_metrics_process_counts(
        process_id, 
        count, 
        total_duration, 
        min_duration, 
        max_duration,
        first_seen,
        last_seen,
        updated_at
      )
      VALUES($1, 1, $2, $2, $2, $3, $3, $3)
      ON CONFLICT (process_id) 
      DO UPDATE SET 
        count = ur_metrics_process_counts.count + 1,
        total_duration = ur_metrics_process_counts.total_duration + $2,
        min_duration = LEAST(ur_metrics_process_counts.min_duration, $2),
        max_duration = GREATEST(ur_metrics_process_counts.max_duration, $2),
        last_seen = $3,
        updated_at = $3
    `, [processId, duration, now])
    
    return true
  } catch (err) {
    _logger('Error updating process count: %O', err)
    return false
  }
}

/**
 * Insert or update action count with enhanced statistics
 * @param {string} action Action name
 * @param {number} duration Request duration in ms
 * @returns {Promise<boolean>} Success flag
 */
export async function updateActionCount(action, duration) {
  if (!pool || !action) return false
  
  try {
    const now = new Date();
    
    await pool.query(`
      INSERT INTO ur_metrics_action_counts(
        action, 
        count, 
        total_duration, 
        min_duration, 
        max_duration,
        first_seen,
        last_seen,
        updated_at
      )
      VALUES($1, 1, $2, $2, $2, $3, $3, $3)
      ON CONFLICT (action) 
      DO UPDATE SET 
        count = ur_metrics_action_counts.count + 1,
        total_duration = ur_metrics_action_counts.total_duration + $2,
        min_duration = LEAST(ur_metrics_action_counts.min_duration, $2),
        max_duration = GREATEST(ur_metrics_action_counts.max_duration, $2),
        last_seen = $3,
        updated_at = $3
    `, [action, duration, now])
    
    return true
  } catch (err) {
    _logger('Error updating action count: %O', err)
    return false
  }
}

/**
 * Insert or update IP count with enhanced statistics
 * @param {string} ip IP address
 * @returns {Promise<boolean>} Success flag
 */
export async function updateIpCount(ip) {
  if (!pool || !ip || ip === '') return false
  
  try {
    const now = new Date();
    
    await pool.query(`
      INSERT INTO ur_metrics_ip_counts(ip, count, first_seen, last_seen, updated_at)
      VALUES($1, 1, $2, $2, $2)
      ON CONFLICT (ip) 
      DO UPDATE SET 
        count = ur_metrics_ip_counts.count + 1,
        last_seen = $2,
        updated_at = $2
    `, [ip, now])
    
    return true
  } catch (err) {
    _logger('Error updating IP count: %O', err)
    return false
  }
}

/**
 * Insert or update referrer count with enhanced statistics
 * @param {string} referrer Referrer URL
 * @returns {Promise<boolean>} Success flag
 */
export async function updateReferrerCount(referrer) {
  if (!pool || !referrer || referrer === '') return false
  
  try {
    const now = new Date();
    
    await pool.query(`
      INSERT INTO ur_metrics_referrer_counts(referrer, count, first_seen, last_seen, updated_at)
      VALUES($1, 1, $2, $2, $2)
      ON CONFLICT (referrer) 
      DO UPDATE SET 
        count = ur_metrics_referrer_counts.count + 1,
        last_seen = $2,
        updated_at = $2
    `, [referrer, now])
    
    return true
  } catch (err) {
    _logger('Error updating referrer count: %O', err)
    return false
  }
}

/**
 * Insert enhanced request details
 * @param {Object} details Request details object with rich data
 * @returns {Promise<boolean>} Success flag
 */
export async function insertRequestDetails(details) {
  if (!pool || !details || !details.processId) return false
  
  try {
    const { 
      processId, 
      ip, 
      referer, 
      timestamp, 
      action, 
      method, 
      path,
      tags,
      body,
      duration,
      jsonBody
    } = details
    
    // Prepare JSONB data carefully
    let tagsJson = null;
    let bodyJson = null;
    
    // Handle tags - important for AO processes
    if (tags) {
      if (typeof tags === 'string') {
        try {
          tagsJson = JSON.parse(tags);
        } catch (e) {
          // If parsing fails, store as an array with one string item
          tagsJson = [tags];
        }
      } else if (Array.isArray(tags)) {
        tagsJson = tags;
      } else if (typeof tags === 'object') {
        tagsJson = tags;
      }
    }
    
    // Handle body data
    if (jsonBody) {
      bodyJson = jsonBody;
    } else if (body) {
      if (typeof body === 'string') {
        try {
          bodyJson = JSON.parse(body);
        } catch (e) {
          // Store as string if parsing fails
          bodyJson = { raw: body.substring(0, 5000) };
        }
      } else if (typeof body === 'object') {
        bodyJson = body;
      }
    }
    
    // Store detailed info with all fields properly mapped
    await pool.query(`
      INSERT INTO ur_metrics_request_details(
        process_id, 
        timestamp, 
        ip, 
        referer, 
        action, 
        method, 
        path, 
        tags, 
        body, 
        duration
      )
      VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      processId, 
      new Date(timestamp), 
      ip || null, 
      referer || null,
      action || null,
      method || null,
      path || null,
      tagsJson ? JSON.stringify(tagsJson) : null,
      bodyJson ? JSON.stringify(bodyJson) : null,
      duration || null
    ])
    
    // Limit to 100 most recent records per process_id
    await pool.query(`
      WITH ranked_details AS (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY process_id ORDER BY timestamp DESC) as rn
        FROM ur_metrics_request_details
        WHERE process_id = $1
      )
      DELETE FROM ur_metrics_request_details
      WHERE id IN (
        SELECT id FROM ranked_details WHERE rn > 100
      )
    `, [processId])
    
    return true
  } catch (err) {
    _logger('Error inserting request details: %O', err)
    return false
  }
}

// Note: The updateTimeSeriesData function has been moved and enhanced
// with action support. See the implementation further down in this file.

/**
 * Increment total request count
 * @returns {Promise<boolean>} Success flag
 */
export async function incrementTotalRequests() {
  if (!pool) return false
  
  try {
    await pool.query(`
      INSERT INTO ur_metrics_server_info(id, start_time, total_requests, last_updated)
      VALUES(1, $1, 1, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        total_requests = ur_metrics_server_info.total_requests + 1,
        last_updated = NOW()
    `, [new Date()])
    
    return true
  } catch (err) {
    _logger('Error incrementing total requests: %O', err)
    return false
  }
}

// Note: The getRecentRequests function has been moved and enhanced
// with additional fields and details. See the implementation further down in this file.

/**
 * Get process counts with enhanced statistics
 * @returns {Promise<Object>} Process counts with timing statistics
 */
export async function getProcessCounts() {
  if (!pool) return {}
  
  try {
    const result = await pool.query(`
      SELECT 
        process_id, 
        count, 
        total_duration,
        min_duration,
        max_duration,
        first_seen,
        last_seen
      FROM ur_metrics_process_counts
      ORDER BY count DESC
    `)
    
    const processCounts = {}
    result.rows.forEach(row => {
      processCounts[row.process_id] = {
        count: parseInt(row.count, 10),
        totalDuration: parseInt(row.total_duration || 0, 10),
        avgDuration: row.count > 0 ? Math.round(parseInt(row.total_duration || 0, 10) / parseInt(row.count, 10)) : 0,
        minDuration: row.min_duration,
        maxDuration: row.max_duration,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen
      }
    })
    
    return processCounts
  } catch (err) {
    _logger('Error getting process counts: %O', err)
    return {}
  }
}

/**
 * Get action counts with enhanced statistics
 * @returns {Promise<Object>} Action counts with timing statistics
 */
export async function getActionCounts() {
  if (!pool) return {}
  
  try {
    const result = await pool.query(`
      SELECT 
        action, 
        count, 
        total_duration,
        min_duration,
        max_duration,
        first_seen,
        last_seen
      FROM ur_metrics_action_counts
      ORDER BY count DESC
    `)
    
    const actionCounts = {}
    result.rows.forEach(row => {
      if (!row.action) return // Skip actions with null name
      
      actionCounts[row.action] = {
        count: parseInt(row.count, 10),
        totalDuration: parseInt(row.total_duration || 0, 10),
        avgDuration: row.count > 0 ? Math.round(parseInt(row.total_duration || 0, 10) / parseInt(row.count, 10)) : 0,
        minDuration: row.min_duration,
        maxDuration: row.max_duration,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen
      }
    })
    
    return actionCounts
  } catch (err) {
    _logger('Error getting action counts: %O', err)
    return {}
  }
}

/**
 * Get IP counts with enhanced statistics
 * @returns {Promise<Object>} IP address counts with timing statistics
 */
export async function getIpCounts() {
  if (!pool) return {}
  
  try {
    const result = await pool.query(`
      SELECT 
        ip, 
        count,
        first_seen,
        last_seen
      FROM ur_metrics_ip_counts
      ORDER BY count DESC
    `)
    
    const ipCounts = {}
    result.rows.forEach(row => {
      if (!row.ip) return // Skip IPs with null value
      
      ipCounts[row.ip] = {
        count: parseInt(row.count, 10),
        firstSeen: row.first_seen,
        lastSeen: row.last_seen
      }
    })
    
    return ipCounts
  } catch (err) {
    _logger('Error getting IP counts: %O', err)
    return {}
  }
}

/**
 * Get referrer counts with enhanced statistics
 * @returns {Promise<Object>} Referrer counts with timing statistics
 */
export async function getReferrerCounts() {
  if (!pool) return {}
  
  try {
    const result = await pool.query(`
      SELECT 
        referrer, 
        count,
        first_seen,
        last_seen
      FROM ur_metrics_referrer_counts
      ORDER BY count DESC
    `)
    
    const referrerCounts = {}
    result.rows.forEach(row => {
      if (!row.referrer) return // Skip referrers with null value
      
      referrerCounts[row.referrer] = {
        count: parseInt(row.count, 10),
        firstSeen: row.first_seen,
        lastSeen: row.last_seen
      }
    })
    
    return referrerCounts
  } catch (err) {
    _logger('Error getting referrer counts: %O', err)
    return {}
  }
}

/**
 * Get process timing statistics
 * @returns {Promise<Object>} Process timing statistics
 */
export async function getProcessTiming() {
  if (!pool) return {}
  
  try {
    const result = await pool.query(`
      SELECT 
        process_id, 
        count, 
        total_duration
      FROM ur_metrics_process_counts
      WHERE count > 0
    `)
    
    const processTiming = {}
    result.rows.forEach(row => {
      const count = parseInt(row.count, 10)
      const totalDuration = parseInt(row.total_duration || 0, 10)
      
      if (count > 0) {
        processTiming[row.process_id] = Math.round(totalDuration / count)
      }
    })
    
    return processTiming
  } catch (err) {
    _logger('Error getting process timing: %O', err)
    return {}
  }
}

/**
 * Get action timing statistics
 * @returns {Promise<Object>} Action timing statistics
 */
export async function getActionTiming() {
  if (!pool) return {}
  
  try {
    const result = await pool.query(`
      SELECT 
        action, 
        count, 
        total_duration
      FROM ur_metrics_action_counts
      WHERE count > 0
    `)
    
    const actionTiming = {}
    result.rows.forEach(row => {
      if (!row.action) return // Skip actions with null name
      
      const count = parseInt(row.count, 10)
      const totalDuration = parseInt(row.total_duration || 0, 10)
      
      if (count > 0) {
        actionTiming[row.action] = Math.round(totalDuration / count)
      }
    })
    
    return actionTiming
  } catch (err) {
    _logger('Error getting action timing: %O', err)
    return {}
  }
}

/**
 * Get process counts
 * @returns {Promise<Object>} Process counts
 */
export async function getProcessCounts() {
  if (!pool) return {}
  
  try {
    const result = await pool.query(`
      SELECT process_id as key, count as value
      FROM ur_metrics_process_counts
      ORDER BY count DESC
    `)
    
    // Convert array of {key, value} to object
    return result.rows.reduce((acc, row) => {
      acc[row.key] = row.value
      return acc
    }, {})
  } catch (err) {
    _logger('Error getting process counts: %O', err)
    return {}
  }
}

/**
 * Get action counts
 * @returns {Promise<Object>} Action counts
 */
export async function getActionCounts() {
  if (!pool) return {}
  
  try {
    const result = await pool.query(`
      SELECT action as key, count as value
      FROM ur_metrics_action_counts
      ORDER BY count DESC
    `)
    
    // Convert array of {key, value} to object
    return result.rows.reduce((acc, row) => {
      acc[row.key] = row.value
      return acc
    }, {})
  } catch (err) {
    _logger('Error getting action counts: %O', err)
    return {}
  }
}

/**
 * Get IP counts
 * @returns {Promise<Object>} IP counts
 */
export async function getIpCounts() {
  if (!pool) return {}
  
  try {
    const result = await pool.query(`
      SELECT ip as key, count as value
      FROM ur_metrics_ip_counts
      ORDER BY count DESC
    `)
    
    // Convert array of {key, value} to object
    return result.rows.reduce((acc, row) => {
      acc[row.key] = row.value
      return acc
    }, {})
  } catch (err) {
    _logger('Error getting IP counts: %O', err)
    return {}
  }
}

/**
 * Get referrer counts
 * @returns {Promise<Object>} Referrer counts
 */
export async function getReferrerCounts() {
  if (!pool) return {}
  
  try {
    const result = await pool.query(`
      SELECT referrer as key, count as value
      FROM ur_metrics_referrer_counts
      ORDER BY count DESC
    `)
    
    // Convert array of {key, value} to object
    return result.rows.reduce((acc, row) => {
      acc[row.key] = row.value
      return acc
    }, {})
  } catch (err) {
    _logger('Error getting referrer counts: %O', err)
    return {}
  }
}

/**
 * Get process timing metrics
 * @returns {Promise<Object>} Process timing metrics
 */
export async function getProcessTiming() {
  if (!pool) return {}
  
  try {
    const result = await pool.query(`
      SELECT 
        process_id as key, 
        json_build_object(
          'totalDuration', total_duration,
          'count', count
        ) as value
      FROM ur_metrics_process_counts
      ORDER BY count DESC
    `)
    
    // Convert array of {key, value} to object
    return result.rows.reduce((acc, row) => {
      acc[row.key] = row.value
      return acc
    }, {})
  } catch (err) {
    _logger('Error getting process timing: %O', err)
    return {}
  }
}

/**
 * Get action timing metrics
 * @returns {Promise<Object>} Action timing metrics
 */
export async function getActionTiming() {
  if (!pool) return {}
  
  try {
    const result = await pool.query(`
      SELECT 
        action as key, 
        json_build_object(
          'totalDuration', total_duration,
          'count', count
        ) as value
      FROM ur_metrics_action_counts
      ORDER BY count DESC
    `)
    
    // Convert array of {key, value} to object
    return result.rows.reduce((acc, row) => {
      acc[row.key] = row.value
      return acc
    }, {})
  } catch (err) {
    _logger('Error getting action timing: %O', err)
    return {}
  }
}

/**
 * Get the database pool for direct use
 * Used for test data generation and debugging
 * @returns {Object} Database pool or null if not connected
 */
export function getDbPool() {
  return pool;
}

/**
 * Update time series data with advanced metrics
 * @param {string} processId Process ID
 * @param {string} timestamp ISO timestamp string
 * @param {string} action Optional action name
 * @returns {Promise<boolean>} Success flag
 */
export async function updateTimeSeriesData(processId, timestamp, action = null) {
  if (!pool || !processId) return false
  
  try {
    const now = new Date(timestamp || Date.now())
    const hour = now.getUTCHours() // Use UTC hours for consistency
    
    // Round timestamp to the hour for bucketing
    const bucketTimestamp = new Date(now)
    bucketTimestamp.setUTCMinutes(0, 0, 0)
    
    // First, try to find and update existing bucket
    const existingBucket = await pool.query(`
      SELECT id, process_counts, action_counts 
      FROM ur_metrics_time_series 
      WHERE timestamp = $1
    `, [bucketTimestamp])
    
    if (existingBucket.rows.length > 0) {
      // Update existing bucket
      const { id, process_counts, action_counts } = existingBucket.rows[0]
      
      // Parse existing JSON data
      const processCounts = process_counts || {}
      const actionCounts = action_counts || {}
      
      // Update counts
      processCounts[processId] = (processCounts[processId] || 0) + 1
      if (action) {
        actionCounts[action] = (actionCounts[action] || 0) + 1
      }
      
      // Update the row
      await pool.query(`
        UPDATE ur_metrics_time_series 
        SET 
          total_requests = total_requests + 1,
          process_counts = $1,
          action_counts = $2
        WHERE id = $3
      `, [JSON.stringify(processCounts), JSON.stringify(actionCounts), id])
    } else {
      // Create new bucket
      const processCounts = {}
      processCounts[processId] = 1
      
      const actionCounts = {}
      if (action) {
        actionCounts[action] = 1
      }
      
      await pool.query(`
        INSERT INTO ur_metrics_time_series(
          timestamp, 
          hour, 
          total_requests, 
          process_counts,
          action_counts
        )
        VALUES($1, $2, 1, $3, $4)
      `, [
        bucketTimestamp, 
        hour, 
        JSON.stringify(processCounts),
        JSON.stringify(actionCounts)
      ])
    }
    
    return true
  } catch (err) {
    _logger('Error updating time series data: %O', err)
    return false
  }
}

/**
 * Get time series data for dashboard with additional metrics
 * @param {number} hours Number of hours of data to retrieve
 * @returns {Promise<Array>} Time series data array
 */
export async function getTimeSeriesData(hours = 24) {
  if (!pool) return []
  try {
    const result = await pool.query(`
      SELECT 
        timestamp, 
        hour, 
        total_requests as "totalRequests", 
        process_counts as "processCounts",
        action_counts as "actionCounts"
      FROM ur_metrics_time_series
      ORDER BY timestamp DESC
      LIMIT $1
    `, [hours])
    return result.rows
  } catch (err) {
    _logger('Error getting time series data: %O', err)
    return []
  }
}

/**
 * Get top process counts with extended metrics
 * @param {number} limit Maximum number of items to return
 * @returns {Promise<Array>} Top process counts with statistics
 */
export async function getTopProcessCounts(limit = 20) {
  if (!pool) return []
  try {
    const result = await pool.query(`
      SELECT 
        process_id, 
        count, 
        total_duration,
        min_duration,
        max_duration,
        first_seen,
        last_seen
      FROM ur_metrics_process_counts
      ORDER BY count DESC
      LIMIT $1
    `, [limit])
    return result.rows
  } catch (err) {
    _logger('Error getting top process counts: %O', err)
    return []
  }
}

/**
 * Get top action counts with extended metrics
 * @param {number} limit Maximum number of items to return
 * @returns {Promise<Array>} Top action counts with statistics
 */
export async function getTopActionCounts(limit = 20) {
  if (!pool) return []
  try {
    const result = await pool.query(`
      SELECT 
        action, 
        count, 
        total_duration,
        min_duration,
        max_duration,
        first_seen,
        last_seen
      FROM ur_metrics_action_counts
      ORDER BY count DESC
      LIMIT $1
    `, [limit])
    return result.rows
  } catch (err) {
    _logger('Error getting top action counts: %O', err)
    return []
  }
}

/**
 * Get top IP counts with extended metrics
 * @param {number} limit Maximum number of items to return
 * @returns {Promise<Array>} Top IP counts with statistics
 */
export async function getTopIpCounts(limit = 20) {
  if (!pool) return []
  try {
    const result = await pool.query(`
      SELECT 
        ip, 
        count,
        first_seen,
        last_seen
      FROM ur_metrics_ip_counts
      ORDER BY count DESC
      LIMIT $1
    `, [limit])
    return result.rows
  } catch (err) {
    _logger('Error getting top IP counts: %O', err)
    return []
  }
}

/**
 * Get top referrer counts with extended metrics
 * @param {number} limit Maximum number of items to return
 * @returns {Promise<Array>} Top referrer counts with statistics
 */
export async function getTopReferrerCounts(limit = 20) {
  if (!pool) return []
  try {
    const result = await pool.query(`
      SELECT 
        referrer, 
        count,
        first_seen,
        last_seen
      FROM ur_metrics_referrer_counts
      ORDER BY count DESC
      LIMIT $1
    `, [limit])
    return result.rows
  } catch (err) {
    _logger('Error getting top referrer counts: %O', err)
    return []
  }
}

/**
 * Get recent requests with detailed information
 * @param {number} limit Maximum number of requests to return
 * @returns {Promise<Array>} Recent requests with details
 */
export async function getRecentRequests(limit = 50) {
  if (!pool) return []
  try {
    const result = await pool.query(`
      SELECT 
        r.id,
        r.timestamp,
        r.process_id,
        r.action,
        r.ip,
        r.duration,
        r.method,
        r.path,
        r.referer,
        r.origin,
        r.user_agent,
        r.content_type,
        d.tags,
        d.body
      FROM ur_metrics_requests r
      LEFT JOIN ur_metrics_request_details d ON r.process_id = d.process_id AND r.timestamp = d.timestamp
      ORDER BY r.timestamp DESC
      LIMIT $1
    `, [limit])
    
    // Process and normalize the results
    return result.rows.map(row => {
      // Parse JSONB fields if they exist
      let tags = null;
      let body = null;
      
      if (row.tags) {
        try {
          tags = typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags;
        } catch (e) {
          // Silent catch
        }
      }
      
      if (row.body) {
        try {
          body = typeof row.body === 'string' ? JSON.parse(row.body) : row.body;
        } catch (e) {
          // Silent catch
        }
      }
      
      return {
        id: row.id,
        timestamp: row.timestamp,
        processId: row.process_id,
        action: row.action,
        ip: row.ip,
        duration: row.duration,
        method: row.method,
        path: row.path,
        referer: row.referer,
        origin: row.origin,
        userAgent: row.user_agent,
        contentType: row.content_type,
        tags,
        body
      };
    });
  } catch (err) {
    _logger('Error getting recent requests: %O', err)
    return []
  }
}

/**
 * Get total requests and server start time
 * @returns {Promise<Object>} Server info
 */
export async function getServerInfo() {
  if (!pool) return { totalRequests: 0, startTime: new Date().toISOString() }
  
  try {
    const result = await pool.query(`
      SELECT total_requests as "totalRequests", start_time as "startTime"
      FROM ur_metrics_server_info
      WHERE id = 1
    `)
    
    if (result.rows.length === 0) {
      return { totalRequests: 0, startTime: new Date().toISOString() }
    }
    
    return result.rows[0]
  } catch (err) {
    _logger('Error getting server info: %O', err)
    return { totalRequests: 0, startTime: new Date().toISOString() }
  }
}

/**
 * Get request details for a specific process
 * @param {string} processId Process ID
 * @returns {Promise<Array>} Request details
 */
export async function getRequestDetails(processId) {
  if (!pool || !processId) return []
  
  try {
    const result = await pool.query(`
      SELECT details
      FROM ur_metrics_request_details
      WHERE process_id = $1
      ORDER BY timestamp DESC
      LIMIT 20
    `, [processId])
    
    return result.rows.map(row => row.details)
  } catch (err) {
    _logger('Error getting request details: %O', err)
    return []
  }
}

/**
 * Check if database connection is active
 * @returns {boolean} Connection status
 */
export function isConnected() {
  return !!pool
}

/**
 * Get total requests and server start time
 * @returns {Promise<Object>} Server info
 */
export async function getServerInfo() {
  if (!pool) {
    return {
      startTime: new Date().toISOString(),
      totalRequests: 0,
      lastUpdated: new Date().toISOString()
    };
  }
  
  try {
    // Try to get server info from database
    const result = await pool.query(`
      SELECT start_time, total_requests, last_updated
      FROM ur_metrics_server_info
      WHERE id = 1
    `);
    
    if (result.rows.length > 0) {
      return {
        startTime: result.rows[0].start_time,
        totalRequests: parseInt(result.rows[0].total_requests || 0, 10),
        lastUpdated: result.rows[0].last_updated
      };
    }
    
    // If no server info exists yet, create it
    const now = new Date();
    await pool.query(`
      INSERT INTO ur_metrics_server_info(start_time, total_requests, last_updated)
      VALUES($1, 0, $1)
      ON CONFLICT (id) DO NOTHING
    `, [now]);
    
    return {
      startTime: now.toISOString(),
      totalRequests: 0,
      lastUpdated: now.toISOString()
    };
  } catch (err) {
    _logger('Error getting server info: %O', err);
    return {
      startTime: new Date().toISOString(),
      totalRequests: 0,
      lastUpdated: new Date().toISOString()
    };
  }
}

/**
 * Close the database connection pool
 */
export async function closeDatabase() {
  if (pool) {
    await pool.end()
    pool = null
    _logger('Database connection closed')
  }
}
