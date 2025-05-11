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
      <!-- No meta refresh tag - using AJAX for updates -->
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/luxon@3.4.3/build/global/luxon.min.js"></script>
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
        .refresh-btn, .apply-btn {
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
        .time-controls {
          display: flex;
          flex-wrap: wrap;
          gap: 20px;
          margin-bottom: 20px;
          padding: 15px;
          background: #f9f9f9;
          border-radius: 4px;
          border: 1px solid #eee;
        }
        .time-range-selector, .time-preset-selector, .interval-selector {
          flex: 1;
          min-width: 250px;
        }
        .time-range-inputs {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: flex-end;
        }
        .time-input-group {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .time-input-group input {
          padding: 6px;
          border: 1px solid #ddd;
          border-radius: 3px;
        }
        .preset-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }
        .time-preset {
          background: #f2f2f2;
          border: 1px solid #ddd;
          border-radius: 3px;
          padding: 5px 10px;
          cursor: pointer;
          font-size: 0.9em;
        }
        .time-preset.active {
          background: #0066cc;
          color: white;
          border-color: #0055aa;
        }
        .interval-selector select {
          padding: 6px;
          border: 1px solid #ddd;
          border-radius: 3px;
          width: 100%;
          max-width: 200px;
        }
        #loading-indicator {
          display: none;
          margin-left: 10px;
          font-style: italic;
          color: #666;
        }
      </style>
    </head>
    <body>
      <h1>AO Router Metrics Dashboard</h1>
      <div class="timestamp">
        <span id="refresh-status">Auto-refreshes every 5 seconds</span> - 
        Last updated: <span id="last-updated">' + new Date().toISOString() + '</span>
        <button id="toggle-refresh" class="refresh-btn">Pause</button>
        <span id="loading-indicator">Loading...</span>
      </div>
      
      <div class="stats-overview">
        <div class="stat-box">
          <div class="stat-number">' + metrics.totalRequests + '</div>
          <div class="stat-label">Total Requests</div>
        </div>
        <div class="stat-box">
          <div class="stat-number">' + Object.keys(metrics.processCounts).length + '</div>
          <div class="stat-label">Unique Process IDs</div>
        </div>
        <div class="stat-box">
          <div class="stat-number">' + Object.keys(metrics.actionCounts).length + '</div>
          <div class="stat-label">Different Actions</div>
        </div>
        <div class="stat-box">
          <div class="stat-number">' + Object.keys(metrics.ipCounts).length + '</div>
          <div class="stat-label">Unique IPs</div>
        </div>
      </div>
      
      <div class="card">
        <h2>Traffic Overview</h2>
        
        <div class="time-controls">
          <div class="time-range-selector">
            <h3>Time Range</h3>
            <div class="time-range-inputs">
              <div class="time-input-group">
                <label for="start-date">Start:</label>
                <input type="datetime-local" id="start-date" name="start-date">
              </div>
              <div class="time-input-group">
                <label for="end-date">End:</label>
                <input type="datetime-local" id="end-date" name="end-date">
              </div>
              <button id="apply-time-range" class="apply-btn">Apply Range</button>
            </div>
          </div>
          
          <div class="time-preset-selector">
            <h3>Quick Presets</h3>
            <div class="preset-buttons">
              <button class="time-preset" data-minutes="15">15m</button>
              <button class="time-preset" data-minutes="30">30m</button>
              <button class="time-preset active" data-hours="1">1h</button>
              <button class="time-preset" data-hours="3">3h</button>
              <button class="time-preset" data-hours="6">6h</button>
              <button class="time-preset" data-hours="12">12h</button>
              <button class="time-preset" data-hours="24">24h</button>
              <button class="time-preset" data-days="3">3d</button>
              <button class="time-preset" data-days="7">7d</button>
            </div>
          </div>
          
          <div class="interval-selector">
            <h3>Time Interval</h3>
            <select id="time-interval">
              <option value="minute" selected>Minutes</option>
              <option value="5minute">5 Minutes</option>
              <option value="15minute">15 Minutes</option>
              <option value="30minute">30 Minutes</option>
              <option value="hour">Hours</option>
              <option value="day">Days</option>
            </select>
          </div>
        </div>
        
        <div class="chart-container">
          <canvas id="timeSeriesChart"></canvas>
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
            ' + (recentRequestsHtml || '<tr><td colspan="6">No requests recorded yet</td></tr>') + '
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
            ' + (processMetricsHtml || '<tr><td colspan="4">No process metrics recorded yet</td></tr>') + '
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
            ' + (actionMetricsHtml || '<tr><td colspan="3">No action metrics recorded yet</td></tr>') + '
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
              ' + (ipMetricsHtml || '<tr><td colspan="2">No IP metrics recorded yet</td></tr>') + '
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
              ' + (referrerMetricsHtml || '<tr><td colspan="2">No referrer metrics recorded yet</td></tr>') + '
            </tbody>
          </table>
        </div>
      </div>
      
      <script>
        // Initial data from server - this will be refreshed via AJAX
        let timeLabels = ' + JSON.stringify(timeLabels) + ';
        let timeSeriesData = ' + JSON.stringify(timeSeriesData) + ';
        
        // Store all metrics data for AJAX updates
        let allMetricsData = {
          recentRequests: ' + JSON.stringify(metrics.recentRequests) + ',
          processCounts: ' + JSON.stringify(metrics.processCounts) + ',
          actionCounts: ' + JSON.stringify(metrics.actionCounts) + ',
          processTiming: ' + JSON.stringify(Object.entries(metrics.processTiming).reduce((acc, [processId, data]) => {
            acc[processId] = {
              ...data,
              avgDuration: data.count > 0 ? data.totalDuration / data.count : 0
            };
            return acc;
          }, {})) + ',
          actionTiming: ' + JSON.stringify(Object.entries(metrics.actionTiming).reduce((acc, [action, data]) => {
            acc[action] = {
              ...data,
              avgDuration: data.count > 0 ? data.totalDuration / data.count : 0
            };
            return acc;
          }, {})) + ',
          totalRequests: ' + (metrics.totalRequests || 0) + ',
          timeSeriesData: ' + JSON.stringify(metrics.timeSeriesData) + '
        };
        
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
        
        // Current time range settings
        let currentTimeRange = {
          start: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago (default view)
          end: new Date(),
          interval: 'minute' // Default interval for 1-hour view
        };
        
        // Initialize datetime pickers with current range
        initDateTimePickers();
        
        // Show initial time range
        updateChartWithTimeRange();
        
        // Time range selection functions
        function initDateTimePickers() {
          const startPicker = document.getElementById('start-date');
          const endPicker = document.getElementById('end-date');
          
          // Format dates for datetime-local input
          const formatDateForInput = (date) => {
            return date.toISOString().slice(0, 16); // Format as YYYY-MM-DDTHH:MM
          };
          
          // Set initial values
          startPicker.value = formatDateForInput(currentTimeRange.start);
          endPicker.value = formatDateForInput(currentTimeRange.end);
          
          // Apply time range button
          document.getElementById('apply-time-range').addEventListener('click', function() {
            // Get values from pickers
            const startDate = new Date(startPicker.value);
            const endDate = new Date(endPicker.value);
            
            // Validate dates
            if (startDate >= endDate) {
              alert('Start date must be before end date');
              return;
            }
            
            // Update current time range
            currentTimeRange.start = startDate;
            currentTimeRange.end = endDate;
            
            // Update charts with new range
            updateChartWithTimeRange();
          });
        }
        
        // Time preset buttons
        document.querySelectorAll('.time-preset').forEach(button => {
          button.addEventListener('click', function() {
            // Clear active state from all buttons
            document.querySelectorAll('.time-preset').forEach(b => b.classList.remove('active'));
            
            // Set this button as active
            this.classList.add('active');
            
            // Calculate new time range based on preset
            const now = new Date();
            let startDate = new Date(now);
            
            if (this.dataset.minutes) {
              startDate.setMinutes(now.getMinutes() - parseInt(this.dataset.minutes, 10));
            } else if (this.dataset.hours) {
              startDate.setHours(now.getHours() - parseInt(this.dataset.hours, 10));
            } else if (this.dataset.days) {
              startDate.setDate(now.getDate() - parseInt(this.dataset.days, 10));
            }
            
            // Update time range
            currentTimeRange.start = startDate;
            currentTimeRange.end = now;
            
            // Update pickers
            document.getElementById('start-date').value = startDate.toISOString().slice(0, 16);
            document.getElementById('end-date').value = now.toISOString().slice(0, 16);
            
            // Update chart
            updateChartWithTimeRange();
          });
        });
        
        // Interval selector
        document.getElementById('time-interval').addEventListener('change', function() {
          currentTimeRange.interval = this.value;
          updateChartWithTimeRange();
        });
        
        // Function to update chart based on time range
        function updateChartWithTimeRange() {
          // Extract time series data within range
          const filteredData = processTimeSeriesData(allMetricsData.timeSeriesData, currentTimeRange);
          
          // Update chart
          timeSeriesChart.data.labels = filteredData.labels;
          timeSeriesChart.data.datasets[0].data = filteredData.values;
          timeSeriesChart.update();
        }
        
        // Process time series data based on time range and interval
        function processTimeSeriesData(timeSeriesData, timeRange) {
          // Convert timestamps to Date objects for comparison
          const startTime = timeRange.start.getTime();
          const endTime = timeRange.end.getTime();
          
          // Filter data within time range
          let filteredData = timeSeriesData.filter(point => {
            const pointTime = new Date(point.timestamp).getTime();
            return pointTime >= startTime && pointTime <= endTime;
          });
          
          // If no data in range, return empty arrays
          if (filteredData.length === 0) {
            return { labels: [], values: [] };
          }
          
          // Sort by time (oldest first)
          filteredData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          
          // Extract labels and values based on interval
          let labels = [];
          let values = [];
          
          // Format labels based on interval
          filteredData.forEach(point => {
            const date = new Date(point.timestamp);
            let label = '';
            
            switch(timeRange.interval) {
              case 'minute':
                label = date.getHours() + ':' + date.getMinutes().toString().padStart(2, '0');
                break;
              case '5minute':
              case '15minute':
              case '30minute':
                label = date.getHours() + ':' + date.getMinutes().toString().padStart(2, '0');
                break;
              case 'hour':
                label = date.getHours() + ':00';
                break;
              case 'day':
                label = (date.getMonth()+1) + '/' + date.getDate();
                break;
              default:
                label = date.toLocaleTimeString();
            }
            
            labels.push(label);
            values.push(point.totalRequests);
          });
          
          return { labels, values };
        }
        
        // AJAX-based refresh functionality
        let refreshInterval;
        let isRefreshing = true;
        const refreshButton = document.getElementById('toggle-refresh');
        const refreshStatus = document.getElementById('refresh-status');
        const lastUpdatedSpan = document.getElementById('last-updated');
        const loadingIndicator = document.getElementById('loading-indicator');
        
        function startAutoRefresh() {
          refreshInterval = setInterval(function() {
            if (isRefreshing) {
              fetchUpdatedMetrics();
            }
          }, 5000); // Refresh every 5 seconds
        }
        
        refreshButton.addEventListener('click', function() {
          isRefreshing = !isRefreshing;
          
          if (isRefreshing) {
            refreshButton.textContent = 'Pause';
            refreshButton.classList.remove('paused');
            refreshStatus.textContent = 'Auto-refreshes every 5 seconds';
            // Perform immediate refresh when resuming
            fetchUpdatedMetrics();
          } else {
            refreshButton.textContent = 'Resume';
            refreshButton.classList.add('paused');
            refreshStatus.textContent = 'Auto-refresh paused';
          }
        });
        
        // Function to fetch updated metrics via AJAX
        function fetchUpdatedMetrics() {
          loadingIndicator.style.display = 'inline-block';
          
          // Create an API endpoint for fetching only metrics data
          fetch('/dashboard/api/metrics')
            .then(response => response.json())
            .then(data => {
              // Update the metrics data
              allMetricsData = data;
              
              // Update UI with new data
              updateDashboardWithNewData();
              
              // Update last updated timestamp
              lastUpdatedSpan.textContent = new Date().toISOString();
              loadingIndicator.style.display = 'none';
            })
            .catch(error => {
              console.error('Error fetching metrics:', error);
              loadingIndicator.style.display = 'none';
            });
        }
        
        // Function to update all dashboard elements with new data
        function updateDashboardWithNewData() {
          // Update time series chart
          updateChartWithTimeRange();
          
          // Update total requests counters
          updateStatCounters();
          
          // Update tables
          updateRequestsTable();
          updateProcessTable();
          updateActionTable();
          updateClientTables();
        }
        
        function updateStatCounters() {
          // Update stat counters
          document.querySelectorAll('.stat-box').forEach(box => {
            const statType = box.dataset.stat;
            const numberEl = box.querySelector('.stat-number');
            
            if (statType === 'totalRequests') {
              numberEl.textContent = allMetricsData.totalRequests;
            } else if (statType === 'uniqueProcesses') {
              numberEl.textContent = Object.keys(allMetricsData.processCounts).length;
            } else if (statType === 'uniqueActions') {
              numberEl.textContent = Object.keys(allMetricsData.actionCounts).length;
            } else if (statType === 'uniqueIps') {
              numberEl.textContent = allMetricsData.ipCounts?.length || 0;
            }
          });
        }
        
        function updateRequestsTable() {
          const tbody = document.querySelector('#requests-tab tbody');
          if (!tbody || !allMetricsData.recentRequests) return;
          
          // Generate HTML for requests table
          const recentRequestsHtml = allMetricsData.recentRequests.map((req, index) => {
            // Create detailed dropdown content similar to original rendering
            const details = allMetricsData.requestDetails?.[req.processId] || [];
            const detail = details.length > 0 ? details[0] : null;
            
            // Create dropdown HTML similar to original
            const detailsHtml = detail ? '
              <div class="details-content">
                <h4>Request Details</h4>
                <table class="details-table">
                  <tr><td>Method:</td><td>' + (detail.method || 'N/A') + '</td></tr>
                  <tr><td>Path:</td><td>' + (detail.path || 'N/A') + '</td></tr>
                  <tr><td>IP Address:</td><td>' + (detail.ip || 'N/A') + '</td></tr>
                  <tr><td>User Agent:</td><td>' + (detail.userAgent || 'N/A') + '</td></tr>
                  <tr><td>Referrer:</td><td>' + (detail.referer || 'N/A') + '</td></tr>
                  <tr><td>Origin:</td><td>' + (detail.origin || 'N/A') + '</td></tr>
                  <tr><td>Content Type:</td><td>' + (detail.contentType || 'N/A') + '</td></tr>
                </table>
              </div>
            ' : '<div class="details-content">No additional details available</div>';
            
            return '
              <tr>
                <td>' + req.timestamp + '</td>
                <td>
                  <details>
                    <summary>' + req.processId + '</summary>
                    <div class="process-details">
                      ' + detailsHtml + '
                    </div>
                  </details>
                </td>
                <td>' + (req.action || 'N/A') + '</td>
                <td>' + req.ip + '</td>
                <td>' + req.duration + 'ms</td>
                <td>
                  <button class="copy-btn" data-id="' + req.processId + '" title="Copy Process ID">
                    Copy ID
                  </button>
                </td>
              </tr>
            ';
          }).join('');
          
          // Update table content
          tbody.innerHTML = recentRequestsHtml || '<tr><td colspan="6">No requests recorded yet</td></tr>';
          
          // Re-attach copy button listeners to newly created buttons
          attachCopyButtonListeners();
        }
        
        function updateProcessTable() {
          const tbody = document.querySelector('#processes-tab tbody');
          if (!tbody) return;
          
          // Generate HTML for process table similar to original rendering
          const processMetricsHtml = Object.entries(allMetricsData.processCounts || {})
            .sort((a, b) => b[1] - a[1]) // Sort by count descending
            .map(([processId, count]) => {
              const timing = allMetricsData.processTiming?.[processId] || { avgDuration: 0 };
              return '
                <tr>
                  <td>
                    <details>
                      <summary>' + processId + '</summary>
                      <div class="process-details">
                        <h4>Process Request History</h4>
                        <p>Historical data available in chart above</p>
                      </div>
                    </details>
                  </td>
                  <td>' + count + '</td>
                  <td>' + (timing.avgDuration ? timing.avgDuration.toFixed(2) : '0.00') + 'ms</td>
                  <td>
                    <button class="copy-btn" data-id="' + processId + '" title="Copy Process ID">
                      Copy ID
                    </button>
                  </td>
                </tr>
              ';
            }).join('');
            
          // Update table
          tbody.innerHTML = processMetricsHtml || '<tr><td colspan="4">No process metrics recorded yet</td></tr>';
          
          // Re-attach copy button listeners
          attachCopyButtonListeners();
        }
        
        function updateActionTable() {
          const tbody = document.querySelector('#actions-tab tbody');
          if (!tbody) return;
          
          // Generate action metrics HTML
          const actionMetricsHtml = Object.entries(allMetricsData.actionCounts || {})
            .sort((a, b) => b[1] - a[1]) // Sort by count descending
            .map(([action, count]) => {
              const timing = allMetricsData.actionTiming?.[action] || { avgDuration: 0 };
              return '
                <tr class="action-row" data-action="' + action + '">
                  <td>' + action + '</td>
                  <td>' + count + '</td>
                  <td>' + (timing.avgDuration ? timing.avgDuration.toFixed(2) : '0.00') + 'ms</td>
                </tr>
              ';
            }).join('');
          
          // Update table
          tbody.innerHTML = actionMetricsHtml || '<tr><td colspan="3">No action metrics recorded yet</td></tr>';
        }
        
        function updateClientTables() {
          // Update IP table
          const ipTbody = document.querySelector('#clients-tab .card:first-child tbody');
          if (ipTbody && allMetricsData.ipCounts) {
            const ipMetricsHtml = allMetricsData.ipCounts
              .map(([ip, count]) => '
                <tr>
                  <td>' + ip + '</td>
                  <td>' + count + '</td>
                </tr>
              ').join('');
              
            ipTbody.innerHTML = ipMetricsHtml || '<tr><td colspan="2">No IP metrics recorded yet</td></tr>';
          }
          
          // Update referrer table
          const refTbody = document.querySelector('#clients-tab .card:last-child tbody');
          if (refTbody && allMetricsData.referrerCounts) {
            const referrerMetricsHtml = allMetricsData.referrerCounts
              .map(([referrer, count]) => '
                <tr>
                  <td>' + referrer + '</td>
                  <td>' + count + '</td>
                </tr>
              ').join('');
              
            refTbody.innerHTML = referrerMetricsHtml || '<tr><td colspan="2">No referrer metrics recorded yet</td></tr>';
          }
        }
        
        function attachCopyButtonListeners() {
          document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', function() {
              const textToCopy = this.dataset.id;
              navigator.clipboard.writeText(textToCopy).then(() => {
                const originalText = this.innerText;
                this.innerText = 'Copied!';
                setTimeout(() => {
                  this.innerText = originalText;
                }, 1000);
              });
            });
          });
        }
        
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
 * Mount dashboard routes on app
 */
export function mountDashboard(app) {
  _logger('Mounting dashboard routes')
  
  // Main dashboard HTML page
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
  
  // API endpoint for metrics data (for AJAX updates)
  app.get('/dashboard/api/metrics', (req, res) => {
    try {
      // Get metrics data in JSON format
      const metrics = getMetrics()
      res.json(metrics)
    } catch (err) {
      _logger('Error fetching metrics data: %O', err)
      res.status(500).json({ error: 'Error fetching metrics data' })
    }
  })
  
  return app
}
