/**
 * Metrics service for the AO Router
 * Tracks request metrics without interfering with core proxy functionality
 */
import { logger } from './logger.js'

const _logger = logger.child('metrics')

// Store metrics in memory (will reset on server restart)
const metrics = {
  // Track recent requests with timestamp, process ID, IP, action, duration
  recentRequests: [],
  // Track counts by process ID
  processCounts: {},
  // Track counts by action
  actionCounts: {},
  // Track average duration by process ID
  processTiming: {},
  // Track average duration by action
  actionTiming: {}
}

// Maximum number of recent requests to keep
const MAX_RECENT_REQUESTS = 100

/**
 * Extract action from request body tags
 * @param {Object} body Request body
 * @returns {String|null} Action or null if not found
 */
export function extractAction(body) {
  try {
    if (!body || !body.Tags) return null;
    
    const actionTag = body.Tags.find(tag => 
      tag.name === 'Action' || tag.name === 'action'
    );
    
    return actionTag ? actionTag.value : null;
  } catch (err) {
    _logger('Error extracting action from request body: %O', err);
    return null;
  }
}

/**
 * Start tracking a request
 * @param {Object} req Express request object
 * @returns {Object} Request tracking object with start time
 */
export function startTracking(req) {
  return {
    startTime: Date.now(),
    processId: req.query['process-id'] || null,
    ip: req.ip || req.headers['x-forwarded-for'] || 'unknown'
  };
}

/**
 * Finish tracking a request and record metrics
 * @param {Object} tracking Request tracking object from startTracking
 * @param {String} action Action from request
 */
export function finishTracking(tracking, action) {
  if (!tracking || !tracking.startTime) return;
  
  const duration = Date.now() - tracking.startTime;
  const { processId, ip } = tracking;
  
  if (!processId) return;
  
  // Add to recent requests (limit size and keep most recent)
  metrics.recentRequests.unshift({
    timestamp: new Date().toISOString(),
    processId,
    ip,
    action,
    duration
  });
  
  if (metrics.recentRequests.length > MAX_RECENT_REQUESTS) {
    metrics.recentRequests.length = MAX_RECENT_REQUESTS;
  }
  
  // Update process counts
  metrics.processCounts[processId] = (metrics.processCounts[processId] || 0) + 1;
  
  // Update action counts if action exists
  if (action) {
    metrics.actionCounts[action] = (metrics.actionCounts[action] || 0) + 1;
  }
  
  // Update timing metrics for process
  if (!metrics.processTiming[processId]) {
    metrics.processTiming[processId] = {
      totalDuration: 0,
      count: 0
    };
  }
  metrics.processTiming[processId].totalDuration += duration;
  metrics.processTiming[processId].count += 1;
  
  // Update timing metrics for action if action exists
  if (action) {
    if (!metrics.actionTiming[action]) {
      metrics.actionTiming[action] = {
        totalDuration: 0,
        count: 0
      };
    }
    metrics.actionTiming[action].totalDuration += duration;
    metrics.actionTiming[action].count += 1;
  }
  
  _logger('Recorded metrics for process %s, action %s, duration %dms', processId, action, duration);
}

/**
 * Get all metrics for dashboard display
 * @returns {Object} All metrics
 */
export function getMetrics() {
  // Calculate average durations for easier display
  const processTimingWithAvg = {};
  Object.keys(metrics.processTiming).forEach(processId => {
    const { totalDuration, count } = metrics.processTiming[processId];
    processTimingWithAvg[processId] = {
      totalDuration,
      count,
      avgDuration: count > 0 ? totalDuration / count : 0
    };
  });
  
  const actionTimingWithAvg = {};
  Object.keys(metrics.actionTiming).forEach(action => {
    const { totalDuration, count } = metrics.actionTiming[action];
    actionTimingWithAvg[action] = {
      totalDuration,
      count,
      avgDuration: count > 0 ? totalDuration / count : 0
    };
  });
  
  return {
    recentRequests: metrics.recentRequests,
    processCounts: metrics.processCounts,
    actionCounts: metrics.actionCounts,
    processTiming: processTimingWithAvg,
    actionTiming: actionTimingWithAvg
  };
}
