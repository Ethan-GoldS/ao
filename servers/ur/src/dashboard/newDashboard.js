/**
 * New AO Universal Router Dashboard
 * Uses direct PostgreSQL access for real-time metrics and visualizations
 */
import express from 'express';
import { logger } from '../logger.js';
import * as db from '../database.js';
import { config } from '../config.js';

const router = express.Router();
const _logger = logger.child('dashboard');

/**
 * Generate the dashboard HTML
 */
async function generateDashboardHtml(req) {
  try {
    // Get raw data from PostgreSQL
    const timeSeriesData = await db.getTimeSeriesData(72); // 3 days of data
    let processCounts = await db.getProcessCounts();
    const ipCounts = await db.getIpCounts();
    const actionCounts = await db.getActionCounts();
    const serverInfo = await db.getServerInfo();
    const recentRequests = await db.getRecentRequests(30);
    const dbInfo = await db.getDatabaseDiagnostics();
    
    // Format process data
    const processData = Object.entries(processCounts)
      .map(([id, data]) => ({
        id: id, 
        count: data.count || 0,
        totalDuration: data.totalDuration || 0,
        avgDuration: data.count ? Math.round(data.totalDuration / data.count) : 0
      }))
      .sort((a, b) => b.count - a.count);
    
    // Format IP data  
    const ipData = Object.entries(ipCounts)
      .map(([ip, count]) => ({ ip, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
      
    // Format action data
    const actionData = Object.entries(actionCounts)
      .map(([action, data]) => ({
        action: action || 'Unknown',
        count: data.count || 0,
        totalDuration: data.totalDuration || 0,
        avgDuration: data.count ? Math.round(data.totalDuration / data.count) : 0
      }))
      .sort((a, b) => b.count - a.count);
      
    // Process time series data for charts
    const processedTimeData = timeSeriesData.map(point => {
      // Normalize data points for consistency
      let processCounts = point.processCounts;
      
      // Parse JSONB if it's a string
      if (typeof processCounts === 'string') {
        try {
          processCounts = JSON.parse(processCounts);
        } catch (e) {
          processCounts = {};
        }
      }
      
      // Return standardized data point
      return {
        timestamp: point.timestamp,
        date: new Date(point.timestamp).toLocaleString(),
        requests: parseInt(point.totalRequests || point.total_requests || 0, 10),
        hour: parseInt(point.hour || new Date(point.timestamp).getUTCHours(), 10),
        processCounts: processCounts || {}
      };
    }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    // Format request details
    const requestDetails = recentRequests.map(req => {
      let details = req.details;
      
      // Parse JSONB if needed
      if (typeof details === 'string') {
        try {
          details = JSON.parse(details);
        } catch (e) {
          details = {};
        }
      }
      
      return {
        id: req.id,
        processId: req.process_id,
        timestamp: new Date(req.timestamp).toLocaleString(),
        ip: req.ip,
        referrer: req.referer,
        details: details
      };
    });
    
    // Gather environment info
    const envInfo = {
      usePostgres: config.usePostgres,
      dbUrl: config.dbUrl ? config.dbUrl.replace(/:\/\/[^:]+:[^@]+@/, '://****:****@') : 'Not configured',
      dbPoolSize: config.dbPoolSize,
      nodeEnv: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || 'Unknown'
    };
  
    // Generate dashboard HTML
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AO Universal Router Dashboard</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/moment@2.29.4/moment.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-moment@1.0.1/dist/chartjs-adapter-moment.min.js"></script>
  <style>
    :root {
      --primary-color: #0066cc;
      --secondary-color: #50b3ff;
      --accent-color: #ff5500;
      --text-color: #333;
      --bg-color: #f5f5f5;
      --card-color: #fff;
    }
    
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-color);
      line-height: 1.6;
      margin: 0;
      padding: 0;
    }
    
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
    }
    
    .dashboard-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid #ddd;
    }
    
    .dashboard-title {
      display: flex;
      align-items: center;
    }
    
    .dashboard-title h1 {
      margin: 0;
      font-weight: 500;
      color: var(--primary-color);
    }
    
    .dashboard-controls {
      display: flex;
      align-items: center;
      gap: 15px;
    }
    
    .last-updated {
      font-size: 14px;
      color: #666;
    }
    
    .btn-refresh {
      background-color: var(--primary-color);
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 500;
      transition: background-color 0.2s;
    }
    
    .btn-refresh:hover {
      background-color: #0055aa;
    }
    
    .stats-row {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      margin-bottom: 20px;
    }
    
    .stat-card {
      flex: 1;
      min-width: 200px;
      background-color: var(--card-color);
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    
    .stat-card h3 {
      margin-top: 0;
      color: #666;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 500;
    }
    
    .stat-value {
      font-size: 28px;
      font-weight: 600;
      color: var(--primary-color);
      margin: 10px 0;
    }
    
    .stat-desc {
      font-size: 12px;
      color: #666;
    }
    
    .card {
      background-color: var(--card-color);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      border-bottom: 1px solid #eee;
      padding-bottom: 10px;
    }
    
    .card-title {
      margin: 0;
      font-size: 18px;
      font-weight: 500;
      color: var(--primary-color);
    }
    
    .chart-container {
      position: relative;
      height: 300px;
      margin-bottom: 20px;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    
    th, td {
      padding: 12px 15px;
      text-align: left;
      border-bottom: 1px solid #eee;
    }
    
    th {
      background-color: #f8f9fa;
      font-weight: 500;
      color: #666;
    }
    
    tr:hover {
      background-color: #f8f9fa;
    }
    
    .truncate {
      max-width: 150px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
    }
    
    .badge {
      padding: 5px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }
    
    .badge-primary {
      background-color: var(--primary-color);
      color: white;
    }
    
    .time-controls {
      display: flex;
      gap: 15px;
      align-items: center;
      margin-bottom: 15px;
    }
    
    .time-control-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .time-control-label {
      font-size: 14px;
      color: #666;
    }
    
    select, input {
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
    }
    
    .tab-content {
      margin-top: 15px;
    }
    
    .tabs {
      display: flex;
      border-bottom: 1px solid #ddd;
      margin-bottom: 15px;
    }
    
    .tab {
      padding: 10px 15px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      font-weight: 500;
    }
    
    .tab.active {
      border-bottom-color: var(--primary-color);
      color: var(--primary-color);
    }
    
    .tab-pane {
      display: none;
    }
    
    .tab-pane.active {
      display: block;
    }
    
    .system-info {
      font-family: monospace;
      font-size: 13px;
      max-height: 200px;
      overflow: auto;
      background: #f5f5f5;
      padding: 15px;
      border-radius: 4px;
    }
    
    footer {
      text-align: center;
      padding: 20px;
      margin-top: 30px;
      border-top: 1px solid #ddd;
      color: #666;
      font-size: 14px;
    }
    
    @media (max-width: 768px) {
      .stats-row {
        flex-direction: column;
      }
      
      .stat-card {
        width: 100%;
      }
      
      .dashboard-header {
        flex-direction: column;
        align-items: flex-start;
      }
      
      .dashboard-controls {
        margin-top: 15px;
      }
      
      .time-controls {
        flex-wrap: wrap;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="dashboard-header">
      <div class="dashboard-title">
        <h1>AO Universal Router Dashboard</h1>
      </div>
      <div class="dashboard-controls">
        <div class="last-updated">Last updated: <span id="last-updated">${new Date().toLocaleString()}</span></div>
        <button class="btn-refresh" id="refresh-btn">Refresh Now</button>
      </div>
    </div>
    
    <div class="stats-row">
      <div class="stat-card">
        <h3>Total Requests</h3>
        <div class="stat-value">${(serverInfo?.totalRequests || 0).toLocaleString()}</div>
        <div class="stat-desc">Since ${serverInfo?.startTime ? new Date(serverInfo.startTime).toLocaleString() : 'startup'}</div>
      </div>
      <div class="stat-card">
        <h3>Unique Processes</h3>
        <div class="stat-value">${processData.length.toLocaleString()}</div>
        <div class="stat-desc">Distinct AO processes tracked</div>
      </div>
      <div class="stat-card">
        <h3>Unique IP Addresses</h3>
        <div class="stat-value">${ipData.length.toLocaleString()}</div>
        <div class="stat-desc">Distinct clients connected</div>
      </div>
      <div class="stat-card">
        <h3>Database Size</h3>
        <div class="stat-value">${dbInfo?.recordCounts?.reduce((acc, item) => acc + item.count, 0) || 0}</div>
        <div class="stat-desc">Total records across all tables</div>
      </div>
    </div>
    
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Request Traffic</h2>
        <div class="time-controls">
          <div class="time-control-group">
            <span class="time-control-label">Time Range:</span>
            <select id="time-range-select">
              <option value="6h">Last 6 hours</option>
              <option value="24h" selected>Last 24 hours</option>
              <option value="48h">Last 48 hours</option>
              <option value="7d">Last 7 days</option>
            </select>
          </div>
          <div class="time-control-group">
            <span class="time-control-label">Group By:</span>
            <select id="interval-select">
              <option value="5m">5 Minutes</option>
              <option value="15m">15 Minutes</option>
              <option value="30m">30 Minutes</option>
              <option value="1h" selected>1 Hour</option>
              <option value="6h">6 Hours</option>
              <option value="1d">1 Day</option>
            </select>
          </div>
        </div>
      </div>
      <div class="chart-container">
        <canvas id="traffic-chart"></canvas>
      </div>
    </div>
    
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Process Activity</h2>
      </div>
      <div class="tabs">
        <div class="tab active" data-tab="processes">Top Processes</div>
        <div class="tab" data-tab="ips">Client IPs</div>
        <div class="tab" data-tab="actions">Actions</div>
      </div>
      <div class="tab-content">
        <div class="tab-pane active" id="processes-tab">
          <table>
            <thead>
              <tr>
                <th>Process ID</th>
                <th>Requests</th>
                <th>Total Duration (ms)</th>
                <th>Avg. Duration (ms)</th>
              </tr>
            </thead>
            <tbody>
              ${processData.slice(0, 10).map(process => `
                <tr>
                  <td><div class="truncate" title="${process.id}">${process.id}</div></td>
                  <td>${process.count.toLocaleString()}</td>
                  <td>${process.totalDuration.toLocaleString()}</td>
                  <td>${process.avgDuration.toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="tab-pane" id="ips-tab">
          <table>
            <thead>
              <tr>
                <th>IP Address</th>
                <th>Requests</th>
              </tr>
            </thead>
            <tbody>
              ${ipData.map(ip => `
                <tr>
                  <td>${ip.ip}</td>
                  <td>${ip.count.toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="tab-pane" id="actions-tab">
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Requests</th>
                <th>Total Duration (ms)</th>
                <th>Avg. Duration (ms)</th>
              </tr>
            </thead>
            <tbody>
              ${actionData.map(action => `
                <tr>
                  <td>${action.action}</td>
                  <td>${action.count.toLocaleString()}</td>
                  <td>${action.totalDuration.toLocaleString()}</td>
                  <td>${action.avgDuration.toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Recent Requests</h2>
      </div>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Process</th>
            <th>IP</th>
            <th>Referrer</th>
          </tr>
        </thead>
        <tbody>
          ${requestDetails.map(req => `
            <tr>
              <td>${req.timestamp}</td>
              <td><div class="truncate" title="${req.processId}">${req.processId}</div></td>
              <td>${req.ip || 'N/A'}</td>
              <td>${req.referrer || 'N/A'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">System Information</h2>
      </div>
      <div class="tabs">
        <div class="tab active" data-tab="env">Environment</div>
        <div class="tab" data-tab="db">Database</div>
      </div>
      <div class="tab-content">
        <div class="tab-pane active" id="env-tab">
          <pre class="system-info">${JSON.stringify(envInfo, null, 2)}</pre>
        </div>
        <div class="tab-pane" id="db-tab">
          <pre class="system-info">${JSON.stringify(dbInfo, null, 2)}</pre>
        </div>
      </div>
    </div>
    
    <footer>
      AO Universal Router Dashboard | Version: ${envInfo.version} | Server Time: ${new Date().toLocaleString()}
    </footer>
  </div>
  
  <script>
    // Store the time series data for charts
    const timeSeriesData = ${JSON.stringify(processedTimeData)};
    
    // Set up traffic chart
    function setupTrafficChart() {
      const ctx = document.getElementById('traffic-chart').getContext('2d');
      
      // Process data for chart
      const chartData = timeSeriesData.map(point => ({
        x: new Date(point.timestamp),
        y: point.requests
      }));
      
      const trafficChart = new Chart(ctx, {
        type: 'line',
        data: {
          datasets: [{
            label: 'Requests',
            data: chartData,
            backgroundColor: 'rgba(0, 102, 204, 0.1)',
            borderColor: 'rgba(0, 102, 204, 1)',
            borderWidth: 2,
            pointBackgroundColor: 'rgba(0, 102, 204, 1)',
            pointRadius: 3,
            pointHoverRadius: 5,
            fill: true,
            tension: 0.2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              type: 'time',
              time: {
                unit: 'hour',
                displayFormats: {
                  hour: 'MMM D, HH:mm'
                },
                tooltipFormat: 'MMM D, YYYY, HH:mm'
              },
              title: {
                display: true,
                text: 'Time'
              }
            },
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Requests'
              }
            }
          },
          plugins: {
            tooltip: {
              mode: 'index',
              intersect: false
            },
            legend: {
              display: true,
              position: 'top'
            }
          }
        }
      });
      
      // Update chart based on time range and interval selection
      function updateChartRange() {
        const timeRange = document.getElementById('time-range-select').value;
        const interval = document.getElementById('interval-select').value;
        
        // Calculate time range
        const now = new Date();
        let startTime;
        
        switch(timeRange) {
          case '6h':
            startTime = new Date(now.getTime() - (6 * 60 * 60 * 1000));
            break;
          case '48h':
            startTime = new Date(now.getTime() - (48 * 60 * 60 * 1000));
            break;
          case '7d':
            startTime = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
            break;
          case '24h':
          default:
            startTime = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        }
        
        // Filter data for selected time range
        const filteredData = timeSeriesData.filter(point => {
          const timestamp = new Date(point.timestamp);
          return timestamp >= startTime && timestamp <= now;
        });
        
        // Group data by interval
        const groupedData = groupDataByInterval(filteredData, interval);
        
        // Update chart
        trafficChart.data.datasets[0].data = groupedData.map(group => ({
          x: new Date(group.timestamp),
          y: group.requests
        }));
        
        // Update time unit based on interval
        let timeUnit = 'hour';
        let format = 'MMM D, HH:mm';
        
        switch(interval) {
          case '5m':
          case '15m':
          case '30m':
            timeUnit = 'minute';
            format = 'HH:mm';
            break;
          case '6h':
            timeUnit = 'hour';
            format = 'MMM D, HH:mm';
            break;
          case '1d':
            timeUnit = 'day';
            format = 'MMM D';
            break;
          default:
            timeUnit = 'hour';
            format = 'MMM D, HH:mm';
        }
        
        trafficChart.options.scales.x.time.unit = timeUnit;
        trafficChart.options.scales.x.time.displayFormats[timeUnit] = format;
        
        trafficChart.update();
      }
      
      // Group data function
      function groupDataByInterval(data, interval) {
        if (!data.length) return [];
        
        // Determine bucket size in minutes
        let bucketSizeMinutes;
        
        switch(interval) {
          case '5m': bucketSizeMinutes = 5; break;
          case '15m': bucketSizeMinutes = 15; break;
          case '30m': bucketSizeMinutes = 30; break;
          case '1h': bucketSizeMinutes = 60; break;
          case '6h': bucketSizeMinutes = 360; break;
          case '1d': bucketSizeMinutes = 1440; break;
          default: bucketSizeMinutes = 60;
        }
        
        const bucketSizeMs = bucketSizeMinutes * 60 * 1000;
        const buckets = {};
        
        // Group data into buckets
        data.forEach(point => {
          const timestamp = new Date(point.timestamp);
          // Round to nearest bucket
          const bucketTime = new Date(Math.floor(timestamp.getTime() / bucketSizeMs) * bucketSizeMs);
          const bucketKey = bucketTime.getTime();
          
          if (!buckets[bucketKey]) {
            buckets[bucketKey] = {
              timestamp: bucketTime,
              requests: 0
            };
          }
          
          buckets[bucketKey].requests += point.requests;
        });
        
        // Convert buckets to array and sort
        return Object.values(buckets).sort((a, b) => a.timestamp - b.timestamp);
      }
      
      // Set up event listeners
      document.getElementById('time-range-select').addEventListener('change', updateChartRange);
      document.getElementById('interval-select').addEventListener('change', updateChartRange);
      
      // Initialize with default selections
      updateChartRange();
      
      return trafficChart;
    }
    
    // Tab functionality
    function setupTabs() {
      const tabs = document.querySelectorAll('.tab');
      
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          // Get the tab group
          const tabGroup = tab.parentElement;
          const tabContentId = tabGroup.nextElementSibling.id;
          
          // Remove active class from all tabs in this group
          tabGroup.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          
          // Add active class to clicked tab
          tab.classList.add('active');
          
          // Get the tab pane ID
          const tabId = tab.getAttribute('data-tab');
          
          // Hide all tab panes
          document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
          
          // Show the selected tab pane
          document.getElementById(tabId + '-tab').classList.add('active');
        });
      });
    }
    
    // Refresh functionality
    function setupRefresh() {
      document.getElementById('refresh-btn').addEventListener('click', () => {
        window.location.reload();
      });
    }
    
    // Initialize dashboard
    document.addEventListener('DOMContentLoaded', () => {
      setupTrafficChart();
      setupTabs();
      setupRefresh();
    });
  </script>
</body>
</html>`;
  } catch (err) {
    _logger('Error generating dashboard HTML: %O', err);
    return `
      <html>
        <head><title>Dashboard Error</title></head>
        <body>
          <h1>Dashboard Error</h1>
          <p>Error generating dashboard: ${err.message}</p>
          <pre>${err.stack}</pre>
          <p><a href="javascript:window.location.reload()">Retry</a></p>
        </body>
      </html>
    `;
  }
}

// Main dashboard route
router.get('/', async (req, res) => {
  try {
    const html = await generateDashboardHtml(req);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    _logger('Error rendering dashboard: %O', err);
    res.status(500).send(`Dashboard Error: ${err.message}`);
  }
});

// Export the router
export default router;
