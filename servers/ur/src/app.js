import cors from 'cors'
import express from 'express'
import { pipe } from 'ramda'

import { config } from './config.js'
import { logger } from './logger.js'

import { proxyWith } from './proxy.js'
import { redirectWith } from './redirect.js'
import { metricsMiddleware, generateDashboardHtml, updateRequestWithBody } from './metrics.js'

const middlewareWithByStrategy = {
  proxy: proxyWith,
  redirect: redirectWith
}

const middlewareWith = middlewareWithByStrategy[config.strategy]

pipe(
  (app) => app.use(cors()),
  // Add body parsing middleware to capture request body data
  (app) => app.use(express.json({ limit: '2mb' })),
  // Add metrics middleware for all requests
  (app) => app.use(metricsMiddleware()),
  // Capture body data for metrics
  (app) => app.use((req, res, next) => {
    // Update metrics with body data
    updateRequestWithBody(req);
    next();
  }),
  // Health check endpoint
  (app) => app.get('/healthcheck', (req, res) => res.status(200).send('OK')),
  // Dashboard endpoint
  (app) => app.get('/dashboard', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(generateDashboardHtml());
  }),
  // Main proxy/redirect middleware - keep the original functionality
  middlewareWith({ ...config }),
  (app) => {
    const server = app.listen(config.port, () => {
      logger(`Server is running on http://localhost:${config.port}`)
      logger(`Metrics dashboard available at http://localhost:${config.port}/dashboard`)
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
