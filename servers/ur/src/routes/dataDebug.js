/**
 * Data debugging route for troubleshooting dashboard display issues
 */
import express from 'express'
import { logger } from '../logger.js'
import * as metrics from '../metrics.js'

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

export default router
