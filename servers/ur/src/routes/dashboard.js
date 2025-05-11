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
            let actionCounts = item.actionCounts;
            
            // Handle PostgreSQL JSONB that may be returned as a string
            if (typeof processCounts === 'string') {
              try {
                processCounts = JSON.parse(processCounts);
              } catch (e) {
                processCounts = {};
              }
            }
            
            // Handle action counts from JSONB
            if (typeof actionCounts === 'string') {
              try {
                actionCounts = JSON.parse(actionCounts);
              } catch (e) {
                actionCounts = {};
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
              // Include action counts for actions chart
              actionCounts: actionCounts || {},
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
      
      // Get additional metrics directly from the database for real-time accuracy
      let processCounts = {};
      let actionCounts = {};
      let ipCounts = {};
      let referrerCounts = {};
      let recentRequests = [];
      
      try {
        // Fetch top process counts directly from database
        const topProcesses = await db.getTopProcessCounts(20);
        if (topProcesses && topProcesses.length > 0) {
          topProcesses.forEach(p => {
            processCounts[p.process_id] = {
              count: p.count,
              totalDuration: p.total_duration,
              avgDuration: p.count > 0 ? Math.round(p.total_duration / p.count) : 0,
              minDuration: p.min_duration || 0,
              maxDuration: p.max_duration || 0,
              firstSeen: p.first_seen || null,
              lastSeen: p.last_seen || null
            };
          });
        }
        
        // Fetch top action counts
        const topActions = await db.getTopActionCounts(20);
        if (topActions && topActions.length > 0) {
          topActions.forEach(a => {
            actionCounts[a.action] = {
              count: a.count,
              totalDuration: a.total_duration,
              avgDuration: a.count > 0 ? Math.round(a.total_duration / a.count) : 0,
              minDuration: a.min_duration || 0,
              maxDuration: a.max_duration || 0,
              firstSeen: a.first_seen || null,
              lastSeen: a.last_seen || null
            };
          });
        }
        
        // Fetch top IP counts
        const topIps = await db.getTopIpCounts(20);
        if (topIps && topIps.length > 0) {
          topIps.forEach(i => {
            ipCounts[i.ip] = {
              count: i.count,
              firstSeen: i.first_seen || null,
              lastSeen: i.last_seen || null
            };
          });
        }
        
        // Fetch top referrer counts
        const topReferrers = await db.getTopReferrerCounts(20);
        if (topReferrers && topReferrers.length > 0) {
          topReferrers.forEach(r => {
            referrerCounts[r.referrer] = {
              count: r.count,
              firstSeen: r.first_seen || null,
              lastSeen: r.last_seen || null
            };
          });
        }
        
        // Fetch recent requests with detailed info
        const recent = await db.getRecentRequests(50);
        if (recent && recent.length > 0) {
          recentRequests = recent;
        }
        
      } catch (err) {
        _logger('Error fetching detailed metrics from database: %O', err);
        // Fall back to in-memory metrics
        processCounts = metrics.processCounts || {};
        actionCounts = metrics.actionCounts || {};
        ipCounts = metrics.ipCounts || {};
        referrerCounts = metrics.referrerCounts || {};
        recentRequests = metrics.recentRequests || [];
      }
      
      // Create comprehensive dashboard data object with all metrics
      const dashboardData = {
        totalRequests: metrics.totalRequests || 0,
        timeSeriesData,
        processCounts,
        actionCounts,
        ipCounts,
        referrerCounts,
        recentRequests,
        startTime: metrics.startTime || new Date().toISOString(),
        // Add server info for dashboard header
        serverInfo: {
          startTime: metrics.startTime || new Date().toISOString(),
          uptime: Math.round((Date.now() - new Date(metrics.startTime || Date.now()).getTime()) / 1000 / 60 / 60) + ' hours',
          totalRequests: metrics.totalRequests || 0,
          uniqueProcessIds: Object.keys(processCounts).length,
          uniqueActions: Object.keys(actionCounts).length,
          uniqueIps: Object.keys(ipCounts).length
        }
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


