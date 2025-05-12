/**
 * Database diagnostic script
 * This will check the actual database schema and report what's available
 */
import { query } from './db.js';
import { logger } from '../logger.js';

const _logger = logger.child('database:diagnose');

async function diagnoseDatabase() {
  try {
    _logger('Starting database diagnostic...');
    
    // Check database connection
    const dbCheck = await query('SELECT NOW() as time');
    _logger('Database connection: SUCCESS - Current time: %s', dbCheck.rows[0].time);
    
    // Check if metrics_requests table exists
    const tableCheck = await query(`
      SELECT table_name, table_schema
      FROM information_schema.tables
      WHERE table_name = 'metrics_requests'
    `);
    
    if (tableCheck.rows.length === 0) {
      _logger('ERROR: metrics_requests table does not exist!');
      _logger('Creating metrics_requests table with proper schema...');
      
      // Create the table with the correct schema
      await query(`
        CREATE TABLE metrics_requests (
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
          response_body TEXT,
          action TEXT,
          duration INTEGER,
          time_received TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          time_completed TIMESTAMPTZ
        )
      `);
      
      _logger('Table metrics_requests created successfully');
      
      // Create indexes for better performance
      await query('CREATE INDEX idx_metrics_process_id ON metrics_requests(process_id)');
      await query('CREATE INDEX idx_metrics_time_received ON metrics_requests(time_received)');
      await query('CREATE INDEX idx_metrics_action ON metrics_requests(action)');
      
      _logger('Indexes created successfully');
    } else {
      _logger('Table metrics_requests exists in schema: %s', tableCheck.rows[0].table_schema);
      
      // Check the columns in the table
      const columnCheck = await query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'metrics_requests'
        ORDER BY ordinal_position
      `);
      
      _logger('Columns in metrics_requests:');
      columnCheck.rows.forEach(col => {
        _logger('  - %s (%s)', col.column_name, col.data_type);
      });
      
      // Check for the time_received column specifically
      const timeReceivedCheck = columnCheck.rows.find(col => col.column_name === 'time_received');
      
      if (!timeReceivedCheck) {
        _logger('ERROR: time_received column does not exist! Adding it now...');
        
        await query(`
          ALTER TABLE metrics_requests
          ADD COLUMN time_received TIMESTAMPTZ NOT NULL DEFAULT NOW()
        `);
        
        _logger('time_received column added successfully');
        
        // Create index on time_received
        await query('CREATE INDEX idx_metrics_time_received ON metrics_requests(time_received)');
        _logger('Index on time_received created');
      } else {
        _logger('time_received column exists with type: %s', timeReceivedCheck.data_type);
      }
      
      // Check if timestamp column exists (older schema)
      const timestampCheck = columnCheck.rows.find(col => col.column_name === 'timestamp');
      
      if (timestampCheck) {
        _logger('timestamp column exists (older schema)');
        
        // If time_received exists but might be empty, copy values from timestamp
        if (timeReceivedCheck) {
          _logger('Copying values from timestamp to time_received where NULL...');
          
          await query(`
            UPDATE metrics_requests
            SET time_received = timestamp
            WHERE time_received IS NULL AND timestamp IS NOT NULL
          `);
          
          _logger('Values copied successfully');
        }
      }
      
      // Check indexes
      const indexCheck = await query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'metrics_requests'
      `);
      
      _logger('Indexes on metrics_requests:');
      indexCheck.rows.forEach(idx => {
        _logger('  - %s: %s', idx.indexname, idx.indexdef);
      });
      
      // Check if time_received index exists
      const timeReceivedIndexCheck = indexCheck.rows.find(idx => 
        idx.indexname === 'idx_metrics_time_received');
      
      if (!timeReceivedIndexCheck) {
        _logger('Index on time_received does not exist! Creating it now...');
        await query('CREATE INDEX idx_metrics_time_received ON metrics_requests(time_received)');
        _logger('Index on time_received created');
      }
    }
    
    // Check sample data
    const sampleCheck = await query(`
      SELECT 
        id, 
        process_id, 
        CASE WHEN time_received IS NOT NULL THEN 'present' ELSE 'null' END as time_received_status,
        action,
        duration
      FROM metrics_requests
      ORDER BY id DESC
      LIMIT 5
    `).catch(err => {
      _logger('Error querying sample data: %O', err);
      return { rows: [] };
    });
    
    if (sampleCheck.rows.length > 0) {
      _logger('Sample data in metrics_requests:');
      sampleCheck.rows.forEach(row => {
        _logger('  - ID: %s, Process: %s, time_received: %s, action: %s, duration: %s',
          row.id, row.process_id, row.time_received_status, row.action, row.duration);
      });
    } else {
      _logger('No sample data found or error querying');
    }
    
    _logger('Database diagnostic completed');
    return true;
  } catch (error) {
    _logger('Error running database diagnostic: %O', error);
    return false;
  }
}

// Run the diagnostic
diagnoseDatabase()
  .then(() => {
    _logger('Diagnostic completed, exiting...');
    process.exit(0);
  })
  .catch(err => {
    _logger('Fatal error in diagnostic: %O', err);
    process.exit(1);
  });
