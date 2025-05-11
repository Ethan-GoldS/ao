import cors from 'cors'
import express from 'express'
import { pipe } from 'ramda'

import { config } from './config.js'
import { logger } from './logger.js'

import { proxyWith } from './proxy.js'
import { redirectWith } from './redirect.js'
import { metricsMiddleware } from './middleware/metricsMiddleware.js'
import { mountDashboard } from './routes/dashboard.js'

const middlewareWithByStrategy = {
  proxy: proxyWith,
  redirect: redirectWith
}

const middlewareWith = middlewareWithByStrategy[config.strategy]

pipe(
  (app) => app.use(cors()),
  (app) => {
    // Add Express JSON body parser for metrics tracking
    app.use(express.json({ strict: false, limit: '1mb' }))
    // Add metrics middleware (doesn't affect core functionality)
    app.use(metricsMiddleware())
    return app
  },
  (app) => app.get('/healthcheck', (req, res) => res.status(200).send('OK')),
  (app) => {
    // Mount dashboard route before proxy middleware
    mountDashboard(app)
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
