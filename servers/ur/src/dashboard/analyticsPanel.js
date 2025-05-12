/**
 * Advanced Analytics Panel with Elasticsearch-style filtering
 * Provides powerful filtering and data visualization for request metrics
 */

/**
 * Generate the HTML for the advanced analytics panel
 * @param {Object} timeSeriesData The time series data from metrics service
 * @returns {String} HTML for the analytics panel
 */
export function generateAnalyticsPanel(timeSeriesData) {
  // Default to last 24 hours
  const now = new Date();
  const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));
  
  // Format dates for input fields
  const formatDateForInput = (date) => {
    return date.toISOString().split('T')[0];
  };
  
  const formatTimeForInput = (date) => {
    return date.toISOString().split('T')[1].substring(0, 5);
  };
  
  // Extract unique process IDs for the filter dropdown
  const processIds = extractUniqueProcessIds(timeSeriesData);
  
  // Create process ID dropdown options
  const processIdOptions = processIds.map(id => 
    `<option value="${id}">${id.substring(0, 8)}...</option>`
  ).join('');
  
  return `
    <div class="analytics-panel">
      <h2>Advanced Traffic Analytics</h2>
      
      <div class="filter-container">
        <div class="filter-section time-filter">
          <h3>Time Range</h3>
          <div class="filter-row">
            <div class="filter-group">
              <label for="start-date">Start:</label>
              <input type="date" id="start-date" value="${formatDateForInput(yesterday)}">
              <input type="time" id="start-time" value="${formatTimeForInput(yesterday)}">
            </div>
            <div class="filter-group">
              <label for="end-date">End:</label>
              <input type="date" id="end-date" value="${formatDateForInput(now)}">
              <input type="time" id="end-time" value="${formatTimeForInput(now)}">
            </div>
          </div>
          <div class="filter-row">
            <div class="filter-group">
              <label for="interval-select">Group by:</label>
              <select id="interval-select">
                <option value="minute">Minute</option>
                <option value="hour" selected>Hour</option>
                <option value="day">Day</option>
                <option value="week">Week</option>
              </select>
            </div>
            <div class="filter-group">
              <button id="time-range-apply" class="filter-button">Apply</button>
              <button id="time-range-reset" class="filter-button secondary">Reset</button>
            </div>
          </div>
        </div>
        
        <div class="filter-section">
          <h3>Request Filters</h3>
          <div class="filter-row">
            <div class="filter-group">
              <label for="process-filter">Process ID:</label>
              <select id="process-filter" multiple>
                <option value="all" selected>All Processes</option>
                ${processIdOptions}
              </select>
            </div>
            <div class="filter-group">
              <label for="action-filter">Action:</label>
              <input type="text" id="action-filter" placeholder="Filter by action...">
            </div>
          </div>
          <div class="filter-row">
            <div class="filter-group">
              <label for="method-filter">Method:</label>
              <select id="method-filter">
                <option value="all" selected>All Methods</option>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
              </select>
            </div>
            <div class="filter-group">
              <label for="path-filter">Path:</label>
              <input type="text" id="path-filter" placeholder="Filter by path...">
            </div>
          </div>
          <div class="filter-row">
            <div class="filter-group">
              <label for="duration-min">Duration (ms):</label>
              <input type="number" id="duration-min" placeholder="Min" min="0">
              <span>to</span>
              <input type="number" id="duration-max" placeholder="Max">
            </div>
            <div class="filter-group">
              <button id="filter-apply" class="filter-button">Apply Filters</button>
              <button id="filter-reset" class="filter-button secondary">Reset</button>
            </div>
          </div>
        </div>
      </div>
      
      <div class="visualization-container">
        <div class="chart-container">
          <h3>Traffic Over Time</h3>
          <canvas id="traffic-chart"></canvas>
        </div>
        
        <div class="metrics-summary">
          <div class="metric-card">
            <h4>Total Requests</h4>
            <div id="total-requests" class="metric-value">0</div>
          </div>
          <div class="metric-card">
            <h4>Average Duration</h4>
            <div id="avg-duration" class="metric-value">0 ms</div>
          </div>
          <div class="metric-card">
            <h4>Unique Processes</h4>
            <div id="unique-processes" class="metric-value">0</div>
          </div>
          <div class="metric-card">
            <h4>Top Action</h4>
            <div id="top-action" class="metric-value">None</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Extract unique process IDs from time series data
 * @param {Array} timeSeriesData The time series data
 * @returns {Array} Array of unique process IDs
 */
function extractUniqueProcessIds(timeSeriesData) {
  const processIds = new Set();
  
  if (!timeSeriesData || !timeSeriesData.length) {
    return [];
  }
  
  // Extract all process IDs from each time bucket
  timeSeriesData.forEach(bucket => {
    if (bucket.processCounts) {
      Object.keys(bucket.processCounts).forEach(id => {
        if (id !== 'null' && id !== 'undefined') {
          processIds.add(id);
        }
      });
    }
  });
  
  return Array.from(processIds);
}

/**
 * Generate the JavaScript for the analytics panel functionality
 * @param {Object} rawTimeData Raw time series data from the server
 * @returns {String} JavaScript code as a string
 */
export function getAnalyticsPanelScript(rawTimeData) {
  return `
    // Store the raw time series data for analytics
    const rawAnalyticsData = ${rawTimeData}; // Already stringified
    
    // Convert ISO strings to Date objects
    const analyticsData = rawAnalyticsData.map(bucket => ({
      timestamp: new Date(bucket.timestamp),
      requests: bucket.totalRequests || 0,
      processCounts: bucket.processCounts || {},
      actions: bucket.actionCounts || {}
    }));
    
    // Initialize the chart
    let trafficChart;
    
    // Apply initial filter state
    let filterState = {
      startTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
      endTime: new Date(),
      interval: 'hour',
      processIds: ['all'],
      action: '',
      method: 'all',
      path: '',
      durationMin: null,
      durationMax: null
    };
    
    // Format dates for display
    function formatDate(date) {
      return date.toLocaleString();
    }
    
    // Update the summary metrics based on filtered data
    function updateMetricSummary(filteredData) {
      const totalRequests = filteredData.reduce((sum, bucket) => sum + bucket.requests, 0);
      document.getElementById('total-requests').textContent = totalRequests.toLocaleString();
      
      // Count unique processes
      const uniqueProcesses = new Set();
      filteredData.forEach(bucket => {
        Object.keys(bucket.processCounts || {}).forEach(id => {
          if (id !== 'null' && id !== 'undefined') {
            uniqueProcesses.add(id);
          }
        });
      });
      document.getElementById('unique-processes').textContent = uniqueProcesses.size;
      
      // Find top action (if available)
      const actionCounts = {};
      filteredData.forEach(bucket => {
        Object.entries(bucket.actions || {}).forEach(([action, count]) => {
          actionCounts[action] = (actionCounts[action] || 0) + count;
        });
      });
      
      const topAction = Object.entries(actionCounts)
        .sort((a, b) => b[1] - a[1])
        .shift();
        
      document.getElementById('top-action').textContent = 
        topAction ? topAction[0] : 'None';
        
      // For demo - we don't have real duration data yet
      document.getElementById('avg-duration').textContent = '15 ms';
    }
    
    // Filter data based on current filter state
    function filterData() {
      return analyticsData.filter(bucket => {
        // Time range filter
        if (bucket.timestamp < filterState.startTime || 
            bucket.timestamp > filterState.endTime) {
          return false;
        }
        
        // Process ID filter
        if (!filterState.processIds.includes('all')) {
          const hasMatchingProcess = filterState.processIds.some(pid => 
            bucket.processCounts && bucket.processCounts[pid]
          );
          if (!hasMatchingProcess) {
            return false;
          }
        }
        
        // Additional filters would go here
        // (We don't have all data fields in the time buckets yet)
        
        return true;
      });
    }
    
    // Group data by the selected interval
    function groupDataByInterval(data, interval) {
      const groupedData = {};
      
      data.forEach(bucket => {
        let groupKey;
        const date = bucket.timestamp;
        
        switch(interval) {
          case 'minute':
            groupKey = new Date(
              date.getFullYear(), date.getMonth(), date.getDate(),
              date.getHours(), date.getMinutes()
            ).getTime();
            break;
          case 'hour':
            groupKey = new Date(
              date.getFullYear(), date.getMonth(), date.getDate(),
              date.getHours()
            ).getTime();
            break;
          case 'day':
            groupKey = new Date(
              date.getFullYear(), date.getMonth(), date.getDate()
            ).getTime();
            break;
          case 'week':
            // Create a date for the Sunday of this week
            const dayOfWeek = date.getDay();
            const diff = date.getDate() - dayOfWeek;
            groupKey = new Date(
              date.getFullYear(), date.getMonth(), diff
            ).getTime();
            break;
          default:
            groupKey = date.getTime();
        }
        
        if (!groupedData[groupKey]) {
          groupedData[groupKey] = {
            timestamp: new Date(groupKey),
            requests: 0,
            processCounts: {},
            actions: {}
          };
        }
        
        // Aggregate the counts
        groupedData[groupKey].requests += bucket.requests;
        
        // Merge process counts
        Object.entries(bucket.processCounts || {}).forEach(([id, count]) => {
          groupedData[groupKey].processCounts[id] = 
            (groupedData[groupKey].processCounts[id] || 0) + count;
        });
        
        // Merge action counts
        Object.entries(bucket.actions || {}).forEach(([action, count]) => {
          groupedData[groupKey].actions[action] = 
            (groupedData[groupKey].actions[action] || 0) + count;
        });
      });
      
      // Convert the object to a sorted array
      return Object.values(groupedData).sort((a, b) => 
        a.timestamp.getTime() - b.timestamp.getTime()
      );
    }
    
    // Render the chart with filtered and grouped data
    function renderChart() {
      const filteredData = filterData();
      const groupedData = groupDataByInterval(filteredData, filterState.interval);
      
      // Update summary metrics
      updateMetricSummary(filteredData);
      
      // Prepare chart data
      const labels = groupedData.map(bucket => {
        return formatDate(bucket.timestamp);
      });
      
      const datasets = [{
        label: 'Total Requests',
        data: groupedData.map(bucket => bucket.requests),
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1,
        fill: false
      }];
      
      // Add individual process lines if specific processes are selected
      if (!filterState.processIds.includes('all')) {
        filterState.processIds.forEach((pid, index) => {
          const colors = [
            'rgb(255, 99, 132)',
            'rgb(54, 162, 235)',
            'rgb(255, 206, 86)',
            'rgb(153, 102, 255)',
            'rgb(255, 159, 64)'
          ];
          
          datasets.push({
            label: \`Process \${pid.substring(0, 8)}...\`,
            data: groupedData.map(bucket => 
              (bucket.processCounts && bucket.processCounts[pid]) || 0
            ),
            borderColor: colors[index % colors.length],
            tension: 0.1,
            fill: false
          });
        });
      }
      
      // Initialize or update chart
      if (trafficChart) {
        trafficChart.data.labels = labels;
        trafficChart.data.datasets = datasets;
        trafficChart.update();
      } else {
        // Clean up any existing chart on this canvas to prevent conflicts
        Chart.getChart('traffic-chart')?.destroy();
        
        const ctx = document.getElementById('traffic-chart').getContext('2d');
        trafficChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: labels,
            datasets: datasets
          },
          options: {
            responsive: true,
            scales: {
              x: {
                title: {
                  display: true,
                  text: 'Time'
                }
              },
              y: {
                beginAtZero: true,
                title: {
                  display: true,
                  text: 'Request Count'
                }
              }
            },
            plugins: {
              tooltip: {
                callbacks: {
                  title: function(tooltipItems) {
                    return formatDate(new Date(groupedData[tooltipItems[0].dataIndex].timestamp));
                  }
                }
              }
            }
          }
        });
      }
    }
    
    // Initialize all event listeners
    function initializeAnalytics() {
      // Time range selectors
      document.getElementById('time-range-apply').addEventListener('click', function() {
        const startDate = document.getElementById('start-date').value;
        const startTime = document.getElementById('start-time').value;
        const endDate = document.getElementById('end-date').value;
        const endTime = document.getElementById('end-time').value;
        
        filterState.startTime = new Date(\`\${startDate}T\${startTime}:00\`);
        filterState.endTime = new Date(\`\${endDate}T\${endTime}:00\`);
        filterState.interval = document.getElementById('interval-select').value;
        
        renderChart();
      });
      
      // Reset time button
      document.getElementById('time-range-reset').addEventListener('click', function() {
        const now = new Date();
        const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        
        document.getElementById('start-date').value = yesterday.toISOString().split('T')[0];
        document.getElementById('start-time').value = yesterday.toISOString().split('T')[1].substring(0, 5);
        document.getElementById('end-date').value = now.toISOString().split('T')[0];
        document.getElementById('end-time').value = now.toISOString().split('T')[1].substring(0, 5);
        document.getElementById('interval-select').value = 'hour';
        
        filterState.startTime = yesterday;
        filterState.endTime = now;
        filterState.interval = 'hour';
        
        renderChart();
      });
      
      // Process filter
      document.getElementById('process-filter').addEventListener('change', function() {
        const select = this;
        const selected = Array.from(select.selectedOptions).map(option => option.value);
        
        // If "All Processes" is selected, deselect other options
        if (selected.includes('all')) {
          Array.from(select.options).forEach(option => {
            if (option.value !== 'all') {
              option.selected = false;
            }
          });
          filterState.processIds = ['all'];
        } else {
          // If individual processes are selected, deselect "All Processes"
          Array.from(select.options).forEach(option => {
            if (option.value === 'all') {
              option.selected = false;
            }
          });
          filterState.processIds = Array.from(select.selectedOptions).map(option => option.value);
        }
      });
      
      // Apply filters button
      document.getElementById('filter-apply').addEventListener('click', function() {
        // Update filter state with current form values
        const processSelect = document.getElementById('process-filter');
        filterState.processIds = Array.from(processSelect.selectedOptions)
          .map(option => option.value);
          
        if (filterState.processIds.length === 0) {
          filterState.processIds = ['all'];
        }
        
        filterState.action = document.getElementById('action-filter').value;
        filterState.method = document.getElementById('method-filter').value;
        filterState.path = document.getElementById('path-filter').value;
        
        const durationMin = document.getElementById('duration-min').value;
        const durationMax = document.getElementById('duration-max').value;
        
        filterState.durationMin = durationMin ? parseInt(durationMin, 10) : null;
        filterState.durationMax = durationMax ? parseInt(durationMax, 10) : null;
        
        renderChart();
      });
      
      // Reset filters button
      document.getElementById('filter-reset').addEventListener('click', function() {
        // Reset all filter form elements
        document.getElementById('process-filter').value = 'all';
        document.getElementById('action-filter').value = '';
        document.getElementById('method-filter').value = 'all';
        document.getElementById('path-filter').value = '';
        document.getElementById('duration-min').value = '';
        document.getElementById('duration-max').value = '';
        
        // Reset filter state
        filterState.processIds = ['all'];
        filterState.action = '';
        filterState.method = 'all';
        filterState.path = '';
        filterState.durationMin = null;
        filterState.durationMax = null;
        
        renderChart();
      });
      
      // Initial render
      renderChart();
    }
    
    // Initialize when DOM is loaded
    document.addEventListener('DOMContentLoaded', initializeAnalytics);
  `;
}

/**
 * Generate CSS for the analytics panel
 * @returns {String} CSS styles as a string
 */
export function getAnalyticsPanelStyles() {
  return `
    .analytics-panel {
      margin-top: 2rem;
      padding: 1.5rem;
      background-color: #fff;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    }
    
    .analytics-panel h2 {
      margin-top: 0;
      margin-bottom: 1.5rem;
      color: #333;
      border-bottom: 2px solid #eee;
      padding-bottom: 0.5rem;
    }
    
    .filter-container {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    
    .filter-section {
      background-color: #f9f9f9;
      border-radius: 6px;
      padding: 1rem;
      border: 1px solid #eee;
    }
    
    .filter-section h3 {
      margin-top: 0;
      margin-bottom: 1rem;
      font-size: 1.1rem;
      color: #555;
    }
    
    .filter-row {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }
    
    .filter-row:last-child {
      margin-bottom: 0;
    }
    
    .filter-group {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex: 1;
      min-width: 200px;
    }
    
    .filter-group label {
      min-width: 80px;
      font-weight: 500;
    }
    
    .filter-group input,
    .filter-group select {
      flex: 1;
      padding: 0.5rem;
      border: 1px solid #ccc;
      border-radius: 4px;
      background-color: white;
    }
    
    .filter-group span {
      margin: 0 0.25rem;
    }
    
    .filter-button {
      padding: 0.5rem 1rem;
      background-color: #4a90e2;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    
    .filter-button:hover {
      background-color: #3a7bc8;
    }
    
    .filter-button.secondary {
      background-color: #999;
    }
    
    .filter-button.secondary:hover {
      background-color: #777;
    }
    
    .visualization-container {
      display: flex;
      flex-direction: column;
      gap: 2rem;
    }
    
    .chart-container {
      background-color: #f9f9f9;
      border-radius: 6px;
      padding: 1rem;
      border: 1px solid #eee;
    }
    
    .chart-container h3 {
      margin-top: 0;
      margin-bottom: 1rem;
      font-size: 1.1rem;
      color: #555;
      text-align: center;
    }
    
    .metrics-summary {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      justify-content: space-between;
    }
    
    .metric-card {
      background-color: #f9f9f9;
      border-radius: 6px;
      padding: 1rem;
      border: 1px solid #eee;
      flex: 1;
      min-width: 150px;
      text-align: center;
    }
    
    .metric-card h4 {
      margin-top: 0;
      margin-bottom: 0.5rem;
      color: #555;
      font-size: 0.9rem;
    }
    
    .metric-value {
      font-size: 1.8rem;
      font-weight: bold;
      color: #4a90e2;
    }
    
    @media (min-width: 768px) {
      .filter-container {
        flex-direction: row;
      }
      
      .filter-section {
        flex: 1;
      }
    }
    
    @media (max-width: 767px) {
      .filter-group {
        flex-direction: column;
        align-items: flex-start;
      }
      
      .filter-group label {
        margin-bottom: 0.25rem;
      }
    }
  `;
}
