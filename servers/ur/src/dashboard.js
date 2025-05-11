/**
 * Dashboard HTML generator for metrics visualization
 */
import { getMetrics } from './metrics.js'

/**
 * Generate HTML for the metrics dashboard
 * @returns {String} HTML content
 */
export function generateDashboardHtml() {
  const { processMetrics, actionMetrics, recentRequests } = getMetrics()
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UR Server Metrics Dashboard</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    h1, h2, h3 {
      color: #444;
    }
    .dashboard-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-gap: 20px;
    }
    @media (max-width: 768px) {
      .dashboard-grid {
        grid-template-columns: 1fr;
      }
    }
    .card {
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
      padding: 20px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 10px;
      text-align: left;
      border-bottom: 1px solid #eee;
    }
    th {
      background-color: #f8f8f8;
    }
    tr:hover {
      background-color: #f5f5f5;
    }
    .truncate {
      max-width: 200px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: inline-block;
    }
    .timestamp {
      color: #777;
      font-size: 0.9em;
    }
    .refresh-button {
      padding: 10px 15px;
      background-color: #4CAF50;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      margin-bottom: 20px;
    }
    .refresh-button:hover {
      background-color: #45a049;
    }
    .metrics-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  </style>
</head>
<body>
  <div class="metrics-header">
    <h1>UR Server Metrics Dashboard</h1>
    <button class="refresh-button" onclick="window.location.reload()">Refresh</button>
  </div>
  
  <div class="dashboard-grid">
    <div class="card">
      <h2>Process ID Metrics (Top ${processMetrics.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Process ID</th>
            <th>Request Count</th>
            <th>Avg Response Time (ms)</th>
            <th>Last Seen</th>
          </tr>
        </thead>
        <tbody>
          ${processMetrics.map(process => `
            <tr>
              <td><span class="truncate" title="${process.processId}">${process.processId}</span></td>
              <td>${process.count}</td>
              <td>${process.avgResponseTime}</td>
              <td><span class="timestamp">${new Date(process.lastSeen).toLocaleString()}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    
    <div class="card">
      <h2>Action Type Metrics (Top ${actionMetrics.length})</h2>
      <table>
        <thead>
          <tr>
            <th>Action</th>
            <th>Request Count</th>
            <th>Avg Response Time (ms)</th>
          </tr>
        </thead>
        <tbody>
          ${actionMetrics.map(action => `
            <tr>
              <td>${action.action}</td>
              <td>${action.count}</td>
              <td>${action.avgResponseTime}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>
  
  <div class="card">
    <h2>Recent Requests (Last ${recentRequests.length})</h2>
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Process ID</th>
          <th>Action</th>
          <th>IP Address</th>
          <th>Response Time (ms)</th>
          <th>Path</th>
        </tr>
      </thead>
      <tbody>
        ${recentRequests.map(req => `
          <tr>
            <td><span class="timestamp">${new Date(req.timestamp).toLocaleString()}</span></td>
            <td><span class="truncate" title="${req.processId}">${req.processId}</span></td>
            <td>${req.action}</td>
            <td>${req.ip}</td>
            <td>${req.responseTime}</td>
            <td><span class="truncate" title="${req.path}">${req.path}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  
  <div class="card">
    <h2>Process ID Details</h2>
    ${processMetrics.map(process => `
      <div>
        <h3><span class="truncate" title="${process.processId}">${process.processId}</span></h3>
        <p>Total Requests: ${process.count} | Avg Time: ${process.avgResponseTime}ms | First Seen: ${new Date(process.firstSeen).toLocaleString()} | Last Seen: ${new Date(process.lastSeen).toLocaleString()}</p>
        <table>
          <thead>
            <tr>
              <th>Action</th>
              <th>Count</th>
              <th>Avg Response Time (ms)</th>
            </tr>
          </thead>
          <tbody>
            ${process.actions.map(action => `
              <tr>
                <td>${action.action}</td>
                <td>${action.count}</td>
                <td>${action.avgResponseTime}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `).join('')}
  </div>
  
  <script>
    // Auto-refresh every 30 seconds
    setTimeout(() => window.location.reload(), 30000);
  </script>
</body>
</html>
  `
}
