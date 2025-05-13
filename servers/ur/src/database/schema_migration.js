/**
 * Schema migration for restructuring metrics database
 * Creates separate tables for dry runs and results, with proper messageID handling
 */
import { query } from './db.js'
import { logger } from '../logger.js'

const _logger = logger.child('schema-migration')

/**
 * Run the schema migration to create new tables and restructure data
 */
export async function runSchemaMigration() {
  try {
    _logger('Starting schema migration to separate dry runs and results...')
    
    // 1. First create the new tables if they don't exist
    await createMetricsBaseTable()
    await createMetricsDryRunsTable()
    await createMetricsResultsTable()
    
    // 2. Create indexes for the new tables
    await createIndexes()
    
    // 3. Migrate existing data from metrics_requests to the new tables
    await migrateExistingData()
    
    _logger('Schema migration completed successfully')
    return true
  } catch (error) {
    _logger('ERROR: Failed to run schema migration: %O', error)
    return false
  }
}

/**
 * Create the metrics_base table for common request information
 */
async function createMetricsBaseTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS metrics_base (
        id SERIAL PRIMARY KEY,
        process_id TEXT NOT NULL,
        request_ip TEXT,
        request_referrer TEXT,
        request_method TEXT,
        request_path TEXT,
        request_user_agent TEXT,
        request_origin TEXT,
        request_content_type TEXT,
        request_raw TEXT,
        duration INTEGER,
        time_received TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        time_completed TIMESTAMPTZ,
        request_type TEXT NOT NULL
      )
    `)
    
    _logger('metrics_base table created or already exists')
    return true
  } catch (error) {
    _logger('ERROR: Failed to create metrics_base table: %O', error)
    throw error
  }
}

/**
 * Create the metrics_dry_runs table for dry run requests
 */
async function createMetricsDryRunsTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS metrics_dry_runs (
        id SERIAL PRIMARY KEY,
        base_id INTEGER NOT NULL REFERENCES metrics_base(id) ON DELETE CASCADE,
        process_id TEXT NOT NULL,
        action TEXT,
        request_body JSONB,
        response_body TEXT,
        time_received TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    
    _logger('metrics_dry_runs table created or already exists')
    return true
  } catch (error) {
    _logger('ERROR: Failed to create metrics_dry_runs table: %O', error)
    throw error
  }
}

/**
 * Create the metrics_results table for result requests
 */
async function createMetricsResultsTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS metrics_results (
        id SERIAL PRIMARY KEY,
        base_id INTEGER NOT NULL REFERENCES metrics_base(id) ON DELETE CASCADE,
        process_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        action TEXT,
        request_body JSONB,
        response_body TEXT,
        time_received TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    
    _logger('metrics_results table created or already exists')
    return true
  } catch (error) {
    _logger('ERROR: Failed to create metrics_results table: %O', error)
    throw error
  }
}

/**
 * Create indexes for the new tables
 */
async function createIndexes() {
  try {
    // Base table indexes
    await query(`CREATE INDEX IF NOT EXISTS idx_metrics_base_process_id ON metrics_base(process_id)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_metrics_base_time_received ON metrics_base(time_received)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_metrics_base_request_type ON metrics_base(request_type)`)
    
    // Dry runs table indexes
    await query(`CREATE INDEX IF NOT EXISTS idx_metrics_dry_runs_base_id ON metrics_dry_runs(base_id)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_metrics_dry_runs_process_id ON metrics_dry_runs(process_id)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_metrics_dry_runs_action ON metrics_dry_runs(action)`)
    
    // Results table indexes
    await query(`CREATE INDEX IF NOT EXISTS idx_metrics_results_base_id ON metrics_results(base_id)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_metrics_results_process_id ON metrics_results(process_id)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_metrics_results_message_id ON metrics_results(message_id)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_metrics_results_action ON metrics_results(action)`)
    
    _logger('Indexes created successfully')
    return true
  } catch (error) {
    _logger('ERROR: Failed to create indexes: %O', error)
    throw error
  }
}

/**
 * Migrate existing data from metrics_requests to the new tables
 */
async function migrateExistingData() {
  try {
    // Check if we already have data in the new tables
    const baseCountResult = await query('SELECT COUNT(*) FROM metrics_base')
    const baseCount = parseInt(baseCountResult.rows[0].count || '0')
    
    if (baseCount > 0) {
      _logger('New tables already contain data, skipping migration')
      return true
    }
    
    _logger('Starting data migration from metrics_requests to new tables...')
    
    // Get count of records to migrate
    const countResult = await query('SELECT COUNT(*) FROM metrics_requests')
    const recordCount = parseInt(countResult.rows[0].count || '0')
    _logger('Found %d records to migrate', recordCount)
    
    // Process in batches to avoid memory issues
    const batchSize = 1000
    let processedCount = 0
    
    while (processedCount < recordCount) {
      const result = await query(`
        SELECT * FROM metrics_requests 
        ORDER BY id ASC 
        LIMIT ${batchSize} 
        OFFSET ${processedCount}
      `)
      
      const rows = result.rows
      if (rows.length === 0) break
      
      _logger('Processing batch of %d records (total processed: %d/%d)', 
        rows.length, processedCount, recordCount)
      
      // Process each record in the batch
      for (const row of rows) {
        try {
          await migrateRecord(row)
        } catch (recordError) {
          _logger('ERROR: Failed to migrate record %d: %O', row.id, recordError)
          // Continue with next record
        }
      }
      
      processedCount += rows.length
      _logger('Processed %d/%d records (%d%%)', 
        processedCount, recordCount, Math.round((processedCount / recordCount) * 100))
    }
    
    _logger('Data migration completed. Migrated %d records to new tables', processedCount)
    return true
  } catch (error) {
    _logger('ERROR: Failed to migrate existing data: %O', error)
    throw error
  }
}

/**
 * Migrate a single record from metrics_requests to the new tables
 */
async function migrateRecord(record) {
  // Determine if this is a dry run or result request
  let requestType = 'unknown'
  let messageId = null
  
  const path = record.request_path || ''
  
  if (path.includes('/dry-run')) {
    requestType = 'dry-run'
  } else if (path.includes('/result/')) {
    requestType = 'result'
    // Extract message ID from path - it's the part after /result/
    const parts = path.split('/result/')
    if (parts.length > 1) {
      messageId = parts[1].split('?')[0] // Remove query params if any
    }
  }
  
  // First insert into the base table
  const baseResult = await query(`
    INSERT INTO metrics_base (
      process_id, request_ip, request_referrer, request_method, 
      request_path, request_user_agent, request_origin, request_content_type,
      request_raw, duration, time_received, time_completed, request_type
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING id
  `, [
    record.process_id,
    record.request_ip || 'unknown',
    record.request_referrer || 'unknown',
    record.request_method || 'unknown',
    record.request_path || 'unknown',
    record.request_user_agent || 'unknown',
    record.request_origin || 'unknown',
    record.request_content_type || 'unknown',
    record.request_raw || null,
    record.duration || 0,
    record.time_received || new Date(),
    record.time_completed || new Date(),
    requestType
  ])
  
  const baseId = baseResult.rows[0].id
  
  // If this is a dry run, add to dry runs table
  if (requestType === 'dry-run') {
    await query(`
      INSERT INTO metrics_dry_runs (
        base_id, process_id, action, request_body, response_body, time_received
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      baseId,
      record.process_id,
      record.action || 'unknown',
      record.request_body || null,
      record.response_body || null,
      record.time_received || new Date()
    ])
  } 
  // If this is a result request, add to results table
  else if (requestType === 'result') {
    await query(`
      INSERT INTO metrics_results (
        base_id, process_id, message_id, action, request_body, response_body, time_received
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      baseId,
      record.process_id,
      messageId || 'unknown',
      record.action || 'unknown',
      record.request_body || null,
      record.response_body || null,
      record.time_received || new Date()
    ])
  }
  
  return true
}
