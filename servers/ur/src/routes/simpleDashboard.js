/**
 * Simple metrics dashboard that directly pulls from PostgreSQL
 */
import express from 'express';
import { logger } from '../logger.js';
import * as db from '../database.js';

const router = express.Router();
const _logger = logger.child('simple-dashboard');

// Generate a simple HTML dashboard
router.get('/', async (req, res) => {
  try {
    // Get data directly from PostgreSQL
    const timeSeriesData = await db.getTimeSeriesData(48);
    let processCountsData = await db.getProcessCounts();
    let dbDiagnostics = await db.getDatabaseDiagnostics();
    let serverInfo = await db.getServerInfo();

    // Parse process counts
    processCountsData = Object.entries(processCountsData || {})
      .map(([id, data]) => ({
        id: id,
        count: data.count || 0,
        totalDuration: data.totalDuration || 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Generate HTML
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Simple Metrics Dashboard</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          h1, h2 { color: #333; }
          .card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          .stat-box { display: inline-block; padding: 15px; margin: 10px; min-width: 120px; background: #f9f9f9; border-radius: 8px; text-align: center; }
          .stat-box h3 { margin: 0 0 10px 0; font-size: 16px; }
          .stat-box .number { font-size: 24px; font-weight: bold; color: #0066cc; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background-color: #f2f2f2; }
          tr:hover { background-color: #f5f5f5; }
          .chart-container { position: relative; height: 300px; margin: 20px 0; }
          .text-center { text-align: center; }
          .refresh-btn { background: #0066cc; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; }
          .refresh-btn:hover { background: #0055aa; }
          .last-updated { font-size: 12px; color: #666; margin-bottom: 10px; }
          .debug-info { font-family: monospace; font-size: 12px; max-height: 200px; overflow: auto; background: #f0f0f0; padding: 10px; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="text-center">
            <h1>AO Universal Router Metrics</h1>
            <p class="last-updated">Last updated: ${new Date().toLocaleString()}</p>
            <button class="refresh-btn" onclick="window.location.reload()">Refresh Dashboard</button>
          </div>
          
          <div class="card">
            <h2>Overview</h2>
            <div class="stat-box">
              <h3>Total Requests</h3>
              <div class="number">${serverInfo?.totalRequests?.toLocaleString() || 0}</div>
            </div>
            <div class="stat-box">
              <h3>Unique Processes</h3>
              <div class="number">${processCountsData.length}</div>
            </div>
            <div class="stat-box">
              <h3>Uptime</h3>
              <div class="number">${serverInfo?.startTime ? getUptimeString(new Date(serverInfo.startTime)) : 'N/A'}</div>
            </div>
          </div>
          
          <div class="card">
            <h2>Time Series Data (${timeSeriesData.length} points)</h2>
            <div class="chart-container">
              <canvas id="timeSeriesChart"></canvas>
            </div>
          </div>
          
          <div class="card">
            <h2>Top Processes</h2>
            <table>
              <tr>
                <th>Process ID</th>
                <th>Request Count</th>
                <th>Total Duration (ms)</th>
                <th>Avg. Duration (ms)</th>
              </tr>
              ${processCountsData.map(process => `
                <tr>
                  <td title="${process.id}">${process.id.substring(0, 15)}...</td>
                  <td>${process.count.toLocaleString()}</td>
                  <td>${process.totalDuration.toLocaleString()}</td>
                  <td>${Math.round(process.totalDuration / process.count).toLocaleString()}</td>
                </tr>
              `).join('')}
            </table>
          </div>
          
          <div class="card">
            <h2>Database Diagnostics</h2>
            <pre class="debug-info">${JSON.stringify(dbDiagnostics, null, 2)}</pre>
          </div>
        </div>
        
        <script>
          // Create time series chart
          const ctx = document.getElementById('timeSeriesChart').getContext('2d');
          
          // Process the time series data
          const timeSeriesData = ${JSON.stringify(timeSeriesData)};
          
          // Format dates for chart
          const formattedData = timeSeriesData.map(item => {
            // Parse process counts if it's a string
            let processCounts = item.processCounts;
            if (typeof processCounts === 'string') {
              try {
                processCounts = JSON.parse(processCounts);
              } catch (e) {
                processCounts = {};
              }
            }
            
            return {
              timestamp: new Date(item.timestamp),
              requests: item.totalRequests || item.total_requests || 0,
              processCounts: processCounts
            };
          });
          
          // Sort by timestamp
          formattedData.sort((a, b) => a.timestamp - b.timestamp);
          
          // Create labels and data arrays
          const labels = formattedData.map(item => {
            const d = item.timestamp;
            return d.getMonth() + 1 + '/' + d.getDate() + ' ' + 
                   d.getHours() + ':' + d.getMinutes().toString().padStart(2, '0');
          });
          
          const requestCounts = formattedData.map(item => item.requests);
          
          // Create chart
          const chart = new Chart(ctx, {
            type: 'line',
            data: {
              labels: labels,
              datasets: [{
                label: 'Requests',
                data: requestCounts,
                backgroundColor: 'rgba(0, 102, 204, 0.2)',
                borderColor: 'rgba(0, 102, 204, 1)',
                borderWidth: 2,
                pointBackgroundColor: 'rgba(0, 102, 204, 1)',
                tension: 0.2
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
                    text: 'Request Count'
                  }
                },
                x: {
                  title: {
                    display: true,
                    text: 'Time'
                  }
                }
              },
              plugins: {
                tooltip: {
                  callbacks: {
                    title: function(tooltipItems) {
                      const idx = tooltipItems[0].dataIndex;
                      return 'Time: ' + formattedData[idx].timestamp.toLocaleString();
                    }
                  }
                }
              }
            }
          });
          
          // Helper function to format time
          function formatTime(time) {
            return time.toString().padStart(2, '0');
          }
        </script>
      </body>
      </html>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    _logger('Error generating simple dashboard: %O', err);
    res.status(500).send(`<h1>Error</h1><pre>${err.stack}</pre>`);
  }
});

// Helper function to calculate uptime string
function getUptimeString(startTime) {
  const now = new Date();
  const diff = now - startTime;
  
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  
  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

export default router;
