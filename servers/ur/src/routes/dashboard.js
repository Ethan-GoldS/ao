/**
 * Dashboard route and UI generator
 */
import express from 'express';
import { logger } from '../logger.js';
import { generateDashboardHtml } from '../dashboard/index.js';
import { getMetrics } from '../metrics.js';

const router = express.Router();
const _logger = logger.child('dashboard');

/**
 * Mount the dashboard routes on the app
 * This is the entry point used by app.js
 */
export function mountDashboard(app) {
  _logger('Mounting dashboard routes');
  
  // Main dashboard HTML route
  app.get('/dashboard', (req, res) => {
    try {
      const metrics = getMetrics();
      const html = generateDashboardHtml(metrics);
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (err) {
      _logger('Error generating dashboard HTML: %o', err);
      res.status(500).send('Internal Server Error');
    }
  });
  
  // JSON data endpoint for AJAX refreshing
  app.get('/dashboard/data', (req, res) => {
    try {
      const metrics = getMetrics();
      
      // Prepare a simplified data object with just what the UI needs
      const dashboardData = {
        totalRequests: metrics.totalRequests || 0,
        uniqueProcessIds: Object.keys(metrics.processCounts || {}).length,
        uniqueIps: Object.keys(metrics.ipCounts || {}).length,
        timeSeriesData: metrics.timeSeriesData || [],
        startTime: metrics.startTime,
        lastUpdated: new Date().toISOString()
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.send(dashboardData);
    } catch (err) {
      _logger('Error generating dashboard data: %o', err);
      res.status(500).json({ error: 'Failed to retrieve metrics data' });
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


