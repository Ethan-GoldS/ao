/**
 * Middleware for capturing request metrics
 */
import { metricsService } from './metrics.js';
import { logger } from './logger.js';

export function metricsMiddleware(req, res, next) {
  // Skip metrics collection for the dashboard itself to avoid recursive data
  if (req.path === '/dashboard' || req.path === '/api/metrics') {
    return next();
  }

  // Record start time
  const startTime = Date.now();
  
  // Extract process ID from various places in the request
  let processId = req.params.processId;
  if (!processId && req.query['process-id']) {
    processId = req.query['process-id'];
  }

  // Store original URL and method
  const endpoint = req.method + ' ' + req.path;

  // Prepare metrics data with what we know so far
  const metricsData = {
    method: req.method,
    path: req.path,
    endpoint,
    processId,
    query: req.query,
    timestamp: startTime,
  };

  // Parse request body for POST/PUT requests if available
  if (req.body && (req.method === 'POST' || req.method === 'PUT')) {
    try {
      // Extract important fields from the body, particularly looking for Tags
      metricsData.body = {
        id: req.body.Id,
        target: req.body.Target,
        owner: req.body.Owner,
      };

      // Extract action and address from Tags if available
      if (Array.isArray(req.body.Tags)) {
        const actionTag = req.body.Tags.find(tag => tag.name === 'Action');
        const addressTag = req.body.Tags.find(tag => tag.name === 'Address');
        
        if (actionTag) {
          metricsData.action = actionTag.value;
        }
        
        if (addressTag) {
          metricsData.address = addressTag.value;
        }
      }
    } catch (err) {
      // Safely ignore parsing errors
      logger('Error parsing request body for metrics:', err);
    }
  }

  // Intercept response to measure duration
  const originalSend = res.send;
  res.send = function(...args) {
    // Calculate response time
    const responseTime = Date.now() - startTime;
    
    // Add response data to metrics
    metricsData.responseTime = responseTime;
    metricsData.statusCode = res.statusCode;
    
    // Record the complete request data
    metricsService.recordRequest(metricsData);
    
    // Log for debugging
    logger.child('metrics')(`${req.method} ${req.path} - ${res.statusCode} - ${responseTime}ms`);
    
    // Call the original send
    return originalSend.apply(this, args);
  };
  
  next();
}
