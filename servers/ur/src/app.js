import cors from 'cors'
import express from 'express'
import { pipe } from 'ramda'
import bodyParser from 'body-parser'

import { config } from './config.js'
import { logger } from './logger.js'

import { proxyWith } from './proxy.js'
import { redirectWith } from './redirect.js'
import { startTimer, recordMetrics } from './metrics.js'
import { mountDashboard } from './dashboard.js'

const middlewareWithByStrategy = {
  proxy: proxyWith,
  redirect: redirectWith
}

const middlewareWith = middlewareWithByStrategy[config.strategy]

pipe(
  (app) => app.use(cors()),
  // Parse JSON body for metrics extraction
  (app) => app.use(bodyParser.json({
    // Using a limit to prevent payload attacks
    limit: '1mb',
    // Don't stop requests on JSON parsing errors
    strict: false
  })),
  // Track request start time for performance metrics
  (app) => app.use((req, res, next) => {
    startTimer(req)
    next()
  }),
  // Add healthcheck endpoint
  (app) => app.get('/healthcheck', (req, res) => res.status(200).send('OK')),
  // Mount dashboard routes before main middleware
  (app) => {
    mountDashboard(app)
    return app
  },
  // Add the proxy or redirect middleware based on config
  middlewareWith({ ...config }),
  // Record metrics after response (using finished event)
  (app) => {
    app.use((req, res, next) => {
      // Record metrics when response finishes
      res.on('finish', () => {
        try {
          recordMetrics(req, res)
        } catch (err) {
          logger('Error recording metrics:', err)
        }
      })
      next()
    })
    return app
  },
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
