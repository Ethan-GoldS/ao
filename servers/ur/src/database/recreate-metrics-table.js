/**
 * Script to recreate the metrics_requests table with the correct schema
 * This will drop the existing table and create a new one with the proper columns
 */
import { query } from './db.js';
import { logger } from '../logger.js';

const _logger = logger.child('db-fix');

/**
 * Drop and recreate the metrics_requests table with proper schema
 */
export async function recreateMetricsTable() {
  try {
    _logger('Starting metrics_requests table recreation...');
    
    // Drop the existing table
    _logger('Dropping existing metrics_requests table');
    await query(`DROP TABLE IF EXISTS metrics_requests`);
    
    // Create the table with the correct schema
    _logger('Creating metrics_requests table with proper schema');
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
        action TEXT,
        duration INTEGER,
        time_received TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        time_completed TIMESTAMPTZ
      )
    `);
    
    // Create indexes for better performance
    _logger('Creating indexes for performance');
    await query(`CREATE INDEX idx_metrics_process_id ON metrics_requests(process_id)`);
    await query(`CREATE INDEX idx_metrics_time_received ON metrics_requests(time_received)`);
    await query(`CREATE INDEX idx_metrics_action ON metrics_requests(action)`);
    
    // Add the request_raw and response_body columns (they were in our code but not in your schema)
    _logger('Adding request_raw and response_body columns');
    await query(`ALTER TABLE metrics_requests ADD COLUMN request_raw TEXT`);
    await query(`ALTER TABLE metrics_requests ADD COLUMN response_body TEXT`);
    
    _logger('Table recreation completed successfully');
    return true;
  } catch (error) {
    _logger('Error recreating metrics_requests table: %O', error);
    return false;
  }
}

// For direct execution from command line
if (process.argv[1].endsWith('recreate-metrics-table.js')) {
  recreateMetricsTable()
    .then(success => {
      if (success) {
        console.log('✅ Successfully recreated metrics_requests table');
        process.exit(0);
      } else {
        console.error('❌ Failed to recreate metrics_requests table');
        process.exit(1);
      }
    })
    .catch(err => {
      console.error('❌ Error:', err);
      process.exit(1);
    });
}
