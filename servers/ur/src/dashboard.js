/**
 * Dashboard route handler for UR metrics
 */
import { getMetrics, resetMetrics } from './metrics.js'

// Simple HTML template for dashboard
const dashboardTemplate = (metrics) => {
  const { processCounts, actionCounts, timings, recentRequests } = metrics
  
  // Convert maps to arrays for easier rendering
  const processEntries = Object.entries(processCounts)
    .sort((a, b) => b[1] - a[1]) // Sort by count descending
  
  const actionEntries = Object.entries(actionCounts)
    .sort((a, b) => b[1] - a[1]) // Sort by count descending
  
  const timingEntries = Object.entries(timings)
    .sort((a, b) => b[1].avg - a[1].avg) // Sort by average time descending
  
  return `<!DOCTYPE html>
<html>
<head>
  <title>UR Server Metrics Dashboard</title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.5;
      margin: 0;
      padding: 20px;
      color: #333;
      background-color: #f5f5f5;
    }
    h1, h2, h3 {
      margin-top: 20px;
      margin-bottom: 10px;
      color: #2c3e50;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
      border-radius: 4px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    @media (max-width: 768px) {
      .grid {
        grid-template-columns: 1fr;
      }
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 14px;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 8px 12px;
      text-align: left;
    }
    th {
      background-color: #f2f2f2;
      font-weight: 600;
    }
    tr:nth-child(even) {
      background-color: #f9f9f9;
    }
    tr:hover {
      background-color: #f1f1f1;
    }
    .request-details {
      font-family: monospace;
      white-space: pre-wrap;
      max-height: 300px;
      overflow-y: auto;
      background-color: #f8f8f8;
      border: 1px solid #ddd;
      padding: 10px;
      border-radius: 4px;
    }
    .actions {
      margin: 20px 0;
    }
    button {
      background-color: #3498db;
      color: white;
      border: none;
      padding: 10px 15px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }
    button:hover {
      background-color: #2980b9;
    }
    .truncate {
      max-width: 150px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .refresh {
      color: #888;
      font-size: 12px;
      margin-left: 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>UR Server Metrics Dashboard</h1>
    <div class="actions">
      <button onclick="location.reload()">Refresh Dashboard</button>
      <button onclick="fetch('/dashboard/reset').then(() => location.reload())">Reset Metrics</button>
      <span class="refresh">Last refreshed: ${new Date().toLocaleString()}</span>
    </div>

    <div class="grid">
      <div>
        <h2>Process ID Request Counts</h2>
        <table>
          <thead>
            <tr>
              <th>Process ID</th>
              <th>Request Count</th>
            </tr>
          </thead>
          <tbody>
            ${processEntries.map(([processId, count]) => `
              <tr>
                <td class="truncate" title="${processId}">${processId}</td>
                <td>${count}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div>
        <h2>Action Type Counts</h2>
        <table>
          <thead>
            <tr>
              <th>Action</th>
              <th>Request Count</th>
            </tr>
          </thead>
          <tbody>
            ${actionEntries.map(([action, count]) => `
              <tr>
                <td>${action}</td>
                <td>${count}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <h2>Response Time Analysis</h2>
    <table>
      <thead>
        <tr>
          <th>Process ID</th>
          <th>Action</th>
          <th>Avg (ms)</th>
          <th>Min (ms)</th>
          <th>Max (ms)</th>
          <th>Request Count</th>
        </tr>
      </thead>
      <tbody>
        ${timingEntries.map(([key, timing]) => {
          const [processId, action] = key.split(':');
          return `
            <tr>
              <td class="truncate" title="${processId}">${processId}</td>
              <td>${action || 'N/A'}</td>
              <td>${Math.round(timing.avg)}</td>
              <td>${timing.min}</td>
              <td>${timing.max}</td>
              <td>${timing.count}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>

    <h2>Recent Requests (Last ${recentRequests.length})</h2>
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Process ID</th>
          <th>Action</th>
          <th>Client IP</th>
          <th>Method</th>
          <th>Response Time (ms)</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        ${recentRequests.map((req, i) => `
          <tr>
            <td>${new Date(req.timestamp).toLocaleTimeString()}</td>
            <td class="truncate" title="${req.processId}">${req.processId}</td>
            <td>${req.action || 'N/A'}</td>
            <td>${req.clientIp}</td>
            <td>${req.method}</td>
            <td>${req.responseTime || 'N/A'}</td>
            <td>
              <button onclick="toggleDetails(${i})">Show Details</button>
              <div id="details-${i}" class="request-details" style="display: none;">
                ${JSON.stringify(req, null, 2)}
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <script>
    function toggleDetails(id) {
      const details = document.getElementById('details-' + id);
      if (details.style.display === 'none') {
        details.style.display = 'block';
      } else {
        details.style.display = 'none';
      }
    }
  </script>
</body>
</html>`;
};

/**
 * Mount dashboard routes on the Express app
 * @param {Object} app - Express app instance
 */
export function mountDashboard(app) {
  // Dashboard home route
  app.get('/dashboard', (req, res) => {
    const metrics = getMetrics();
    res.send(dashboardTemplate(metrics));
  });
  
  // Reset metrics route
  app.get('/dashboard/reset', (req, res) => {
    resetMetrics();
    res.redirect('/dashboard');
  });
}
