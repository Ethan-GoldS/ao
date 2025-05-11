/**
 * Metrics tracking module for UR server
 * Collects data about requests, process IDs, actions, and response times
 */

// Store metrics in memory
const metrics = {
  // Track requests by process ID
  processCounts: new Map(),
  // Track requests by action type
  actionCounts: new Map(),
  // Track timing information by process ID and action
  timings: new Map(),
  // Store recent requests for display
  recentRequests: [],
  maxRecentRequests: 50
}

/**
 * Extract process ID from request
 * @param {Object} req - Express request object
 * @returns {string|null} Process ID or null if not found
 */
export function extractProcessId(req) {
  // Check query parameter first
  if (req.query && req.query['process-id']) {
    return req.query['process-id']
  }
  
  // Check params (for routes like /state/:processId)
  if (req.params && req.params.processId) {
    return req.params.processId
  }
  
  // For POST requests with body, try to extract from body.Target
  if (req.body && req.body.Target) {
    return req.body.Target
  }
  
  return null
}

/**
 * Extract action from request body
 * @param {Object} req - Express request object
 * @returns {string|null} Action name or null if not found
 */
export function extractAction(req) {
  if (!req.body || !req.body.Tags || !Array.isArray(req.body.Tags)) {
    return null
  }
  
  const actionTag = req.body.Tags.find(tag => 
    tag && tag.name === 'Action' && tag.value
  )
  
  return actionTag ? actionTag.value : null
}

/**
 * Extract other tag values from request body
 * @param {Object} req - Express request object
 * @returns {Object} Object with tag names as keys and values as values
 */
export function extractTags(req) {
  const tags = {}
  
  if (!req.body || !req.body.Tags || !Array.isArray(req.body.Tags)) {
    return tags
  }
  
  req.body.Tags.forEach(tag => {
    if (tag && tag.name && tag.value) {
      tags[tag.name] = tag.value
    }
  })
  
  return tags
}

/**
 * Record request start time
 * @param {Object} req - Express request object
 */
export function startTimer(req) {
  req._requestStartTime = Date.now()
}

/**
 * Record metrics for a request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export function recordMetrics(req, res) {
  const processId = extractProcessId(req)
  const action = extractAction(req)
  const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown'
  const responseTime = req._requestStartTime ? Date.now() - req._requestStartTime : null
  const tags = extractTags(req)
  const method = req.method
  const url = req.originalUrl || req.url
  
  // Skip if no process ID (though this shouldn't happen for most requests)
  if (!processId) return
  
  // Update process counts
  metrics.processCounts.set(
    processId, 
    (metrics.processCounts.get(processId) || 0) + 1
  )
  
  // Update action counts if action exists
  if (action) {
    metrics.actionCounts.set(
      action,
      (metrics.actionCounts.get(action) || 0) + 1
    )
    
    // Track timings by process ID and action
    const key = `${processId}:${action}`
    if (responseTime) {
      const existing = metrics.timings.get(key) || { count: 0, total: 0, max: 0, min: Infinity }
      existing.count += 1
      existing.total += responseTime
      existing.max = Math.max(existing.max, responseTime)
      existing.min = Math.min(existing.min, responseTime)
      existing.avg = existing.total / existing.count
      metrics.timings.set(key, existing)
    }
  }
  
  // Add to recent requests
  const requestInfo = {
    timestamp: new Date().toISOString(),
    processId,
    action,
    clientIp,
    method,
    url,
    responseTime,
    tags
  }
  
  metrics.recentRequests.unshift(requestInfo)
  
  // Keep only the most recent requests
  if (metrics.recentRequests.length > metrics.maxRecentRequests) {
    metrics.recentRequests = metrics.recentRequests.slice(0, metrics.maxRecentRequests)
  }
}

/**
 * Get all collected metrics
 * @returns {Object} All metrics data
 */
export function getMetrics() {
  return {
    processCounts: Object.fromEntries(metrics.processCounts),
    actionCounts: Object.fromEntries(metrics.actionCounts),
    timings: Object.fromEntries(metrics.timings),
    recentRequests: metrics.recentRequests
  }
}

/**
 * Reset all metrics
 */
export function resetMetrics() {
  metrics.processCounts.clear()
  metrics.actionCounts.clear()
  metrics.timings.clear()
  metrics.recentRequests = []
}
