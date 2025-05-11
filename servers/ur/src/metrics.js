/**
 * Metrics collection for the UR server
 * Tracks process IDs, actions, response times, and other request data
 */
import { logger } from './logger.js'

const _logger = logger.child('metrics')

// In-memory storage for metrics
const metrics = {
  // Track requests by process ID
  requestsByProcessId: new Map(),
  // Track requests by action
  requestsByAction: new Map(),
  // Track the most recent requests for display
  recentRequests: [],
  // Maximum number of recent requests to keep
  maxRecentRequests: 100
}

/**
 * Parse the process ID from the request
 * @param {Object} req - Express request object
 * @returns {String|null} - Process ID or null if not found
 */
export function parseProcessId(req) {
  // From query parameter
  if (req.query && req.query['process-id']) {
    return req.query['process-id']
  }
  
  // From URL parameters
  if (req.params && req.params.processId) {
    return req.params.processId
  }
  
  // From body if it's a JSON POST with Target
  if (req.body && req.body.Target) {
    return req.body.Target
  }
  
  return null
}

/**
 * Parse the action from request body
 * @param {Object} req - Express request object
 * @returns {String|null} - Action or null if not found
 */
export function parseAction(req) {
  try {
    if (req.body && Array.isArray(req.body.Tags)) {
      const actionTag = req.body.Tags.find(tag => tag.name === 'Action')
      if (actionTag) {
        return actionTag.value
      }
    }
  } catch (err) {
    _logger('Error parsing action from request body', err)
  }
  return 'Unknown'
}

/**
 * Middleware to track request metrics
 * @returns {Function} Express middleware
 */
export function metricsMiddleware() {
  return (req, res, next) => {
    // Save original timestamp when request started
    const startTime = Date.now()
    
    // Add a unique request ID
    req.requestId = Date.now().toString(36) + Math.random().toString(36).substring(2)
    
    // Parse request body if it's JSON
    let originalBody = ''
    
    // Only for POST requests with content-type application/json
    if (req.method === 'POST' && req.headers['content-type']?.includes('application/json')) {
      const chunks = []
      
      req.on('data', chunk => {
        chunks.push(chunk)
      })
      
      req.on('end', () => {
        originalBody = Buffer.concat(chunks).toString()
        try {
          if (originalBody) {
            req.body = JSON.parse(originalBody)
          }
        } catch (err) {
          _logger('Error parsing request body', err)
        }
      })
    }
    
    // Capture the original end function
    const originalEnd = res.end
    
    // Override the end function to capture metrics before sending response
    res.end = function(chunk, encoding) {
      // Calculate response time
      const responseTime = Date.now() - startTime
      
      // Restore original end function and call it
      res.end = originalEnd
      res.end(chunk, encoding)
      
      // Process metrics after response is sent
      process.nextTick(() => {
        try {
          const processId = parseProcessId(req)
          const action = parseAction(req)
          const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress
          
          if (!processId) return
          
          // Track by process ID
          if (!metrics.requestsByProcessId.has(processId)) {
            metrics.requestsByProcessId.set(processId, {
              count: 0,
              totalTime: 0,
              byAction: new Map(),
              firstSeen: new Date(),
              lastSeen: new Date()
            })
          }
          
          const processMetrics = metrics.requestsByProcessId.get(processId)
          processMetrics.count++
          processMetrics.totalTime += responseTime
          processMetrics.lastSeen = new Date()
          
          // Track by action within process
          if (!processMetrics.byAction.has(action)) {
            processMetrics.byAction.set(action, {
              count: 0,
              totalTime: 0
            })
          }
          
          const actionMetrics = processMetrics.byAction.get(action)
          actionMetrics.count++
          actionMetrics.totalTime += responseTime
          
          // Track by action overall
          if (!metrics.requestsByAction.has(action)) {
            metrics.requestsByAction.set(action, {
              count: 0,
              totalTime: 0
            })
          }
          
          const globalActionMetrics = metrics.requestsByAction.get(action)
          globalActionMetrics.count++
          globalActionMetrics.totalTime += responseTime
          
          // Add to recent requests
          const requestInfo = {
            timestamp: new Date(),
            processId,
            action,
            ip,
            responseTime,
            method: req.method,
            path: req.originalUrl || req.url,
            requestId: req.requestId
          }
          
          metrics.recentRequests.unshift(requestInfo)
          
          // Trim recent requests list if needed
          if (metrics.recentRequests.length > metrics.maxRecentRequests) {
            metrics.recentRequests = metrics.recentRequests.slice(0, metrics.maxRecentRequests)
          }
          
          _logger('Recorded metrics for process %s, action %s, response time %dms', processId, action, responseTime)
        } catch (err) {
          _logger('Error recording metrics', err)
        }
      })
    }
    
    next()
  }
}

/**
 * Get metrics for dashboard
 * @returns {Object} Current metrics
 */
export function getMetrics() {
  const processMetrics = []
  const actionMetrics = []
  
  // Convert process metrics map to array
  for (const [processId, data] of metrics.requestsByProcessId.entries()) {
    const actions = []
    for (const [action, actionData] of data.byAction.entries()) {
      actions.push({
        action,
        count: actionData.count,
        avgResponseTime: actionData.count > 0 ? Math.round(actionData.totalTime / actionData.count) : 0
      })
    }
    
    processMetrics.push({
      processId,
      count: data.count,
      avgResponseTime: data.count > 0 ? Math.round(data.totalTime / data.count) : 0,
      firstSeen: data.firstSeen,
      lastSeen: data.lastSeen,
      actions
    })
  }
  
  // Convert action metrics map to array
  for (const [action, data] of metrics.requestsByAction.entries()) {
    actionMetrics.push({
      action,
      count: data.count,
      avgResponseTime: data.count > 0 ? Math.round(data.totalTime / data.count) : 0
    })
  }
  
  return {
    processMetrics: processMetrics.sort((a, b) => b.count - a.count),
    actionMetrics: actionMetrics.sort((a, b) => b.count - a.count),
    recentRequests: metrics.recentRequests
  }
}
