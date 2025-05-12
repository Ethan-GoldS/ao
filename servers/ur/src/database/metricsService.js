/**
 * PostgreSQL-based metrics service
 * Handles storage and retrieval of request metrics data
 */
import { query } from './db.js'
import { logger } from '../logger.js'

const _logger = logger.child('metricsService')

/**
 * Store request metrics in the database
 * @param {Object} details Request details object
 * @returns {Promise<boolean>} Success status
 */
export async function storeMetrics(details) {
  try {
    if (!details || !details.processId) {
      _logger('Invalid request details for metrics storage')
      return false
    }

    const {
      processId,
      ip,
      referer,
      method,
      path,
      userAgent,
      origin,
      contentType,
      requestBody,
      rawBody,
      responseBody, // Add response body handling
      action,
      duration,
      timeReceived,
      timeCompleted
    } = details

    // Parse JSON body if it's a string
    let parsedBody = requestBody
    if (typeof requestBody === 'string') {
      try {
        parsedBody = JSON.parse(requestBody)
      } catch (e) {
        _logger('Failed to parse request body as JSON: %s', e.message)
        parsedBody = { rawBody: requestBody }
      }
    }

    // Here we're making sure raw body is a string and properly formatted for DB storage
    let rawBodyForStorage = null;
    if (rawBody) {
      if (typeof rawBody === 'string') {
        rawBodyForStorage = rawBody;
      } else {
        try {
          rawBodyForStorage = JSON.stringify(rawBody);
        } catch (e) {
          _logger('Failed to stringify raw body: %s', e.message);
          // Use string representation as fallback
          rawBodyForStorage = String(rawBody);
        }
      }
    }

    // Store response body too if available
    let responseBodyForStorage = null;
    if (responseBody) {
      if (typeof responseBody === 'string') {
        responseBodyForStorage = responseBody;
      } else {
        try {
          responseBodyForStorage = JSON.stringify(responseBody);
        } catch (e) {
          _logger('Failed to stringify response body: %s', e.message);
          responseBodyForStorage = String(responseBody);
        }
      }
    }

    // Check if table has request_raw column before inserting
    const result = await query(
      `INSERT INTO metrics_requests (
        process_id, request_ip, request_referrer, request_method, 
        request_path, request_user_agent, request_origin, request_content_type,
        request_body, request_raw, response_body, action, duration, time_received, time_completed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id`,
      [
        processId,
        ip || 'unknown',
        referer || 'unknown',
        method || 'unknown',
        path || 'unknown',
        userAgent || 'unknown',
        origin || 'unknown',
        contentType || 'unknown',
        parsedBody ? JSON.stringify(parsedBody) : null,
        rawBodyForStorage, // Use prepared raw body value
        responseBodyForStorage, // Add response body
        action || 'unknown',
        duration || 0,
        timeReceived ? new Date(timeReceived) : new Date(),
        timeCompleted ? new Date(timeCompleted) : new Date()
      ]
    )

    const id = result.rows[0]?.id
    _logger('Successfully stored metrics for process %s with ID %d', processId, id)

    // Verify the data was actually inserted
    try {
      const verifyResult = await query('SELECT * FROM metrics_requests WHERE id = $1', [id])
      if (verifyResult.rows.length > 0) {
        const row = verifyResult.rows[0]
        _logger('Verified stored metrics - process_id: %s, time_received: %s', 
          row.process_id, row.time_received)
      } else {
        _logger('WARNING: Could not verify stored metrics with ID %d - record not found', id)
      }
    } catch (verifyErr) {
      _logger('WARNING: Error verifying stored metrics: %O', verifyErr)
    }

    return true
  } catch (error) {
    _logger('ERROR: Failed to store metrics: %O', error)
    return false
  }
}

/**
 * Get recent request metrics
 * @param {Number} limit Maximum number of requests to return
 * @returns {Promise<Array>} Recent requests
 */
export async function getRecentRequests(limit = 100) {
  try {
    const result = await query(
      `SELECT * FROM metrics_requests
       ORDER BY time_received DESC
       LIMIT $1`,
      [limit]
    );
    
    // If query fails with the time_received column, try with timestamp for backward compatibility
    return result.rows.map(row => ({
      id: row.id,
      process_id: row.process_id,
      processId: row.process_id, // Include both formats for compatibility
      request_ip: row.request_ip,
      ip: row.request_ip, // Include both formats for compatibility
      request_referrer: row.request_referrer,
      referer: row.request_referrer,
      request_method: row.request_method,
      method: row.request_method,
      request_path: row.request_path,
      path: row.request_path,
      request_user_agent: row.request_user_agent,
      userAgent: row.request_user_agent,
      request_origin: row.request_origin,
      origin: row.request_origin,
      request_content_type: row.request_content_type,
      contentType: row.request_content_type,
      request_body: row.request_body,
      requestBody: row.request_body,
      request_raw: row.request_raw,
      rawBody: row.request_raw, // Include both formats for compatibility
      action: row.action,
      duration: row.duration,
      timestamp: row.time_received || row.timestamp, // Use time_received if available, timestamp as fallback
      time_received: row.time_received,
      timeReceived: row.time_received,
      time_completed: row.time_completed,
      timeCompleted: row.time_completed
    }))
  } catch (error) {
    _logger('Error getting recent requests: %O', error)
    return []
  }
}

/**
 * Get process metrics aggregated by process ID
 * @returns {Promise<Object>} Process metrics
 */
export async function getProcessMetrics() {
  try {
    const countResult = await query(
      `SELECT 
         process_id,
         COUNT(*) as request_count,
         AVG(duration) as avg_duration,
         MAX(time_received) as last_request
       FROM metrics_requests
       GROUP BY process_id
       ORDER BY request_count DESC`
    )

    return countResult.rows.map(row => ({
      processId: row.process_id,
      requestCount: parseInt(row.request_count, 10),
      avgDuration: parseFloat(row.avg_duration) || 0,
      lastRequest: row.last_request
    }))
  } catch (error) {
    _logger('Error getting process metrics: %O', error)
    return []
  }
}

/**
 * Get action metrics aggregated by action
 * @returns {Promise<Object>} Action metrics
 */
export async function getActionMetrics() {
  try {
    const result = await query(
      `SELECT 
         action,
         COUNT(*) as request_count,
         AVG(duration) as avg_duration
       FROM metrics_requests
       WHERE action IS NOT NULL AND action != 'unknown'
       GROUP BY action
       ORDER BY request_count DESC`
    )

    return result.rows.map(row => ({
      action: row.action,
      requestCount: parseInt(row.request_count, 10),
      avgDuration: parseFloat(row.avg_duration) || 0
    }))
  } catch (error) {
    _logger('Error getting action metrics: %O', error)
    return []
  }
}

/**
 * Get client metrics (IP and referrer counts)
 * @returns {Promise<Object>} Client metrics
 */
export async function getClientMetrics() {
  try {
    // Get IP metrics
    const ipResult = await query(
      `SELECT 
         request_ip as ip,
         COUNT(*) as request_count
       FROM metrics_requests
       WHERE request_ip != 'unknown'
       GROUP BY request_ip
       ORDER BY request_count DESC
       LIMIT 20`
    )

    // Get referrer metrics
    const referrerResult = await query(
      `SELECT 
         request_referrer as referrer,
         COUNT(*) as request_count
       FROM metrics_requests
       WHERE request_referrer != 'unknown'
       GROUP BY request_referrer
       ORDER BY request_count DESC
       LIMIT 20`
    )

    return {
      ipCounts: ipResult.rows.map(row => [
        row.ip,
        parseInt(row.request_count, 10)
      ]),
      referrerCounts: referrerResult.rows.map(row => [
        row.referrer,
        parseInt(row.request_count, 10)
      ])
    }
  } catch (error) {
    _logger('Error getting client metrics: %O', error)
    return { ipCounts: [], referrerCounts: [] }
  }
}

/**
 * Get time series data for requests over time
 * @param {Number} hours Number of hours to include in time series
 * @returns {Promise<Object>} Time series data
 */
export async function getTimeSeriesData(hours = 24) {
  try {
    // Detailed logging of database schema
    _logger('Running detailed schema check for time series data...');
    try {
      const tableCheck = await query(
        `SELECT table_schema, table_name
         FROM information_schema.tables
         WHERE table_name = 'metrics_requests'`
      );
      _logger('Found metrics_requests table in schemas: %O', 
        tableCheck.rows.map(row => row.table_schema));
              
      // Get all columns for the table
      const allColumns = await query(
        `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_name = 'metrics_requests'
         ORDER BY ordinal_position`
      );
      _logger('Available columns for metrics_requests: %O', 
        allColumns.rows.map(row => `${row.column_name} (${row.data_type})`));
    } catch (schemaErr) {
      _logger('ERROR checking schema details: %O', schemaErr);
    }
  
    // Check for existence of time_received column
    const columnCheck = await query(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_name = 'metrics_requests' 
       AND column_name = 'time_received'`
    );
    
    _logger('time_received column exists: %s', columnCheck.rows.length > 0);
    
    if (columnCheck.rows.length > 0) {
      // Column exists, use it
      try {
        _logger('Attempting to query using time_received column...');
        // Try a simpler query first to verify column access
        const simpleCheck = await query(
          `SELECT 
             MIN("time_received") as min_time,
             MAX("time_received") as max_time, 
             COUNT(*) as count
           FROM metrics_requests
           LIMIT 1`
        );
        
        if (simpleCheck.rows.length > 0) {
          _logger('Simple time_received check successful - count: %d, min: %s, max: %s', 
            simpleCheck.rows[0].count, 
            simpleCheck.rows[0].min_time, 
            simpleCheck.rows[0].max_time);
        } else {
          _logger('Simple time_received check returned no rows');
        }
        
        // Now try the main query with quoted column names
        const result = await query(
          `SELECT 
             date_trunc('hour', "time_received") as hour,
             COUNT(*) as total_requests,
             jsonb_object_agg("process_id", process_count) as process_counts
           FROM (
             SELECT 
               date_trunc('hour', "time_received") as hour,
               "process_id",
               COUNT(*) as process_count
             FROM metrics_requests
             WHERE "time_received" > NOW() - interval '${hours} hours'
             GROUP BY hour, "process_id"
             ORDER BY hour, process_count DESC
           ) AS hourly_process_counts
           GROUP BY hour
           ORDER BY hour ASC`,
          [], // params
          10000 // 10 second timeout
        );
        return await processTimeSeriesResults(result, hours);
      } catch (err) {
        _logger('Error using time_received column: %s', err.message);
        // Continue to fallback methods
      }
    }
    
    // Check for existence of timestamp column
    const timestampCheck = await query(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_name = 'metrics_requests' 
       AND column_name = 'timestamp'`
    );
    
    if (timestampCheck.rows.length > 0) {
      // Column exists, use it
      try {
        const result = await query(
          `SELECT 
             date_trunc('hour', timestamp) as hour,
             COUNT(*) as total_requests,
             jsonb_object_agg(process_id, process_count) as process_counts
           FROM (
             SELECT 
               date_trunc('hour', timestamp) as hour,
               process_id,
               COUNT(*) as process_count
             FROM metrics_requests
             WHERE timestamp > NOW() - interval '${hours} hours'
             GROUP BY hour, process_id
             ORDER BY hour, process_count DESC
           ) AS hourly_process_counts
           GROUP BY hour
           ORDER BY hour ASC`,
          [], // params
          10000 // 10 second timeout
        );
        return await processTimeSeriesResults(result, hours);
      } catch (err) {
        _logger('Error using timestamp column: %s', err.message);
        // Continue to fallback methods
      }
    }
    
    // If we get here, neither column exists or both failed, fall back to a simpler query based on ID
    _logger('Using simplified metrics query without time data');
    try {
      const result = await query(
        `SELECT 
           COUNT(*) as total_requests,
           jsonb_object_agg(process_id, process_count) as process_counts
         FROM (
           SELECT 
             process_id,
             COUNT(*) as process_count
           FROM metrics_requests
           GROUP BY process_id
           ORDER BY process_count DESC
         ) AS process_counts`,
        [], // params
        10000 // 10 second timeout
      );
      
      // Generate time series data using just the totals
      const timeSeriesData = [];
      const now = new Date();
      const totalRequests = parseInt(result.rows[0]?.total_requests || 0, 10);
      const processCounts = result.rows[0]?.process_counts || {};
      
      // Create empty buckets for each hour
      for (let i = hours - 1; i >= 0; i--) {
        const bucketTime = new Date(now.getTime() - i * 60 * 60 * 1000);
        timeSeriesData.push({
          timestamp: bucketTime.toISOString(),
          hour: bucketTime.getUTCHours(),
          totalRequests: i === 0 ? totalRequests : 0, // Put all data in the most recent bucket
          processCounts: i === 0 ? processCounts : {}
        });
      }
      
      // Return the generated time series data
      return {
        timeSeriesData,
        timeLabels: timeSeriesData.map(d => 
          new Date(d.timestamp).getUTCHours().toString().padStart(2, '0') + ':00'
        )
      };
    } catch (innerErr) {
      _logger('Error with simplified query: %s', innerErr.message);
      throw innerErr; // Bubble up to outer catch
    }
  } catch (error) {
    _logger('Error getting time series data: %O', error);
    // Generate empty time series data
    const timeLabels = [];
    const timeSeriesData = [];
    const now = new Date();
    
    for (let i = hours - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 60 * 60 * 1000);
      timeLabels.push(date.getUTCHours().toString().padStart(2, '0') + ':00');
      
      const bucketTime = new Date(now.getTime() - i * 60 * 60 * 1000);
      timeSeriesData.push({
        timestamp: bucketTime.toISOString(),
        hour: bucketTime.getUTCHours(),
        totalRequests: 0,
        processCounts: {}
      });
    }
    
    return { timeSeriesData, timeLabels };
  }
}

/**
 * Process time series results into expected format
 * @param {Object} result Query result
 * @param {Number} hours Number of hours
 * @returns {Promise<Object>} Processed time series data
 */
async function processTimeSeriesResults(result, hours) {
  try {
    // Get the top process IDs overall
    const topProcessesResult = await query(
      `SELECT 
         process_id,
         COUNT(*) as request_count
       FROM metrics_requests
       GROUP BY process_id
       ORDER BY request_count DESC
       LIMIT 5`
    )

    const topProcessIds = topProcessesResult.rows.map(row => row.process_id)

    // Generate time labels (hour of day)
    const timeLabels = []
    const now = new Date()
    for (let i = hours - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 60 * 60 * 1000)
      timeLabels.push(date.getUTCHours().toString().padStart(2, '0') + ':00')
    }

    // Fill in any missing hours with zeros
    const timeSeriesData = []
    const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000)

    for (let i = 0; i < hours; i++) {
      const bucketTime = new Date(startTime.getTime() + i * 60 * 60 * 1000)
      const bucketHour = date_trunc_hour(bucketTime)
      
      // Find matching row from query result
      const matchingRow = result.rows.find(row => {
        const rowTime = new Date(row.hour)
        return date_trunc_hour(rowTime).getTime() === bucketHour.getTime()
      })
      
      if (matchingRow) {
        timeSeriesData.push({
          timestamp: bucketHour.toISOString(),
          hour: bucketHour.getUTCHours(),
          totalRequests: parseInt(matchingRow.total_requests, 10),
          processCounts: matchingRow.process_counts || {}
        })
      } else {
        // No data for this hour, add empty bucket
        timeSeriesData.push({
          timestamp: bucketHour.toISOString(),
          hour: bucketHour.getUTCHours(),
          totalRequests: 0,
          processCounts: {}
        })
      }
    }

    return { timeSeriesData, timeLabels, topProcessIds }
  } catch (error) {
    _logger('Error processing time series results: %O', error)
    
    // Generate empty time series data on error
    const timeLabels = []
    const timeSeriesData = []
    const now = new Date()
    
    for (let i = hours - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 60 * 60 * 1000)
      timeLabels.push(date.getUTCHours().toString().padStart(2, '0') + ':00')
      
      const bucketTime = new Date(now.getTime() - i * 60 * 60 * 1000)
      timeSeriesData.push({
        timestamp: bucketTime.toISOString(),
        hour: bucketTime.getUTCHours(),
        totalRequests: 0,
        processCounts: {}
      })
    }
    
    return {
      timeSeriesData,
      timeLabels,
      topProcessIds: []
    }
  }
}

/**
 * Get total statistics
 * @returns {Promise<Object>} Total statistics
 */
export async function getTotalStats() {
  try {
    const result = await query(
      `SELECT 
         COUNT(*) as total_requests,
         COUNT(DISTINCT process_id) as unique_processes,
         COUNT(DISTINCT request_ip) as unique_ips,
         MIN(time_received) as start_time
       FROM metrics_requests`
    )

    const row = result.rows[0]
    return {
      totalRequests: parseInt(row.total_requests, 10),
      uniqueProcesses: parseInt(row.unique_processes, 10),
      uniqueIps: parseInt(row.unique_ips, 10),
      startTime: row.start_time ? row.start_time.toISOString() : new Date().toISOString()
    }
  } catch (error) {
    _logger('Error getting total stats: %O', error)
    return {
      totalRequests: 0,
      uniqueProcesses: 0,
      uniqueIps: 0,
      startTime: new Date().toISOString()
    }
  }
}

/**
 * Get flexible time series data with customizable time ranges and intervals
 * @param {Object} options Configuration options
 * @param {Number} options.timeRangeMinutes Time range in minutes (default: 60)
 * @param {Number} options.intervalSeconds Interval size in seconds (default: 60)
 * @param {String} options.processIdFilter Optional process ID filter (substring match)
 * @returns {Promise<Object>} Time series data
 */
export async function getFlexibleTimeSeriesData(options = {}) {
  const timeRangeMinutes = options.timeRangeMinutes || 60; // Default to 1 hour
  const intervalSeconds = options.intervalSeconds || 60; // Default to 1 minute intervals
  const processIdFilter = options.processIdFilter || null;
  
  try {
    _logger('Getting flexible time series data: range=%d minutes, interval=%d seconds, filter=%s', 
      timeRangeMinutes, intervalSeconds, processIdFilter || 'none');
    
    // Build the interval expression based on seconds
    let intervalExpr = '';
    if (intervalSeconds < 60) {
      // For intervals less than a minute, use seconds
      intervalExpr = `${intervalSeconds} seconds`;
    } else if (intervalSeconds < 3600) {
      // For intervals less than an hour, use minutes
      intervalExpr = `${Math.floor(intervalSeconds / 60)} minutes`;
    } else {
      // For intervals of an hour or more, use hours
      intervalExpr = `${Math.floor(intervalSeconds / 3600)} hours`;
    }
    
    // Build the query, adding process_id filter if needed
    let queryParams = [];
    let processFilterClause = '';
    
    if (processIdFilter) {
      processFilterClause = 'AND process_id ILIKE $1';
      queryParams.push(`%${processIdFilter}%`);
    }
    
    const result = await query(
      `WITH time_slots AS (
        SELECT 
          generate_series(
            date_trunc('second', NOW() - interval '${timeRangeMinutes} minutes'),
            date_trunc('second', NOW()),
            interval '${intervalExpr}'
          ) AS slot_start
      )
      SELECT 
        time_slots.slot_start,
        COUNT(mr.id) AS request_count,
        COALESCE(jsonb_object_agg(
          mr.process_id, 
          COUNT(mr.id)
        ) FILTER (WHERE mr.id IS NOT NULL), '{}'::jsonb) AS process_counts,
        COALESCE(jsonb_object_agg(
          mr.action, 
          COUNT(mr.id)
        ) FILTER (WHERE mr.id IS NOT NULL), '{}'::jsonb) AS action_counts,
        COALESCE(AVG(mr.duration) FILTER (WHERE mr.id IS NOT NULL), 0) AS avg_duration
      FROM 
        time_slots
      LEFT JOIN metrics_requests mr ON 
        mr.time_received >= time_slots.slot_start AND
        mr.time_received < time_slots.slot_start + interval '${intervalExpr}'
        ${processFilterClause}
      GROUP BY 
        time_slots.slot_start
      ORDER BY 
        time_slots.slot_start ASC`,
      queryParams,
      30000 // 30 second timeout
    );
    
    // Format the results
    const timeSeriesData = result.rows.map(row => ({
      timestamp: row.slot_start.toISOString(),
      requestCount: parseInt(row.request_count, 10),
      processCounts: row.process_counts || {},
      actionCounts: row.action_counts || {},
      avgDuration: parseFloat(row.avg_duration) || 0
    }));
    
    // Generate time labels based on the interval
    const timeLabels = timeSeriesData.map(d => {
      const date = new Date(d.timestamp);
      if (intervalSeconds < 60) {
        // For intervals less than a minute, show hours:minutes:seconds
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
      } else if (intervalSeconds < 3600) {
        // For intervals less than an hour, show hours:minutes
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      } else {
        // For intervals of an hour or more, show day and hour
        return `${date.getDate()}/${date.getMonth()+1} ${date.getHours().toString().padStart(2, '0')}:00`;
      }
    });
    
    // Get unique process IDs across all time periods
    const allProcessIds = new Set();
    timeSeriesData.forEach(data => {
      Object.keys(data.processCounts).forEach(pid => allProcessIds.add(pid));
    });
    
    // Get unique actions across all time periods
    const allActions = new Set();
    timeSeriesData.forEach(data => {
      Object.keys(data.actionCounts).forEach(action => allActions.add(action));
    });
    
    return {
      timeSeriesData,
      timeLabels,
      uniqueProcessIds: Array.from(allProcessIds),
      uniqueActions: Array.from(allActions),
      totalRequests: timeSeriesData.reduce((sum, data) => sum + data.requestCount, 0),
      startTime: timeSeriesData.length > 0 ? timeSeriesData[0].timestamp : null,
      endTime: timeSeriesData.length > 0 ? timeSeriesData[timeSeriesData.length - 1].timestamp : null
    };
  } catch (error) {
    _logger('Error getting flexible time series data: %O', error);
    return {
      timeSeriesData: [],
      timeLabels: [],
      uniqueProcessIds: [],
      uniqueActions: [],
      totalRequests: 0,
      startTime: null,
      endTime: null
    };
  }
}

/**
 * Get all metrics for dashboard display
 * @returns {Promise<Object>} All metrics
 */
export async function getAllMetrics() {
  try {
    const recentRequests = await getRecentRequests(100);
    const processMetrics = await getProcessMetrics();
    const actionMetrics = await getActionMetrics();
    const clientMetrics = await getClientMetrics();
    const timeSeriesData = await getTimeSeriesData(24);
    const totalStats = await getTotalStats();
    const trafficOverview = await getFlexibleTimeSeriesData({ timeRangeMinutes: 60, intervalSeconds: 60 });
    
    return {
      recentRequests,
      processMetrics,
      actionMetrics,
      clientMetrics,
      timeSeriesData,
      totalStats,
      trafficOverview
    };
  } catch (error) {
    _logger('Error getting all metrics: %O', error);
    return {
      recentRequests: [],
      processMetrics: [],
      actionMetrics: [],
      clientMetrics: {
        ipAddresses: [],
        referrers: []
      },
      timeSeriesData: {
        timeSeriesData: [],
        timeLabels: []
      },
      totalStats: {
        totalRequests: 0,
        avgDuration: 0,
        activeProcesses: 0
      },
      trafficOverview: {
        timeSeriesData: [],
        timeLabels: [],
        uniqueProcessIds: [],
        uniqueActions: [],
        totalRequests: 0
      }
    };
  }
}

/**
 * Helper function to truncate a date to the nearest hour
 * @param {Date} date Date to truncate
 * @returns {Date} Date truncated to hour
 */
function date_trunc_hour(date) {
  const result = new Date(date)
  result.setMinutes(0, 0, 0)
  return result
}
