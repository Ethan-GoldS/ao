/**
 * Metrics collection and tracking for the UR server
 */
import { logger } from './logger.js'

// Store metrics in memory
const metrics = {
  // Track requests by process ID
  processCounts: new Map(),
  // Track requests by action
  actionCounts: new Map(),
  // Track timing by process ID
  processTimings: new Map(),
  // Track timing by action
  actionTimings: new Map(),
  // Recent requests with details
  recentRequests: [],
  // Maximum number of recent requests to store
  maxRecentRequests: 100
}

/**
 * Record metrics for a request
 */
export function recordMetrics({ 
  processId, 
  action, 
  tags, 
  ip, 
  duration, 
  url, 
  method, 
  body,
  timestamp = Date.now() 
}) {
  const _logger = logger.child('metrics')
  
  try {
    // Track process IDs
    const processCount = metrics.processCounts.get(processId) || 0
    metrics.processCounts.set(processId, processCount + 1)
    
    // Track actions
    if (action) {
      const actionCount = metrics.actionCounts.get(action) || 0
      metrics.actionCounts.set(action, actionCount + 1)
    }
    
    // Track timings by process ID
    const processTimings = metrics.processTimings.get(processId) || {
      count: 0,
      totalDuration: 0,
      avgDuration: 0
    }
    processTimings.count += 1
    processTimings.totalDuration += duration
    processTimings.avgDuration = processTimings.totalDuration / processTimings.count
    metrics.processTimings.set(processId, processTimings)
    
    // Track timings by action
    if (action) {
      const actionTimings = metrics.actionTimings.get(action) || {
        count: 0,
        totalDuration: 0,
        avgDuration: 0
      }
      actionTimings.count += 1
      actionTimings.totalDuration += duration
      actionTimings.avgDuration = actionTimings.totalDuration / actionTimings.count
      metrics.actionTimings.set(action, actionTimings)
    }
    
    // Store recent request details
    const request = {
      timestamp,
      processId,
      action,
      tags,
      ip,
      duration,
      url,
      method,
      body: typeof body === 'object' ? JSON.stringify(body).substring(0, 200) : String(body || '').substring(0, 200)
    }
    
    metrics.recentRequests.unshift(request)
    
    // Limit the number of recent requests stored
    if (metrics.recentRequests.length > metrics.maxRecentRequests) {
      metrics.recentRequests.pop()
    }
  } catch (err) {
    _logger('Error recording metrics:', err)
  }
}

/**
 * Get all metrics
 */
export function getMetrics() {
  return {
    processCounts: Object.fromEntries(metrics.processCounts),
    actionCounts: Object.fromEntries(metrics.actionCounts),
    processTimings: Object.fromEntries(metrics.processTimings),
    actionTimings: Object.fromEntries(metrics.actionTimings),
    recentRequests: metrics.recentRequests
  }
}

/**
 * Reset metrics
 */
export function resetMetrics() {
  metrics.processCounts.clear()
  metrics.actionCounts.clear()
  metrics.processTimings.clear()
  metrics.actionTimings.clear()
  metrics.recentRequests = []
}

/**
 * Extract action and other metadata from request body
 */
export function extractMetadataFromRequest(req) {
  try {
    let processId = null
    let action = null
    let tags = []
    let body = null
    
    // Get process ID from query params or URL
    if (req.query && req.query['process-id']) {
      processId = req.query['process-id']
    } else if (req.params && req.params.processId) {
      processId = req.params.processId
    }
    
    // Extract data from body if it's JSON
    if (req.body) {
      body = req.body
      
      // Try to extract tags from the body
      if (body.Tags && Array.isArray(body.Tags)) {
        tags = body.Tags
        
        // Look for Action tag
        const actionTag = body.Tags.find(tag => 
          tag.name === 'Action' || tag.Name === 'Action'
        )
        
        if (actionTag) {
          action = actionTag.value || actionTag.Value
        }
      }
      
      // If no process ID yet, try to get it from Target in body
      if (!processId && body.Target) {
        processId = body.Target
      }
    }
    
    return {
      processId,
      action,
      tags,
      body
    }
  } catch (err) {
    logger.child('metrics')('Error extracting metadata:', err)
    return {
      processId: null,
      action: null,
      tags: [],
      body: null
    }
  }
}

/**
 * Create middleware to track request metrics
 */
export function createMetricsMiddleware() {
  const _logger = logger.child('metrics-middleware')
  
  return (req, res, next) => {
    // Record start time
    const startTime = Date.now()
    
    // Store original end function
    const originalEnd = res.end
    
    // Override end function to capture metrics
    res.end = function(...args) {
      // Calculate request duration
      const duration = Date.now() - startTime
      
      try {
        // Get client IP
        const ip = req.headers['x-forwarded-for'] || 
                  req.socket.remoteAddress || 
                  'unknown'
        
        // Extract metadata from request
        const { processId, action, tags, body } = extractMetadataFromRequest(req)
        
        // Record metrics
        if (processId) {
          recordMetrics({
            processId,
            action,
            tags,
            ip,
            duration,
            url: req.originalUrl || req.url,
            method: req.method,
            body
          })
        }
      } catch (err) {
        _logger('Error in metrics middleware:', err)
      }
      
      // Call original end
      return originalEnd.apply(this, args)
    }
    
    next()
  }
}
