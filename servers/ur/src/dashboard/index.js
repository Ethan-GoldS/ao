/**
 * Main dashboard module
 * Imports and assembles all dashboard components
 */
import { getDashboardStyles } from './styles.js';
import { 
  generateRecentRequestsTable, 
  generateProcessMetricsTable, 
  generateActionMetricsTable,
  generateClientMetricsTable,
  getFilterScript 
} from './metricsTables.js';
import { generateRefreshControls, getRefreshControlsScript } from './refreshControls.js';
import { 
  generateTrafficOverviewHtml, 
  getTrafficOverviewStyles, 
  getTrafficOverviewScript 
} from './trafficOverview.js';
import { logger } from '../logger.js';

const _logger = logger.child('dashboard');

/**
 * Generate the complete dashboard HTML
 * @param {Object} metrics The metrics data from the metrics service
 * @returns {String} Complete HTML for the dashboard
 */
export function generateDashboardHtml(metrics) {
  _logger('Generating dashboard HTML with metrics data');
  
  // Prepare data for process metrics table
  // Add null checks to handle missing data
  const processCounts = metrics.processCounts || {};
  const allProcessIds = Object.keys(processCounts);
  const topProcessIds = allProcessIds
    .sort((a, b) => processCounts[b] - processCounts[a])
    .slice(0, 5);
    
  // Add top process IDs to metrics
  metrics.topProcessIds = topProcessIds;
  
  // Use the timeLabels if already provided by the normalized metrics structure
  if (!metrics.timeLabels || !Array.isArray(metrics.timeLabels) || metrics.timeLabels.length === 0) {
    // If timeLabels aren't already set, try to derive them
    if (metrics.timeSeriesDataArray && Array.isArray(metrics.timeSeriesDataArray)) {
      // Use timeSeriesDataArray if available (from normalization)
      metrics.timeLabels = metrics.timeSeriesDataArray.map(bucket => {
        // If timestamp is already a formatted time string (HH:MM), use it directly
        if (typeof bucket.timestamp === 'string' && bucket.timestamp.includes(':')) {
          return bucket.timestamp;
        }
        // Otherwise parse as date
        const date = new Date(bucket.timestamp);
        return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
      });
    } else if (Array.isArray(metrics.timeSeriesData)) {
      // Fall back to raw timeSeriesData if it's an array
      metrics.timeLabels = metrics.timeSeriesData.map(bucket => {
        const date = new Date(bucket.timestamp);
        return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
      });
    } else {
      // Last resort fallback
      _logger('Warning: Could not generate timeLabels from available data');
      metrics.timeLabels = [];
    }
  }
  
  // Generate each section of the dashboard
  const lastUpdated = new Date().toISOString();
  const refreshControls = generateRefreshControls(lastUpdated);
  const trafficOverview = generateTrafficOverviewHtml();
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
        <div class="stat-number">${metrics.processCount || Object.keys(metrics.processCounts).length}</div>
        <div class="stat-label">Unique Process IDs</div>
      </div>
      <div class="stat-section">
        <div class="stat-box dry-run-stat">
          <div class="stat-number">${metrics.dryRunCount || 0}</div>
          <div class="stat-label">Dry Run Requests</div>
        </div>
        <div class="stat-box result-stat">
          <div class="stat-number">${metrics.resultCount || 0}</div>
          <div class="stat-label">Result Requests</div>
        </div>
      </div>
      <div class="stat-section">
        <div class="stat-box unique-stat">
          <div class="stat-number">${metrics.uniqueDryRuns || Object.keys(metrics.actionCounts).length}</div>
          <div class="stat-label">Unique Actions</div>
        </div>
        <div class="stat-box unique-message-stat">
          <div class="stat-number">${metrics.uniqueMessageIds || 0}</div>
          <div class="stat-label">Unique Message IDs</div>
        </div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${metrics.ipCounts.length}</div>
        <div class="stat-label">Unique IPs</div>
      </div>
    </div>
  `;
  
  // Get all JavaScript for the dashboard
  const dashboardScripts = `
    ${getTrafficOverviewScript()}
    
    // Process chart
    const processLabels = ${JSON.stringify(topProcessIds.map(id => id.substring(0, 8) + '...'))};
    const processData = ${JSON.stringify(topProcessIds.map(id => metrics.processCounts[id]))};

    // Add time series data for new metrics format
    const timeSeriesLabels = ${JSON.stringify(metrics.timeLabels || [])};
    const requestCounts = ${JSON.stringify(metrics.requestCounts || [])};
    const dryRunCounts = ${JSON.stringify(metrics.dryRunCounts || [])};
    const resultCounts = ${JSON.stringify(metrics.resultCounts || [])};
        
    
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
    <html>
    <head>
      <title>AO Router Metrics Dashboard</title>
      <!-- Auto-refresh handled by JavaScript instead of meta tag -->
      <style>
        ${getDashboardStyles()}
        ${getTrafficOverviewStyles()}
      </style>
      <script src="https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@2.0.0/dist/chartjs-adapter-date-fns.bundle.min.js"></script>
    </head>
    <body>
      <h1>AO Router Metrics Dashboard</h1>
      ${refreshControls}
      
      <!-- Traffic Overview -->
      <div class="dashboard-card">
        ${trafficOverview}
      </div>
      
      ${statsOverview}
      
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
    </body>
    </html>
  `;
}
