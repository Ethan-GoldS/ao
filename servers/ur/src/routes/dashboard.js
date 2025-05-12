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


