import cors from 'cors'
import express from 'express'
import { pipe } from 'ramda'

import { config } from './config.js'
import { logger } from './logger.js'

import { proxyWith } from './proxy.js'
import { redirectWith } from './redirect.js'
import { metricsMiddleware } from './middleware/metricsMiddleware.js'
import { mountDashboard } from './routes/dashboard.js'
import newDashboardRouter from './routes/new-dashboard.js'
import { mountTrafficApi } from './routes/trafficApi.js'

const middlewareWithByStrategy = {
  proxy: proxyWith,
  redirect: redirectWith
}

const middlewareWith = middlewareWithByStrategy[config.strategy]

pipe(
  (app) => app.use(cors()),
  (app) => {
    // Add metrics middleware (doesn't affect core functionality)
    // DO NOT parse body here - it breaks proxy functionality
    app.use(metricsMiddleware())
    return app
  },
  (app) => app.get('/healthcheck', (req, res) => res.status(200).send('OK')),
  (app) => {
    // Mount dashboard routes before proxy middleware
    mountDashboard(app)
    
    // Mount new PostgreSQL-based metrics dashboard
    app.use('/new-dashboard', newDashboardRouter)
    
    // Mount traffic API routes
    mountTrafficApi(app)
    
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
