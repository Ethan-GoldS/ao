/**
 * Script to completely clean up metrics database tables and views
 */
const { Pool } = require('pg');

// Get environment variables or use defaults
const env = process.env.NODE_ENV || 'development';
const dbHost = process.env.PG_HOST || 'localhost';
const dbPort = process.env.PG_PORT || 5432;
const dbName = process.env.PG_DATABASE || 'ur_cu_metrics';
const dbUser = process.env.PG_USER || 'postgres';
const dbPassword = process.env.PG_PASSWORD || 'postgres';

// Configure the database connection
const pool = new Pool({
  host: dbHost,
  port: dbPort,
  database: dbName,
  user: dbUser,
  password: dbPassword,
});

// SQL to completely clean up the database
const cleanupSQL = `
-- First drop the views that depend on tables
DROP VIEW IF EXISTS metrics_view CASCADE;

-- Then drop the tables
DROP TABLE IF EXISTS metrics_results CASCADE;
DROP TABLE IF EXISTS metrics_dry_runs CASCADE;
DROP TABLE IF EXISTS metrics_base CASCADE;
DROP TABLE IF EXISTS metrics_requests CASCADE;
DROP TABLE IF EXISTS request_details CASCADE;

-- Drop any other potential dependent objects
DROP SEQUENCE IF EXISTS metrics_requests_id_seq CASCADE;
DROP SEQUENCE IF EXISTS metrics_base_id_seq CASCADE;
DROP SEQUENCE IF EXISTS metrics_results_id_seq CASCADE;
DROP SEQUENCE IF EXISTS metrics_dry_runs_id_seq CASCADE;
`;

async function cleanDatabase() {
  const client = await pool.connect();
  try {
    console.log('Starting database cleanup...');
    await client.query(cleanupSQL);
    console.log('Database cleanup completed successfully!');
    console.log('The tables will be recreated when you restart the server.');
  } catch (err) {
    console.error('Error during database cleanup:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the cleanup
cleanDatabase();
