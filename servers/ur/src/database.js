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
    
    // Create requests table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ur_metrics_requests (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL,
        process_id TEXT,
        ip TEXT,
        action TEXT,
        duration INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    
    // Create process counts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ur_metrics_process_counts (
        process_id TEXT PRIMARY KEY,
        count INTEGER DEFAULT 0,
        total_duration BIGINT DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    
    // Create action counts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ur_metrics_action_counts (
        action TEXT PRIMARY KEY,
        count INTEGER DEFAULT 0,
        total_duration BIGINT DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    
    // Create IP counts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ur_metrics_ip_counts (
        ip TEXT PRIMARY KEY,
        count INTEGER DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    
    // Create referrer counts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ur_metrics_referrer_counts (
        referrer TEXT PRIMARY KEY,
        count INTEGER DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    
    // Create time series data table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ur_metrics_time_series (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL,
        hour INTEGER NOT NULL,
        total_requests INTEGER DEFAULT 0,
        process_counts JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(timestamp)
      )
    `)
    
    // Create request details table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ur_metrics_request_details (
        id SERIAL PRIMARY KEY,
        process_id TEXT NOT NULL,
        ip TEXT,
        referer TEXT,
        timestamp TIMESTAMPTZ NOT NULL,
        details JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `)
    
    // Create index on process_id for request details
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_request_details_process_id 
      ON ur_metrics_request_details(process_id)
    `)
    
    // Create index on timestamp for requests
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_requests_timestamp 
      ON ur_metrics_requests(timestamp)
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
 * Insert request metrics into the database
 * @param {Object} request Request metrics object
 * @returns {Promise<boolean>} Success flag
 */
export async function insertRequestMetrics(request) {
  if (!pool) return false
  
  try {
    const { timestamp, processId, ip, action, duration } = request
    
    const result = await pool.query(
      'INSERT INTO ur_metrics_requests(timestamp, process_id, ip, action, duration) VALUES($1, $2, $3, $4, $5) RETURNING id',
      [new Date(timestamp), processId, ip, action, duration]
    )
    
    return result.rows.length > 0
  } catch (err) {
    _logger('Error inserting request metrics: %O', err)
    return false
  }
}

/**
 * Insert or update process count
 * @param {string} processId Process ID
 * @param {number} duration Request duration in ms
 * @returns {Promise<boolean>} Success flag
 */
export async function updateProcessCount(processId, duration) {
  if (!pool || !processId) return false
  
  try {
    await pool.query(`
      INSERT INTO ur_metrics_process_counts(process_id, count, total_duration, updated_at)
      VALUES($1, 1, $2, NOW())
      ON CONFLICT (process_id) 
      DO UPDATE SET 
        count = ur_metrics_process_counts.count + 1,
        total_duration = ur_metrics_process_counts.total_duration + $2,
        updated_at = NOW()
    `, [processId, duration])
    
    return true
  } catch (err) {
    _logger('Error updating process count: %O', err)
    return false
  }
}

/**
 * Insert or update action count
 * @param {string} action Action name
 * @param {number} duration Request duration in ms
 * @returns {Promise<boolean>} Success flag
 */
export async function updateActionCount(action, duration) {
  if (!pool || !action) return false
  
  try {
    await pool.query(`
      INSERT INTO ur_metrics_action_counts(action, count, total_duration, updated_at)
      VALUES($1, 1, $2, NOW())
      ON CONFLICT (action) 
      DO UPDATE SET 
        count = ur_metrics_action_counts.count + 1,
        total_duration = ur_metrics_action_counts.total_duration + $2,
        updated_at = NOW()
    `, [action, duration])
    
    return true
  } catch (err) {
    _logger('Error updating action count: %O', err)
    return false
  }
}

/**
 * Insert or update IP count
 * @param {string} ip IP address
 * @returns {Promise<boolean>} Success flag
 */
export async function updateIpCount(ip) {
  if (!pool || !ip || ip === 'unknown') return false
  
  try {
    await pool.query(`
      INSERT INTO ur_metrics_ip_counts(ip, count, updated_at)
      VALUES($1, 1, NOW())
      ON CONFLICT (ip) 
      DO UPDATE SET 
        count = ur_metrics_ip_counts.count + 1,
        updated_at = NOW()
    `, [ip])
    
    return true
  } catch (err) {
    _logger('Error updating IP count: %O', err)
    return false
  }
}

/**
 * Insert or update referrer count
 * @param {string} referrer Referrer URL
 * @returns {Promise<boolean>} Success flag
 */
export async function updateReferrerCount(referrer) {
  if (!pool || !referrer || referrer === 'unknown') return false
  
  try {
    await pool.query(`
      INSERT INTO ur_metrics_referrer_counts(referrer, count, updated_at)
      VALUES($1, 1, NOW())
      ON CONFLICT (referrer) 
      DO UPDATE SET 
        count = ur_metrics_referrer_counts.count + 1,
        updated_at = NOW()
    `, [referrer])
    
    return true
  } catch (err) {
    _logger('Error updating referrer count: %O', err)
    return false
  }
}

/**
 * Insert request details
 * @param {Object} details Request details object
 * @returns {Promise<boolean>} Success flag
 */
export async function insertRequestDetails(details) {
  if (!pool || !details || !details.processId) return false
  
  try {
    const { processId, ip, referer, timestamp } = details
    
    // Store detailed info as JSON, limiting to 20 entries per process
    await pool.query(`
      INSERT INTO ur_metrics_request_details(process_id, ip, referer, timestamp, details)
      VALUES($1, $2, $3, $4, $5)
    `, [processId, ip, referer, new Date(timestamp), JSON.stringify(details)])
    
    // Limit to 20 most recent records per process_id
    await pool.query(`
      WITH ranked_details AS (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY process_id ORDER BY timestamp DESC) as rn
        FROM ur_metrics_request_details
        WHERE process_id = $1
      )
      DELETE FROM ur_metrics_request_details
      WHERE id IN (
        SELECT id FROM ranked_details WHERE rn > 20
      )
    `, [processId])
    
    return true
  } catch (err) {
    _logger('Error inserting request details: %O', err)
    return false
  }
}

/**
 * Update time series data for a request
 * @param {string} processId Process ID
 * @param {string} timestamp ISO timestamp string
 * @returns {Promise<boolean>} Success flag
 */
export async function updateTimeSeriesData(processId, timestamp) {
  if (!pool || !processId || !timestamp) return false
  
  try {
    const requestTime = new Date(timestamp)
    
    // Round down to the nearest hour for consistent bucketing
    const bucketTime = new Date(
      requestTime.getFullYear(),
      requestTime.getMonth(),
      requestTime.getDate(),
      requestTime.getHours(),
      0, 0, 0
    )
    
    // Update or insert time bucket
    await pool.query(`
      INSERT INTO ur_metrics_time_series(timestamp, hour, total_requests, process_counts)
      VALUES($1, $2, 1, jsonb_build_object($3::text, 1))
      ON CONFLICT (timestamp)
      DO UPDATE SET
        total_requests = ur_metrics_time_series.total_requests + 1,
        process_counts = 
          CASE
            WHEN ur_metrics_time_series.process_counts ? $3::text THEN
              jsonb_set(
                ur_metrics_time_series.process_counts,
                ARRAY[$3::text],
                to_jsonb((ur_metrics_time_series.process_counts->>$3::text)::int + 1)
              )
            ELSE
              ur_metrics_time_series.process_counts || jsonb_build_object($3::text, 1)
          END
    `, [bucketTime, bucketTime.getUTCHours(), processId])
    
    return true
  } catch (err) {
    _logger('Error updating time series data: %O', err)
    return false
  }
}

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

/**
 * Get recent requests
 * @param {number} limit Maximum number of requests to return
 * @returns {Promise<Array>} Recent requests
 */
export async function getRecentRequests(limit = 100) {
  if (!pool) return []
  
  try {
    const result = await pool.query(`
      SELECT 
        timestamp, 
        process_id as "processId", 
        ip, 
        action, 
        duration 
      FROM ur_metrics_requests
      ORDER BY timestamp DESC
      LIMIT $1
    `, [limit])
    
    return result.rows
  } catch (err) {
    _logger('Error getting recent requests: %O', err)
    return []
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
 * Get time series data
 * @param {number} hours Number of hours of data to return
 * @returns {Promise<Array>} Time series data
 */
export async function getTimeSeriesData(hours = 24) {
  if (!pool) return []
  
  try {
    const result = await pool.query(`
      SELECT 
        timestamp, 
        hour, 
        total_requests as "totalRequests", 
        process_counts as "processCounts"
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
 * Close the database connection pool
 */
export async function closeDatabase() {
  if (pool) {
    await pool.end()
    pool = null
    _logger('Database connection closed')
  }
}
