/**
 * Diagnostics routes for debugging database connectivity and metrics
 */
import express from 'express'
import { logger } from '../logger.js'
import * as db from '../database.js'
import * as metrics from '../metrics.js'
import { config } from '../config.js'

const _logger = logger.child('diagnostics')
const router = express.Router()

/**
 * Basic metrics status route
 */
router.get('/status', (req, res) => {
  // Get current metrics data
  const currentMetrics = metrics.getMetrics()
  
  res.json({
    status: 'ok',
    usePostgres: config.usePostgres,
    dbUrl: config.dbUrl ? config.dbUrl.replace(/:[^:]*@/, ':****@') : null,
    storagePath: process.env.METRICS_STORAGE_PATH || null,
    metricsInMemory: {
      totalRequests: currentMetrics.totalRequests || 0,
      processCounts: Object.keys(currentMetrics.processCounts || {}).length,
      ipCounts: Object.keys(currentMetrics.ipCounts || {}).length,
      timeSeriesEntries: (currentMetrics.timeSeriesData || []).length
    }
  })
})

/**
 * Database diagnostics route
 */
router.get('/db', async (req, res) => {
  if (!config.usePostgres) {
    return res.json({
      enabled: false,
      message: 'PostgreSQL is not enabled. Set USE_POSTGRES=true and DB_URL to enable.'
    })
  }
  
  try {
    const diagnostics = await db.getDatabaseDiagnostics()
    res.json({
      enabled: true,
      ...diagnostics
    })
  } catch (err) {
    res.status(500).json({
      enabled: true,
      error: err.message,
      stack: err.stack
    })
  }
})

/**
 * Raw metrics data route
 */
router.get('/metrics-data', (req, res) => {
  res.json(metrics.getMetrics())
})

export default router
