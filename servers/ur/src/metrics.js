/**
 * Metrics collection for the UR server
 * Tracks request information and performance metrics
 */

// Store process metrics
const metrics = {
  // Track total requests by process ID
  requestsByProcessId: new Map(),
  // Track requests by action type
  requestsByAction: new Map(),
  // Store recent requests with details
  recentRequests: [],
  // Maximum number of recent requests to store
  maxRecentRequests: 100,
  // Track timing information by process ID and action
  timingByProcessIdAndAction: new Map()
}

/**
 * Record the start of a request
 * @param {string} processId - The process ID
 * @param {string} clientIp - The client IP address
 * @param {string} path - The request path
 * @param {object} requestBody - The request body
 * @returns {object} The request context with start time
 */
export function recordRequestStart(processId, clientIp, path, requestBody) {
  const startTime = Date.now()
  
  // Extract action from Tags if available
  let action = 'unknown'
  let tags = {}
  
  try {
    if (requestBody && requestBody.Tags) {
      const actionTag = requestBody.Tags.find(tag => tag.name === 'Action')
      if (actionTag) {
        action = actionTag.value
      }
      
      // Convert tags to a more usable object
      requestBody.Tags.forEach(tag => {
        tags[tag.name] = tag.value
      })
    }
  } catch (err) {
    // Silently fail to avoid breaking the main functionality
    console.error('Error parsing tags from request body:', err)
  }
  
  // Create request context
  const requestContext = {
    processId,
    clientIp,
    path,
    action,
    tags,
    startTime,
    requestBody: JSON.stringify(requestBody).substring(0, 500) // Limit size
  }
  
  return requestContext
}

/**
 * Record the completion of a request
 * @param {object} requestContext - The request context from recordRequestStart
 */
export function recordRequestComplete(requestContext) {
  if (!requestContext) return
  
  const endTime = Date.now()
  const duration = endTime - requestContext.startTime
  
  // Update request with completion time
  requestContext.endTime = endTime
  requestContext.duration = duration
  requestContext.timestamp = new Date().toISOString()
  
  // Store in recent requests, maintaining max size
  metrics.recentRequests.unshift(requestContext)
  if (metrics.recentRequests.length > metrics.maxRecentRequests) {
    metrics.recentRequests.pop()
  }
  
  // Update process ID metrics
  if (!metrics.requestsByProcessId.has(requestContext.processId)) {
    metrics.requestsByProcessId.set(requestContext.processId, {
      count: 0,
      totalDuration: 0,
      actions: new Map()
    })
  }
  
  const processMetrics = metrics.requestsByProcessId.get(requestContext.processId)
  processMetrics.count++
  processMetrics.totalDuration += duration
  
  // Update action metrics for this process
  if (!processMetrics.actions.has(requestContext.action)) {
    processMetrics.actions.set(requestContext.action, {
      count: 0,
      totalDuration: 0
    })
  }
  const actionMetrics = processMetrics.actions.get(requestContext.action)
  actionMetrics.count++
  actionMetrics.totalDuration += duration
  
  // Update global action metrics
  if (!metrics.requestsByAction.has(requestContext.action)) {
    metrics.requestsByAction.set(requestContext.action, {
      count: 0,
      totalDuration: 0,
      processCounts: new Map()
    })
  }
  
  const globalActionMetrics = metrics.requestsByAction.get(requestContext.action)
  globalActionMetrics.count++
  globalActionMetrics.totalDuration += duration
  
  // Update process counts for this action
  if (!globalActionMetrics.processCounts.has(requestContext.processId)) {
    globalActionMetrics.processCounts.set(requestContext.processId, 0)
  }
  globalActionMetrics.processCounts.set(
    requestContext.processId,
    globalActionMetrics.processCounts.get(requestContext.processId) + 1
  )
  
  // Track timing by process ID and action combined
  const timingKey = `${requestContext.processId}:${requestContext.action}`
  if (!metrics.timingByProcessIdAndAction.has(timingKey)) {
    metrics.timingByProcessIdAndAction.set(timingKey, {
      count: 0,
      totalDuration: 0,
      minDuration: Number.MAX_SAFE_INTEGER,
      maxDuration: 0
    })
  }
  
  const timingMetrics = metrics.timingByProcessIdAndAction.get(timingKey)
  timingMetrics.count++
  timingMetrics.totalDuration += duration
  timingMetrics.minDuration = Math.min(timingMetrics.minDuration, duration)
  timingMetrics.maxDuration = Math.max(timingMetrics.maxDuration, duration)
}

/**
 * Get a snapshot of all metrics
 * @returns {object} The current metrics
 */
export function getMetrics() {
  // Convert Maps to serializable objects
  const serialized = {
    recentRequests: metrics.recentRequests,
    
    requestsByProcessId: Array.from(metrics.requestsByProcessId.entries()).map(([processId, data]) => ({
      processId,
      count: data.count,
      avgDuration: data.count > 0 ? data.totalDuration / data.count : 0,
      actions: Array.from(data.actions.entries()).map(([action, actionData]) => ({
        action,
        count: actionData.count,
        avgDuration: actionData.count > 0 ? actionData.totalDuration / actionData.count : 0
      }))
    })),
    
    requestsByAction: Array.from(metrics.requestsByAction.entries()).map(([action, data]) => ({
      action,
      count: data.count,
      avgDuration: data.count > 0 ? data.totalDuration / data.count : 0,
      topProcesses: Array.from(data.processCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([processId, count]) => ({ processId, count }))
    })),
    
    timingByProcessIdAndAction: Array.from(metrics.timingByProcessIdAndAction.entries()).map(([key, data]) => {
      const [processId, action] = key.split(':')
      return {
        processId,
        action,
        count: data.count,
        avgDuration: data.count > 0 ? data.totalDuration / data.count : 0,
        minDuration: data.minDuration === Number.MAX_SAFE_INTEGER ? 0 : data.minDuration,
        maxDuration: data.maxDuration
      }
    }).sort((a, b) => b.avgDuration - a.avgDuration) // Sort by slowest first
  }
  
  return serialized
}

// Export the metrics module
export default {
  recordRequestStart,
  recordRequestComplete,
  getMetrics
}
