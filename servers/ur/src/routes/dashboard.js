/**
 * Dashboard route and UI generator
 */
import express from 'express';
import { logger } from '../logger.js';
import { generateDashboardHtml } from '../dashboard/index.js';
import { getMetrics } from '../metrics.js';
import { getFlexibleTimeSeriesData } from '../database/metricsService.js';
import { generateTrafficOverview } from '../dashboard/trafficOverview.js';

const router = express.Router();
const _logger = logger.child('dashboard');

/**
 * Mount the dashboard routes on the app
 * This is the entry point used by app.js
 */
export function mountDashboard(app) {
  _logger('Mounting dashboard routes');
  
  // API endpoint for flexible traffic overview data
  app.get('/api/dashboard/traffic-overview', async (req, res) => {
    try {
      // Parse query parameters with defaults
      const timeRangeMinutes = parseInt(req.query.timeRangeMinutes || '60', 10);
      const intervalSeconds = parseInt(req.query.intervalSeconds || '60', 10);
      const processIdFilter = req.query.processIdFilter || null;
      
      // Enforce limits to prevent resource-intensive queries
      const limitedTimeRange = Math.min(Math.max(timeRangeMinutes, 1), 10080); // Max 1 week
      const limitedInterval = Math.min(Math.max(intervalSeconds, 5), 86400); // Min 5 sec, max 1 day
      
      _logger('Traffic overview request: range=%d minutes, interval=%d seconds, filter=%s',
        limitedTimeRange, limitedInterval, processIdFilter || 'none');
      
      // Get the data with timeout protection
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Traffic data query timed out')), 15000);
      });
      
      const dataPromise = getFlexibleTimeSeriesData({
        timeRangeMinutes: limitedTimeRange,
        intervalSeconds: limitedInterval,
        processIdFilter
      });
      
      const trafficData = await Promise.race([dataPromise, timeoutPromise])
        .catch(err => {
          _logger('Traffic overview query error or timeout: %o', err);
          return {
            timeSeriesData: [],
            timeLabels: [],
            uniqueProcessIds: [],
            uniqueActions: []
          };
        });
      
      // Generate HTML for the traffic overview
      const html = generateTrafficOverview(trafficData);
      
      // Return both the HTML and the data
      res.json({
        html,
        data: trafficData
      });
    } catch (err) {
      _logger('Error generating traffic overview: %o', err);
      res.status(500).json({
        html: '<div class="alert alert-danger">Error generating traffic overview</div>',
        error: err.message
      });
    }
  });
  
  app.get('/dashboard', async (req, res) => {
    try {
      // Set timeout to prevent long loading times
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Dashboard generation timed out')), 15000);
      });
      
      const metricsPromise = Promise.resolve().then(() => {
        try {
          return getMetrics() || {}; // Ensure we always have an object
        } catch (err) {
          _logger('Error fetching metrics: %o', err);
          return {}; // Return empty object on error
        }
      });
      
      // Use Promise.race to implement timeout
      const metrics = await Promise.race([metricsPromise, timeoutPromise])
        .catch(err => {
          _logger('Dashboard error or timeout: %o', err);
          return {}; // Return empty object on timeout
        });
      
      const html = generateDashboardHtml(metrics);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (err) {
      _logger('Error generating dashboard HTML: %o', err);
      res.status(500).send('Internal Server Error');
    }
  });
}

/**
 * Set up dashboard routes
 * Alternative export for more modular usage
 */
export function setupDashboardRoutes(metricsService) {
  _logger('Setting up dashboard routes');

  router.get('/', (req, res) => {
    _logger('Handling dashboard request');
    const metrics = metricsService.getMetrics();
    res.send(generateDashboardHtml(metrics));
  });

  return router;
}


