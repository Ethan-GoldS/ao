/**
 * New dashboard interface for PostgreSQL-based metrics
 * Provides a modern UI for displaying and filtering metrics data
 */
import { generateRequestsTable } from './components/requestsTable.js'
import { generateProcessMetricsTable } from './components/processMetricsTable.js'
import { generateDashboardCharts } from './components/dashboardCharts.js'
import { generateClientMetricsTable } from './components/clientMetricsTable.js'

/**
 * Generate the complete dashboard HTML
 * @param {Object} metrics Metrics object from PostgreSQL
 * @returns {String} Complete HTML for dashboard
 */
export function generateNewDashboardHtml(metrics) {
  const {
    recentRequests,
    requestDetails,
    processCounts,
    processTiming,
    actionCounts,
    actionTiming,
    ipCounts,
    referrerCounts,
    timeSeriesData,
    timeLabels,
    topProcessIds,
    totalRequests,
    startTime,
    uniqueProcesses,
    uniqueIps
  } = metrics

  // Format date for display
  const startTimeFormatted = new Date(startTime).toLocaleString()

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AO Unit Router Metrics Dashboard</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css">
  <style>
    :root {
      --primary-color: #3498db;
      --secondary-color: #2c3e50;
      --accent-color: #e74c3c;
      --light-bg: #f5f7fa;
      --dark-bg: #2c3e50;
      --card-bg: #ffffff;
      --text-color: #333333;
    }
    
    body {
      background-color: var(--light-bg);
      color: var(--text-color);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding-top: 20px;
    }
    
    .dashboard-header {
      background-color: var(--secondary-color);
      color: white;
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }
    
    .stats-card {
      background-color: var(--card-bg);
      border-radius: 10px;
      padding: 15px;
      margin-bottom: 20px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
      transition: transform 0.3s ease;
    }
    
    .stats-card:hover {
      transform: translateY(-5px);
    }
    
    .stats-value {
      font-size: 2.5rem;
      font-weight: bold;
      color: var(--primary-color);
    }
    
    .stats-label {
      font-size: 0.9rem;
      color: #777;
      text-transform: uppercase;
    }
    
    .tab-content {
      background-color: var(--card-bg);
      border-radius: 0 0 10px 10px;
      padding: 20px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }
    
    .nav-tabs .nav-link {
      border-radius: 10px 10px 0 0;
      font-weight: 500;
      color: var(--secondary-color);
    }
    
    .nav-tabs .nav-link.active {
      background-color: var(--card-bg);
      color: var(--primary-color);
      border-bottom: none;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
    }
    
    table th {
      background-color: var(--primary-color);
      color: white;
      padding: 12px;
      font-weight: 500;
    }
    
    table td {
      padding: 12px;
      border-bottom: 1px solid #e9ecef;
    }
    
    table tbody tr:hover {
      background-color: #f5f7fa;
    }
    
    .table-responsive {
      overflow-x: auto;
      margin-bottom: 20px;
    }
    
    .filter-group {
      margin-bottom: 15px;
    }
    
    .filter-input {
      padding: 8px 12px;
      border-radius: 5px;
      border: 1px solid #ced4da;
      width: 100%;
    }
    
    .copy-btn {
      background-color: var(--primary-color);
      color: white;
      border: none;
      border-radius: 4px;
      padding: 5px 10px;
      cursor: pointer;
      font-size: 0.8rem;
      transition: background-color 0.3s;
    }
    
    .copy-btn:hover {
      background-color: #2980b9;
    }
    
    .details-content {
      background-color: #f8f9fa;
      padding: 10px;
      border-radius: 5px;
      margin-top: 10px;
      max-height: 300px;
      overflow-y: auto;
    }
    
    .details-table {
      width: 100%;
      margin-bottom: 0;
    }
    
    .details-table td {
      padding: 5px;
      border-bottom: 1px solid #dee2e6;
    }
    
    .details-table tr:last-child td {
      border-bottom: none;
    }
    
    .chart-container {
      height: 300px;
      margin-bottom: 30px;
    }
    
    @media (max-width: 768px) {
      .stats-value {
        font-size: 1.8rem;
      }
      
      .tab-content {
        padding: 15px 10px;
      }
    }
    
    .refresh-btn {
      background-color: var(--primary-color);
      color: white;
      border: none;
      border-radius: 5px;
      padding: 8px 15px;
      cursor: pointer;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    
    .refresh-btn:hover {
      background-color: #2980b9;
    }
    
    .mini-chart {
      height: 150px;
      width: 100%;
    }
    
    .process-details {
      padding: 10px;
    }
    
    .request-body-preview {
      max-height: 150px;
      overflow-y: auto;
      font-family: monospace;
      background-color: #f8f9fa;
      padding: 10px;
      border-radius: 5px;
      font-size: 0.85rem;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div class="container-fluid">
    <div class="dashboard-header">
      <div class="row align-items-center">
        <div class="col-md-8">
          <h1><i class="bi bi-speedometer2"></i> AO Unit Router Metrics</h1>
          <p>Real-time monitoring of AO process requests with PostgreSQL data storage</p>
          <p class="small">Started: ${startTimeFormatted}</p>
        </div>
        <div class="col-md-4 text-md-end">
          <button id="refreshDashboard" class="refresh-btn">
            <i class="bi bi-arrow-clockwise"></i> Refresh Dashboard
          </button>
        </div>
      </div>
    </div>
    
    <div class="row mb-4">
      <div class="col-md-3">
        <div class="stats-card text-center">
          <div class="stats-value">${totalRequests.toLocaleString()}</div>
          <div class="stats-label">Total Requests</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="stats-card text-center">
          <div class="stats-value">${uniqueProcesses.toLocaleString()}</div>
          <div class="stats-label">Unique Processes</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="stats-card text-center">
          <div class="stats-value">${Object.keys(actionCounts).length.toLocaleString()}</div>
          <div class="stats-label">Different Actions</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="stats-card text-center">
          <div class="stats-value">${uniqueIps.toLocaleString()}</div>
          <div class="stats-label">Unique IP Addresses</div>
        </div>
      </div>
    </div>
    
    <div class="row mb-4">
      <div class="col-12">
        <div class="chart-container">
          <canvas id="requestsTimeChart"></canvas>
        </div>
      </div>
    </div>
    
    <div class="row">
      <div class="col-12">
        <ul class="nav nav-tabs" id="metricsTab" role="tablist">
          <li class="nav-item" role="presentation">
            <button class="nav-link active" id="requests-tab" data-bs-toggle="tab" data-bs-target="#requests" type="button" role="tab">Recent Requests</button>
          </li>
          <li class="nav-item" role="presentation">
            <button class="nav-link" id="processes-tab" data-bs-toggle="tab" data-bs-target="#processes" type="button" role="tab">Processes</button>
          </li>
          <li class="nav-item" role="presentation">
            <button class="nav-link" id="actions-tab" data-bs-toggle="tab" data-bs-target="#actions" type="button" role="tab">Actions</button>
          </li>
          <li class="nav-item" role="presentation">
            <button class="nav-link" id="clients-tab" data-bs-toggle="tab" data-bs-target="#clients" type="button" role="tab">Clients</button>
          </li>
        </ul>
        
        <div class="tab-content" id="metricsTabContent">
          <div class="tab-pane fade show active" id="requests" role="tabpanel">
            <h3>Recent Requests</h3>
            <div class="table-responsive">
              ${generateRequestsTable(recentRequests, requestDetails)}
            </div>
          </div>
          
          <div class="tab-pane fade" id="processes" role="tabpanel">
            <div class="row">
              <div class="col-md-8">
                <h3>Process Metrics</h3>
                <div class="table-responsive">
                  ${generateProcessMetricsTable(metrics)}
                </div>
              </div>
              <div class="col-md-4">
                <h3>Top Processes</h3>
                <div class="chart-container">
                  <canvas id="topProcessesChart"></canvas>
                </div>
              </div>
            </div>
          </div>
          
          <div class="tab-pane fade" id="actions" role="tabpanel">
            <div class="row">
              <div class="col-md-8">
                <h3>Action Metrics</h3>
                <div class="table-responsive" id="actionsTable">
                  ${generateDashboardCharts(metrics, 'actions')}
                </div>
              </div>
              <div class="col-md-4">
                <h3>Actions Distribution</h3>
                <div class="chart-container">
                  <canvas id="actionsChart"></canvas>
                </div>
              </div>
            </div>
          </div>
          
          <div class="tab-pane fade" id="clients" role="tabpanel">
            <h3>Client Information</h3>
            ${generateClientMetricsTable(metrics)}
          </div>
        </div>
      </div>
    </div>
  </div>
  
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.3.0/dist/chart.umd.min.js"></script>
  
  <script>
  // Dashboard initialization
  document.addEventListener('DOMContentLoaded', function() {
    // Initialize charts
    initializeCharts();
    
    // Set up refresh button
    document.getElementById('refreshDashboard').addEventListener('click', function() {
      refreshDashboard();
    });
    
    // Set up copy buttons
    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const id = this.getAttribute('data-id');
        navigator.clipboard.writeText(id)
          .then(() => {
            const originalText = this.textContent;
            this.textContent = 'Copied!';
            setTimeout(() => {
              this.textContent = originalText;
            }, 1500);
          });
      });
    });
    
    // Set up table filters
    setupTableFilters();
  });
  
  function initializeCharts() {
    // Time series chart
    const timeCtx = document.getElementById('requestsTimeChart').getContext('2d');
    const timeChart = new Chart(timeCtx, {
      type: 'line',
      data: {
        labels: ${JSON.stringify(timeLabels)},
        datasets: [{
          label: 'Requests',
          data: ${JSON.stringify(timeSeriesData.map(bucket => bucket.totalRequests))},
          borderColor: '#3498db',
          backgroundColor: 'rgba(52, 152, 219, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Request Volume Over Time',
            font: {
              size: 16
            }
          },
          legend: {
            position: 'top'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              precision: 0
            }
          }
        }
      }
    });
    
    // Top processes chart
    if (document.getElementById('topProcessesChart')) {
      const processesCtx = document.getElementById('topProcessesChart').getContext('2d');
      
      // Get top 5 processes by count
      const topProcesses = Object.entries(processCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      
      new Chart(processesCtx, {
        type: 'bar',
        data: {
          labels: topProcesses.map(p => p[0].substring(0, 10) + '...'),
          datasets: [{
            label: 'Request Count',
            data: topProcesses.map(p => p[1]),
            backgroundColor: [
              'rgba(52, 152, 219, 0.7)',
              'rgba(46, 204, 113, 0.7)',
              'rgba(155, 89, 182, 0.7)',
              'rgba(52, 73, 94, 0.7)',
              'rgba(22, 160, 133, 0.7)'
            ],
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            }
          }
        }
      });
    }
    
    // Actions chart
    if (document.getElementById('actionsChart')) {
      const actionsCtx = document.getElementById('actionsChart').getContext('2d');
      
      // Get top actions by count
      const topActions = Object.entries(actionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      
      new Chart(actionsCtx, {
        type: 'doughnut',
        data: {
          labels: topActions.map(a => a[0]),
          datasets: [{
            data: topActions.map(a => a[1]),
            backgroundColor: [
              'rgba(52, 152, 219, 0.7)',
              'rgba(46, 204, 113, 0.7)',
              'rgba(155, 89, 182, 0.7)',
              'rgba(52, 73, 94, 0.7)',
              'rgba(22, 160, 133, 0.7)'
            ]
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right'
            }
          }
        }
      });
    }
    
    // Mini charts for process details
    document.querySelectorAll('.mini-chart').forEach(chartElem => {
      const processId = chartElem.getAttribute('data-process-id');
      const timeLabels = JSON.parse(chartElem.getAttribute('data-time-labels'));
      const values = JSON.parse(chartElem.getAttribute('data-values'));
      
      const ctx = chartElem.getContext('2d');
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: timeLabels,
          datasets: [{
            label: 'Requests',
            data: values,
            borderColor: '#3498db',
            backgroundColor: 'rgba(52, 152, 219, 0.1)',
            borderWidth: 1,
            fill: true
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
            x: {
              display: false
            },
            y: {
              beginAtZero: true,
              ticks: {
                precision: 0
              }
            }
          }
        }
      });
    });
  }
  
  function setupTableFilters() {
    const filters = [
      { id: 'requestFilter', tableSelector: '#requests table tbody tr' },
      { id: 'processFilter', tableSelector: '#processes table tbody tr' },
      { id: 'actionFilter', tableSelector: '#actions table tbody tr' }
    ];
    
    filters.forEach(filter => {
      const filterInput = document.getElementById(filter.id);
      if (filterInput) {
        filterInput.addEventListener('keyup', function() {
          const value = this.value.toLowerCase();
          document.querySelectorAll(filter.tableSelector).forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.indexOf(value) > -1 ? '' : 'none';
          });
        });
      }
    });
  }
  
  function refreshDashboard() {
    const refreshBtn = document.getElementById('refreshDashboard');
    refreshBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Refreshing...';
    refreshBtn.disabled = true;
    
    fetch('/new-dashboard/api/metrics')
      .then(response => response.json())
      .then(data => {
        location.reload();
      })
      .catch(error => {
        console.error('Error refreshing dashboard:', error);
        alert('Error refreshing dashboard data');
      })
      .finally(() => {
        refreshBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Refresh Dashboard';
        refreshBtn.disabled = false;
      });
  }
  </script>
</body>
</html>
  `;
}
