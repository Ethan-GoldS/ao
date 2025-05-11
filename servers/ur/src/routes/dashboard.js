/**
 * Dashboard route for displaying metrics
 */
import { getMetrics } from '../metrics.js'
import { logger } from '../logger.js'

const _logger = logger.child('dashboard')

/**
 * Generate HTML for metrics dashboard
 */
function generateDashboardHtml() {
  const metrics = getMetrics()
  
  // Generate recent requests table
  const recentRequestsHtml = metrics.recentRequests.map(req => `
    <tr>
      <td>${req.timestamp}</td>
      <td>${req.processId}</td>
      <td>${req.action || 'N/A'}</td>
      <td>${req.ip}</td>
      <td>${req.duration}ms</td>
    </tr>
  `).join('')

  // Generate process metrics table
  const processMetricsHtml = Object.entries(metrics.processCounts)
    .map(([processId, count]) => {
      const timing = metrics.processTiming[processId] || { avgDuration: 0 }
      return `
        <tr>
          <td>${processId}</td>
          <td>${count}</td>
          <td>${timing.avgDuration.toFixed(2)}ms</td>
        </tr>
      `
    }).join('')

  // Generate action metrics table
  const actionMetricsHtml = Object.entries(metrics.actionCounts)
    .map(([action, count]) => {
      const timing = metrics.actionTiming[action] || { avgDuration: 0 }
      return `
        <tr>
          <td>${action}</td>
          <td>${count}</td>
          <td>${timing.avgDuration.toFixed(2)}ms</td>
        </tr>
      `
    }).join('')

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>AO Router Metrics Dashboard</title>
      <meta http-equiv="refresh" content="30">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          padding: 20px;
          line-height: 1.6;
          color: #333;
          max-width: 1200px;
          margin: 0 auto;
        }
        h1, h2 {
          color: #444;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        th, td {
          text-align: left;
          padding: 8px;
          border: 1px solid #ddd;
        }
        th {
          background-color: #f2f2f2;
        }
        tr:nth-child(even) {
          background-color: #f9f9f9;
        }
        .timestamp {
          font-size: 0.8em;
          color: #666;
          text-align: right;
        }
        .card {
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 15px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
      </style>
    </head>
    <body>
      <h1>AO Router Metrics Dashboard</h1>
      <div class="timestamp">Auto-refreshes every 30 seconds - Last updated: ${new Date().toISOString()}</div>
      
      <div class="card">
        <h2>Recent Requests</h2>
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Process ID</th>
              <th>Action</th>
              <th>IP</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            ${recentRequestsHtml || '<tr><td colspan="5">No requests recorded yet</td></tr>'}
          </tbody>
        </table>
      </div>
      
      <div class="card">
        <h2>Process Metrics</h2>
        <table>
          <thead>
            <tr>
              <th>Process ID</th>
              <th>Request Count</th>
              <th>Average Duration</th>
            </tr>
          </thead>
          <tbody>
            ${processMetricsHtml || '<tr><td colspan="3">No process metrics recorded yet</td></tr>'}
          </tbody>
        </table>
      </div>
      
      <div class="card">
        <h2>Action Metrics</h2>
        <table>
          <thead>
            <tr>
              <th>Action</th>
              <th>Request Count</th>
              <th>Average Duration</th>
            </tr>
          </thead>
          <tbody>
            ${actionMetricsHtml || '<tr><td colspan="3">No action metrics recorded yet</td></tr>'}
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `
}

/**
 * Mount dashboard route on app
 */
export function mountDashboard(app) {
  _logger('Mounting dashboard route')
  
  app.get('/dashboard', (req, res) => {
    try {
      const html = generateDashboardHtml()
      res.setHeader('Content-Type', 'text/html')
      res.send(html)
    } catch (err) {
      _logger('Error rendering dashboard: %O', err)
      res.status(500).send('Error rendering dashboard')
    }
  })
  
  return app
}
