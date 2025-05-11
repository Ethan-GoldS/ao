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
  // Configure CORS with more permissive settings
  (app) => {
    const corsOptions = {
      origin: '*', // Allow all origins
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
      exposedHeaders: ['Content-Range', 'X-Content-Range'],
      credentials: true,
      maxAge: 86400 // 24 hours
    };
    
    // Apply CORS to all routes
    app.use(cors(corsOptions));
    
    // Handle OPTIONS preflight requests specially
    app.options('*', cors(corsOptions));
    
    return app;
  },
  (app) => app.use(express.json({ limit: '2mb' })), // Parse JSON request bodies with increased limit
  (app) => app.get('/healthcheck', (req, res) => res.status(200).send('OK')),
  // Setup metrics if enabled
  (app) => {
    logger(`Metrics configuration: ${config.enableMetrics ? 'ENABLED' : 'DISABLED'}`)
    if (config.enableMetrics) {
      logger('Setting up metrics dashboard at /dashboard')
      app.use(metricsMiddleware)
      setupDashboard(app)
      
      // Add a direct test route to verify dashboard is registered
      app.get('/metrics-test', (req, res) => {
        res.send('Metrics system is active. Dashboard should be available at /dashboard')
      })
      
      logger('Metrics dashboard setup complete')
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
