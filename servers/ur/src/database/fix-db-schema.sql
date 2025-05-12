-- SQL script to recreate the metrics_requests table with proper schema
-- Run this in your PostgreSQL database to fix schema issues

-- First, check if the table already exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'metrics_requests') THEN
        -- Table exists, try to backup data first
        CREATE TABLE IF NOT EXISTS metrics_requests_backup AS SELECT * FROM metrics_requests;
        RAISE NOTICE 'Created backup of existing metrics_requests table as metrics_requests_backup';
    END IF;
END $$;

-- Drop the existing table
DROP TABLE IF EXISTS metrics_requests;

-- Create the table with the correct schema
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
);

-- Create indexes for better performance
CREATE INDEX idx_metrics_process_id ON metrics_requests(process_id);
CREATE INDEX idx_metrics_time_received ON metrics_requests(time_received);
CREATE INDEX idx_metrics_action ON metrics_requests(action);

-- Restore data if we had a backup
DO $$
DECLARE
    row_count INTEGER;
BEGIN
    IF EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'metrics_requests_backup'
    ) THEN
        -- Count rows in backup
        EXECUTE 'SELECT COUNT(*) FROM metrics_requests_backup' INTO row_count;
        
        IF row_count > 0 THEN
            -- Try to restore the data with all required columns
            BEGIN
                INSERT INTO metrics_requests (
                    id, process_id, request_ip, request_referrer, 
                    request_method, request_path, request_user_agent, 
                    request_origin, request_content_type, request_body,
                    request_raw, response_body, action, duration,
                    time_received, time_completed
                )
                SELECT 
                    id, process_id, request_ip, request_referrer, 
                    request_method, request_path, request_user_agent, 
                    request_origin, request_content_type, request_body,
                    request_raw, response_body, action, duration,
                    NOW() as time_received, -- Set to current time since original might be missing
                    NULL as time_completed
                FROM metrics_requests_backup;
                
                RAISE NOTICE 'Successfully restored % rows of data from backup', row_count;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Failed to restore all columns. Trying minimal restore...';
                
                -- Try a minimal restore with just essential columns
                INSERT INTO metrics_requests (process_id, time_received)
                SELECT 
                    process_id, 
                    NOW() as time_received
                FROM metrics_requests_backup;
                
                RAISE NOTICE 'Completed minimal data restore';
            END;
        ELSE
            RAISE NOTICE 'Backup table exists but contains no data';
        END IF;
        
        -- Drop the backup table after restore
        -- DROP TABLE metrics_requests_backup;
        -- RAISE NOTICE 'Removed backup table';
        RAISE NOTICE 'Kept metrics_requests_backup table for safety';
    END IF;
END $$;

-- Final message
DO $$
BEGIN
    RAISE NOTICE 'Schema update complete. metrics_requests table now has correct structure.';
END $$;
