/**
 * PostgreSQL database connection module
 * Provides connection pool and query helpers with timeout and error handling
 */
import pg from 'pg'
import { logger } from '../logger.js'
import { config } from '../config.js'

const _logger = logger.child('database')

const { Pool } = pg

// Default timeout for database operations (15 seconds)
const DEFAULT_TIMEOUT_MS = 15000

// Create a new PostgreSQL connection pool using DB_URL from config
const pool = new Pool({
  connectionString: config.dbUrl,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 5000, // Return an error after 5 seconds if connection not established
})

pool.on('error', (err) => {
  _logger('Unexpected error on idle client', err)
})

/**
 * Execute a query with timeout handling
 * @param {String} text SQL query text
 * @param {Array} params Query parameters
 * @param {Number} timeoutMs Query timeout in milliseconds
 * @returns {Promise<Object>} Query result
 */
export async function query(text, params = [], timeoutMs = DEFAULT_TIMEOUT_MS) {
  const start = Date.now()
  const client = await pool.connect()
  
  try {
    // Create a promise that will reject after the timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Database query timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    })

    // Race the query against the timeout
    const result = await Promise.race([
      client.query(text, params),
      timeoutPromise
    ])

    const duration = Date.now() - start
    _logger('Executed query %s in %dms', text.substring(0, 60), duration)
    
    return result
  } catch (error) {
    const duration = Date.now() - start
    _logger('Query error %s in %dms: %O', text.substring(0, 60), duration, error)
    throw error
  } finally {
    client.release()
  }
}

/**
 * Initialize database by creating tables if they don't exist
 */
export async function initializeDatabase() {
  try {
    _logger('Initializing database...')
    
    // Create metrics table
    await query(`
      CREATE TABLE IF NOT EXISTS metrics_requests (
        id SERIAL PRIMARY KEY,
        process_id TEXT NOT NULL,
        request_ip TEXT,
        request_referrer TEXT,
        request_method TEXT,
        request_path TEXT,
        request_user_agent TEXT,
        request_origin TEXT,
        request_content_type TEXT,
        request_body JSONB,
        action TEXT,
        duration INTEGER,
        time_received TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        time_completed TIMESTAMPTZ
      )
    `)
    
    // Create index on process_id and timestamp for faster queries
    await query(`
      CREATE INDEX IF NOT EXISTS idx_metrics_process_id ON metrics_requests(process_id)
    `)
    
    await query(`
      CREATE INDEX IF NOT EXISTS idx_metrics_time_received ON metrics_requests(time_received)
    `)
    
    await query(`
      CREATE INDEX IF NOT EXISTS idx_metrics_action ON metrics_requests(action)
    `)
    
    _logger('Database initialization complete')
  } catch (error) {
    _logger('Error initializing database: %O', error)
    throw error
  }
}

/**
 * Close the database pool
 */
export async function closeDatabase() {
  try {
    await pool.end()
    _logger('Database pool closed')
  } catch (error) {
    _logger('Error closing database pool: %O', error)
  }
}
