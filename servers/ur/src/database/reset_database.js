/**
 * Script to completely reset the metrics database with the new structure only
 * This eliminates all legacy tables and creates only the new ones with proper separation
 */
import { Pool } from 'pg';
import { config } from '../config.js';

// Configure the database connection
const pool = new Pool({
  connectionString: config.dbUrl
});

// SQL to completely clean up the database
const cleanupSQL = `
-- First drop any views that depend on tables
DROP VIEW IF EXISTS metrics_view CASCADE;

-- Then drop all metrics tables (both legacy and new)
DROP TABLE IF EXISTS metrics_results CASCADE;
DROP TABLE IF EXISTS metrics_dry_runs CASCADE;
DROP TABLE IF EXISTS metrics_base CASCADE;
DROP TABLE IF EXISTS metrics_requests CASCADE;
DROP TABLE IF EXISTS request_details CASCADE;

-- Drop any sequences
DROP SEQUENCE IF EXISTS metrics_requests_id_seq CASCADE;
DROP SEQUENCE IF EXISTS metrics_base_id_seq CASCADE;
DROP SEQUENCE IF EXISTS metrics_results_id_seq CASCADE;
DROP SEQUENCE IF EXISTS metrics_dry_runs_id_seq CASCADE;
`;

async function resetDatabase() {
  const client = await pool.connect();
  try {
    console.log('Starting complete database reset...');
    
    // Step 1: Drop all existing tables and views
    console.log('Dropping all existing metrics tables and views...');
    await client.query(cleanupSQL);
    console.log('All tables dropped successfully.');
    
    // Step 2: Create the new tables structure only
    console.log('Creating new metrics tables structure...');
    
    // Create metrics_base table
    await client.query(`
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
        request_body JSONB,
        request_raw TEXT,
        duration INTEGER,
        time_received TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        time_completed TIMESTAMPTZ
      )
    `);
    
    // Create metrics_dry_runs table 
    await client.query(`
      CREATE TABLE IF NOT EXISTS metrics_dry_runs (
        id SERIAL PRIMARY KEY,
        metrics_id INTEGER NOT NULL REFERENCES metrics_base(id) ON DELETE CASCADE,
        action TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    
    // Create metrics_results table with message_id
    await client.query(`
      CREATE TABLE IF NOT EXISTS metrics_results (
        id SERIAL PRIMARY KEY,
        metrics_id INTEGER NOT NULL REFERENCES metrics_base(id) ON DELETE CASCADE,
        message_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    
    // Create indexes for faster queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_metrics_base_process_id ON metrics_base(process_id);
      CREATE INDEX IF NOT EXISTS idx_metrics_base_time_received ON metrics_base(time_received);
      CREATE INDEX IF NOT EXISTS idx_metrics_dry_runs_action ON metrics_dry_runs(action);
      CREATE INDEX IF NOT EXISTS idx_metrics_results_message_id ON metrics_results(message_id);
    `);
    
    console.log('New database structure created successfully!');
    console.log('The server will now use ONLY the new tables structure.');
    
  } catch (err) {
    console.error('Error during database reset:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the reset
resetDatabase();
