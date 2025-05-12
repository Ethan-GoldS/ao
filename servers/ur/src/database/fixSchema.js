/**
 * Database schema fix script
 * Creates a view to resolve column naming/case sensitivity issues
 */
import { query } from './db.js';
import { logger } from '../logger.js';

const _logger = logger.child('database:fix-schema');

async function fixSchema() {
  try {
    _logger('Starting schema fix operation...');
    
    // Check if metrics_view already exists
    const viewCheck = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'metrics_view' AND table_type = 'VIEW'
    `);
    
    if (viewCheck.rows.length > 0) {
      _logger('Dropping existing metrics_view...');
      await query('DROP VIEW metrics_view');
    }
    
    // Create view with explicitly quoted column names
    _logger('Creating metrics_view with properly quoted column names...');
    await query(`
      CREATE VIEW metrics_view AS
      SELECT 
        id,
        process_id,
        request_ip,
        request_referrer,
        request_method,
        request_path,
        request_user_agent,
        request_origin,
        request_content_type,
        request_body,
        request_raw,
        response_body,
        action,
        duration,
        time_received,
        time_completed
      FROM metrics_requests
    `);
    
    _logger('View created successfully');
    
    // Update metricsService.js to use the view instead
    _logger('Now update your code to use metrics_view instead of metrics_requests');
    _logger('In metricsService.js, replace table name metrics_requests with metrics_view');
    
    // Test the view
    _logger('Testing the view...');
    const testView = await query(`
      SELECT COUNT(*) FROM metrics_view
    `);
    
    _logger('View has %d records', testView.rows[0].count);
    
    _logger('Schema fix completed');
    return true;
  } catch (error) {
    _logger('Error fixing schema: %O', error);
    return false;
  }
}

// Run the fix
fixSchema()
  .then(success => {
    if (success) {
      _logger('Schema fixed successfully, exiting...');
    } else {
      _logger('Schema fix failed, see logs for details');
    }
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    _logger('Fatal error in fix-schema: %O', err);
    process.exit(1);
  });
