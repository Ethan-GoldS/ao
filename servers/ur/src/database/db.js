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
_logger('Initializing database connection pool with URL: %s', config.dbUrl.replace(/\/\/.*?:.*?@/, '//***:***@')); // Log URL with credentials hidden

// Track active connections to help debug connection leaks
let activeConnections = 0;

const pool = new Pool({
  connectionString: config.dbUrl,
  max: 10, // Reduced maximum number of clients in the pool
  min: 2, // Keep at least 2 connections open
  idleTimeoutMillis: 60000, // Close idle clients after 60 seconds
  connectionTimeoutMillis: 5000, // Return an error after 5 seconds if connection not established
})

pool.on('connect', client => {
  activeConnections++;
  _logger('New database connection established (active: %d/%d)', activeConnections, pool.options.max);
});

pool.on('remove', client => {
  activeConnections--;
  _logger('Database connection removed from pool (active: %d/%d)', activeConnections, pool.options.max);
});

pool.on('error', (err) => {
  _logger('Unexpected error on idle client: %O', err);
});

// Check pool status periodically
setInterval(() => {
  _logger('Connection pool status: %d active connections, %d idle, %d total', 
    activeConnections, 
    pool.idleCount, 
    pool.totalCount);
}, 30000); // Log every 30 seconds

/**
 * Execute a query with timeout handling and improved connection management
 * @param {String} text SQL query text
 * @param {Array} params Query parameters
 * @param {Number} timeoutMs Query timeout in milliseconds
 * @returns {Promise<Object>} Query result
 */
export async function query(text, params = [], timeoutMs = DEFAULT_TIMEOUT_MS) {
  const start = Date.now()
  let client = null
  
  try {
    // Get a client from the pool with a timeout
    const clientPromise = pool.connect()
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Connection acquisition timed out after ${timeoutMs/2}ms`))
      }, timeoutMs/2) // Half the timeout for connection acquisition
    })
    
    // Race connection acquisition against timeout
    client = await Promise.race([clientPromise, timeoutPromise])
    
    // Create a promise that will reject after the query timeout
    const queryTimeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Database query timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    })

    // Race the query against the timeout
    const result = await Promise.race([
      client.query(text, params),
      queryTimeoutPromise
    ])

    const duration = Date.now() - start
    _logger('Executed query %s in %dms', text.substring(0, 60), duration)
    
    return result
  } catch (error) {
    const duration = Date.now() - start
    _logger('Query error %s in %dms: %O', text.substring(0, 60), duration, error)
    throw error
  } finally {
    if (client) {
      // Make sure to release the client back to the pool
      // The done callback is used to handle errors during release
      client.release((err) => {
        if (err) {
          _logger('Error releasing client back to pool: %O', err)
        }
      })
    }
  }
}

/**
 * Initialize database by creating tables if they don't exist
 */
export async function initializeDatabase() {
  try {
    _logger('Starting database initialization...')
    
    // Test the database connection first
    try {
      const testResult = await query('SELECT NOW() as time')
      _logger('Database connection test successful: %s', testResult.rows[0].time)
    } catch (connError) {
      _logger('ERROR: Database connection test failed: %O', connError)
      // Continue anyway to see if we can fix it
    }
    
    // Define a timeout for the initialization
    const initTimeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Database initialization timed out after 15 seconds'))
      }, 15000) // 15 second timeout - consistent with other timeouts in the application
    })
    
    // Database initialization with timeout
    _logger('Creating database schema if it doesn\'t exist')
    await Promise.race([
      initDatabaseSchema(),
      initTimeoutPromise
    ])
    
    // Test if the table was created
    try {
      const tableTest = await query(
        'SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)',
        ['metrics_requests']
      )
      _logger('metrics_requests table exists: %s', tableTest.rows[0].exists)
      
      // List all columns in the table
      const columnsResult = await query(
        'SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1',
        ['metrics_requests']
      )
      
      _logger('metrics_requests table columns: %O', columnsResult.rows.map(row => `${row.column_name} (${row.data_type})`))
    } catch (tableErr) {
      _logger('ERROR: Failed to check table existence: %O', tableErr)
    }
    
    // Run migrations to fix any schema mismatches
    _logger('Running database migrations...')
    const { runMigrations } = await import('./migration.js')
    await runMigrations()
    
    // Run schema migration to create new tables for dry runs and results
    _logger('Running schema migrations for new table structure...')
    const { runSchemaMigration } = await import('./schema_migration.js')
    await runSchemaMigration()
    
    _logger('Database initialization complete')
    return true
  } catch (error) {
    _logger('ERROR: Failed to initialize database: %O', error)
    // Don't throw here - we want to continue even if DB setup fails
    // The application should still work but metrics won't be stored
    return false
  }
}

/**
 * Initialize database schema with tables and indexes
 */
async function initDatabaseSchema() {
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
      request_raw TEXT,
      action TEXT,
      duration INTEGER,
      time_received TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      time_completed TIMESTAMPTZ
    )
  `)
  
  // Create indexes for faster queries
  await query(`
    CREATE INDEX IF NOT EXISTS idx_metrics_process_id ON metrics_requests(process_id)
  `)
  
  await query(`
    CREATE INDEX IF NOT EXISTS idx_metrics_time_received ON metrics_requests(time_received)
  `)
  
  await query(`
    CREATE INDEX IF NOT EXISTS idx_metrics_action ON metrics_requests(action)
  `)
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
