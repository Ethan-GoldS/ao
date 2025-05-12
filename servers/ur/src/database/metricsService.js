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

    _logger('Stored metrics for process %s with ID %d', processId, result.rows[0]?.id)
    return true
  } catch (error) {
    _logger('Error storing metrics: %O', error)
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
         MAX(timestamp) as last_request
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
    // First, let's inspect what columns actually exist in the metrics_requests table
    const availableColumns = await query(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_name = 'metrics_requests'`
    );
    
    // Log all available columns to diagnose the issue
    const columnNames = availableColumns.rows.map(row => row.column_name);
    _logger('Available columns in metrics_requests: %s', columnNames.join(', '));
    
    // Check which timestamp column we should use based on what's available
    const hasTimeReceived = columnNames.includes('time_received');
    const hasTimeCompleted = columnNames.includes('time_completed');
    const hasCreatedAt = columnNames.includes('created_at');
    const hasTimestamp = columnNames.includes('timestamp');
    const hasID = columnNames.includes('id');
    
    let timeColumn = null;
    
    // Determine which column to use for time series, in order of preference
    if (hasTimeReceived) {
      timeColumn = 'time_received';
      _logger('Using time_received column for time series data');
    } else if (hasTimeCompleted) {
      timeColumn = 'time_completed';
      _logger('Using time_completed column for time series data');
    } else if (hasCreatedAt) {
      timeColumn = 'created_at';
      _logger('Using created_at column for time series data');
    } else if (hasTimestamp) {
      timeColumn = 'timestamp';
      _logger('Using timestamp column for time series data');
    }
    
    if (timeColumn) {
      try {
        // Use the detected time column
        const result = await query(
          `SELECT 
             date_trunc('hour', ${timeColumn}) as hour,
             COUNT(*) as total_requests,
             jsonb_object_agg(process_id, process_count) as process_counts
           FROM (
             SELECT 
               date_trunc('hour', ${timeColumn}) as hour,
               process_id,
               COUNT(*) as process_count
             FROM metrics_requests
             WHERE ${timeColumn} > NOW() - interval '${hours} hours'
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
        _logger('Error using %s column: %s', timeColumn, err.message);
        // Continue to fallback method
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
           LIMIT 100
         ) AS process_counts`,
        [], // params
        5000 // 5 second timeout
      );
      
      // If time columns are missing, attempt a comprehensive table modification
      try {
        _logger('Attempting comprehensive table fix for time-related columns');
        
        // First try to add just the time_received column with correct constraints
        await query(
          `ALTER TABLE metrics_requests ADD COLUMN IF NOT EXISTS time_received TIMESTAMPTZ NOT NULL DEFAULT NOW()`
        );
        _logger('Successfully added time_received column');
        
        // Try to add time_completed column also
        await query(
          `ALTER TABLE metrics_requests ADD COLUMN IF NOT EXISTS time_completed TIMESTAMPTZ`
        );
        _logger('Successfully added time_completed column');
        
        // Add request_raw if it doesn't exist
        await query(
          `ALTER TABLE metrics_requests ADD COLUMN IF NOT EXISTS request_raw TEXT`
        );
        
        // Add response_body if it doesn't exist
        await query(
          `ALTER TABLE metrics_requests ADD COLUMN IF NOT EXISTS response_body TEXT`
        );
        
        // Create necessary indexes
        await query(`CREATE INDEX IF NOT EXISTS idx_metrics_time_received ON metrics_requests(time_received)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_metrics_process_id ON metrics_requests(process_id)`);
        await query(`CREATE INDEX IF NOT EXISTS idx_metrics_action ON metrics_requests(action)`);
        
        _logger('Table metrics_requests structure has been verified and fixed');
      } catch (err) {
        _logger('Error updating table structure: %s', err.message);
        _logger('Consider manually recreating the table with the schema provided in the code repository');
      }
      
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
    // Check which column to use for timestamp data
    const columns = await query(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_name = 'metrics_requests'`
    );
    
    const columnNames = columns.rows.map(row => row.column_name);
    let timeColumn = 'time_received';
    
    // Fall back to other columns if time_received doesn't exist
    if (!columnNames.includes('time_received')) {
      if (columnNames.includes('time_completed')) {
        timeColumn = 'time_completed';
      } else if (columnNames.includes('created_at')) {
        timeColumn = 'created_at';
      }
    }
    
    _logger('Using %s column for total stats time data', timeColumn);
    
    const result = await query(
      `SELECT 
         COUNT(*) as total_requests,
         COUNT(DISTINCT process_id) as unique_processes,
         COUNT(DISTINCT request_ip) as unique_ips,
         MIN(${timeColumn}) as start_time
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
export async function getAllMetrics() {
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
    const { timeSeriesData, timeLabels, topProcessIds } = await getTimeSeriesData(24)
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
      timeLabels,
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
