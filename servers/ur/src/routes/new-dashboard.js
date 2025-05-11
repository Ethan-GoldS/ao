/**
 * New metrics dashboard route using PostgreSQL
 * Displays detailed request metrics in a visual format
 */
import express from 'express'
import { logger } from '../logger.js'
import { getMetrics } from '../metrics.js'
import { generateNewDashboardHtml } from '../dashboard/newDashboard.js'

const _logger = logger.child('new-dashboard')
const router = express.Router()

// Main dashboard page
router.get('/', async (req, res) => {
  try {
    const metrics = await getMetrics()
    const html = generateNewDashboardHtml(metrics)
    res.send(html)
  } catch (err) {
    _logger('Error serving dashboard: %O', err)
    res.status(500).send('Error loading dashboard')
  }
})

// API endpoint to get metrics data for dashboard refresh
router.get('/api/metrics', async (req, res) => {
  try {
    const metrics = await getMetrics()
    res.json(metrics)
  } catch (err) {
    _logger('Error serving metrics API: %O', err)
    res.status(500).json({ error: 'Error loading metrics' })
  }
})

export default router
