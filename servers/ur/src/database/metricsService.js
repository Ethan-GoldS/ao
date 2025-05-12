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
 * @param {Object} options Time series options
 * @param {Number} options.hours Number of hours to include (default: 24)
 * @param {String} options.startTime ISO string for start time (overrides hours if provided)
 * @param {String} options.endTime ISO string for end time (defaults to now if not provided)
 * @param {String} options.interval Grouping interval (minute, 5min, 10min, 15min, 30min, hour, day)
 * @param {String} options.processId Process ID to filter by (optional)
 * @returns {Promise<Object>} Time series data
 */
export async function getTimeSeriesData(options = {}) {
  // Set defaults
  const hours = options.hours || 24;
  const interval = options.interval || 'hour';
  const processId = options.processId || null;
  
  // Determine time range
  let startTime, endTime;
  if (options.startTime) {
    startTime = new Date(options.startTime);
  } else {
    // Default to hours ago from now
    startTime = new Date();
    startTime.setHours(startTime.getHours() - hours);
  }
  
  endTime = options.endTime ? new Date(options.endTime) : new Date();
  
  // Validate dates
  if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
    _logger('Invalid date range provided: %s to %s', options.startTime, options.endTime);
    startTime = new Date();
    startTime.setHours(startTime.getHours() - 24);
    endTime = new Date();
  }
  
  _logger('Getting time series data from %s to %s with interval %s', 
    startTime.toISOString(), 
    endTime.toISOString(),
    interval
  );
  
  // Convert interval to PostgreSQL interval
  let pgInterval;
  switch(interval) {
    // Fine-grained intervals
    case '5sec': pgInterval = '5 seconds'; break;
    case '10sec': pgInterval = '10 seconds'; break;
    case '30sec': pgInterval = '30 seconds'; break;
    case 'minute': pgInterval = 'minute'; break;
    case '5min': pgInterval = '5 minutes'; break;
    case '10min': pgInterval = '10 minutes'; break;
    case '15min': pgInterval = '15 minutes'; break;
    case '30min': pgInterval = '30 minutes'; break;
    
    // Coarser intervals for longer time periods
    case 'hour': pgInterval = 'hour'; break;
    case '2hour': pgInterval = '2 hours'; break;
    case '6hour': pgInterval = '6 hours'; break;
    case '12hour': pgInterval = '12 hours'; break;
    case 'day': pgInterval = 'day'; break;
    case 'week': pgInterval = 'week'; break;
    case 'month': pgInterval = 'month'; break;
    
    default: 
      // Choose appropriate interval based on time range span
      const timeSpanHours = (endTime - startTime) / (60 * 60 * 1000);
      
      if (timeSpanHours <= 1) {
        pgInterval = 'minute'; // Less than 1 hour: use minutes
      } else if (timeSpanHours <= 6) {
        pgInterval = '10 minutes'; // 1-6 hours: use 10 min intervals
      } else if (timeSpanHours <= 24) {
        pgInterval = 'hour'; // 6-24 hours: use hourly intervals
      } else if (timeSpanHours <= 168) { // 7 days
        pgInterval = '6 hours'; // 1-7 days: use 6 hour intervals
      } else {
        pgInterval = 'day'; // More than 7 days: use daily intervals
      }
      
      _logger('Auto-selected grouping interval %s for time span of %d hours', 
              pgInterval, timeSpanHours.toFixed(1));
      break;
  }
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
  
    // First check what columns actually exist in the table
    const columnsCheck = await query(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_name = 'metrics_requests'`
    );
    
    // Get all available column names
    const availableColumns = columnsCheck.rows.map(row => row.column_name);
    _logger('Available columns in metrics_requests table: %O', availableColumns);
    
    // Determine which timestamp column to use
    let timestampColumn = '';
    
    // Check in order of preference
    if (availableColumns.includes('time_received')) {
      timestampColumn = 'time_received';
    } else if (availableColumns.includes('timestamp')) {
      timestampColumn = 'timestamp';
    } else if (availableColumns.includes('received_time')) {
      timestampColumn = 'received_time';
    }
    
    _logger('Using timestamp column: %s', timestampColumn || 'NONE');
    
    if (timestampColumn) {
      try {
        _logger('Attempting query with timestamp column %s and interval %s...', timestampColumn, pgInterval);
        
        // Build process filter if needed
        let processFilter = '';
        let params = [pgInterval, startTime, endTime];
        let processIdPosition = 4; // Default position if we need to add processId
        
        if (processId) {
          processFilter = `AND ${timestampColumn === 'process_id' ? '"process_id"' : 'process_id'} = $${processIdPosition}`;
          params.push(processId);
          _logger('Filtering by process ID: %s', processId);
        }
        
        // Build a query that works regardless of column name quoting
        const result = await query(
          `SELECT 
             date_trunc($1, ${timestampColumn}) as bucket_time,
             COUNT(*) as total_requests,
             jsonb_object_agg(process_id, process_count) as process_counts
           FROM (
             SELECT 
               date_trunc($1, ${timestampColumn}) as bucket_time,
               process_id,
               COUNT(*) as process_count
             FROM metrics_requests
             WHERE ${timestampColumn} >= $2 AND ${timestampColumn} <= $3 ${processFilter}
             GROUP BY bucket_time, process_id
             ORDER BY bucket_time, process_count DESC
           ) AS bucketed_process_counts
           GROUP BY bucket_time
           ORDER BY bucket_time ASC`,
          params, 
          15000 // 15 second timeout
        );
        
        return await processTimeSeriesResults(result, startTime, endTime, interval, processId);
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
        // Build process filter if needed
        let processFilter = '';
        let params = [pgInterval, startTime, endTime];
        
        if (processId) {
          processFilter = 'AND process_id = $4';
          params.push(processId);
        }
        
        const result = await query(
          `SELECT 
             date_trunc($1, timestamp) as bucket_time,
             COUNT(*) as total_requests,
             jsonb_object_agg(process_id, process_count) as process_counts
           FROM (
             SELECT 
               date_trunc($1, timestamp) as bucket_time,
               process_id,
               COUNT(*) as process_count
             FROM metrics_requests
             WHERE timestamp >= $2 AND timestamp <= $3 ${processFilter}
             GROUP BY bucket_time, process_id
             ORDER BY bucket_time, process_count DESC
           ) AS bucketed_process_counts
           GROUP BY bucket_time
           ORDER BY bucket_time ASC`,
          params,
          15000 // 15 second timeout
        );
        return await processTimeSeriesResults(result, startTime, endTime, interval, processId);
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
 * @param {Date} startTime Start time for the series
 * @param {Date} endTime End time for the series
 * @param {String} interval The bucketing interval
 * @param {String} processId Optional process ID filter
 * @returns {Promise<Object>} Processed time series data
 */
async function processTimeSeriesResults(result, startTime, endTime, interval, processId) {
  try {
    // Get the top process IDs overall or relevant to the time range
    let processFilter = '';
    const params = [startTime, endTime];
    
    if (processId) {
      // If we're already filtering by a specific process, just include that one
      return { 
        timeSeriesData: processAndFormatTimeSeriesData(result.rows, startTime, endTime, interval),
        topProcessIds: [processId] 
      };
    }
    
    const topProcessesResult = await query(
      `SELECT 
         process_id,
         COUNT(*) as request_count
       FROM metrics_requests
       WHERE time_received >= $1 AND time_received <= $2
       GROUP BY process_id
       ORDER BY request_count DESC
       LIMIT 10`,
      params
    );

    const topProcessIds = topProcessesResult.rows.map(row => row.process_id);

    return { 
      timeSeriesData: processAndFormatTimeSeriesData(result.rows, startTime, endTime, interval),
      topProcessIds 
    };
  } catch (error) {
    _logger('Error processing time series results: %O', error);
    return {
      timeSeriesData: [],
      topProcessIds: []
    };
  }
}

/**
 * Process and format time series data with appropriate time buckets
 * @param {Array} rows Query result rows
 * @param {Date} startTime Start time
 * @param {Date} endTime End time
 * @param {String} interval Bucketing interval
 * @returns {Array} Processed time series data
 */
function processAndFormatTimeSeriesData(rows, startTime, endTime, interval) {
  // Determine time increment based on interval
  let incrementMs;
  switch(interval) {
    case 'minute': incrementMs = 60 * 1000; break;
    case '5min': incrementMs = 5 * 60 * 1000; break;
    case '10min': incrementMs = 10 * 60 * 1000; break;
    case '15min': incrementMs = 15 * 60 * 1000; break;
    case '30min': incrementMs = 30 * 60 * 1000; break;
    case 'hour': incrementMs = 60 * 60 * 1000; break;
    case 'day': incrementMs = 24 * 60 * 60 * 1000; break;
    default: incrementMs = 60 * 60 * 1000; // Default to hour
  }
  
  // Create all time buckets for the requested range
  const timeSeriesData = [];
  const currentTime = new Date(startTime.getTime());

  // Create buckets for the entire range
  while (currentTime < endTime) {
    // Create new bucket
    const bucketTime = new Date(currentTime);
    
    // Find matching row in the query results
    const matchingRow = rows.find(row => {
      const rowTime = new Date(row.bucket_time);
      return Math.abs(rowTime.getTime() - bucketTime.getTime()) < 1000; // Allow 1s difference for rounding
    });
    
    if (matchingRow) {
      timeSeriesData.push({
        timestamp: bucketTime.toISOString(),
        totalRequests: parseInt(matchingRow.total_requests, 10),
        processCounts: matchingRow.process_counts || {}
      });
    } else {
      // No data for this interval, add empty bucket
      timeSeriesData.push({
        timestamp: bucketTime.toISOString(),
        totalRequests: 0,
        processCounts: {}
      });
    }
    
    // Move to next bucket
    currentTime.setTime(currentTime.getTime() + incrementMs);
  }
  
  return timeSeriesData;
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
 * Get all metrics for dashboard display
 * @returns {Promise<Object>} All metrics
 */
export async function getAllMetrics(timeOptions = {}) {
  try {
    const recentRequests = await getRecentRequests(100)
    
    // Group request details by processId
    const requestDetails = {}
    for (const req of recentRequests) {
      if (!requestDetails[req.processId]) {
        requestDetails[req.processId] = []
      }
      requestDetails[req.processId].push(req)
    }
    
    const processMetrics = await getProcessMetrics()
    const actionMetrics = await getActionMetrics()
    const clientMetrics = await getClientMetrics()
    
    // Use provided time options or default to 24 hours
    const { timeSeriesData, topProcessIds } = await getTimeSeriesData({
      hours: 24,
      interval: 'hour',
      ...timeOptions
    })
    
    const totals = await getTotalStats()
    
    return {
      recentRequests,
      requestDetails,
      processCounts: processMetrics.reduce((obj, metric) => {
        obj[metric.processId] = metric.requestCount
        return obj
      }, {}),
      processTiming: processMetrics.reduce((obj, metric) => {
        obj[metric.processId] = { avgDuration: metric.avgDuration }
        return obj
      }, {}),
      actionCounts: actionMetrics.reduce((obj, metric) => {
        obj[metric.action] = metric.requestCount
        return obj
      }, {}),
      actionTiming: actionMetrics.reduce((obj, metric) => {
        obj[metric.action] = { avgDuration: metric.avgDuration }
        return obj
      }, {}),
      ipCounts: clientMetrics.ipCounts,
      referrerCounts: clientMetrics.referrerCounts,
      timeSeriesData,
      topProcessIds,
      totalRequests: totals.totalRequests,
      uniqueProcesses: totals.uniqueProcesses,
      uniqueIps: totals.uniqueIps,
      startTime: totals.startTime
    }
  } catch (error) {
    _logger('Error getting all metrics: %O', error)
    return {
      recentRequests: [],
      requestDetails: {},
      processCounts: {},
      processTiming: {},
      actionCounts: {},
      actionTiming: {},
      ipCounts: [],
      referrerCounts: [],
      timeSeriesData: [],
      timeLabels: [],
      topProcessIds: [],
      totalRequests: 0,
      uniqueProcesses: 0,
      uniqueIps: 0,
      startTime: new Date().toISOString()
    }
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
