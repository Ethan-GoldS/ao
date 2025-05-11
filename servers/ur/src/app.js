import cors from 'cors'
import express from 'express'
import { pipe } from 'ramda'

import { config } from './config.js'
import { logger } from './logger.js'

import { proxyWith } from './proxy.js'
import { redirectWith } from './redirect.js'
import { metricsMiddleware } from './middleware/metricsMiddleware.js'
import diagnosticsRoutes from './routes/diagnostics.js'
import dataDebugRoutes from './routes/dataDebug.js'
import newDashboardRoutes from './dashboard/newDashboard.js'

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
    // Mount diagnostics routes for debugging
    app.use('/diagnostics', diagnosticsRoutes)
    logger('Diagnostics routes mounted at /diagnostics')
    
    // Mount data debug route for dashboard troubleshooting
    app.use('/data-debug', dataDebugRoutes)
    logger('Data debug route mounted at /data-debug')
    
    // Mount the new enhanced dashboard as the main dashboard
    app.use('/dashboard', newDashboardRoutes)
    logger('Enhanced dashboard mounted at /dashboard')
    
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
