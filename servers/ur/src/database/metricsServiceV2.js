/**
 * PostgreSQL-based metrics service (V2)
 * Enhanced version that stores dry runs and results in separate tables
 * with proper messageID tracking for result queries
 */
import { query } from './db.js'
import { logger } from '../logger.js'

const _logger = logger.child('metricsServiceV2')

/**
 * Store request metrics in the new database structure
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
      duration,
      timeReceived,
      timeCompleted
    } = details

    // Determine request type and extract messageId if it's a result request
    let requestType = 'unknown'
    let messageId = null
    
    if (path && path.includes('/dry-run')) {
      requestType = 'dry-run'
    } else if (path && path.includes('/result/')) {
      requestType = 'result'
      // Extract message ID from path - it's the part after /result/
      const parts = path.split('/result/')
      if (parts.length > 1) {
        messageId = parts[1].split('?')[0] // Remove query params if any
      }
    }
    
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

    // Prepare raw body for storage
    let rawBodyForStorage = null
    if (rawBody) {
      if (typeof rawBody === 'string') {
        rawBodyForStorage = rawBody
      } else {
        try {
          rawBodyForStorage = JSON.stringify(rawBody)
        } catch (e) {
          _logger('Failed to stringify raw body: %s', e.message)
          rawBodyForStorage = String(rawBody)
        }
      }
    }

    // Prepare response body for storage
    let responseBodyForStorage = null
    if (responseBody) {
      if (typeof responseBody === 'string') {
        responseBodyForStorage = responseBody
      } else {
        try {
          responseBodyForStorage = JSON.stringify(responseBody)
        } catch (e) {
          _logger('Failed to stringify response body: %s', e.message)
          responseBodyForStorage = String(responseBody)
        }
      }
    }

    // First, insert into metrics_base table
    const baseResult = await query(
      `INSERT INTO metrics_base (
        process_id, request_ip, request_referrer, request_method, 
        request_path, request_user_agent, request_origin, request_content_type,
        request_raw, duration, time_received, time_completed, request_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
        rawBodyForStorage,
        duration || 0,
        timeReceived ? new Date(timeReceived) : new Date(),
        timeCompleted ? new Date(timeCompleted) : new Date(),
        requestType
      ]
    )

    const baseId = baseResult.rows[0].id
    
    // Now insert into the appropriate specialized table
    if (requestType === 'dry-run') {
      // Insert into dry runs table
      await query(
        `INSERT INTO metrics_dry_runs (
          base_id, process_id, action, request_body, response_body, time_received
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id`,
        [
          baseId,
          processId,
          action || 'unknown',
          parsedBody ? JSON.stringify(parsedBody) : null,
          responseBodyForStorage,
          timeReceived ? new Date(timeReceived) : new Date()
        ]
      )
    } else if (requestType === 'result') {
      // Insert into results table
      await query(
        `INSERT INTO metrics_results (
          base_id, process_id, message_id, action, request_body, response_body, time_received
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [
          baseId,
          processId,
          messageId || 'unknown',
          action || 'unknown',
          parsedBody ? JSON.stringify(parsedBody) : null,
          responseBodyForStorage,
          timeReceived ? new Date(timeReceived) : new Date()
        ]
      )
    }

    _logger('Successfully stored metrics for %s request (process: %s)', requestType, processId)
    return true
  } catch (error) {
    _logger('ERROR: Failed to store metrics: %O', error)
    return false
  }
}

/**
 * Get recent request metrics from the new database structure
 * @param {Number} limit Maximum number of requests to return
 * @param {String} requestType Optional filter for request type ('dry-run', 'result', or null for all)
 * @returns {Promise<Array>} Recent requests
 */
export async function getRecentRequests(limit = 100, requestType = null) {
  try {
    let whereClause = ''
    const params = [limit]
    
    if (requestType) {
      whereClause = 'WHERE b.request_type = $2'
      params.push(requestType)
    }
    
    // Query that joins the base table with both specialized tables
    const query_sql = `
      SELECT 
        b.id, 
        b.process_id, 
        b.request_ip, 
        b.request_referrer, 
        b.request_method, 
        b.request_path, 
        b.request_user_agent, 
        b.request_origin, 
        b.request_content_type,
        b.request_raw,
        b.duration,
        b.time_received,
        b.time_completed,
        b.request_type,
        dr.action as dry_run_action,
        dr.request_body as dry_run_body,
        dr.response_body as dry_run_response,
        r.action as result_action,
        r.message_id,
        r.request_body as result_body,
        r.response_body as result_response
      FROM metrics_base b
      LEFT JOIN metrics_dry_runs dr ON b.id = dr.base_id AND b.request_type = 'dry-run'
      LEFT JOIN metrics_results r ON b.id = r.base_id AND b.request_type = 'result'
      ${whereClause}
      ORDER BY b.time_received DESC
      LIMIT $1
    `
    
    const result = await query(query_sql, params)
    
    // Format the results for consistent structure
    return result.rows.map(row => {
      const action = row.request_type === 'dry-run' ? row.dry_run_action : 
                    row.request_type === 'result' ? row.result_action : 
                    'unknown'
      
      const requestBody = row.request_type === 'dry-run' ? row.dry_run_body :
                         row.request_type === 'result' ? row.result_body :
                         null
                         
      const responseBody = row.request_type === 'dry-run' ? row.dry_run_response :
                          row.request_type === 'result' ? row.result_response :
                          null
      
      return {
        id: row.id,
        process_id: row.process_id,
        processId: row.process_id,
        request_ip: row.request_ip,
        ip: row.request_ip,
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
        request_raw: row.request_raw,
        rawBody: row.request_raw,
        action: action,
        message_id: row.message_id || null,
        messageId: row.message_id || null,
        request_type: row.request_type,
        requestType: row.request_type,
        request_body: requestBody,
        requestBody: requestBody,
        response_body: responseBody,
        responseBody: responseBody,
        duration: row.duration,
        time_received: row.time_received,
        timeReceived: row.time_received,
        time_completed: row.time_completed,
        timeCompleted: row.time_completed,
        timestamp: row.time_received
      }
    })
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
    const countResult = await query(`
      SELECT 
        process_id,
        COUNT(*) as request_count,
        AVG(duration) as avg_duration,
        MAX(time_received) as last_request
      FROM metrics_base
      GROUP BY process_id
      ORDER BY request_count DESC
    `)

    return countResult.rows.map(row => ({
      process_id: row.process_id,
      request_count: parseInt(row.request_count),
      avg_duration: Math.round(parseFloat(row.avg_duration) || 0),
      last_request: row.last_request
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
    // Get counts from dry runs
    const dryRunsQuery = await query(`
      SELECT 
        action,
        COUNT(*) as request_count
      FROM metrics_dry_runs
      WHERE action IS NOT NULL AND action != 'unknown'
      GROUP BY action
      ORDER BY request_count DESC
    `)
    
    // Get counts from results
    const resultsQuery = await query(`
      SELECT 
        action,
        COUNT(*) as request_count
      FROM metrics_results
      WHERE action IS NOT NULL AND action != 'unknown'
      GROUP BY action
      ORDER BY request_count DESC
    `)
    
    // Get message IDs (this is a separate metric since you requested)
    const messageIdsQuery = await query(`
      SELECT 
        message_id,
        COUNT(*) as request_count
      FROM metrics_results
      WHERE message_id IS NOT NULL AND message_id != 'unknown'
      GROUP BY message_id
      ORDER BY request_count DESC
    `)

    // Combine all actions into one map
    const actionCounts = {}
    
    // Add dry run actions
    dryRunsQuery.rows.forEach(row => {
      actionCounts[row.action] = parseInt(row.request_count)
    })
    
    // Add result actions (prefixed to distinguish them)
    resultsQuery.rows.forEach(row => {
      actionCounts[row.action] = (actionCounts[row.action] || 0) + parseInt(row.request_count)
    })
    
    // Create a separate map for message IDs
    const messageIdCounts = {}
    messageIdsQuery.rows.forEach(row => {
      messageIdCounts[row.message_id] = parseInt(row.request_count)
    })

    return {
      actionCounts,
      messageIdCounts
    }
  } catch (error) {
    _logger('Error getting action metrics: %O', error)
    return { actionCounts: {}, messageIdCounts: {} }
  }
}

/**
 * Get the total number of unique dry runs, results and unique message IDs
 * @returns {Promise<Object>} Totals of uniqueness metrics
 */
export async function getUniqueCounts() {
  try {
    // Get count of unique dry runs (by action)
    const uniqueDryRunsResult = await query(`
      SELECT COUNT(DISTINCT action) as count
      FROM metrics_dry_runs
      WHERE action IS NOT NULL AND action != 'unknown'
    `)
    
    // Get count of unique results (by action)
    const uniqueResultsResult = await query(`
      SELECT COUNT(DISTINCT action) as count
      FROM metrics_results
      WHERE action IS NOT NULL AND action != 'unknown'
    `)
    
    // Get count of unique message IDs
    const uniqueMessageIdsResult = await query(`
      SELECT COUNT(DISTINCT message_id) as count
      FROM metrics_results
      WHERE message_id IS NOT NULL AND message_id != 'unknown'
    `)
    
    return {
      uniqueDryRuns: parseInt(uniqueDryRunsResult.rows[0].count || '0'),
      uniqueResults: parseInt(uniqueResultsResult.rows[0].count || '0'),
      uniqueMessageIds: parseInt(uniqueMessageIdsResult.rows[0].count || '0')
    }
  } catch (error) {
    _logger('Error getting unique counts: %O', error)
    return { uniqueDryRuns: 0, uniqueResults: 0, uniqueMessageIds: 0 }
  }
}

/**
 * Get client metrics (IP and referrer counts)
 * @returns {Promise<Object>} Client metrics
 */
export async function getClientMetrics() {
  try {
    // Get IP counts
    const ipResult = await query(`
      SELECT 
        request_ip as ip, 
        COUNT(*) as count
      FROM metrics_base
      GROUP BY request_ip
      ORDER BY count DESC
      LIMIT 100
    `)
    
    // Get referrer counts
    const referrerResult = await query(`
      SELECT 
        request_referrer as referrer, 
        COUNT(*) as count
      FROM metrics_base
      GROUP BY request_referrer
      ORDER BY count DESC
      LIMIT 100
    `)
    
    // Get user agent counts
    const userAgentResult = await query(`
      SELECT 
        request_user_agent as user_agent, 
        COUNT(*) as count
      FROM metrics_base
      GROUP BY request_user_agent
      ORDER BY count DESC
      LIMIT 100
    `)
    
    return {
      ipCounts: ipResult.rows.map(row => ({
        ip: row.ip,
        count: parseInt(row.count)
      })),
      referrerCounts: referrerResult.rows.map(row => ({
        referrer: row.referrer,
        count: parseInt(row.count)
      })),
      userAgentCounts: userAgentResult.rows.map(row => ({
        userAgent: row.user_agent,
        count: parseInt(row.count)
      }))
    }
  } catch (error) {
    _logger('Error getting client metrics: %O', error)
    return { ipCounts: [], referrerCounts: [], userAgentCounts: [] }
  }
}

/**
 * Get time series data for requests over time
 * @param {Number} hours Number of hours to include in time series
 * @returns {Promise<Object>} Time series data
 */
export async function getTimeSeriesData(hours = 24) {
  try {
    // Create time buckets for the given number of hours
    const endDate = new Date()
    const startDate = new Date(endDate.getTime() - (hours * 60 * 60 * 1000))
    
    _logger('Generating time series data from %s to %s', startDate.toISOString(), endDate.toISOString())
    
    // Get time series data from base table
    const result = await query(`
      SELECT 
        date_trunc('hour', time_received) + 
        (EXTRACT(MINUTE FROM time_received)::INTEGER / 5) * 
        INTERVAL '5 minute' AS time_bucket,
        COUNT(*) as request_count,
        COUNT(CASE WHEN request_type = 'dry-run' THEN 1 END) as dry_run_count,
        COUNT(CASE WHEN request_type = 'result' THEN 1 END) as result_count,
        COUNT(CASE WHEN request_type = 'unknown' THEN 1 END) as unknown_count
      FROM metrics_base
      WHERE time_received >= $1 AND time_received <= $2
      GROUP BY time_bucket
      ORDER BY time_bucket
    `, [startDate, endDate])
    
    // Process into the expected format
    return processTimeSeriesResults(result, hours)
  } catch (error) {
    _logger('Error getting time series data: %O', error)
    return { timeLabels: [], requestCounts: [], dryRunCounts: [], resultCounts: [] }
  }
}

/**
 * Process time series results into expected format
 * @param {Object} result Query result
 * @param {Number} hours Number of hours
 * @returns {Promise<Object>} Processed time series data
 */
function processTimeSeriesResults(result, hours) {
  const intervals = Math.min(24, Math.ceil(hours * 12)) // 5-minute intervals for the time period
  
  // Create an array of evenly-spaced time intervals
  const now = new Date()
  const timeLabels = []
  const requestCountMap = {}
  const dryRunCountMap = {}
  const resultCountMap = {}
  
  // Initialize with empty data
  for (let i = 0; i < intervals; i++) {
    const timeOffset = i * 5 * 60 * 1000 // 5 minutes in milliseconds
    const intervalTime = new Date(now.getTime() - (intervals - i - 1) * timeOffset)
    const formattedTime = formatTimeBucket(intervalTime)
    
    timeLabels.push(formattedTime)
    requestCountMap[formattedTime] = 0
    dryRunCountMap[formattedTime] = 0
    resultCountMap[formattedTime] = 0
  }
  
  // Fill in actual data points
  result.rows.forEach(row => {
    const timeBucket = formatTimeBucket(new Date(row.time_bucket))
    if (requestCountMap[timeBucket] !== undefined) {
      requestCountMap[timeBucket] = parseInt(row.request_count)
      dryRunCountMap[timeBucket] = parseInt(row.dry_run_count)
      resultCountMap[timeBucket] = parseInt(row.result_count)
    }
  })
  
  // Convert maps to arrays in the correct order
  const requestCounts = timeLabels.map(label => requestCountMap[label])
  const dryRunCounts = timeLabels.map(label => dryRunCountMap[label])
  const resultCounts = timeLabels.map(label => resultCountMap[label])
  
  return {
    timeLabels,
    requestCounts,
    dryRunCounts,
    resultCounts
  }
}

/**
 * Format a time bucket for display
 * @param {Date} date Date to format
 * @returns {String} Formatted time string
 */
function formatTimeBucket(date) {
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

/**
 * Get total statistics
 * @returns {Promise<Object>} Total statistics
 */
export async function getTotalStats() {
  try {
    // Get total requests
    const totalResult = await query('SELECT COUNT(*) FROM metrics_base')
    const totalRequests = parseInt(totalResult.rows[0].count || '0')
    
    // Get process count
    const processResult = await query('SELECT COUNT(DISTINCT process_id) FROM metrics_base')
    const processCount = parseInt(processResult.rows[0].count || '0')
    
    // Get counts by request type
    const typeResult = await query(`
      SELECT 
        request_type, 
        COUNT(*) as count
      FROM metrics_base
      GROUP BY request_type
    `)
    
    const typeCounts = { 'dry-run': 0, 'result': 0, 'unknown': 0 }
    typeResult.rows.forEach(row => {
      typeCounts[row.request_type] = parseInt(row.count || '0')
    })
    
    // Get counts from the unique metrics function
    const uniqueCounts = await getUniqueCounts()
    
    return {
      totalRequests,
      processCount,
      dryRunCount: typeCounts['dry-run'],
      resultCount: typeCounts['result'],
      unknownCount: typeCounts['unknown'],
      uniqueDryRuns: uniqueCounts.uniqueDryRuns,
      uniqueResults: uniqueCounts.uniqueResults,
      uniqueMessageIds: uniqueCounts.uniqueMessageIds
    }
  } catch (error) {
    _logger('Error getting total stats: %O', error)
    return { 
      totalRequests: 0, 
      processCount: 0,
      dryRunCount: 0,
      resultCount: 0,
      unknownCount: 0,
      uniqueDryRuns: 0,
      uniqueResults: 0,
      uniqueMessageIds: 0
    }
  }
}

/**
 * Get all metrics for dashboard display
 * @returns {Promise<Object>} All metrics
 */
export async function getAllMetrics() {
  try {
    // Get total stats first
    const totalStats = await getTotalStats()
    
    // Get process metrics
    const processCounts = {}
    const processMetrics = await getProcessMetrics()
    processMetrics.forEach(metric => {
      processCounts[metric.process_id] = metric.request_count
    })
    
    // Get action and message ID metrics
    const { actionCounts, messageIdCounts } = await getActionMetrics()
    
    // Get client metrics
    const clientMetrics = await getClientMetrics()
    
    // Get time series data (last 24 hours)
    const timeSeriesData = await getTimeSeriesData(24)
    
    // Get recent requests
    const recentRequests = await getRecentRequests(100)
    
    // Combine all metrics into one object
    return {
      totalRequests: totalStats.totalRequests,
      dryRunCount: totalStats.dryRunCount,
      resultCount: totalStats.resultCount,
      processCount: totalStats.processCount,
      uniqueDryRuns: totalStats.uniqueDryRuns,
      uniqueResults: totalStats.uniqueResults,
      uniqueMessageIds: totalStats.uniqueMessageIds,
      processCounts,
      actionCounts,
      messageIdCounts,
      ipCounts: clientMetrics.ipCounts,
      referrerCounts: clientMetrics.referrerCounts,
      userAgentCounts: clientMetrics.userAgentCounts,
      timeSeriesData: timeSeriesData,
      timeLabels: timeSeriesData.timeLabels,
      requestCounts: timeSeriesData.requestCounts,
      dryRunCounts: timeSeriesData.dryRunCounts,
      resultCounts: timeSeriesData.resultCounts,
      recentRequests
    }
  } catch (error) {
    _logger('Error getting all metrics: %O', error)
    return {
      totalRequests: 0,
      dryRunCount: 0,
      resultCount: 0,
      processCount: 0,
      uniqueDryRuns: 0,
      uniqueResults: 0,
      uniqueMessageIds: 0,
      processCounts: {},
      actionCounts: {},
      messageIdCounts: {},
      ipCounts: [],
      referrerCounts: [],
      userAgentCounts: [],
      timeSeriesData: {
        timeLabels: [],
        requestCounts: []
      },
      timeLabels: [],
      requestCounts: [],
      dryRunCounts: [],
      resultCounts: [],
      recentRequests: []
    }
  }
}
