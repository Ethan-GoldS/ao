/**
 * Dashboard route for metrics display
 */
import express from 'express'
import { getMetrics, resetMetrics } from './metrics.js'
import { logger } from './logger.js'

export function setupDashboard(app) {
  const _logger = logger.child('dashboard')
  _logger('Setting up dashboard routes')
  
  // Route for dashboard UI
  app.get('/dashboard', (req, res) => {
    res.send(generateDashboardHtml())
  })
  
  // API route to get metrics data as JSON
  app.get('/api/metrics', (req, res) => {
    res.json(getMetrics())
  })
  
  // API route to reset metrics
  app.post('/api/metrics/reset', (req, res) => {
    resetMetrics()
    res.json({ success: true, message: 'Metrics reset successfully' })
  })
}

function generateDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UR Server Metrics Dashboard</title>
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      margin: 0;
      padding: 20px;
      color: #333;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    h1, h2, h3 {
      color: #2c3e50;
    }
    .dashboard-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }
    .card {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      padding: 20px;
      margin-bottom: 20px;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 20px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    th, td {
      padding: 12px 15px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background-color: #f8f9fa;
      font-weight: bold;
    }
    tr:hover {
      background-color: #f1f1f1;
    }
    .btn {
      background-color: #3498db;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }
    .btn:hover {
      background-color: #2980b9;
    }
    .chart-container {
      height: 300px;
      margin-top: 20px;
    }
    .tab-container {
      margin-bottom: 20px;
    }
    .tab-buttons {
      display: flex;
      border-bottom: 1px solid #ddd;
      margin-bottom: 15px;
    }
    .tab-btn {
      padding: 10px 20px;
      border: none;
      background: none;
      cursor: pointer;
      font-size: 16px;
      border-bottom: 3px solid transparent;
    }
    .tab-btn.active {
      border-bottom: 3px solid #3498db;
      font-weight: bold;
    }
    .tab-content {
      display: none;
    }
    .tab-content.active {
      display: block;
    }
    .metric-value {
      font-size: 24px;
      font-weight: bold;
      margin: 10px 0;
    }
    .refresh-controls {
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="dashboard-header">
      <h1>UR Server Metrics Dashboard</h1>
      <div>
        <button id="resetBtn" class="btn">Reset Metrics</button>
        <button id="refreshBtn" class="btn">Refresh Data</button>
      </div>
    </div>
    
    <div class="refresh-controls">
      <label>
        <input type="checkbox" id="autoRefresh"> Auto-refresh
      </label>
      <select id="refreshInterval">
        <option value="5000">5 seconds</option>
        <option value="10000" selected>10 seconds</option>
        <option value="30000">30 seconds</option>
        <option value="60000">1 minute</option>
      </select>
    </div>
    
    <div class="tab-container">
      <div class="tab-buttons">
        <button class="tab-btn active" data-tab="overview">Overview</button>
        <button class="tab-btn" data-tab="processes">Process Details</button>
        <button class="tab-btn" data-tab="actions">Action Details</button>
        <button class="tab-btn" data-tab="requests">Recent Requests</button>
      </div>
      
      <div id="overview" class="tab-content active">
        <div class="metrics-grid">
          <div class="card">
            <h3>Total Processes</h3>
            <div id="totalProcesses" class="metric-value">0</div>
          </div>
          <div class="card">
            <h3>Total Actions</h3>
            <div id="totalActions" class="metric-value">0</div>
          </div>
          <div class="card">
            <h3>Recent Requests</h3>
            <div id="totalRequests" class="metric-value">0</div>
          </div>
          <div class="card">
            <h3>Avg. Response Time</h3>
            <div id="avgResponseTime" class="metric-value">0 ms</div>
          </div>
        </div>
        
        <div class="card">
          <h3>Top Processes by Usage</h3>
          <div id="topProcessesChart" class="chart-container"></div>
        </div>
        
        <div class="card">
          <h3>Top Actions</h3>
          <div id="topActionsChart" class="chart-container"></div>
        </div>
      </div>
      
      <div id="processes" class="tab-content">
        <div class="card">
          <h3>Process Metrics</h3>
          <table id="processTable">
            <thead>
              <tr>
                <th>Process ID</th>
                <th>Count</th>
                <th>Avg. Duration (ms)</th>
                <th>Total Duration (ms)</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
      
      <div id="actions" class="tab-content">
        <div class="card">
          <h3>Action Metrics</h3>
          <table id="actionTable">
            <thead>
              <tr>
                <th>Action</th>
                <th>Count</th>
                <th>Avg. Duration (ms)</th>
                <th>Total Duration (ms)</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
      
      <div id="requests" class="tab-content">
        <div class="card">
          <h3>Recent Requests</h3>
          <table id="requestsTable">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Process ID</th>
                <th>Action</th>
                <th>Method</th>
                <th>URL</th>
                <th>IP</th>
                <th>Duration (ms)</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script>
    let charts = {};
    let refreshInterval;
    
    // Initialize tabs
    document.querySelectorAll('.tab-btn').forEach(button => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        button.classList.add('active');
        document.getElementById(button.dataset.tab).classList.add('active');
        
        // Refresh charts when switching tabs
        fetchMetrics();
      });
    });
    
    // Handle auto-refresh
    document.getElementById('autoRefresh').addEventListener('change', function() {
      if (this.checked) {
        const interval = parseInt(document.getElementById('refreshInterval').value);
        startAutoRefresh(interval);
      } else {
        stopAutoRefresh();
      }
    });
    
    document.getElementById('refreshInterval').addEventListener('change', function() {
      if (document.getElementById('autoRefresh').checked) {
        stopAutoRefresh();
        startAutoRefresh(parseInt(this.value));
      }
    });
    
    function startAutoRefresh(interval) {
      stopAutoRefresh();
      refreshInterval = setInterval(fetchMetrics, interval);
    }
    
    function stopAutoRefresh() {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    }
    
    // Reset metrics button
    document.getElementById('resetBtn').addEventListener('click', function() {
      if (confirm('Are you sure you want to reset all metrics?')) {
        fetch('/api/metrics/reset', { method: 'POST' })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              fetchMetrics();
            }
          });
      }
    });
    
    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', fetchMetrics);
    
    // Fetch metrics data
    function fetchMetrics() {
      fetch('/api/metrics')
        .then(response => response.json())
        .then(metrics => {
          updateDashboard(metrics);
        })
        .catch(error => console.error('Error fetching metrics:', error));
    }
    
    function updateDashboard(metrics) {
      // Update overview metrics
      document.getElementById('totalProcesses').textContent = Object.keys(metrics.processCounts).length;
      document.getElementById('totalActions').textContent = Object.keys(metrics.actionCounts).length;
      document.getElementById('totalRequests').textContent = metrics.recentRequests.length;
      
      // Calculate average response time across all processes
      let totalDuration = 0;
      let totalCount = 0;
      
      Object.values(metrics.processTimings).forEach(timing => {
        totalDuration += timing.totalDuration;
        totalCount += timing.count;
      });
      
      const avgResponseTime = totalCount > 0 ? Math.round(totalDuration / totalCount) : 0;
      document.getElementById('avgResponseTime').textContent = avgResponseTime + ' ms';
      
      // Update process table
      const processTableBody = document.querySelector('#processTable tbody');
      processTableBody.innerHTML = '';
      
      Object.entries(metrics.processTimings)
        .sort((a, b) => b[1].count - a[1].count)
        .forEach(([processId, timing]) => {
          const row = document.createElement('tr');
          row.innerHTML = \`
            <td title="\${processId}">\${truncateString(processId, 12)}</td>
            <td>\${timing.count}</td>
            <td>\${Math.round(timing.avgDuration)} ms</td>
            <td>\${timing.totalDuration} ms</td>
          \`;
          processTableBody.appendChild(row);
        });
      
      // Update action table
      const actionTableBody = document.querySelector('#actionTable tbody');
      actionTableBody.innerHTML = '';
      
      Object.entries(metrics.actionTimings)
        .sort((a, b) => b[1].count - a[1].count)
        .forEach(([action, timing]) => {
          const row = document.createElement('tr');
          row.innerHTML = \`
            <td>\${action || 'Unknown'}</td>
            <td>\${timing.count}</td>
            <td>\${Math.round(timing.avgDuration)} ms</td>
            <td>\${timing.totalDuration} ms</td>
          \`;
          actionTableBody.appendChild(row);
        });
      
      // Update requests table
      const requestsTableBody = document.querySelector('#requestsTable tbody');
      requestsTableBody.innerHTML = '';
      
      metrics.recentRequests.forEach(request => {
        const row = document.createElement('tr');
        const timestamp = new Date(request.timestamp).toLocaleString();
        row.innerHTML = \`
          <td>\${timestamp}</td>
          <td title="\${request.processId || 'N/A'}">\${truncateString(request.processId || 'N/A', 12)}</td>
          <td>\${request.action || 'N/A'}</td>
          <td>\${request.method}</td>
          <td>\${truncateString(request.url, 30)}</td>
          <td>\${request.ip}</td>
          <td>\${request.duration} ms</td>
        \`;
        requestsTableBody.appendChild(row);
      });
      
      // Only update charts if we're on the overview tab
      if (document.getElementById('overview').classList.contains('active')) {
        updateCharts(metrics);
      }
    }
    
    function updateCharts(metrics) {
      try {
        // Check if chart containers exist
        const processChartElement = document.getElementById('topProcessesChart');
        const actionChartElement = document.getElementById('topActionsChart');
        
        if (!processChartElement || !actionChartElement) {
          console.warn('Chart containers not found in DOM');
          return;
        }
        
        // Ensure canvas elements exist and are properly created
        if (!processChartElement.tagName || processChartElement.tagName.toLowerCase() !== 'canvas') {
          processChartElement.innerHTML = '';
          const canvas = document.createElement('canvas');
          canvas.id = 'processChartCanvas';
          processChartElement.appendChild(canvas);
          processChartElement.canvas = canvas;
        }
        
        if (!actionChartElement.tagName || actionChartElement.tagName.toLowerCase() !== 'canvas') {
          actionChartElement.innerHTML = '';
          const canvas = document.createElement('canvas');
          canvas.id = 'actionChartCanvas';
          actionChartElement.appendChild(canvas);
          actionChartElement.canvas = canvas;
        }
        
        // Prepare data for process chart
        const processLabels = [];
        const processCounts = [];
        
        Object.entries(metrics.processCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .forEach(([processId, count]) => {
            processLabels.push(truncateString(processId, 8));
            processCounts.push(count);
          });
        
        // Prepare data for action chart
        const actionLabels = [];
        const actionCounts = [];
        
        Object.entries(metrics.actionCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .forEach(([action, count]) => {
            actionLabels.push(action || 'Unknown');
            actionCounts.push(count);
          });
        
        // Get the chart contexts
        const processCtx = processChartElement.canvas ? processChartElement.canvas.getContext('2d') : null;
        const actionCtx = actionChartElement.canvas ? actionChartElement.canvas.getContext('2d') : null;
        
        if (!processCtx || !actionCtx) {
          console.warn('Could not get chart contexts');
          return;
        }
        
        // Configure chart options
        const chartOptions = {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Number of Requests'
              }
            }
          }
        };
        
        // Create/update process chart
        if (charts.processes) {
          charts.processes.data.labels = processLabels;
          charts.processes.data.datasets[0].data = processCounts;
          charts.processes.update();
        } else if (processCtx) {
          charts.processes = new Chart(processCtx, {
            type: 'bar',
            data: {
              labels: processLabels,
              datasets: [{
                label: 'Request Count',
                data: processCounts,
                backgroundColor: 'rgba(52, 152, 219, 0.6)',
                borderColor: 'rgba(52, 152, 219, 1)',
                borderWidth: 1
              }]
            },
            options: {
              ...chartOptions,
              scales: {
                ...chartOptions.scales,
                x: {
                  title: {
                    display: true,
                    text: 'Process ID'
                  }
                }
              }
            }
          });
        }
        
        // Create/update action chart
        if (charts.actions) {
          charts.actions.data.labels = actionLabels;
          charts.actions.data.datasets[0].data = actionCounts;
          charts.actions.update();
        } else if (actionCtx) {
          charts.actions = new Chart(actionCtx, {
            type: 'bar',
            data: {
              labels: actionLabels,
              datasets: [{
                label: 'Request Count',
                data: actionCounts,
                backgroundColor: 'rgba(46, 204, 113, 0.6)',
                borderColor: 'rgba(46, 204, 113, 1)',
                borderWidth: 1
              }]
            },
            options: {
              ...chartOptions,
              scales: {
                ...chartOptions.scales,
                x: {
                  title: {
                    display: true,
                    text: 'Action Type'
                  }
                }
              }
            }
          });
        }
      } catch (error) {
        console.error('Error updating charts:', error);
      }
    }
    
    function truncateString(str, maxLength) {
      if (!str) return 'N/A';
      return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
    }
    
    // Initial fetch
    fetchMetrics();
  </script>
</body>
</html>`;
}
