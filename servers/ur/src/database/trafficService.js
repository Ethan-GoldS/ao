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

    // Get interval configuration including PostgreSQL interval and truncation level
    const intervalConfig = getIntervalConfig(interval);
    
    _logger('Using PostgreSQL interval: %s for requested interval: %s with truncation to %s', 
      intervalConfig.pgInterval, interval, intervalConfig.truncateTo);
    
    // Calculate time difference in minutes for logging
    const timeDiffMins = Math.round((endTime - startTime) / (1000 * 60));
    _logger('Time range requested: %d minutes (%d hours)', timeDiffMins, timeDiffMins/60);
    
    // Prepare new query using proper bucketing with date_trunc for precise interval control
    let sql = `
      WITH time_buckets AS (
        SELECT 
          date_trunc($1, time_bucket($2::interval, time_received)) AS bucket_time,
          action,
          process_id
        FROM metrics_requests
        WHERE time_received BETWEEN $3 AND $4
    `;

    // Add process ID filter if provided
    const params = [intervalConfig.truncateTo, intervalConfig.pgInterval, startTime, endTime];
    if (processIdFilter) {
      sql += ` AND process_id LIKE $5 `;
      params.push(`%${processIdFilter}%`);
    }

    // Complete the query with better aggregation
    sql += `
      )
      SELECT 
        bucket_time,
        SUM(count_per_action) AS request_count,
        jsonb_object_agg(
          COALESCE(action, 'unknown'),
          COALESCE(count_per_action, 0)
        ) AS action_counts
      FROM (
        SELECT 
          bucket_time,
          action,
          COUNT(*) AS count_per_action
        FROM time_buckets
        GROUP BY bucket_time, action
      ) AS action_counts_per_bucket
      GROUP BY bucket_time
      ORDER BY bucket_time ASC
    `;

    // Execute the query with timeout (15 seconds)
    const result = await query(sql, params, 15000);

    // Process and return the results
    const trafficData = processTrafficResults(result.rows, interval, intervalConfig.formatType);
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
 * Convert user-friendly interval to PostgreSQL interval string and get appropriate format
 * @param {String} interval User-friendly interval
 * @returns {Object} PostgreSQL interval and format information
 */
function getIntervalConfig(interval) {
  // Define the mapping for all supported intervals
  const intervalConfigs = {
    // Seconds-based intervals
    '5sec': { 
      pgInterval: '5 seconds', 
      truncateTo: 'second',
      formatType: 'time_with_seconds'
    },
    '15sec': { 
      pgInterval: '15 seconds', 
      truncateTo: 'second',
      formatType: 'time_with_seconds'
    },
    '30sec': { 
      pgInterval: '30 seconds', 
      truncateTo: 'second',
      formatType: 'time_with_seconds'
    },
    
    // Minutes-based intervals
    '1min': { 
      pgInterval: '1 minute', 
      truncateTo: 'minute',
      formatType: 'time_with_seconds'
    },
    '5min': { 
      pgInterval: '5 minutes', 
      truncateTo: 'minute',
      formatType: 'time_with_seconds'
    },
    '10min': { 
      pgInterval: '10 minutes', 
      truncateTo: 'minute',
      formatType: 'time_with_seconds'
    },
    '15min': { 
      pgInterval: '15 minutes', 
      truncateTo: 'minute',
      formatType: 'time_with_seconds'
    },
    '30min': { 
      pgInterval: '30 minutes', 
      truncateTo: 'minute',
      formatType: 'time_without_seconds'
    },
    
    // Hours-based intervals
    '1hour': { 
      pgInterval: '1 hour', 
      truncateTo: 'hour',
      formatType: 'time_without_seconds'
    },
    '3hour': { 
      pgInterval: '3 hours', 
      truncateTo: 'hour',
      formatType: 'time_without_seconds'
    },
    '6hour': { 
      pgInterval: '6 hours', 
      truncateTo: 'hour',
      formatType: 'time_without_seconds'
    },
    '12hour': { 
      pgInterval: '12 hours', 
      truncateTo: 'hour',
      formatType: 'date_and_time'
    },
    
    // Days-based intervals
    '1day': { 
      pgInterval: '1 day', 
      truncateTo: 'day',
      formatType: 'date_and_time'
    },
    '7day': { 
      pgInterval: '1 day', 
      truncateTo: 'day',
      formatType: 'date_only'
    }
  };

  // Try to get the config for the requested interval
  if (intervalConfigs[interval]) {
    return intervalConfigs[interval];
  }
  
  // Try to parse a custom interval format (e.g., '45sec', '2min')
  const match = interval.match(/^(\d+)(sec|min|hour|day)$/);
  if (match) {
    const value = match[1];
    const unit = match[2];
    
    const unitMap = {
      'sec': 'seconds',
      'min': 'minutes',
      'hour': 'hours',
      'day': 'days'
    };
    
    // Determine truncation level and format type based on unit
    let truncateTo, formatType;
    switch(unit) {
      case 'sec':
        truncateTo = 'second';
        formatType = 'time_with_seconds';
        break;
      case 'min':
        truncateTo = 'minute';
        formatType = value < 30 ? 'time_with_seconds' : 'time_without_seconds';
        break;
      case 'hour':
        truncateTo = 'hour';
        formatType = value < 12 ? 'time_without_seconds' : 'date_and_time';
        break;
      case 'day':
        truncateTo = 'day';
        formatType = 'date_only';
        break;
      default:
        truncateTo = 'minute';
        formatType = 'time_without_seconds';
    }
    
    return {
      pgInterval: `${value} ${unitMap[unit] || 'minutes'}`,
      truncateTo,
      formatType
    };
  }
  
  // Default fallback
  return {
    pgInterval: '1 minute',
    truncateTo: 'minute',
    formatType: 'time_without_seconds'
  };
}

/**
 * Process traffic results into a more usable format
 * @param {Array} rows Query result rows
 * @param {String} interval Original interval string
 * @param {String} formatType Type of time formatting to use
 * @returns {Object} Processed traffic data
 */
function processTrafficResults(rows, interval, formatType) {
  // Format the bucket time based on format type
  const formatTime = (timestamp, formatType) => {
    const date = new Date(timestamp);
    
    switch(formatType) {
      case 'time_with_seconds':
        // For short intervals, show time with seconds (HH:MM:SS)
        return date.toLocaleTimeString();
      
      case 'time_without_seconds':
        // For medium intervals, show time without seconds (HH:MM)
        return date.toLocaleString(undefined, {
          hour: '2-digit',
          minute: '2-digit'
        });
      
      case 'date_and_time':
        // For longer intervals, show date and time (MMM DD, HH:MM)
        return date.toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      
      case 'date_only':
        // For very long intervals, show just date (MMM DD)
        return date.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric'
        });
      
      default:
        // Default fallback
        return date.toLocaleString();
    }
  };

  // Process the rows into the expected format
  const trafficData = rows.map(row => ({
    timestamp: row.bucket_time,
    formatted_time: formatTime(row.bucket_time, formatType),
    request_count: parseInt(row.request_count, 10),
    action_counts: row.action_counts || {},
    interval: interval // Include the interval for reference
  }));

  // Extract time labels for chart
  const timeLabels = trafficData.map(data => data.formatted_time);
  
  _logger('Processed %d data points with interval %s', trafficData.length, interval);

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
