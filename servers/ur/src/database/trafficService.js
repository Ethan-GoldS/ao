/**
 * Traffic overview data service
 * Provides optimized queries for traffic visualization with flexible time ranges and intervals
 */
import { query } from './db.js';
import { logger } from '../logger.js';

const _logger = logger.child('trafficService');

/**
 * Get traffic data with flexible time ranges and intervals
 * @param {Object} options Query options
 * @param {Date} options.startTime Start time
 * @param {Date} options.endTime End time
 * @param {String} options.interval Time grouping interval ('5sec'|'30sec'|'1min'|'5min'|'10min'|'30min'|'1hour'|'6hour'|'1day')
 * @param {String} options.processIdFilter Optional process ID filter (can be partial)
 * @returns {Promise<Array>} Traffic data grouped by the specified interval
 */
export async function getTrafficData(options) {
  try {
    // Validate required schema before querying
    await validateSchema();
    
    const {
      startTime = new Date(Date.now() - 3600000), // Default 1 hour ago
      endTime = new Date(),
      interval = '1min',
      processIdFilter = null
    } = options;

    _logger('Getting traffic data: range=%s to %s, interval=%s, processFilter=%s',
      startTime.toISOString(),
      endTime.toISOString(),
      interval,
      processIdFilter || 'none'
    );

    // Convert interval to PostgreSQL interval format
    const pgInterval = convertToPgInterval(interval);
    
    // Prepare base query with flexible time bucketing
    let sql = `
      SELECT 
        time_bucket($1, time_received) AS bucket_time,
        COUNT(*) AS request_count,
        jsonb_object_agg(COALESCE(action, 'unknown'), action_count) AS action_counts
      FROM (
        SELECT 
          time_received,
          action,
          COUNT(*) AS action_count
        FROM metrics_requests
        WHERE time_received BETWEEN $2 AND $3
    `;

    // Add process ID filter if provided
    const params = [pgInterval, startTime, endTime];
    if (processIdFilter) {
      sql += ` AND process_id LIKE $4 `;
      params.push(`%${processIdFilter}%`);
    }

    // Complete the query with grouping and ordering
    sql += `
        GROUP BY time_received, action
      ) AS detailed
      GROUP BY bucket_time
      ORDER BY bucket_time ASC
    `;

    // Execute the query with timeout
    const result = await query(sql, params, 15000);

    // Process and return the results
    const trafficData = processTrafficResults(result.rows, interval);
    return trafficData;
    
  } catch (error) {
    _logger('Error getting traffic data: %O', error);
    return { 
      error: error.message,
      trafficData: [],
      timeLabels: []
    };
  }
}

/**
 * Convert user-friendly interval to PostgreSQL interval string
 * @param {String} interval User-friendly interval
 * @returns {String} PostgreSQL interval
 */
function convertToPgInterval(interval) {
  const intervalMap = {
    '5sec': '5 seconds',
    '15sec': '15 seconds',
    '30sec': '30 seconds',
    '1min': '1 minute',
    '5min': '5 minutes',
    '10min': '10 minutes',
    '15min': '15 minutes',
    '30min': '30 minutes',
    '1hour': '1 hour',
    '3hour': '3 hours',
    '6hour': '6 hours',
    '12hour': '12 hours',
    '1day': '1 day'
  };

  return intervalMap[interval] || '1 minute';
}

/**
 * Process traffic results into a more usable format
 * @param {Array} rows Query result rows
 * @param {String} interval Interval used for query
 * @returns {Object} Processed traffic data
 */
function processTrafficResults(rows, interval) {
  // Format the bucket time based on interval
  const formatTime = (timestamp, interval) => {
    const date = new Date(timestamp);
    
    // For short intervals (seconds/minutes), show time with seconds
    if (['5sec', '15sec', '30sec', '1min', '5min', '10min'].includes(interval)) {
      return date.toLocaleTimeString();
    }
    
    // For medium intervals (hours), show date and time without seconds
    if (['30min', '1hour', '3hour', '6hour'].includes(interval)) {
      return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    
    // For long intervals (days), show just date
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric'
    });
  };

  // Process the rows into the expected format
  const trafficData = rows.map(row => ({
    timestamp: row.bucket_time,
    formatted_time: formatTime(row.bucket_time, interval),
    request_count: parseInt(row.request_count, 10),
    action_counts: row.action_counts || {}
  }));

  // Extract time labels for chart
  const timeLabels = trafficData.map(data => data.formatted_time);

  return { 
    trafficData,
    timeLabels
  };
}

/**
 * Get the list of unique process IDs for filtering
 * @param {Object} options Query options
 * @param {Date} options.startTime Start time
 * @param {Date} options.endTime End time
 * @returns {Promise<Array>} List of unique process IDs
 */
export async function getUniqueProcessIds(options = {}) {
  try {
    await validateSchema();
    
    const {
      startTime = new Date(Date.now() - 3600000), // Default 1 hour ago
      endTime = new Date()
    } = options;

    const result = await query(
      `SELECT DISTINCT process_id 
       FROM metrics_requests
       WHERE time_received BETWEEN $1 AND $2
       ORDER BY process_id`,
      [startTime, endTime],
      10000
    );

    return result.rows.map(row => row.process_id);
  } catch (error) {
    _logger('Error getting unique process IDs: %O', error);
    return [];
  }
}

/**
 * Validate the database schema to ensure required tables and columns exist
 * @returns {Promise<Boolean>} True if schema is valid
 */
async function validateSchema() {
  try {
    // Check if metrics_requests table exists
    const tableCheck = await query(
      `SELECT table_name 
       FROM information_schema.tables 
       WHERE table_name = 'metrics_requests'`
    );
    
    if (tableCheck.rows.length === 0) {
      throw new Error('metrics_requests table does not exist');
    }
    
    // Check if required columns exist
    const requiredColumns = ['process_id', 'time_received', 'action'];
    
    const columnCheck = await query(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_name = 'metrics_requests' 
       AND column_name = ANY($1)`,
      [requiredColumns]
    );
    
    const missingColumns = requiredColumns.filter(col => 
      !columnCheck.rows.some(row => row.column_name === col)
    );
    
    if (missingColumns.length > 0) {
      throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
    }
    
    // Check if the time_bucket function is available (TimescaleDB)
    // If not, we need to create our own function
    try {
      await query(`SELECT time_bucket('1 minute'::interval, now())`);
    } catch (e) {
      _logger('time_bucket function not found, creating compatibility function');
      await query(`
        CREATE OR REPLACE FUNCTION time_bucket(bucket_width interval, ts timestamptz)
        RETURNS timestamptz AS $$
        BEGIN
          RETURN date_trunc('minute', ts);
        END;
        $$ LANGUAGE plpgsql;
      `);
    }
    
    return true;
  } catch (error) {
    _logger('Schema validation error: %O', error);
    throw error;
  }
}

/**
 * Initialize and validate traffic service schema
 * Call this during app startup to ensure database is ready
 */
export async function initializeTrafficService() {
  try {
    await validateSchema();
    _logger('Traffic service schema validated successfully');
    return true;
  } catch (error) {
    _logger('Error initializing traffic service: %O', error);
    return false;
  }
}
