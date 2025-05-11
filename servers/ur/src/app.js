import cors from 'cors'
import express from 'express'
import { pipe } from 'ramda'

import { config } from './config.js'
import { logger } from './logger.js'

import { proxyWith } from './proxy.js'
import { redirectWith } from './redirect.js'
import { metricsMiddleware } from './metricsMiddleware.js'
import { setupDashboard } from './dashboard.js'

const middlewareWithByStrategy = {
  proxy: proxyWith,
  redirect: redirectWith
}

const middlewareWith = middlewareWithByStrategy[config.strategy]

pipe(
  (app) => app.use(cors()),
  (app) => app.use(express.json()), // Parse JSON request bodies
  (app) => app.get('/healthcheck', (req, res) => res.status(200).send('OK')),
  // Setup metrics if enabled
  (app) => {
    if (config.enableMetrics) {
      logger('Metrics enabled, setting up dashboard at /dashboard')
      app.use(metricsMiddleware)
      setupDashboard(app)
    }
    return app
  },
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
