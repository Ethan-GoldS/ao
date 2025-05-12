/**
 * Main dashboard module
 * Imports and assembles all dashboard components
 */
import { getDashboardStyles } from './styles.js';
import { initializeTimeControls, getTimeChartScript } from './timeChart.js';
import { 
  generateRecentRequestsTable, 
  generateProcessMetricsTable, 
  generateActionMetricsTable,
  generateClientMetricsTable,
  getFilterScript 
} from './metricsTables.js';
import { generateRefreshControls, getRefreshControlsScript } from './refreshControls.js';
import { generateAnalyticsPanel, getAnalyticsPanelScript, getAnalyticsPanelStyles } from './analyticsPanel.js';
import { logger } from '../logger.js';

const _logger = logger.child('dashboard');

/**
 * Generate the complete dashboard HTML
 * @param {Object} metrics The metrics data from the metrics service
 * @returns {String} Complete HTML for the dashboard
 */
export function generateDashboardHtml(metrics) {
  _logger('Generating dashboard HTML with metrics data');
  
  // Apply robust fallbacks and defaults for all metrics properties
  // This follows the same pattern used in PITokenClient for handling various response formats
  metrics.recentRequests = metrics.recentRequests || [];
  metrics.actionCounts = metrics.actionCounts || {};
  metrics.processCounts = metrics.processCounts || {};
  metrics.clientMetrics = metrics.clientMetrics || { ipCounts: [], referrerCounts: [] };
  metrics.requestDetails = metrics.requestDetails || {};
  
  // Prepare data for process metrics table with full error handling
  const processCounts = metrics.processCounts || {};
  const allProcessIds = Object.keys(processCounts);
  const topProcessIds = allProcessIds
    .sort((a, b) => processCounts[b] - processCounts[a])
    .slice(0, 5);
    
  // Add top process IDs to metrics
  metrics.topProcessIds = topProcessIds;
  
  // Ensure timeSeriesData exists to prevent errors
  metrics.timeSeriesData = metrics.timeSeriesData || [];
  
  // Get time labels for charts with proper error handling
  metrics.timeLabels = metrics.timeSeriesData.length > 0 ? 
    metrics.timeSeriesData.map(bucket => {
      try {
        if (!bucket || !bucket.timestamp) return '--:--';
        const date = new Date(bucket.timestamp);
        return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
      } catch (err) {
        return '--:--'; // Fallback for invalid date
      }
    }) : [];
  
  // Generate each section of the dashboard
  const lastUpdated = new Date().toISOString();
  const refreshControls = generateRefreshControls(lastUpdated);
  
  // Generate the new advanced analytics panel - ensure we have valid data
  // Add a fallback for empty time series data
  const timeSeriesData = metrics.timeSeriesData || [];
  const analyticsPanel = generateAnalyticsPanel(timeSeriesData);
  
  // Generate the traditional dashboard components (we'll keep these for backward compatibility)
  const timeControls = initializeTimeControls(metrics.timeSeriesData);
  const recentRequestsTable = generateRecentRequestsTable(metrics.recentRequests, metrics.requestDetails);
  const processMetricsTable = generateProcessMetricsTable(metrics);
  const actionMetricsTable = generateActionMetricsTable(metrics);
  const clientMetricsTable = generateClientMetricsTable(metrics);
  
  // Generate the overview stats
  const statsOverview = `
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
  `;
  
  // Get all JavaScript for the dashboard
  const dashboardScripts = `
    ${getTimeChartScript(metrics.timeSeriesData)}
    
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

    ${getFilterScript()}
    
    ${getRefreshControlsScript()}
    
    // Initialize the chart
    initializeTimeChart();
  `;
  
  // Assemble the complete HTML
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>AO Router Metrics Dashboard</title>
      <style>
        ${getDashboardStyles()}
        ${getAnalyticsPanelStyles()}
        
        /* Tab styles */
        .tab-container {
          margin-bottom: 1rem;
        }
        
        .tabs {
          display: flex;
          list-style: none;
          padding: 0;
          margin: 0;
          border-bottom: 1px solid #ddd;
        }
        
        .tab-button {
          padding: 0.75rem 1.5rem;
          background-color: #f1f1f1;
          border: none;
          cursor: pointer;
          transition: background-color 0.3s;
          font-size: 1rem;
          border-top-left-radius: 4px;
          border-top-right-radius: 4px;
        }
        
        .tab-button:hover {
          background-color: #ddd;
        }
        
        .tab-button.active {
          background-color: #fff;
          border: 1px solid #ddd;
          border-bottom: 1px solid white;
          margin-bottom: -1px;
          font-weight: bold;
        }
        
        .tab-content {
          display: none;
          padding: 1rem;
          background-color: white;
          border: 1px solid #ddd;
          border-top: none;
        }
        
        .tab-content.active {
          display: block;
        }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    </head>
    <body>
      <div class="dashboard-container">
        <header class="dashboard-header">
          <h1>AO Router Metrics Dashboard</h1>
          ${refreshControls}
        </header>
        
        <main class="dashboard-content">
          <section class="metrics-section" id="traffic-analytics">
            <div class="tab-container">
              <ul class="tabs">
                <li><button class="tab-button active" data-tab="advanced-analytics">Advanced Analytics</button></li>
                <li><button class="tab-button" data-tab="basic-traffic">Basic Traffic</button></li>
              </ul>
              
              <div id="advanced-analytics" class="tab-content active">
                ${analyticsPanel}
              </div>
              
              <div id="basic-traffic" class="tab-content">
                <h2>Traffic Overview (Legacy)</h2>
                ${timeControls}
              </div>
            </div>
          </section>
      
          <div class="tabs">
            <div class="tab active" data-tab="requests">Recent Requests</div>
            <div class="tab" data-tab="processes">Process Metrics</div>
            <div class="tab" data-tab="actions">Action Metrics</div>
            <div class="tab" data-tab="clients">Client Metrics</div>
          </div>
          
          <div class="tab-content active" id="requests-tab">
            ${recentRequestsTable}
          </div>
          
          <div class="tab-content" id="processes-tab">
            ${processMetricsTable}
          </div>
          
          <div class="tab-content" id="actions-tab">
            ${actionMetricsTable}
          </div>
          
          <div class="tab-content" id="clients-tab">
            ${clientMetricsTable}
          </div>
          
          <script>
            ${dashboardScripts}
          </script>
        </main>
      </div>
        
          <div class="card metrics-card">
            <h2>Request Details</h2>
            <div class="tabs">
              <div class="tab active" data-tab="requests">Recent Requests</div>
              <div class="tab" data-tab="processes">Process Metrics</div>
              <div class="tab" data-tab="actions">Action Metrics</div>
              <div class="tab" data-tab="clients">Client Metrics</div>
            </div>
            
            <div class="tab-content active" id="requests-tab">
              ${recentRequestsTable}
            </div>
            
            <div class="tab-content" id="processes-tab">
              ${processMetricsTable}
            </div>
            
            <div class="tab-content" id="actions-tab">
              ${actionMetricsTable}
            </div>
            
            <div class="tab-content" id="clients-tab">
              ${clientMetricsTable}
            </div>
          </div>
        </main>
      </div>
      
      <script>
        ${dashboardScripts}
        ${getAnalyticsPanelScript(JSON.stringify(timeSeriesData || []))}
        
        // Tab switching for analytics vs basic traffic view
        document.querySelectorAll('.tab-button').forEach(button => {
          button.addEventListener('click', () => {
            // Remove active class from all buttons and content
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-container .tab-content').forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked button and corresponding content
            button.classList.add('active');
            document.getElementById(button.dataset.tab).classList.add('active');
          });
        });
      </script>
    </body>
    </html>
  `;
}
