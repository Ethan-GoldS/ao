/**
 * Traffic Overview component
 * Provides filterable, time-based request rate visualization
 */

/**
 * Generate the traffic overview component HTML
 * @returns {string} Component HTML
 */
export function generateTrafficOverviewHtml() {
  // Time range options
  const timeRangeOptions = [
    { value: '1m', label: 'Past Minute' },
    { value: '30m', label: 'Past 30 Minutes' },
    { value: '1h', label: 'Past Hour' },
    { value: '3h', label: 'Past 3 Hours' },
    { value: '6h', label: 'Past 6 Hours' },
    { value: '1d', label: 'Past Day' },
    { value: '7d', label: 'Past Week' }
  ];

  // Time interval options
  const timeIntervalOptions = [
    { value: '5s', label: '5 Seconds' },
    { value: '15s', label: '15 Seconds' },
    { value: '30s', label: '30 Seconds' },
    { value: '1m', label: '1 Minute' },
    { value: '5m', label: '5 Minutes' },
    { value: '10m', label: '10 Minutes' },
    { value: '30m', label: '30 Minutes' },
    { value: '1h', label: '1 Hour' },
    { value: '6h', label: '6 Hours' },
    { value: '12h', label: '12 Hours' },
    { value: '1d', label: '1 Day' }
  ];

  // Create time range option buttons
  const timeRangeButtons = timeRangeOptions.map(option => 
    `<button class="time-range-btn${option.value === '1h' ? ' active' : ''}" data-value="${option.value}">${option.label}</button>`
  ).join('');

  // Create time interval select options
  const timeIntervalSelectOptions = timeIntervalOptions.map(option => 
    `<option value="${option.value}"${option.value === '1m' ? ' selected' : ''}>${option.label}</option>`
  ).join('');

  return `
    <div class="traffic-overview-container">
      <div class="traffic-controls">
        <div class="control-section">
          <h3>Time Range</h3>
          <div class="time-range-buttons">
            ${timeRangeButtons}
          </div>
        </div>
        
        <div class="control-section">
          <h3>Time Interval</h3>
          <select id="timeIntervalSelect" class="time-interval-select">
            ${timeIntervalSelectOptions}
          </select>
        </div>
        
        <div class="control-section">
          <h3>Process ID Filter</h3>
          <div class="process-filter">
            <input type="text" id="processIdFilter" placeholder="Filter by Process ID...">
            <button id="applyProcessFilter" class="apply-filter-btn">Apply</button>
            <button id="clearProcessFilter" class="clear-filter-btn">Clear</button>
          </div>
        </div>
      </div>
      
      <div class="traffic-visualization">
        <div class="traffic-chart-container">
          <canvas id="trafficChart"></canvas>
        </div>
      </div>
      
      <div class="traffic-stats">
        <div class="stat-card">
          <h4>Total Requests</h4>
          <div id="totalRequests" class="stat-value">-</div>
        </div>
        <div class="stat-card">
          <h4>Avg. Requests/Min</h4>
          <div id="avgRequestRate" class="stat-value">-</div>
        </div>
        <div class="stat-card">
          <h4>Peak Rate</h4>
          <div id="peakRate" class="stat-value">-</div>
        </div>
        <div class="stat-card">
          <h4>Unique Process IDs</h4>
          <div id="uniqueProcesses" class="stat-value">-</div>
        </div>
      </div>
      
      <div class="traffic-data-table-container">
        <h3>Traffic Data</h3>
        <div class="table-controls">
          <button id="refreshTrafficData" class="refresh-btn">Refresh Data</button>
        </div>
        <div class="traffic-table-wrapper">
          <table id="trafficDataTable" class="traffic-data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Requests</th>
                <th>Rate (req/min)</th>
                <th>Process IDs</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colspan="4" class="loading-data">Loading traffic data...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

/**
 * Get the JavaScript code to power the traffic overview functionality
 * @returns {string} JavaScript code
 */
export function getTrafficOverviewScript() {
  return `
    // Traffic Overview functionality
    let trafficChart = null;
    let currentTimeRange = '1h';
    let currentTimeInterval = '1m';
    let currentProcessFilter = '';
    let trafficData = [];
    
    // Initialize the traffic overview functionality
    function initTrafficOverview() {
      // Set up event listeners for time range buttons
      document.querySelectorAll('.time-range-btn').forEach(button => {
        button.addEventListener('click', function() {
          // Remove active class from all buttons
          document.querySelectorAll('.time-range-btn').forEach(btn => {
            btn.classList.remove('active');
          });
          
          // Add active class to clicked button
          this.classList.add('active');
          
          // Update time range and refresh data
          currentTimeRange = this.dataset.value;
          fetchTrafficData();
        });
      });
      
      // Set up event listener for interval selection
      document.getElementById('timeIntervalSelect').addEventListener('change', function() {
        currentTimeInterval = this.value;
        fetchTrafficData();
      });
      
      // Set up process ID filter
      document.getElementById('applyProcessFilter').addEventListener('click', function() {
        currentProcessFilter = document.getElementById('processIdFilter').value.trim();
        fetchTrafficData();
      });
      
      // Enter key on process filter
      document.getElementById('processIdFilter').addEventListener('keyup', function(event) {
        if (event.key === 'Enter') {
          currentProcessFilter = this.value.trim();
          fetchTrafficData();
        }
      });
      
      // Clear process filter
      document.getElementById('clearProcessFilter').addEventListener('click', function() {
        document.getElementById('processIdFilter').value = '';
        currentProcessFilter = '';
        fetchTrafficData();
      });
      
      // Refresh button
      document.getElementById('refreshTrafficData').addEventListener('click', fetchTrafficData);
      
      // Initial data fetch
      fetchTrafficData();
      
      // Set up auto-refresh every 30 seconds
      setInterval(fetchTrafficData, 30000);
    }
    
    // Fetch traffic data from the server
    function fetchTrafficData() {
      showLoading();
      
      // Build query parameters
      const params = new URLSearchParams({
        timeRange: currentTimeRange,
        timeInterval: currentTimeInterval,
        processFilter: currentProcessFilter
      });
      
      // Fetch data from API endpoint
      fetch('/api/traffic-data?' + params.toString())
        .then(response => response.json())
        .then(data => {
          trafficData = data;
          updateTrafficChart();
          updateTrafficTable();
          updateTrafficStats();
          hideLoading();
        })
        .catch(error => {
          console.error('Error fetching traffic data:', error);
          showError('Failed to load traffic data. Please try again.');
          hideLoading();
        });
    }
    
    // Update the traffic chart with new data
    function updateTrafficChart() {
      const ctx = document.getElementById('trafficChart').getContext('2d');
      
      // Extract data for chart
      const labels = trafficData.intervals.map(interval => interval.formattedTime);
      const values = trafficData.intervals.map(interval => interval.requestCount);
      
      // Destroy existing chart if it exists
      if (trafficChart) {
        trafficChart.destroy();
      }
      
      // Create new chart
      trafficChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Requests',
            data: values,
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 2,
            tension: 0.2,
            pointRadius: 3,
            pointHoverRadius: 7
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: {
              callbacks: {
                title: function(tooltipItems) {
                  return tooltipItems[0].label;
                },
                label: function(context) {
                  return 'Requests: ' + context.raw;
                },
                afterLabel: function(context) {
                  const interval = trafficData.intervals[context.dataIndex];
                  const rate = interval.requestRate.toFixed(2);
                  const processCount = interval.uniqueProcessIds;
                  
                  return [
                    'Rate: ' + rate + ' req/min',
                    'Unique Process IDs: ' + processCount
                  ];
                }
              }
            },
            legend: {
              display: false
            },
            title: {
              display: true,
              text: 'Traffic Overview'
            }
          },
          scales: {
            x: {
              title: {
                display: true,
                text: 'Time (' + getIntervalLabel(currentTimeInterval) + ')'
              },
              grid: {
                display: false
              }
            },
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Request Count'
              }
            }
          }
        }
      });
    }
    
    // Update the traffic data table
    function updateTrafficTable() {
      const tableBody = document.querySelector('#trafficDataTable tbody');
      
      // Create table rows
      const rows = trafficData.intervals.map(interval => {
        const processIdsText = interval.topProcessIds.length > 0 
          ? interval.topProcessIds.join(', ') 
          : 'None';
          
        return \`
          <tr>
            <td>\${interval.formattedTime}</td>
            <td>\${interval.requestCount}</td>
            <td>\${interval.requestRate.toFixed(2)}</td>
            <td class="process-ids-cell">
              <div class="process-ids-preview">\${processIdsText}</div>
            </td>
          </tr>
        \`;
      }).join('');
      
      // If no data, show message
      if (trafficData.intervals.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="no-data">No traffic data available for the selected filters</td></tr>';
      } else {
        tableBody.innerHTML = rows;
      }
    }
    
    // Update the traffic statistics
    function updateTrafficStats() {
      // Calculate overall statistics
      let totalRequests = 0;
      let totalMinutes = 0;
      let peakRate = 0;
      const allProcessIds = new Set();
      
      trafficData.intervals.forEach(interval => {
        totalRequests += interval.requestCount;
        totalMinutes += interval.durationMinutes;
        peakRate = Math.max(peakRate, interval.requestRate);
        
        // Add process IDs to set
        interval.allProcessIds.forEach(id => allProcessIds.add(id));
      });
      
      // Calculate average rate
      const avgRate = totalMinutes > 0 ? totalRequests / totalMinutes : 0;
      
      // Update stat displays
      document.getElementById('totalRequests').textContent = totalRequests;
      document.getElementById('avgRequestRate').textContent = avgRate.toFixed(2);
      document.getElementById('peakRate').textContent = peakRate.toFixed(2);
      document.getElementById('uniqueProcesses').textContent = allProcessIds.size;
    }
    
    // Helper function to get interval label for chart
    function getIntervalLabel(interval) {
      const labels = {
        '5s': '5 Seconds',
        '15s': '15 Seconds',
        '30s': '30 Seconds',
        '1m': '1 Minute',
        '5m': '5 Minutes',
        '10m': '10 Minutes',
        '30m': '30 Minutes',
        '1h': '1 Hour',
        '6h': '6 Hours',
        '12h': '12 Hours',
        '1d': '1 Day'
      };
      
      return labels[interval] || interval;
    }
    
    // Show loading state
    function showLoading() {
      document.querySelector('.traffic-chart-container').classList.add('loading');
      document.querySelector('.traffic-table-wrapper').classList.add('loading');
    }
    
    // Hide loading state
    function hideLoading() {
      document.querySelector('.traffic-chart-container').classList.remove('loading');
      document.querySelector('.traffic-table-wrapper').classList.remove('loading');
    }
    
    // Show error message
    function showError(message) {
      // Simple error toast implementation
      const toast = document.createElement('div');
      toast.className = 'error-toast';
      toast.textContent = message;
      document.body.appendChild(toast);
      
      // Remove after 5 seconds
      setTimeout(() => {
        toast.remove();
      }, 5000);
    }
    
    // Initialize traffic overview when DOM is loaded
    document.addEventListener('DOMContentLoaded', initTrafficOverview);
  `;
}

/**
 * Get the CSS styles for the traffic overview component
 * @returns {string} CSS styles
 */
export function getTrafficOverviewStyles() {
  return `
    /* Traffic Overview Styles */
    .traffic-overview-container {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      padding: 1rem;
      background-color: #f7f9fc;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
    }
    
    .traffic-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #e1e4e8;
    }
    
    .control-section {
      flex: 1;
      min-width: 200px;
    }
    
    .control-section h3 {
      margin-top: 0;
      margin-bottom: 0.75rem;
      font-size: 1rem;
      color: #24292e;
    }
    
    .time-range-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    
    .time-range-btn {
      padding: 0.375rem 0.75rem;
      background-color: #edf2f7;
      border: 1px solid #d1d5da;
      border-radius: 4px;
      font-size: 0.875rem;
      color: #24292e;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .time-range-btn:hover {
      background-color: #e2e8f0;
    }
    
    .time-range-btn.active {
      background-color: #0366d6;
      border-color: #0366d6;
      color: white;
    }
    
    .time-interval-select {
      width: 100%;
      padding: 0.5rem;
      border: 1px solid #d1d5da;
      border-radius: 4px;
      background-color: white;
      font-size: 0.875rem;
    }
    
    .process-filter {
      display: flex;
      gap: 0.5rem;
    }
    
    #processIdFilter {
      flex: 1;
      padding: 0.5rem;
      border: 1px solid #d1d5da;
      border-radius: 4px;
      font-size: 0.875rem;
    }
    
    .apply-filter-btn, .clear-filter-btn, .refresh-btn {
      padding: 0.5rem 0.75rem;
      background-color: #0366d6;
      border: none;
      border-radius: 4px;
      color: white;
      font-size: 0.875rem;
      cursor: pointer;
      transition: background-color 0.2s ease;
    }
    
    .apply-filter-btn:hover, .refresh-btn:hover {
      background-color: #0550ae;
    }
    
    .clear-filter-btn {
      background-color: #6c757d;
    }
    
    .clear-filter-btn:hover {
      background-color: #5a6268;
    }
    
    .traffic-visualization {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    
    .traffic-chart-container {
      height: 300px;
      position: relative;
      border-radius: 8px;
      background-color: white;
      padding: 1rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    }
    
    .traffic-chart-container.loading::after {
      content: "Loading...";
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background-color: rgba(255, 255, 255, 0.8);
      padding: 0.5rem 1rem;
      border-radius: 4px;
      font-size: 0.875rem;
      color: #24292e;
    }
    
    .traffic-stats {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
    }
    
    .stat-card {
      flex: 1;
      min-width: 150px;
      padding: 1rem;
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
      text-align: center;
    }
    
    .stat-card h4 {
      margin-top: 0;
      margin-bottom: 0.5rem;
      font-size: 0.875rem;
      color: #6c757d;
      font-weight: 500;
    }
    
    .stat-value {
      font-size: 1.5rem;
      font-weight: 600;
      color: #24292e;
    }
    
    .traffic-data-table-container {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    
    .traffic-data-table-container h3 {
      margin-top: 0;
      margin-bottom: 0;
      font-size: 1rem;
      color: #24292e;
    }
    
    .table-controls {
      display: flex;
      justify-content: flex-end;
    }
    
    .traffic-table-wrapper {
      position: relative;
      max-height: 350px;
      overflow-y: auto;
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    }
    
    .traffic-table-wrapper.loading::after {
      content: "Loading...";
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background-color: rgba(255, 255, 255, 0.8);
      padding: 0.5rem 1rem;
      border-radius: 4px;
      font-size: 0.875rem;
      color: #24292e;
    }
    
    .traffic-data-table {
      width: 100%;
      border-collapse: collapse;
    }
    
    .traffic-data-table th,
    .traffic-data-table td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid #e1e4e8;
    }
    
    .traffic-data-table th {
      background-color: #f7f9fc;
      font-weight: 600;
      font-size: 0.875rem;
      color: #24292e;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    
    .traffic-data-table tbody tr:hover {
      background-color: #f6f8fa;
    }
    
    .loading-data, .no-data {
      text-align: center;
      color: #6c757d;
      padding: 2rem 0;
    }
    
    .process-ids-cell {
      max-width: 200px;
    }
    
    .process-ids-preview {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .error-toast {
      position: fixed;
      bottom: 1rem;
      right: 1rem;
      padding: 0.75rem 1.5rem;
      background-color: #f8d7da;
      border: 1px solid #f5c6cb;
      border-radius: 4px;
      color: #721c24;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
  `;
}
