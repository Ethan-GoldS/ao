/**
 * Diagnostics routes for debugging database connectivity and metrics
 */
import express from 'express'
import { logger } from '../logger.js'
import * as db from '../database.js'
import { metrics } from '../metrics.js'
import { config } from '../config.js'

const _logger = logger.child('diagnostics')
const router = express.Router()

/**
 * Basic metrics status route
 */
router.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    usePostgres: config.usePostgres,
    dbUrl: config.dbUrl ? config.dbUrl.replace(/:[^:]*@/, ':****@') : null,
    storagePath: process.env.METRICS_STORAGE_PATH || null,
    metricsInMemory: {
      totalRequests: metrics.totalRequests || 0,
      processCounts: Object.keys(metrics.processCounts || {}).length,
      ipCounts: Object.keys(metrics.ipCounts || {}).length,
      timeSeriesEntries: (metrics.timeSeriesData || []).length
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
  res.json(metrics)
})

export default router
