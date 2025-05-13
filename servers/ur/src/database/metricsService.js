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
      responseBody,
      action,
      messageId,
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

    // Get all available columns for dynamic query building
    const columnsResult = await query(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_name = 'metrics_requests'`
    )
    
    const availableColumns = columnsResult.rows.map(row => row.column_name)
    _logger('Available metrics_requests columns: %s', availableColumns.join(', '))

    // Process raw body for storage
    const maxStorageSize = 100000 // 100 KB max storage
    let rawBodyForStorage = null
    if (rawBody) {
      if (typeof rawBody === 'string') {
        rawBodyForStorage = rawBody.length > maxStorageSize ? 
          rawBody.substring(0, maxStorageSize) + '...[truncated]' : rawBody
      } else {
        try {
          const stringified = JSON.stringify(rawBody)
          rawBodyForStorage = stringified.length > maxStorageSize ? 
            stringified.substring(0, maxStorageSize) + '...[truncated]' : stringified
        } catch (e) {
          _logger('Failed to stringify raw body: %s', e.message)
          rawBodyForStorage = String(rawBody).substring(0, maxStorageSize) + '...[truncated]'
        }
      }
    }

    // Process response body for storage
    let responseBodyForStorage = null
    if (responseBody) {
      if (typeof responseBody === 'string') {
        responseBodyForStorage = responseBody.length > maxStorageSize ? 
          responseBody.substring(0, maxStorageSize) + '...[truncated]' : responseBody
      } else {
        try {
          const stringified = JSON.stringify(responseBody)
          responseBodyForStorage = stringified.length > maxStorageSize ? 
            stringified.substring(0, maxStorageSize) + '...[truncated]' : stringified
        } catch (e) {
          _logger('Failed to stringify response body: %s', e.message)
          responseBodyForStorage = String(responseBody).substring(0, maxStorageSize) + '...[truncated]'
        }
      }
    }

    // Build column and value arrays for dynamic query
    const columns = []
    const values = []
    const placeholders = []
    let paramIndex = 1

    // Define mappings of column names to values
    const columnMappings = [
      { name: 'process_id', value: processId },
      { name: 'request_ip', value: ip || 'unknown' },
      { name: 'request_referrer', value: referer || 'unknown' },
      { name: 'request_method', value: method || 'unknown' },
      { name: 'request_path', value: path || 'unknown' },
      { name: 'request_user_agent', value: userAgent || 'unknown' },
      { name: 'request_origin', value: origin || 'unknown' },
      { name: 'request_content_type', value: contentType || 'unknown' },
      { name: 'request_body', value: parsedBody ? JSON.stringify(parsedBody) : null },
      { name: 'request_raw', value: rawBodyForStorage },
      { name: 'response_body', value: responseBodyForStorage },
      { name: 'action', value: action || 'unknown' },
      { name: 'message_id', value: messageId || null },
      { name: 'duration', value: duration || 0 },
      { name: 'time_received', value: timeReceived ? new Date(timeReceived) : new Date() },
      { name: 'time_completed', value: timeCompleted ? new Date(timeCompleted) : new Date() }
    ]

    // Only include columns that exist in the database
    columnMappings.forEach(mapping => {
      if (availableColumns.includes(mapping.name)) {
        columns.push(`"${mapping.name}"`)
        values.push(mapping.value)
        placeholders.push(`$${paramIndex++}`)
      } else {
        _logger('Skipping column %s (not in schema)', mapping.name)
      }
    })

    // Build and execute the query
    const queryText = `
      INSERT INTO metrics_requests (
        ${columns.join(', ')}
      ) VALUES (
        ${placeholders.join(', ')}
      ) RETURNING id
    `

    const result = await query(queryText, values)
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
      message_id: row.message_id,
      messageId: row.message_id, // Include both formats for compatibility
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
 * Get message ID metrics aggregated by message ID
 * @returns {Promise<Object>} Message ID metrics
 */
export async function getMessageIdMetrics() {
  try {
    _logger('Getting message ID metrics...');
    
    // First check if the message_id column exists
    const columnCheck = await query(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_name = 'metrics_requests' 
       AND column_name = 'message_id'`
    );
    
    if (columnCheck.rows.length === 0) {
      _logger('Message ID column does not exist in metrics_requests table');
      return [];
    }
    
    // Check for time column to use in the query
    const timeColumnCheck = await query(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_name = 'metrics_requests' 
       AND column_name IN ('time_received', 'timestamp')`
    );
    
    const availableTimeColumns = timeColumnCheck.rows.map(row => row.column_name);
    let timeColumn = availableTimeColumns.includes('time_received') ? 'time_received' : 
                     availableTimeColumns.includes('timestamp') ? 'timestamp' : null;
    
    let queryText;
    if (timeColumn) {
      _logger('Using %s column for message ID metrics time data', timeColumn);
      queryText = `SELECT 
        "message_id", 
        COUNT(*) as request_count,
        MIN("${timeColumn}") as first_seen,
        MAX("${timeColumn}") as last_seen
      FROM metrics_requests
      WHERE "message_id" IS NOT NULL
      GROUP BY "message_id"
      ORDER BY request_count DESC, last_seen DESC
      LIMIT 500`;
    } else {
      _logger('No time column available, querying message ID metrics without time data');
      queryText = `SELECT 
        "message_id", 
        COUNT(*) as request_count
      FROM metrics_requests
      WHERE "message_id" IS NOT NULL
      GROUP BY "message_id"
      ORDER BY request_count DESC
      LIMIT 500`;
    }
    
    const result = await query(
      queryText,
      [],
      15000 // 15 second timeout
    );
    
    return result.rows.map(row => {
      // Ensure all expected properties exist even if time columns didn't exist
      if (!row.hasOwnProperty('first_seen')) {
        row.first_seen = null;
      }
      if (!row.hasOwnProperty('last_seen')) {
        row.last_seen = null;
      }
      return row;
    });
  } catch (error) {
    _logger('Error getting message ID metrics: %O', error);
    return [];
  }
}

/**
 * Get action metrics aggregated by action
 * @returns {Promise<Object>} Action metrics
 */
export async function getActionMetrics() {
  try {
    const actionResult = await query(
      `SELECT 
         action,
         COUNT(*) as request_count,
         AVG(duration) as avg_duration,
         MAX(time_received) as last_request
       FROM metrics_requests 
       GROUP BY action
       ORDER BY request_count DESC`
    )

    return actionResult.rows.map(row => ({
      action: row.action,
      requestCount: parseInt(row.request_count),
      avgDuration: parseFloat(row.avg_duration),
      lastRequest: row.last_request
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
    _logger('Getting time series data for last %d hours', hours);
    
    // Check which time column we can use (time_received or timestamp)
    const columnsResult = await query(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_name = 'metrics_requests' 
       AND column_name IN ('time_received', 'timestamp')`
    );
    
    const availableColumns = columnsResult.rows.map(row => row.column_name);
    _logger('Available time columns: %s', availableColumns.join(', ') || 'none');
    
    let timeColumn = null;
    
    // Prefer time_received if available
    if (availableColumns.includes('time_received')) {
      timeColumn = 'time_received';
      _logger('Using time_received column for time series data');
    } else if (availableColumns.includes('timestamp')) {
      timeColumn = 'timestamp';
      _logger('Using timestamp column for time series data');
    }
    
    // If we have a time column, try to use it
    if (timeColumn) {
      try {
        _logger('Querying time series data using %s column', timeColumn);
        
        // Try the main time-based query
        const result = await query(
          `SELECT 
             date_trunc('hour', "${timeColumn}") as hour,
             COUNT(*) as total_requests,
             jsonb_object_agg("process_id", process_count) as process_counts
           FROM (
             SELECT 
               date_trunc('hour', "${timeColumn}") as hour,
               "process_id",
               COUNT(*) as process_count
             FROM metrics_requests
             WHERE "${timeColumn}" > NOW() - interval '${hours} hours'
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
        _logger('Error using %s column: %s', timeColumn, err.message);
        // Fall through to the next approach
      }
    }
    
    // If time columns don't exist or query failed, fall back to ID-based query
    _logger('Falling back to simplified metrics query without time data');
    try {
      const result = await query(
        `SELECT 
           COUNT(*) as total_requests,
           jsonb_object_agg("process_id", process_count) as process_counts
         FROM (
           SELECT 
             "process_id",
             COUNT(*) as process_count
           FROM metrics_requests
           GROUP BY "process_id"
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
      
      const timeLabels = timeSeriesData.map(d => 
        new Date(d.timestamp).getUTCHours().toString().padStart(2, '0') + ':00'
      );
      
      return { timeSeriesData, timeLabels };
    } catch (innerErr) {
      _logger('Error with simplified query: %s', innerErr.message);
      // Fall through to the empty data generation
    }
  } catch (error) {
    _logger('Error getting time series data: %O', error);
    return createEmptyTimeSeriesData(hours);
  }
}

/**
 * Creates empty time series data for use as a fallback
 * @param {Number} hours Number of hours to include
 * @returns {Object} Empty time series data structure
 */
function createEmptyTimeSeriesData(hours = 24) {
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
 * Get all metrics for dashboard display
 * @returns {Promise<Object>} All metrics
 */
export async function getAllMetrics() {
  try {
    // Get the most recent requests
    const recentRequests = await getRecentRequests(100)
    
    // Get request details by process ID
    const requestDetailsByProcessId = {}
    recentRequests.forEach(request => {
      if (!requestDetailsByProcessId[request.processId]) {
        requestDetailsByProcessId[request.processId] = []
      }
      requestDetailsByProcessId[request.processId].push(request)
    })

    // Get process metrics
    const processMetrics = await getProcessMetrics()
    
    // Get action metrics
    const actionMetrics = await getActionMetrics()
    
    // Get message ID metrics
    const messageIdMetrics = await getMessageIdMetrics()
    
    // Get client metrics
    const clientMetrics = await getClientMetrics()
    
    // Get time series data for the last 24 hours
    const timeSeriesData = await getTimeSeriesData(24)
    
    // Get total stats
    const totalStats = await getTotalStats()
    
    // Prepare counts for dashboard
    const processCounts = {}
    processMetrics.forEach(process => {
      processCounts[process.processId] = process.requestCount
    })
    
    const actionCounts = {}
    actionMetrics.forEach(action => {
      actionCounts[action.action] = action.requestCount
    })
    
    const messageIdCounts = {}
    messageIdMetrics.forEach(msg => {
      messageIdCounts[msg.messageId] = msg.requestCount
    })
    
    return {
      recentRequests,
      requestDetails: requestDetailsByProcessId,
      processMetrics,
      actionMetrics,
      messageIdMetrics,
      clientMetrics,
      timeSeriesData,
      totalStats,
      processCounts,
      actionCounts,
      messageIdCounts,
      ipCounts: clientMetrics.ipMetrics || [],
      referrerCounts: clientMetrics.referrerMetrics || [],
      totalRequests: totalStats.totalRequests
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
