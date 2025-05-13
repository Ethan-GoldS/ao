/**
 * Database migration module
 * Handles table structure evolution and fixes schema mismatches
 */
import { query } from './db.js'
import { logger } from '../logger.js'

const _logger = logger.child('migration')

/**
 * Check if a column exists in a table
 * @param {String} tableName Name of the table to check
 * @param {String} columnName Name of the column to check
 * @returns {Promise<Boolean>} True if column exists, false otherwise
 */
async function columnExists(tableName, columnName) {
  try {
    const result = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = $1 
      AND column_name = $2
    `, [tableName, columnName])
    
    return result.rows.length > 0
  } catch (error) {
    _logger('Error checking column existence: %O', error)
    return false
  }
}

/**
 * Run database migrations to ensure schema is up to date
 */
export async function runMigrations() {
  try {
    _logger('Starting database schema migration process...')
    
    // Check current database name and schema
    try {
      const dbInfoResult = await query(`
        SELECT current_database() as db_name, current_schema() as schema_name
      `)
      _logger('Running migrations on database: %s, schema: %s', 
        dbInfoResult.rows[0].db_name, 
        dbInfoResult.rows[0].schema_name)
    } catch (dbInfoErr) {
      _logger('ERROR: Failed to get database information: %O', dbInfoErr)
    }
    
    // Check if metrics_requests table exists
    const tableResult = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'metrics_requests'
    `)
    
    const tableExists = tableResult.rows.length > 0
    _logger('metrics_requests table exists: %s', tableExists)
    
    if (!tableExists) {
      _logger('metrics_requests table does not exist, skipping migrations')
      return
    }
    
    // Check for critical columns we need
    const hasTimeReceived = await columnExists('metrics_requests', 'time_received')
    const hasTimestamp = await columnExists('metrics_requests', 'timestamp')
    const hasRequestRaw = await columnExists('metrics_requests', 'request_raw')
    const hasResponseBody = await columnExists('metrics_requests', 'response_body')
    const hasMessageId = await columnExists('metrics_requests', 'message_id')
    
    _logger('Column status - time_received: %s, timestamp: %s, request_raw: %s, response_body: %s, message_id: %s', 
      hasTimeReceived ? 'exists' : 'missing',
      hasTimestamp ? 'exists' : 'missing',
      hasRequestRaw ? 'exists' : 'missing',
      hasResponseBody ? 'exists' : 'missing',
      hasMessageId ? 'exists' : 'missing')
    
    // Add time_received column if it doesn't exist
    if (!hasTimeReceived) {
      _logger('Adding time_received column to metrics_requests table')
      await query(`
        ALTER TABLE metrics_requests 
        ADD COLUMN time_received TIMESTAMPTZ
      `)
      
      // If timestamp exists, copy values to time_received
      if (hasTimestamp) {
        _logger('Copying timestamp values to time_received')
        await query(`
          UPDATE metrics_requests 
          SET time_received = timestamp 
          WHERE time_received IS NULL
        `)
      } else {
        // If no timestamp, set time_received to current time
        _logger('Setting time_received to current time for existing records')
        await query(`
          UPDATE metrics_requests 
          SET time_received = NOW() 
          WHERE time_received IS NULL
        `)
      }
      
      // Create index on time_received
      _logger('Creating index on time_received')
      await query(`
        CREATE INDEX IF NOT EXISTS idx_metrics_time_received 
        ON metrics_requests(time_received)
      `)
    }
    
    // Add request_raw column if it doesn't exist
    if (!hasRequestRaw) {
      _logger('Adding request_raw column to metrics_requests table')
      await query(`
        ALTER TABLE metrics_requests 
        ADD COLUMN request_raw TEXT
      `)
      _logger('request_raw column added successfully')
    }
    
    // Add response_body column if it doesn't exist
    if (!hasResponseBody) {
      _logger('Adding response_body column to metrics_requests table')
      await query(`
        ALTER TABLE metrics_requests 
        ADD COLUMN response_body TEXT
      `)
      _logger('response_body column added successfully')
    }
    
    // Add message_id column if it doesn't exist
    if (!hasMessageId) {
      _logger('Adding message_id column to metrics_requests table')
      await query(`
        ALTER TABLE metrics_requests 
        ADD COLUMN message_id TEXT
      `)
      
      // Extract message_id from path for result URLs
      _logger('Updating existing records to populate message_id from request_path')
      await query(`
        UPDATE metrics_requests
        SET message_id = substring(request_path from '/result/([^/?]+)')
        WHERE request_path LIKE '%/result/%' AND message_id IS NULL
      `)
      
      // Create index on message_id
      _logger('Creating index on message_id')
      await query(`
        CREATE INDEX IF NOT EXISTS idx_metrics_message_id 
        ON metrics_requests(message_id)
      `)
      
      _logger('message_id column added and populated successfully')
    }
    
    _logger('Database migrations completed successfully')
  } catch (error) {
    _logger('Error running database migrations: %O', error)
    throw error
  }
}
