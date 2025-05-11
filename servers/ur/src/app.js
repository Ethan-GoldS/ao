import cors from 'cors'
import express from 'express'
import { pipe } from 'ramda'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

import { config } from './config.js'
import { logger } from './logger.js'

import { proxyWith } from './proxy.js'
import { redirectWith } from './redirect.js'
import { getMetrics } from './metrics.js'

const middlewareWithByStrategy = {
  proxy: proxyWith,
  redirect: redirectWith
}

const middlewareWith = middlewareWithByStrategy[config.strategy]

// Get the current directory using ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Dashboard HTML template
const dashboardHtml = readFileSync(join(__dirname, 'dashboard.html'), 'utf8')

pipe(
  (app) => app.use(cors()),
  // Parse JSON requests for metrics collection
  (app) => app.use(express.json({ limit: '10mb', strict: false })),
  // Add middleware to capture raw body for metrics
  (app) => app.use((req, res, next) => {
    let data = ''
    req.on('data', chunk => {
      data += chunk
    })
    req.on('end', () => {
      if (data) {
        req.rawBody = data
      }
      next()
    })
  }),
  (app) => app.get('/healthcheck', (req, res) => res.status(200).send('OK')),
  // Add dashboard route
  (app) => app.get('/dashboard', (req, res) => {
    res.set('Content-Type', 'text/html')
    res.send(dashboardHtml)
  }),
  // Add metrics API endpoint
  (app) => app.get('/metrics', (req, res) => {
    res.json(getMetrics())
  }),
  middlewareWith({ ...config }),
  (app) => {
    const server = app.listen(config.port, () => {
      logger(`Server is running on http://localhost:${config.port}`)
    })

    process.on('SIGTERM', () => {
      logger('Received SIGTERM. Gracefully shutting down server...')
      server.close(() => {
        logger('Server Shut Down')
        process.exit()
      })
    })

    return server
  }
)(express())
