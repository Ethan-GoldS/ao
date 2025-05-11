/**
 * Dashboard routes and UI for metrics visualization
 */
import express from 'express';
import { metricsService } from './metrics.js';

export function setupDashboard(app) {
  // Create router for dashboard routes
  const router = express.Router();
  
  // API endpoint to get metrics data
  router.get('/api/metrics', (req, res) => {
    res.json(metricsService.getStats());
  });

  // Dashboard HTML page
  router.get('/dashboard', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UR Server Metrics Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/moment"></script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 20px;
      background-color: #f5f5f7;
      color: #333;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    h1 {
      margin: 0;
      color: #333;
    }
    .refresh-btn {
      padding: 8px 16px;
      background-color: #007aff;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }
    .stat-cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
    }
    .card {
      background: white;
      border-radius: 10px;
      padding: 15px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
    }
    .card h2 {
      margin-top: 0;
      font-size: 16px;
      color: #666;
    }
    .card .value {
      font-size: 28px;
      font-weight: bold;
      margin: 10px 0;
    }
    .chart-container {
      margin-bottom: 20px;
      background: white;
      border-radius: 10px;
      padding: 15px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
    }
    .chart {
      height: 300px;
    }
    .table-container {
      background: white;
      border-radius: 10px;
      padding: 15px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
      margin-bottom: 20px;
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 10px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background-color: #f5f5f7;
    }
    .top-items {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 15px;
    }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 12px;
      background-color: #e6e6e6;
      font-size: 12px;
      margin-right: 5px;
    }
    .success { background-color: #d4edda; color: #155724; }
    .warning { background-color: #fff3cd; color: #856404; }
    .danger { background-color: #f8d7da; color: #721c24; }
    .code {
      font-family: monospace;
      background-color: #f5f5f5;
      padding: 2px 4px;
      border-radius: 3px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>UR Server Metrics Dashboard</h1>
      <button id="refresh-btn" class="refresh-btn">Refresh Data</button>
    </div>
    
    <div class="stat-cards" id="stat-cards">
      <!-- Will be filled dynamically -->
    </div>
    
    <div class="chart-container">
      <h2>Response Times</h2>
      <div class="chart">
        <canvas id="responseTimeChart"></canvas>
      </div>
    </div>
    
    <div class="top-items">
      <div class="table-container">
        <h2>Top Processes</h2>
        <table id="top-processes-table">
          <thead>
            <tr>
              <th>Process ID</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            <!-- Will be filled dynamically -->
          </tbody>
        </table>
      </div>
      
      <div class="table-container">
        <h2>Top Actions</h2>
        <table id="top-actions-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            <!-- Will be filled dynamically -->
          </tbody>
        </table>
      </div>
      
      <div class="table-container">
        <h2>Top Endpoints</h2>
        <table id="top-endpoints-table">
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            <!-- Will be filled dynamically -->
          </tbody>
        </table>
      </div>
    </div>
    
    <div class="table-container">
      <h2>Recent Requests</h2>
      <table id="recent-requests-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Method</th>
            <th>Path</th>
            <th>Process ID</th>
            <th>Status</th>
            <th>Response Time</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <!-- Will be filled dynamically -->
        </tbody>
      </table>
    </div>
  </div>

  <script>
    // Format time function
    function formatTime(ms) {
      if (ms < 1000) return ms + 'ms';
      if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
      return Math.floor(ms / 60000) + 'm ' + (Math.floor(ms / 1000) % 60) + 's';
    }
    
    // Format timestamp
    function formatTimestamp(timestamp) {
      const date = new Date(timestamp);
      return date.toLocaleTimeString();
    }

    // Fetch metrics data
    async function fetchMetrics() {
      try {
        const response = await fetch('/api/metrics');
        const data = await response.json();
        renderDashboard(data);
      } catch (error) {
        console.error('Error fetching metrics:', error);
      }
    }

    // Chart instance
    let responseTimeChart;

    // Render dashboard with data
    function renderDashboard(data) {
      // Render stat cards
      const statCards = document.getElementById('stat-cards');
      statCards.innerHTML = \`
        <div class="card">
          <h2>Total Requests</h2>
          <div class="value">\${data.totalRequests}</div>
        </div>
        <div class="card">
          <h2>Avg Response Time</h2>
          <div class="value">\${data.avgResponseTime.toFixed(2)}ms</div>
        </div>
        <div class="card">
          <h2>p50 Response Time</h2>
          <div class="value">\${data.p50ResponseTime.toFixed(2)}ms</div>
        </div>
        <div class="card">
          <h2>p90 Response Time</h2>
          <div class="value">\${data.p90ResponseTime.toFixed(2)}ms</div>
        </div>
        <div class="card">
          <h2>p99 Response Time</h2>
          <div class="value">\${data.p99ResponseTime.toFixed(2)}ms</div>
        </div>
        <div class="card">
          <h2>Uptime</h2>
          <div class="value">\${formatTime(data.uptime)}</div>
        </div>
      \`;

      // Render top processes
      const topProcessesTable = document.getElementById('top-processes-table').querySelector('tbody');
      topProcessesTable.innerHTML = '';
      data.topProcesses.forEach(([processId, count]) => {
        const row = document.createElement('tr');
        row.innerHTML = \`
          <td><span class="code">\${processId}</span></td>
          <td>\${count}</td>
        \`;
        topProcessesTable.appendChild(row);
      });

      // Render top actions
      const topActionsTable = document.getElementById('top-actions-table').querySelector('tbody');
      topActionsTable.innerHTML = '';
      data.topActions.forEach(([action, count]) => {
        const row = document.createElement('tr');
        row.innerHTML = \`
          <td>\${action || 'Unknown'}</td>
          <td>\${count}</td>
        \`;
        topActionsTable.appendChild(row);
      });

      // Render top endpoints
      const topEndpointsTable = document.getElementById('top-endpoints-table').querySelector('tbody');
      topEndpointsTable.innerHTML = '';
      data.topEndpoints.forEach(([endpoint, count]) => {
        const row = document.createElement('tr');
        row.innerHTML = \`
          <td>\${endpoint}</td>
          <td>\${count}</td>
        \`;
        topEndpointsTable.appendChild(row);
      });

      // Render recent requests
      const recentRequestsTable = document.getElementById('recent-requests-table').querySelector('tbody');
      recentRequestsTable.innerHTML = '';
      data.recentRequests.forEach(request => {
        const row = document.createElement('tr');
        
        // Determine status class
        let statusClass = '';
        if (request.statusCode < 300) statusClass = 'success';
        else if (request.statusCode < 400) statusClass = 'warning';
        else statusClass = 'danger';
        
        row.innerHTML = \`
          <td>\${formatTimestamp(request.timestamp)}</td>
          <td>\${request.method}</td>
          <td>\${request.path}</td>
          <td><span class="code">\${request.processId || '-'}</span></td>
          <td><span class="badge \${statusClass}">\${request.statusCode || '-'}</span></td>
          <td>\${request.responseTime ? request.responseTime + 'ms' : '-'}</td>
          <td>\${request.action || '-'}</td>
        \`;
        recentRequestsTable.appendChild(row);
      });

      // Render chart
      const labels = data.recentRequests.map(r => formatTimestamp(r.timestamp)).reverse();
      const responseTimesData = data.recentRequests.map(r => r.responseTime).reverse();
      
      if (responseTimeChart) {
        responseTimeChart.data.labels = labels;
        responseTimeChart.data.datasets[0].data = responseTimesData;
        responseTimeChart.update();
      } else {
        const ctx = document.getElementById('responseTimeChart').getContext('2d');
        responseTimeChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [{
              label: 'Response Time (ms)',
              data: responseTimesData,
              backgroundColor: 'rgba(0, 122, 255, 0.2)',
              borderColor: 'rgba(0, 122, 255, 1)',
              borderWidth: 2,
              tension: 0.4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true
              }
            }
          }
        });
      }
    }

    // Initial fetch
    fetchMetrics();

    // Set up refresh interval (every 5 seconds)
    const refreshInterval = setInterval(fetchMetrics, 5000);

    // Manual refresh button
    document.getElementById('refresh-btn').addEventListener('click', fetchMetrics);
  </script>
</body>
</html>
    `);
  });
  
  // Register all dashboard routes
  app.use('/', router);
}
