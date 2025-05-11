/**
 * Data debugging route for troubleshooting dashboard display issues
 */
import express from 'express'
import { logger } from '../logger.js'
import * as metrics from '../metrics.js'
import * as db from '../database.js'

const _logger = logger.child('data-debug')
const router = express.Router()

/**
 * Raw metrics data endpoint for debugging
 */
router.get('/', (req, res) => {
  const currentMetrics = metrics.getMetrics()
  
  // Add debug info about data types and formats
  const debugInfo = {
    // General metrics info
    totalRequests: currentMetrics.totalRequests,
    startTime: currentMetrics.startTime,
    
    // Process counts info
    processCounts: {
      type: typeof currentMetrics.processCounts,
      isArray: Array.isArray(currentMetrics.processCounts),
      keys: Object.keys(currentMetrics.processCounts || {}),
      sample: Object.entries(currentMetrics.processCounts || {}).slice(0, 2),
      count: Object.keys(currentMetrics.processCounts || {}).length
    },
    
    // Time series info
    timeSeriesData: {
      type: typeof currentMetrics.timeSeriesData,
      isArray: Array.isArray(currentMetrics.timeSeriesData),
      length: (currentMetrics.timeSeriesData || []).length,
      sample: (currentMetrics.timeSeriesData || []).slice(0, 2),
      timestamps: (currentMetrics.timeSeriesData || []).map(item => item?.timestamp).slice(0, 5)
    },
    
    // IP counts info
    ipCounts: {
      type: typeof currentMetrics.ipCounts,
      isArray: Array.isArray(currentMetrics.ipCounts),
      keys: Object.keys(currentMetrics.ipCounts || {}),
      sample: Object.entries(currentMetrics.ipCounts || {}).slice(0, 2),
      count: Object.keys(currentMetrics.ipCounts || {}).length
    },
    
    // Recent requests info
    recentRequests: {
      type: typeof currentMetrics.recentRequests,
      isArray: Array.isArray(currentMetrics.recentRequests),
      length: (currentMetrics.recentRequests || []).length,
      sample: (currentMetrics.recentRequests || []).slice(0, 2)
    }
  }
  
  // Return as formatted JSON
  res.setHeader('Content-Type', 'application/json')
  res.send(JSON.stringify(debugInfo, null, 2))
})

/**
 * Time series data debugging endpoint
 */
router.get('/time-series', async (req, res) => {
  try {
    // Get raw time series data directly from the database
    const timeSeriesData = await db.getTimeSeriesData(48) // Get 48 hours of data
    
    // Normalize each time series data point
    const normalizedData = timeSeriesData.map(point => {
      let processCounts = point.processCounts;
      
      // Parse JSONB data if it's a string
      if (typeof processCounts === 'string') {
        try {
          processCounts = JSON.parse(processCounts);
        } catch (e) {
          processCounts = {};
        }
      }
      
      // Create a timestamp from the ISO string
      const timestamp = new Date(point.timestamp);
      
      // Create a time series point that works with the chart
      return {
        id: point.id,
        timestamp: point.timestamp,
        date: timestamp.toLocaleString(),
        hour: point.hour,
        requests: point.totalRequests || point.total_requests || 0,
        processCounts: processCounts
      };
    });

    // Create synthetic test data if we don't have any real time series data
    if (normalizedData.length === 0) {
      _logger('No time series data found, generating synthetic test data');
      
      // Generate 24 hours of fake data points
      const now = new Date();
      for (let i = 0; i < 24; i++) {
        const pointTime = new Date(now.getTime() - (i * 3600 * 1000));
        normalizedData.push({
          timestamp: pointTime.toISOString(),
          date: pointTime.toLocaleString(),
          hour: pointTime.getHours(),
          requests: Math.floor(Math.random() * 100) + 1, // Random request count 1-100
          processCounts: {}
        });
      }
      
      // Reverse to get oldest first
      normalizedData.reverse();
    }
    
    // Send the debug info
    res.json({
      count: normalizedData.length,
      timeSeriesData: normalizedData,
      debugInfo: {
        firstTimestamp: normalizedData[0]?.timestamp,
        lastTimestamp: normalizedData[normalizedData.length - 1]?.timestamp,
        timeRange: `${normalizedData[0]?.date} to ${normalizedData[normalizedData.length - 1]?.date}`
      }
    });
  } catch (err) {
    _logger('Error in time series debug endpoint: %o', err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
})

/**
 * Generate and store test time series data
 */
router.post('/generate-test-data', async (req, res) => {
  try {
    // Create fake time series data for the last 24 hours
    const now = new Date();
    let createdCount = 0;
    
    // Get the database pool directly from database.js if it exists
    const pool = await db.getDbPool();
    if (!pool) {
      return res.status(500).json({ 
        error: 'Database not connected', 
        message: 'Make sure PostgreSQL is enabled and configured correctly' 
      });
    }
    
    // Create data for the last 24 hours
    for (let i = 0; i < 24; i++) {
      try {
        const pointTime = new Date(now.getTime() - (i * 3600 * 1000)); // Go back i hours
        const requestCount = Math.floor(Math.random() * 100) + 5; // Random number 5-104
        
        // Insert directly into the time series table
        const result = await pool.query(`
          INSERT INTO ur_metrics_time_series(
            timestamp, 
            hour, 
            total_requests, 
            process_counts
          )
          VALUES(
            $1, 
            $2, 
            $3, 
            $4
          )
          ON CONFLICT (timestamp) DO UPDATE SET
            total_requests = $3,
            process_counts = $4
        `, [
          pointTime,
          pointTime.getUTCHours(),
          requestCount,
          JSON.stringify({"8N08BvmC34q9Hxj-YS6eAOd_cSmYqGpezPPHUYWJBhg": Math.floor(Math.random() * requestCount) + 1})
        ]);
        
        _logger(`Created test time series data for ${pointTime.toISOString()}`);
        createdCount++;
      } catch (err) {
        _logger(`Error creating test point for hour -${i}: ${err.message}`);
      }
    }
    
    res.json({
      success: true,
      message: `Generated ${createdCount} test time series data points`,
      action: 'Refresh the dashboard to see the new data'
    });
  } catch (err) {
    _logger('Error generating test data: %o', err);
    res.status(500).json({ error: err.message });
  }
})

export default router
