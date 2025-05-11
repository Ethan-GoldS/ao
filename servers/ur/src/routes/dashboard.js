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
  
  app.get('/dashboard', async (req, res) => {
    try {
      // getMetrics is now async and returns a Promise
      const metrics = await getMetrics();
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

  router.get('/', async (req, res) => {
    try {
      _logger('Handling dashboard request');
      // Handle both async and sync getMetrics implementations
      const metrics = metricsService.getMetrics instanceof Function
        ? await metricsService.getMetrics()
        : metricsService.getMetrics;
      
      res.setHeader('Content-Type', 'text/html');
      res.send(generateDashboardHtml(metrics));
    } catch (err) {
      _logger('Error handling dashboard request: %o', err);
      res.status(500).send('Internal Server Error');
    }
  });

  return router;
}


