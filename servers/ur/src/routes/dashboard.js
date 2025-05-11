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
  const metrics = getMetrics();
  
  // Generate recent requests table with dropdowns for details
  const recentRequestsHtml = metrics.recentRequests.map((req, index) => {
    // Try to get request details for this process ID
    const details = metrics.requestDetails[req.processId] || [];
    const detail = details.length > 0 ? details[0] : null;
    
    // Create detailed dropdown content
    const detailsHtml = detail ? `
      <div class="details-content">
        <h4>Request Details</h4>
        <table class="details-table">
          <tr><td>Method:</td><td>${detail.method || 'N/A'}</td></tr>
          <tr><td>Path:</td><td>${detail.path || 'N/A'}</td></tr>
          <tr><td>IP Address:</td><td>${detail.ip || 'N/A'}</td></tr>
          <tr><td>User Agent:</td><td>${detail.userAgent || 'N/A'}</td></tr>
          <tr><td>Referrer:</td><td>${detail.referer || 'N/A'}</td></tr>
          <tr><td>Origin:</td><td>${detail.origin || 'N/A'}</td></tr>
          <tr><td>Content Type:</td><td>${detail.contentType || 'N/A'}</td></tr>
        </table>
      </div>
    ` : '<div class="details-content">No additional details available</div>';
    
    return `
      <tr>
        <td>${req.timestamp}</td>
        <td>
          <details>
            <summary>${req.processId}</summary>
            <div class="process-details">
              ${detailsHtml}
            </div>
          </details>
        </td>
        <td>${req.action || 'N/A'}</td>
        <td>${req.ip}</td>
        <td>${req.duration}ms</td>
        <td>
          <button class="copy-btn" data-id="${req.processId}" title="Copy Process ID">
            Copy ID
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Generate time series chart data for visualization
  const timeLabels = metrics.timeSeriesData.map(bucket => {
    const date = new Date(bucket.timestamp);
    return `${date.getHours()}:00`;
  });
  
  const timeSeriesData = metrics.timeSeriesData.map(bucket => bucket.totalRequests);
  
  // Get top process IDs for time series chart
  const allProcessIds = Object.keys(metrics.processCounts);
  const topProcessIds = allProcessIds
    .sort((a, b) => metrics.processCounts[b] - metrics.processCounts[a])
    .slice(0, 5);
    
  // Generate process metrics table with time charts
  const processMetricsHtml = Object.entries(metrics.processCounts)
    .sort((a, b) => b[1] - a[1]) // Sort by count descending
    .map(([processId, count]) => {
      const timing = metrics.processTiming[processId] || { avgDuration: 0 };
      const isTopProcess = topProcessIds.includes(processId);
      
      // Create process-specific time series data
      const processTimeData = metrics.timeSeriesData.map(bucket => 
        bucket.processCounts[processId] || 0
      );
      
      return `
        <tr>
          <td>
            <details>
              <summary>${processId}</summary>
              <div class="process-details">
                <h4>Process Request History</h4>
                ${isTopProcess ? 
                  `<div class="mini-chart" data-process-id="${processId}" data-time-labels='${JSON.stringify(timeLabels)}' data-values='${JSON.stringify(processTimeData)}'></div>` : 
                  '<p>Not enough data for visualization</p>'}
              </div>
            </details>
          </td>
          <td>${count}</td>
          <td>${timing.avgDuration.toFixed(2)}ms</td>
          <td>
            <button class="copy-btn" data-id="${processId}" title="Copy Process ID">
              Copy ID
            </button>
          </td>
        </tr>
      `;
    }).join('');

  // Generate action metrics table with filtering
  const actionMetricsHtml = Object.entries(metrics.actionCounts)
    .sort((a, b) => b[1] - a[1]) // Sort by count descending
    .map(([action, count]) => {
      const timing = metrics.actionTiming[action] || { avgDuration: 0 };
      return `
        <tr class="action-row" data-action="${action}">
          <td>${action}</td>
          <td>${count}</td>
          <td>${timing.avgDuration.toFixed(2)}ms</td>
        </tr>
      `;
    }).join('');
    
  // Generate IP address metrics
  const ipMetricsHtml = metrics.ipCounts
    .map(([ip, count]) => `
      <tr>
        <td>${ip}</td>
        <td>${count}</td>
      </tr>
    `).join('');
    
  // Generate referrer metrics
  const referrerMetricsHtml = metrics.referrerCounts
    .map(([referrer, count]) => `
      <tr>
        <td>${referrer}</td>
        <td>${count}</td>
      </tr>
    `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>AO Router Metrics Dashboard</title>
      <!-- Auto-refresh handled by JavaScript instead of meta tag -->
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          padding: 20px;
          line-height: 1.6;
          color: #333;
          max-width: 1200px;
          margin: 0 auto;
        }
        h1, h2, h3, h4 {
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
        .stats-overview {
          display: flex;
          justify-content: space-between;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }
        .stat-box {
          flex: 1;
          min-width: 200px;
          margin: 0 10px 10px 0;
          padding: 15px;
          background: #f8f9fa;
          border-radius: 4px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
          text-align: center;
        }
        .stat-number {
          font-size: 2em;
          font-weight: bold;
          color: #0066cc;
        }
        .stat-label {
          font-size: 0.9em;
          color: #666;
        }
        .chart-container {
          position: relative;
          height: 300px;
          margin: 15px 0;
        }
        .mini-chart {
          height: 150px;
          margin: 10px 0;
        }
        .tabs {
          display: flex;
          margin-bottom: 20px;
        }
        .tab {
          padding: 8px 15px;
          cursor: pointer;
          background: #f2f2f2;
          border: 1px solid #ddd;
          border-bottom: none;
          margin-right: 5px;
          border-radius: 4px 4px 0 0;
        }
        .tab.active {
          background: #fff;
          font-weight: bold;
        }
        .tab-content {
          display: none;
          border: 1px solid #ddd;
          padding: 15px;
          border-radius: 0 4px 4px 4px;
        }
        .tab-content.active {
          display: block;
        }
        details {
          margin: 5px 0;
        }
        summary {
          cursor: pointer;
          padding: 5px;
          background: #f8f9fa;
          border-radius: 3px;
        }
        .process-details, .details-content {
          padding: 10px;
          margin-top: 5px;
          background: #f9f9f9;
          border: 1px solid #eee;
          border-radius: 3px;
        }
        .copy-btn {
          background: #0066cc;
          color: white;
          border: none;
          padding: 4px 8px;
          border-radius: 3px;
          cursor: pointer;
          font-size: 0.8em;
        }
        .copy-btn:hover {
          background: #0055aa;
        }
        .details-table {
          margin: 10px 0;
          font-size: 0.9em;
        }
        .details-table td:first-child {
          font-weight: bold;
          width: 120px;
        }
        .slider-container {
          margin: 20px 0;
        }
        #timeRangeSlider {
          width: 100%;
        }
        #sliderValue {
          text-align: center;
          font-weight: bold;
          margin-top: 5px;
        }
        .filter-group {
          margin-bottom: 15px;
        }
        .filter-input {
          padding: 5px;
          width: 200px;
        }
        .refresh-btn {
          background: #0066cc;
          color: white;
          border: none;
          padding: 4px 8px;
          border-radius: 3px;
          cursor: pointer;
          margin-left: 10px;
        }
        .refresh-btn.paused {
          background: #cc4400;
        }
      </style>
    </head>
    <body>
      <h1>AO Router Metrics Dashboard</h1>
      <div class="timestamp">
        <span id="refresh-status">Auto-refreshes every 5 seconds</span> - 
        Last updated: <span id="last-updated">${new Date().toISOString()}</span>
        <button id="toggle-refresh" class="refresh-btn">Pause</button>
      </div>
      
      <div class="stats-overview">
        <div class="stat-box">
          <div class="stat-number">${metrics.totalRequests}</div>
          <div class="stat-label">Total Requests</div>
        </div>
        <div class="stat-box">
          <div class="stat-number">${Object.keys(metrics.processCounts).length}</div>
          <div class="stat-label">Unique Process IDs</div>
        </div>
        <div class="stat-box">
          <div class="stat-number">${Object.keys(metrics.actionCounts).length}</div>
          <div class="stat-label">Different Actions</div>
        </div>
        <div class="stat-box">
          <div class="stat-number">${metrics.ipCounts.length}</div>
          <div class="stat-label">Unique IPs</div>
        </div>
      </div>
      
      <div class="card">
        <h2>Traffic Overview</h2>
        <div class="chart-container">
          <canvas id="timeSeriesChart"></canvas>
        </div>
        <div class="slider-container">
          <input type="range" min="1" max="24" value="24" id="timeRangeSlider">
          <div id="sliderValue">Last 24 hours</div>
        </div>
      </div>
      
      <div class="tabs">
        <div class="tab active" data-tab="requests">Recent Requests</div>
        <div class="tab" data-tab="processes">Process Metrics</div>
        <div class="tab" data-tab="actions">Action Metrics</div>
        <div class="tab" data-tab="clients">Client Metrics</div>
      </div>
      
      <div class="tab-content active" id="requests-tab">
        <div class="filter-group">
          <input type="text" class="filter-input" id="requestFilter" placeholder="Filter requests..." />
        </div>
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Process ID</th>
              <th>Action</th>
              <th>IP</th>
              <th>Duration</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${recentRequestsHtml || '<tr><td colspan="6">No requests recorded yet</td></tr>'}
          </tbody>
        </table>
      </div>
      
      <div class="tab-content" id="processes-tab">
        <div class="filter-group">
          <input type="text" class="filter-input" id="processFilter" placeholder="Filter by process ID..." />
        </div>
        <table>
          <thead>
            <tr>
              <th>Process ID</th>
              <th>Request Count</th>
              <th>Average Duration</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${processMetricsHtml || '<tr><td colspan="4">No process metrics recorded yet</td></tr>'}
          </tbody>
        </table>
        <div class="chart-container">
          <h3>Top Process IDs by Request Count</h3>
          <canvas id="topProcessesChart"></canvas>
        </div>
      </div>
      
      <div class="tab-content" id="actions-tab">
        <div class="filter-group">
          <input type="text" class="filter-input" id="actionFilter" placeholder="Filter by action..." />
        </div>
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
        <div class="chart-container">
          <h3>Actions by Request Count</h3>
          <canvas id="actionsChart"></canvas>
        </div>
      </div>
      
      <div class="tab-content" id="clients-tab">
        <div class="card">
          <h3>Top IP Addresses</h3>
          <table>
            <thead>
              <tr>
                <th>IP Address</th>
                <th>Request Count</th>
              </tr>
            </thead>
            <tbody>
              ${ipMetricsHtml || '<tr><td colspan="2">No IP metrics recorded yet</td></tr>'}
            </tbody>
          </table>
        </div>
        
        <div class="card">
          <h3>Top Referrers</h3>
          <table>
            <thead>
              <tr>
                <th>Referrer</th>
                <th>Request Count</th>
              </tr>
            </thead>
            <tbody>
              ${referrerMetricsHtml || '<tr><td colspan="2">No referrer metrics recorded yet</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
      
      <script>
        // Initialize time series chart - reverse the arrays to show most recent data on the right
        const timeLabels = ${JSON.stringify(timeLabels.reverse())};
        const timeSeriesData = ${JSON.stringify(timeSeriesData.reverse())};
        
        const timeCtx = document.getElementById('timeSeriesChart').getContext('2d');
        const timeSeriesChart = new Chart(timeCtx, {
          type: 'line',
          data: {
            labels: timeLabels,
            datasets: [{
              label: 'Requests per Hour',
              data: timeSeriesData,
              backgroundColor: 'rgba(0, 102, 204, 0.2)',
              borderColor: 'rgba(0, 102, 204, 1)',
              borderWidth: 2,
              tension: 0.1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true,
                title: {
                  display: true,
                  text: 'Number of Requests'
                }
              },
              x: {
                title: {
                  display: true,
                  text: 'Hour'
                }
              }
            }
          }
        });
        
        // Process chart
        const processLabels = ${JSON.stringify(topProcessIds.map(id => id.substring(0, 8) + '...'))};        
        const processData = ${JSON.stringify(topProcessIds.map(id => metrics.processCounts[id]))};        
        
        const processCtx = document.getElementById('topProcessesChart').getContext('2d');
        const processChart = new Chart(processCtx, {
          type: 'bar',
          data: {
            labels: processLabels,
            datasets: [{
              label: 'Requests per Process',
              data: processData,
              backgroundColor: [
                'rgba(54, 162, 235, 0.5)',
                'rgba(75, 192, 192, 0.5)',
                'rgba(255, 159, 64, 0.5)',
                'rgba(255, 99, 132, 0.5)',
                'rgba(153, 102, 255, 0.5)'
              ],
              borderColor: [
                'rgba(54, 162, 235, 1)',
                'rgba(75, 192, 192, 1)',
                'rgba(255, 159, 64, 1)',
                'rgba(255, 99, 132, 1)',
                'rgba(153, 102, 255, 1)'
              ],
              borderWidth: 1
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
        
        // Action chart
        const actionLabels = ${JSON.stringify(Object.keys(metrics.actionCounts).slice(0, 5))};        
        const actionData = ${JSON.stringify(Object.keys(metrics.actionCounts).slice(0, 5)
          .map(action => metrics.actionCounts[action]))};        
        
        const actionCtx = document.getElementById('actionsChart').getContext('2d');
        const actionChart = new Chart(actionCtx, {
          type: 'pie',
          data: {
            labels: actionLabels,
            datasets: [{
              data: actionData,
              backgroundColor: [
                'rgba(54, 162, 235, 0.5)',
                'rgba(75, 192, 192, 0.5)',
                'rgba(255, 159, 64, 0.5)',
                'rgba(255, 99, 132, 0.5)',
                'rgba(153, 102, 255, 0.5)'
              ],
              borderColor: [
                'rgba(54, 162, 235, 1)',
                'rgba(75, 192, 192, 1)',
                'rgba(255, 159, 64, 1)',
                'rgba(255, 99, 132, 1)',
                'rgba(153, 102, 255, 1)'
              ],
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false
          }
        });
        
        // Initialize mini charts for process details
        document.querySelectorAll('.mini-chart').forEach(chartElem => {
          const processId = chartElem.dataset.processId;
          const timeLabels = JSON.parse(chartElem.dataset.timeLabels);
          const values = JSON.parse(chartElem.dataset.values);
          
          const canvas = document.createElement('canvas');
          chartElem.appendChild(canvas);
          
          new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
              labels: timeLabels,
              datasets: [{
                label: 'Requests',
                data: values,
                backgroundColor: 'rgba(0, 102, 204, 0.2)',
                borderColor: 'rgba(0, 102, 204, 1)',
                borderWidth: 2,
                tension: 0.1
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: {
                  display: false
                }
              },
              scales: {
                y: {
                  beginAtZero: true
                }
              }
            }
          });
        });
        
        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
          tab.addEventListener('click', () => {
            // Deactivate all tabs and hide content
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            // Activate clicked tab
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab + '-tab').classList.add('active');
          });
        });
        
        // Copy button functionality
        document.querySelectorAll('.copy-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const textToCopy = btn.dataset.id;
            navigator.clipboard.writeText(textToCopy).then(() => {
              const originalText = btn.innerText;
              btn.innerText = 'Copied!';
              setTimeout(() => {
                btn.innerText = originalText;
              }, 1000);
            });
          });
        });
        
        // Time range slider
        const slider = document.getElementById('timeRangeSlider');
        const sliderValue = document.getElementById('sliderValue');
        
        // Initialize with full data range
        let currentDisplayHours = 24;
        
        // Show proper time range initially
        timeSeriesChart.data.labels = timeLabels.slice(0, currentDisplayHours);
        timeSeriesChart.data.datasets[0].data = timeSeriesData.slice(0, currentDisplayHours);
        timeSeriesChart.update();
        
        slider.addEventListener('input', function() {
          const hours = parseInt(this.value);
          currentDisplayHours = hours;
          sliderValue.innerText = 'Last ' + hours + (hours == 1 ? ' hour' : ' hours');
          
          // Always include the most recent hour (index 0) and then add the requested number of hours
          // Since arrays are already reversed with most recent first (at index 0)
          timeSeriesChart.data.labels = timeLabels.slice(0, hours);
          timeSeriesChart.data.datasets[0].data = timeSeriesData.slice(0, hours);
          timeSeriesChart.update();
        });
        
        // Auto-refresh functionality
        let refreshInterval;
        let isRefreshing = true;
        const refreshButton = document.getElementById('toggle-refresh');
        const refreshStatus = document.getElementById('refresh-status');
        const lastUpdatedSpan = document.getElementById('last-updated');
        
        function startAutoRefresh() {
          refreshInterval = setInterval(function() {
            if (isRefreshing) {
              window.location.reload();
            }
          }, 5000); // Refresh every 5 seconds
        }
        
        refreshButton.addEventListener('click', function() {
          isRefreshing = !isRefreshing;
          
          if (isRefreshing) {
            refreshButton.textContent = 'Pause';
            refreshButton.classList.remove('paused');
            refreshStatus.textContent = 'Auto-refreshes every 5 seconds';
          } else {
            refreshButton.textContent = 'Resume';
            refreshButton.classList.add('paused');
            refreshStatus.textContent = 'Auto-refresh paused';
          }
        });
        
        // Start auto-refresh when page loads
        startAutoRefresh();
        
        // Filter functionality
        document.getElementById('requestFilter').addEventListener('input', function() {
          const filterValue = this.value.toLowerCase();
          const rows = document.querySelectorAll('#requests-tab tbody tr');
          
          rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(filterValue) ? '' : 'none';
          });
        });
        
        document.getElementById('processFilter').addEventListener('input', function() {
          const filterValue = this.value.toLowerCase();
          const rows = document.querySelectorAll('#processes-tab tbody tr');
          
          rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(filterValue) ? '' : 'none';
          });
        });
        
        document.getElementById('actionFilter').addEventListener('input', function() {
          const filterValue = this.value.toLowerCase();
          const rows = document.querySelectorAll('#actions-tab tbody tr');
          
          rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(filterValue) ? '' : 'none';
          });
        });
      </script>
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
