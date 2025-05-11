/**
 * Metrics service for tracking request and response metrics in the ao UR server
 */
import { logger } from './logger.js'

const _logger = logger.child('metrics')

// In-memory storage for metrics (could be replaced with a persistent store for production)
const metrics = {
  requests: [], // Recent requests (limited to 100 most recent)
  processCounts: {}, // Count of requests per process ID
  actionCounts: {}, // Count of requests per action
  processTimes: {}, // Average processing time per process ID
  actionTimes: {}, // Average processing time per action
  totalRequests: 0, // Total number of requests processed
}

// Maximum number of recent requests to keep
const MAX_RECENT_REQUESTS = 100

/**
 * Record metrics for an incoming request
 * @param {Object} data Request data to record
 */
export function recordRequestStart(req) {
  const timestamp = Date.now()
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress
  const processId = getProcessIdFromRequest(req)
  
  // Create a request record with initial data
  const requestRecord = {
    timestamp,
    processId,
    ip,
    method: req.method,
    path: req.path,
    startTime: timestamp,
    endTime: null,
    duration: null,
    action: null,
    tags: [],
    body: null
  }
  
  // Store the request record in the req object so we can update it later
  req._metrics = requestRecord
  
  _logger('Request tracking started for process ID %s from IP %s', processId, ip)
  
  return requestRecord
}

/**
 * Update metrics with data from the request body (for POST requests)
 */
export function updateRequestWithBody(req) {
  if (!req._metrics) return
  
  try {
    if (req.method === 'POST' && req.body) {
      const requestRecord = req._metrics
      
      // Store a sanitized version of the body (avoid storing large payloads)
      requestRecord.body = {
        id: req.body.Id || null,
        target: req.body.Target || null,
        owner: req.body.Owner || null,
        anchor: req.body.Anchor || null,
      }
      
      // Extract tags from the body
      if (req.body.Tags && Array.isArray(req.body.Tags)) {
        requestRecord.tags = req.body.Tags
        
        // Extract action from Tags if available
        const actionTag = req.body.Tags.find(tag => tag.name === 'Action')
        if (actionTag) {
          requestRecord.action = actionTag.value
        }
        
        // Store all tags for reference
        requestRecord.tags = req.body.Tags.map(tag => ({ 
          name: tag.name, 
          value: tag.value 
        }))
      }
      
      _logger('Updated request metrics with body data for process ID %s, action: %s', 
        requestRecord.processId, requestRecord.action)
    }
  } catch (err) {
    _logger('Error extracting data from request body: %s', err.message)
  }
}

/**
 * Record metrics for a completed request
 */
export function recordRequestEnd(req, res) {
  if (!req._metrics) return
  
  const requestRecord = req._metrics
  const endTime = Date.now()
  const duration = endTime - requestRecord.startTime
  
  // Update timing information
  requestRecord.endTime = endTime
  requestRecord.duration = duration
  requestRecord.status = res.statusCode
  
  // Update process count
  if (requestRecord.processId) {
    metrics.processCounts[requestRecord.processId] = 
      (metrics.processCounts[requestRecord.processId] || 0) + 1
    
    // Update process timing
    if (!metrics.processTimes[requestRecord.processId]) {
      metrics.processTimes[requestRecord.processId] = { 
        count: 0, 
        totalTime: 0, 
        avgTime: 0 
      }
    }
    
    const procTime = metrics.processTimes[requestRecord.processId]
    procTime.count++
    procTime.totalTime += duration
    procTime.avgTime = procTime.totalTime / procTime.count
  }
  
  // Update action count and timing
  if (requestRecord.action) {
    metrics.actionCounts[requestRecord.action] = 
      (metrics.actionCounts[requestRecord.action] || 0) + 1
    
    // Update action timing
    if (!metrics.actionTimes[requestRecord.action]) {
      metrics.actionTimes[requestRecord.action] = { 
        count: 0, 
        totalTime: 0, 
        avgTime: 0 
      }
    }
    
    const actionTime = metrics.actionTimes[requestRecord.action]
    actionTime.count++
    actionTime.totalTime += duration
    actionTime.avgTime = actionTime.totalTime / actionTime.count
  }
  
  // Add to recent requests, maintaining max size limit
  metrics.requests.unshift(requestRecord)
  if (metrics.requests.length > MAX_RECENT_REQUESTS) {
    metrics.requests.pop()
  }
  
  // Increment total requests counter
  metrics.totalRequests++
  
  _logger('Request tracking completed for process ID %s, duration: %dms', 
    requestRecord.processId, duration)
}

/**
 * Extract the process ID from the request
 */
function getProcessIdFromRequest(req) {
  // Check query parameters
  if (req.query && req.query['process-id']) {
    return req.query['process-id']
  }
  
  // Check URL parameters
  if (req.params && req.params.processId) {
    return req.params.processId
  }
  
  // Check the path for /dry-run?process-id=X
  if (req.path === '/dry-run' && req.query && req.query['process-id']) {
    return req.query['process-id']
  }
  
  // Check for process ID in body
  if (req.body && req.body.Target) {
    return req.body.Target
  }
  
  return 'unknown'
}

/**
 * Get all collected metrics
 */
export function getMetrics() {
  return {
    totalRequests: metrics.totalRequests,
    recentRequests: metrics.requests,
    processCounts: Object.entries(metrics.processCounts)
      .map(([id, count]) => ({ 
        processId: id, 
        count, 
        avgTime: metrics.processTimes[id]?.avgTime || 0 
      }))
      .sort((a, b) => b.count - a.count),
    actionCounts: Object.entries(metrics.actionCounts)
      .map(([action, count]) => ({ 
        action, 
        count, 
        avgTime: metrics.actionTimes[action]?.avgTime || 0 
      }))
      .sort((a, b) => b.count - a.count),
  }
}

/**
 * Create middleware to track metrics for all requests
 */
export function metricsMiddleware() {
  return (req, res, next) => {
    // Start tracking request metrics
    recordRequestStart(req)
    
    // Track response metrics
    const originalEnd = res.end
    res.end = function(...args) {
      recordRequestEnd(req, res)
      return originalEnd.apply(res, args)
    }
    
    // Continue with the request
    next()
  }
}

/**
 * Dashboard HTML template
 */
export function generateDashboardHtml() {
  const data = getMetrics()
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ao UR Server Metrics Dashboard</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; line-height: 1.6; }
    h1, h2, h3 { margin-top: 20px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    tr:nth-child(even) { background-color: #f9f9f9; }
    .dashboard { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .dashboard-full { grid-column: span 2; }
    .metrics-card { background: white; border-radius: 5px; padding: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
    .refresh-button { padding: 10px 15px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; }
    .refresh-button:hover { background: #3e8e41; }
    #last-updated { margin-top: 10px; font-style: italic; color: #666; }
  </style>
</head>
<body>
  <h1>ao UR Server Metrics Dashboard</h1>
  <button class="refresh-button" onclick="window.location.reload()">Refresh Data</button>
  <div id="last-updated">Last updated: ${new Date().toLocaleString()}</div>
  <p>Total Requests Processed: ${data.totalRequests}</p>
  
  <div class="dashboard">
    <div class="metrics-card">
      <h2>Process ID Usage</h2>
      <table>
        <thead>
          <tr>
            <th>Process ID</th>
            <th>Count</th>
            <th>Avg Time (ms)</th>
          </tr>
        </thead>
        <tbody>
          ${data.processCounts.map(p => `
            <tr>
              <td title="${p.processId}">${truncate(p.processId, 20)}</td>
              <td>${p.count}</td>
              <td>${p.avgTime.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    
    <div class="metrics-card">
      <h2>Action Usage</h2>
      <table>
        <thead>
          <tr>
            <th>Action</th>
            <th>Count</th>
            <th>Avg Time (ms)</th>
          </tr>
        </thead>
        <tbody>
          ${data.actionCounts.map(a => `
            <tr>
              <td>${a.action || 'unknown'}</td>
              <td>${a.count}</td>
              <td>${a.avgTime.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    
    <div class="metrics-card dashboard-full">
      <h2>Recent Requests</h2>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Process ID</th>
            <th>IP</th>
            <th>Method</th>
            <th>Path</th>
            <th>Action</th>
            <th>Duration (ms)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${data.recentRequests.map(r => `
            <tr>
              <td>${new Date(r.timestamp).toLocaleString()}</td>
              <td title="${r.processId}">${truncate(r.processId, 12)}</td>
              <td>${r.ip}</td>
              <td>${r.method}</td>
              <td>${r.path}</td>
              <td>${r.action || 'N/A'}</td>
              <td>${r.duration !== null ? r.duration : 'pending'}</td>
              <td>${r.status || 'pending'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>
  
  <script>
    function truncate(str, length) {
      if (!str) return 'unknown';
      return str.length > length ? str.substring(0, length) + '...' : str;
    }
  </script>
</body>
</html>`;
}

// Helper function used in the HTML template
function truncate(str, length) {
  if (!str) return 'unknown';
  return str.length > length ? str.substring(0, length) + '...' : str;
}
