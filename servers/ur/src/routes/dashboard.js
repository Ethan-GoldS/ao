/**
 * Dashboard route and UI generator
 */
import express from 'express';
import { logger } from '../logger.js';
import { generateDashboardHtml } from '../dashboard/index.js';
import { getMetrics } from '../metrics.js';
import * as db from '../database.js';

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
  app.get('/dashboard/data', async (req, res) => {
    try {
      const metrics = getMetrics();
      
      // Get the freshest time series data directly from the database
      // This ensures we're always displaying the latest data even if
      // in-memory metrics haven't been fully updated
      let timeSeriesData = [];
      
      try {
        // Get 48 hours of time series data
        const dbTimeSeriesData = await db.getTimeSeriesData(48);
        _logger('Fetched %d time series data points directly from database', dbTimeSeriesData.length);
        
        if (dbTimeSeriesData && dbTimeSeriesData.length > 0) {
          timeSeriesData = dbTimeSeriesData.map(item => {
            // Normalize the data format for the UI
            let processCounts = item.processCounts;
            
            // Handle PostgreSQL JSONB that may be returned as a string
            if (typeof processCounts === 'string') {
              try {
                processCounts = JSON.parse(processCounts);
              } catch (e) {
                processCounts = {};
              }
            }
            
            // Ensure we have a valid date object for consistent sorting
            const timestamp = item.timestamp ? new Date(item.timestamp) : new Date();
            
            return {
              timestamp: timestamp.toISOString(),
              // Use camelCase property names for consistency
              totalRequests: parseInt(item.totalRequests || item.total_requests || 0, 10),
              // Make sure process counts is an object
              processCounts: processCounts || {},
              // Add a properly formatted hour field
              hour: item.hour || timestamp.getUTCHours()
            };
          });
          
          // Sort from oldest to newest for proper charting
          timeSeriesData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        }
      } catch (dbErr) {
        _logger('Error fetching time series data from database: %O', dbErr);
        // Fall back to in-memory data if DB query fails
        timeSeriesData = metrics.timeSeriesData || [];
      }
      
      // Log the time series data for debugging
      if (timeSeriesData.length > 0) {
        _logger('Time series data available: %d points from %s to %s', 
                timeSeriesData.length,
                new Date(timeSeriesData[0].timestamp).toLocaleString(),
                new Date(timeSeriesData[timeSeriesData.length-1].timestamp).toLocaleString());
      } else {
        _logger('No time series data available');
      }
      
      const dashboardData = {
        totalRequests: metrics.totalRequests || 0,
        uniqueProcessIds: Object.keys(metrics.processCounts || {}).length,
        uniqueIps: Object.keys(metrics.ipCounts || {}).length,
        timeSeriesData: timeSeriesData,
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


