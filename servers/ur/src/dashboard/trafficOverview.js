/**
 * Traffic Overview Dashboard Component
 * Provides visualization of request traffic with customizable time ranges and intervals
 */

/**
 * Generate the traffic overview HTML
 * @returns {String} Traffic overview HTML
 */
export function generateTrafficOverviewHtml() {
  return `
    <div class="traffic-overview-container">
      <div class="traffic-overview-header">
        <h3>Traffic Overview</h3>
        <div class="traffic-overview-description">
          Monitor request traffic with customizable time ranges and grouping intervals.
        </div>
      </div>
      
      <div class="traffic-controls">
        <div class="control-group">
          <label for="timeRangeSelector">Time Range:</label>
          <select id="timeRangeSelector" class="form-select">
            <option value="1min">Last Minute</option>
            <option value="5min">Last 5 Minutes</option>
            <option value="15min">Last 15 Minutes</option>
            <option value="30min">Last 30 Minutes</option>
            <option value="1hour" selected>Last Hour</option>
            <option value="3hour">Last 3 Hours</option>
            <option value="6hour">Last 6 Hours</option>
            <option value="12hour">Last 12 Hours</option>
            <option value="1day">Last Day</option>
            <option value="7day">Last Week</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>
        
        <div class="control-group interval-group">
          <label for="intervalSelector">Group By:</label>
          <select id="intervalSelector" class="form-select">
            <option value="5sec">5 Seconds</option>
            <option value="15sec">15 Seconds</option>
            <option value="30sec">30 Seconds</option>
            <option value="1min" selected>1 Minute</option>
            <option value="5min">5 Minutes</option>
            <option value="10min">10 Minutes</option>
            <option value="15min">15 Minutes</option>
            <option value="30min">30 Minutes</option>
            <option value="1hour">1 Hour</option>
            <option value="3hour">3 Hours</option>
            <option value="6hour">6 Hours</option>
            <option value="12hour">12 Hours</option>
            <option value="1day">1 Day</option>
          </select>
        </div>
        
        <div class="custom-range-controls" style="display: none;">
          <div class="control-group">
            <label for="startDatePicker">Start:</label>
            <input type="datetime-local" id="startDatePicker" class="form-control">
          </div>
          <div class="control-group">
            <label for="endDatePicker">End:</label>
            <input type="datetime-local" id="endDatePicker" class="form-control">
          </div>
        </div>
        
        <div class="control-group process-filter-group">
          <label for="processIdFilter">Process ID Filter:</label>
          <input type="text" id="processIdFilter" class="form-control" placeholder="Filter by Process ID">
          <div id="processIdSuggestions" class="process-id-suggestions" style="display: none;"></div>
        </div>
        
        <div class="control-group">
          <button id="applyTrafficFilters" class="btn btn-primary">Apply</button>
          <button id="refreshTrafficData" class="btn btn-outline-secondary">
            <i class="bi bi-arrow-clockwise"></i> Refresh
          </button>
        </div>
      </div>
      
      <div class="traffic-visualization">
        <div class="chart-container">
          <canvas id="trafficChart"></canvas>
          <div id="chartLoadingOverlay" class="loading-overlay">
            <div class="spinner-border text-primary" role="status">
              <span class="visually-hidden">Loading...</span>
            </div>
          </div>
        </div>
        
        <div class="traffic-table-container">
          <table class="table table-striped" id="trafficTable">
            <thead>
              <tr>
                <th>Time</th>
                <th>Requests</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="trafficTableBody">
              <tr>
                <td colspan="3" class="text-center">No data available</td>
              </tr>
            </tbody>
          </table>
          <div id="tableLoadingOverlay" class="loading-overlay">
            <div class="spinner-border text-primary" role="status">
              <span class="visually-hidden">Loading...</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Generate the traffic overview CSS
 * @returns {String} Traffic overview CSS
 */
export function getTrafficOverviewStyles() {
  return `
    .traffic-overview-container {
      background-color: #fff;
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 30px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }
    
    .traffic-overview-header {
      margin-bottom: 20px;
    }
    
    .traffic-overview-header h3 {
      margin-bottom: 10px;
      color: #2c3e50;
    }
    
    .traffic-overview-description {
      color: #7f8c8d;
      font-size: 0.9rem;
    }
    
    .traffic-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 1px solid #eee;
    }
    
    .control-group {
      flex: 1;
      min-width: 150px;
    }
    
    .control-group label {
      display: block;
      margin-bottom: 5px;
      font-weight: 500;
      font-size: 0.9rem;
    }
    
    .custom-range-controls {
      display: flex;
      gap: 15px;
      width: 100%;
    }
    
    .process-filter-group {
      position: relative;
      flex: 2;
    }
    
    .process-id-suggestions {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      z-index: 10;
      background: white;
      border: 1px solid #ddd;
      border-radius: 0 0 5px 5px;
      max-height: 200px;
      overflow-y: auto;
    }
    
    .process-id-suggestions div {
      padding: 8px 10px;
      cursor: pointer;
      border-bottom: 1px solid #eee;
    }
    
    .process-id-suggestions div:hover {
      background-color: #f5f7fa;
    }
    
    .traffic-visualization {
      position: relative;
    }
    
    .chart-container {
      position: relative;
      height: 300px;
      margin-bottom: 30px;
    }
    
    .traffic-table-container {
      position: relative;
      margin-top: 20px;
      overflow-x: auto;
    }
    
    .loading-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(255, 255, 255, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 5;
    }
    
    #trafficTable {
      width: 100%;
    }
    
    #trafficTable th {
      background-color: #f8f9fa;
      border-top: none;
      font-weight: 600;
      color: #2c3e50;
    }
    
    .action-tags-container {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      position: relative;
    }
    
    .action-tooltip {
      display: inline-block;
      position: relative;
      margin-right: 8px;
      cursor: help;
    }
    
    .action-tooltip-text {
      visibility: hidden;
      width: 250px;
      background-color: #555;
      color: #fff;
      text-align: center;
      border-radius: 6px;
      padding: 5px;
      position: absolute;
      z-index: 1;
      bottom: 125%;
      left: 50%;
      margin-left: -125px;
      opacity: 0;
      transition: opacity 0.3s;
      font-size: 0.8rem;
    }
    
    .action-tooltip:hover .action-tooltip-text {
      visibility: visible;
      opacity: 1;
    }
    
    .action-tag {
      display: inline-flex;
      align-items: center;
      padding: 3px 10px;
      margin: 2px;
      border-radius: 12px;
      font-size: 0.8rem;
      background-color: #e9ecef;
    }
    
    .action-name {
      font-weight: 500;
      margin-right: 5px;
    }
    
    .action-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background-color: #3498db;
      color: white;
      border-radius: 50%;
      min-width: 20px;
      height: 20px;
      padding: 0 4px;
      font-size: 0.75rem;
      font-weight: bold;
    }
    
    .no-actions {
      color: #6c757d;
      font-style: italic;
    }
    
    /* New refresh controls styling */
    .refresh-card {
      background-color: #f8f9fa;
      border-radius: 8px;
      padding: 15px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      margin-bottom: 20px;
    }
    
    .refresh-header {
      margin-bottom: 15px;
      border-bottom: 1px solid #e9ecef;
      padding-bottom: 10px;
    }
    
    .refresh-header h4 {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      color: #2c3e50;
    }
    
    .refresh-body {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      align-items: center;
    }
    
    .refresh-interval-group {
      display: flex;
      flex-direction: column;
      gap: 5px;
      min-width: 180px;
    }
    
    .refresh-input-group {
      display: flex;
      align-items: center;
    }
    
    .refresh-input-group input {
      width: 70px;
      text-align: center;
      border-radius: 4px 0 0 4px;
    }
    
    .refresh-input-group .input-group-text {
      background-color: #e9ecef;
      border: 1px solid #ced4da;
      border-left: none;
      border-radius: 0 4px 4px 0;
      padding: 0.375rem 0.75rem;
    }
    
    .refresh-status {
      flex: 1;
      min-width: 200px;
    }
    
    .status-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 5px;
    }
    
    .status-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    
    .status-dot.active {
      background-color: #28a745;
      box-shadow: 0 0 5px rgba(40, 167, 69, 0.5);
    }
    
    .status-dot.paused {
      background-color: #6c757d;
    }
    
    .last-updated {
      font-size: 0.8rem;
      color: #6c757d;
    }
    
    .refresh-buttons {
      display: flex;
      gap: 8px;
      margin-left: auto;
    }
    
    @media (max-width: 768px) {
      .traffic-controls {
        flex-direction: column;
      }
      
      .control-group {
        width: 100%;
      }
    }
  `;
}

/**
 * Generate the traffic overview JavaScript
 * @returns {String} Traffic overview JavaScript
 */
export function getTrafficOverviewScript() {
  return `
    // Global function for external references
    function initializeTimeChart() {
      console.log('Legacy initializeTimeChart called - using new traffic overview implementation');
      // If chart already exists, just refresh data
      if (window.trafficChart) {
        loadTrafficData(window.trafficChart);
      } else {
        // Otherwise wait for DOM to be ready and initialize
        document.addEventListener('DOMContentLoaded', () => {
          if (document.getElementById('trafficChart')) {
            initializeTrafficOverview();
          }
        });
      }
    }
    
    // Traffic Overview initialization
    function initializeTrafficOverview() {
      // Set up Chart.js configuration
      const ctx = document.getElementById('trafficChart').getContext('2d');
      const trafficChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'Requests',
            data: [],
            borderColor: 'rgb(54, 162, 235)',
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            fill: true,
            tension: 0.2,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              grid: {
                display: false
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
                text: 'Request Count'
              }
            }
          },
          plugins: {
            tooltip: {
              mode: 'index',
              intersect: false
            },
            legend: {
              position: 'top',
            }
          }
        }
      });
      
      // Initialize date pickers with current date range
      initializeDatePickers();
      
      // Set up event listeners
      setupEventListeners(trafficChart);
      
      // Initial data load - default to 1 minute interval
      document.getElementById('intervalSelector').value = '1min';
      loadTrafficData(trafficChart);
      
      // Load process ID suggestions
      loadProcessIdSuggestions();
      
      // Store chart in window for potential external access
      window.trafficChart = trafficChart;
      
      // Register with global refresh system if available
      if (window.dashboardRefresh) {
        window.dashboardRefresh.register(function(graceful) {
          loadTrafficData(trafficChart, graceful);
        });
      }
      
      // Set up event listener for manual refresh button
      document.getElementById('refreshTrafficData').addEventListener('click', function() {
        loadTrafficData(trafficChart, false); // Manual refresh is not graceful
      });
    }
    
    // Initialize date pickers with default values
    function initializeDatePickers() {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600000);
      
      const startPicker = document.getElementById('startDatePicker');
      const endPicker = document.getElementById('endDatePicker');
      
      // Format date for datetime-local input
      startPicker.value = formatDateTimeForInput(oneHourAgo);
      endPicker.value = formatDateTimeForInput(now);
    }
    
    // Format date for datetime-local input
    function formatDateTimeForInput(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      
      return \`\${year}-\${month}-\${day}T\${hours}:\${minutes}\`;
    }
    
    // Setup event listeners for controls
    function setupEventListeners(chart) {
      // Time range selector change
      document.getElementById('timeRangeSelector').addEventListener('change', function() {
        const customRangeControls = document.querySelector('.custom-range-controls');
        if (this.value === 'custom') {
          customRangeControls.style.display = 'flex';
        } else {
          customRangeControls.style.display = 'none';
          
          // Update date pickers to match selected range
          updateDatePickersFromRange(this.value);
          
          // For short time ranges, use smaller intervals
          const intervalSelector = document.getElementById('intervalSelector');
          if (intervalSelector) {
            // Adjust interval based on time range
            if (['1min', '5min'].includes(this.value)) {
              // For short ranges, use seconds
              intervalSelector.value = '5sec';
            } else if (['15min', '30min'].includes(this.value)) {
              intervalSelector.value = '30sec';
            } else if (['1hour'].includes(this.value)) {
              intervalSelector.value = '1min';
            } else if (['3hour', '6hour'].includes(this.value)) {
              intervalSelector.value = '5min';
            } else if (['12hour', '1day'].includes(this.value)) {
              intervalSelector.value = '30min';
            } else if (['7day'].includes(this.value)) {
              intervalSelector.value = '3hour';
            }
          }
        }
      });
      
      // Interval selector change
      document.getElementById('intervalSelector').addEventListener('change', function() {
        console.log('Interval changed to:', this.value);
        // When interval changes, reload data with new interval
        loadTrafficData(chart);
      });
      
      // Apply filters button
      document.getElementById('applyTrafficFilters').addEventListener('click', function() {
        loadTrafficData(chart);
      });
      
      // Refresh button
      document.getElementById('refreshTrafficData').addEventListener('click', function() {
        loadTrafficData(chart);
      });
      
      // Process ID filter input
      const processIdFilter = document.getElementById('processIdFilter');
      const suggestions = document.getElementById('processIdSuggestions');
      
      processIdFilter.addEventListener('focus', function() {
        if (suggestions.children.length > 0) {
          suggestions.style.display = 'block';
        }
      });
      
      processIdFilter.addEventListener('blur', function() {
        // Delayed hide to allow clicking on suggestions
        setTimeout(() => {
          suggestions.style.display = 'none';
        }, 200);
      });
      
      processIdFilter.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        const allSuggestions = suggestions.querySelectorAll('div');
        
        // Filter visible suggestions
        Array.from(allSuggestions).forEach(suggestion => {
          const text = suggestion.textContent.toLowerCase();
          suggestion.style.display = text.includes(searchTerm) ? 'block' : 'none';
        });
        
        // Show suggestions container if we have matches
        const hasVisibleSuggestions = Array.from(allSuggestions).some(
          suggestion => suggestion.style.display !== 'none'
        );
        
        suggestions.style.display = hasVisibleSuggestions ? 'block' : 'none';
      });
    }
    
    // Update date pickers based on selected time range
    function updateDatePickersFromRange(range) {
      const now = new Date();
      let startDate = new Date(now);
      
      // Calculate start date based on range
      switch(range) {
        case '1min':
          startDate.setMinutes(now.getMinutes() - 1);
          break;
        case '5min':
          startDate.setMinutes(now.getMinutes() - 5);
          break;
        case '15min':
          startDate.setMinutes(now.getMinutes() - 15);
          break;
        case '30min':
          startDate.setMinutes(now.getMinutes() - 30);
          break;
        case '1hour':
          startDate.setHours(now.getHours() - 1);
          break;
        case '3hour':
          startDate.setHours(now.getHours() - 3);
          break;
        case '6hour':
          startDate.setHours(now.getHours() - 6);
          break;
        case '12hour':
          startDate.setHours(now.getHours() - 12);
          break;
        case '1day':
          startDate.setDate(now.getDate() - 1);
          break;
        case '7day':
          startDate.setDate(now.getDate() - 7);
          break;
      }
      
      // Update date pickers
      document.getElementById('startDatePicker').value = formatDateTimeForInput(startDate);
      document.getElementById('endDatePicker').value = formatDateTimeForInput(now);
    }
    
    // Load traffic data from the server
    function loadTrafficData(chart, graceful = false) {
      console.log('Loading traffic data...'); // Debug log
      
      // Only show loading indicators if not graceful refresh
      if (!graceful) {
        document.getElementById('chartLoadingOverlay').style.display = 'flex';
        document.getElementById('tableLoadingOverlay').style.display = 'flex';
      }
      
      // Clear any previous error messages
      const errorDisplay = document.getElementById('error-message');
      if (errorDisplay) {
        errorDisplay.style.display = 'none';
      }
      
      // Get filter values
      const timeRange = document.getElementById('timeRangeSelector').value;
      const interval = document.getElementById('intervalSelector').value;
      const processIdFilter = document.getElementById('processIdFilter').value;
      
      // Get date range
      let startTime, endTime;
      
      if (timeRange === 'custom') {
        startTime = new Date(document.getElementById('startDatePicker').value);
        endTime = new Date(document.getElementById('endDatePicker').value);
      } else {
        endTime = new Date();
        startTime = calculateStartTime(endTime, timeRange);
      }
      
      // Format dates for URL
      const startParam = startTime.toISOString();
      const endParam = endTime.toISOString();
      
      // Get the selected interval
      const selectedInterval = document.getElementById('intervalSelector').value;
      console.log('Using interval for API request:', selectedInterval);
      
      // Construct API URL
      let url = '/api/traffic-data?startTime=' + encodeURIComponent(startParam) + 
                '&endTime=' + encodeURIComponent(endParam) + 
                '&interval=' + selectedInterval;
      
      if (processIdFilter) {
        url += '&processIdFilter=' + encodeURIComponent(processIdFilter);
      }
      
      // Fetch data from API
      fetch(url)
        .then(response => {
          if (!response.ok) {
            throw new Error('Network response was not ok');
          }
          console.log('Response received from server');
          return response.json();
        })
        .then(data => {
          updateTrafficVisualization(chart, data, graceful);
        })
        .catch(error => {
          console.error('Error fetching traffic data:', error);
          if (!graceful) {
            showErrorMessage('Failed to load traffic data. Please try again.');
          }
        })
        .finally(() => {
          // Hide loading indicators
          document.getElementById('chartLoadingOverlay').style.display = 'none';
          document.getElementById('tableLoadingOverlay').style.display = 'none';
        });
    }
    
    // Calculate start time based on time range
    function calculateStartTime(endTime, timeRange) {
      const startTime = new Date(endTime);
      
      switch(timeRange) {
        case '1min':
          startTime.setMinutes(endTime.getMinutes() - 1);
          break;
        case '5min':
          startTime.setMinutes(endTime.getMinutes() - 5);
          break;
        case '15min':
          startTime.setMinutes(endTime.getMinutes() - 15);
          break;
        case '30min':
          startTime.setMinutes(endTime.getMinutes() - 30);
          break;
        case '1hour':
          startTime.setHours(endTime.getHours() - 1);
          break;
        case '3hour':
          startTime.setHours(endTime.getHours() - 3);
          break;
        case '6hour':
          startTime.setHours(endTime.getHours() - 6);
          break;
        case '12hour':
          // Fix the 12-hour limit by ensuring we go back full 12 hours
          startTime.setTime(endTime.getTime() - (12 * 60 * 60 * 1000));
          break;
        case '1day':
          startTime.setTime(endTime.getTime() - (24 * 60 * 60 * 1000));
          break;
        case '7day':
          startTime.setTime(endTime.getTime() - (7 * 24 * 60 * 60 * 1000));
          break;
        default:
          startTime.setHours(endTime.getHours() - 1); // Default to 1 hour
      }
      
      return startTime;
    }
    
    // Update traffic chart and table with new data
    function updateTrafficVisualization(chart, data, graceful = false) {
      console.log('Updating visualization with data:', data); // Debug log
      // Check if chart is valid
      if (!chart || !chart.data) {
        console.error('Invalid chart object');
        return;
      }
      
      // Validate received data
      if (!data || !data.trafficData || !Array.isArray(data.trafficData) || data.error) {
        if (!graceful) {
          showErrorMessage(data.error || 'Invalid data received from server');
        }
        return;
      }
      
      // Extract data for chart
      const timeLabels = data.timeLabels || [];
      const requestCounts = data.trafficData.map(item => item.request_count || 0);
      
      // Ensure chart data structure exists
      if (!chart.data.datasets || !chart.data.datasets[0]) {
        chart.data.datasets = [{
          label: 'Requests',
          data: [],
          borderColor: 'rgb(54, 162, 235)',
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          fill: true,
          tension: 0.2,
          borderWidth: 2
        }];
      }
      
      if (graceful) {
        // Graceful transition - use animation
        const animation = {
          duration: 600,
          easing: 'easeOutQuad'
        };
        
        // Update chart with animation
        chart.data.labels = timeLabels;
        chart.data.datasets[0].data = requestCounts;
        chart.update(animation);
        
        // Update table with a fade transition
        const tableBody = document.getElementById('trafficTableBody');
        if (tableBody) {
          // Create a temporary container for the new table content
          const tempContainer = document.createElement('div');
          tempContainer.style.position = 'absolute';
          tempContainer.style.left = '-9999px';
          document.body.appendChild(tempContainer);
          
          // Generate the new table HTML
          tempContainer.innerHTML = '<table><tbody></tbody></table>';
          const tempTableBody = tempContainer.querySelector('tbody');
          
          // Populate with new data
          populateTableBody(tempTableBody, data.trafficData);
          
          // Fade out current content
          tableBody.style.transition = 'opacity 300ms';
          tableBody.style.opacity = '0.3';
          
          // After fade out, replace content and fade in
          setTimeout(function() {
            tableBody.innerHTML = tempTableBody.innerHTML;
            tableBody.style.opacity = '1';
            document.body.removeChild(tempContainer);
          }, 300);
        }
      } else {
        // Regular update without transition
        chart.data.labels = timeLabels;
        chart.data.datasets[0].data = requestCounts;
        chart.update();
        
        // Update table
        updateTrafficTable(data.trafficData);
      }
    }
    
    // Update traffic table with new data
    function updateTrafficTable(trafficData) {
      const tableBody = document.getElementById('trafficTableBody');
      
      // Clear existing rows
      tableBody.innerHTML = '';
      
      if (!trafficData || trafficData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3" class="text-center">No data available</td></tr>';
        return;
      }
      
      // Populate the table body
      populateTableBody(tableBody, trafficData);
    }
    
    // Helper function to populate a table body with traffic data
    function populateTableBody(tableBody, trafficData) {
      if (!trafficData || trafficData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3" class="text-center">No data available</td></tr>';
        return;
      }
      
      // Add rows for each time bucket (newest first)
      trafficData.slice().reverse().forEach(function(data) {
        const row = document.createElement('tr');
        
        // Time column
        const timeCell = document.createElement('td');
        timeCell.textContent = data.formatted_time;
        row.appendChild(timeCell);
        
        // Request count column
        const countCell = document.createElement('td');
        countCell.textContent = data.request_count;
        row.appendChild(countCell);
        
        // Actions column
        const actionsCell = document.createElement('td');
        const actionCounts = data.action_counts || {};
        
        // Create a container for action tags with title
        const actionContainer = document.createElement('div');
        actionContainer.className = 'action-tags-container';
        
        // Add an explanation tooltip
        const actionTooltip = document.createElement('div');
        actionTooltip.className = 'action-tooltip';
        actionTooltip.innerHTML = '<i class="bi bi-info-circle"></i><span class="action-tooltip-text">The number next to each action represents the count of requests with that action type during this time period.</span>';
        actionContainer.appendChild(actionTooltip);
        
        // Create action tags
        Object.entries(actionCounts).forEach(function([action, count]) {
          if (action && action !== 'null' && action !== 'undefined') {
            const actionTag = document.createElement('span');
            actionTag.classList.add('action-tag');
            
            // Create a more descriptive format
            const actionName = document.createElement('span');
            actionName.className = 'action-name';
            actionName.textContent = action;
            
            const actionCount = document.createElement('span');
            actionCount.className = 'action-count';
            actionCount.textContent = count;
            
            actionTag.appendChild(actionName);
            actionTag.appendChild(actionCount);
            
            actionContainer.appendChild(actionTag);
          }
        });
        
        if (Object.keys(actionCounts).length === 0) {
          actionContainer.innerHTML += '<span class="no-actions">None</span>';
        }
        
        actionsCell.appendChild(actionContainer);
        row.appendChild(actionsCell);
        tableBody.appendChild(row);
      });
    }
    
    // Load process ID suggestions from the server
    function loadProcessIdSuggestions() {
      const suggestionsContainer = document.getElementById('processIdSuggestions');
      
      // Get current time range
      const timeRange = document.getElementById('timeRangeSelector').value;
      let startTime, endTime;
      
      if (timeRange === 'custom') {
        startTime = new Date(document.getElementById('startDatePicker').value);
        endTime = new Date(document.getElementById('endDatePicker').value);
      } else {
        endTime = new Date();
        startTime = calculateStartTime(endTime, timeRange);
      }
      
      // Format dates for URL
      const startParam = startTime.toISOString();
      const endParam = endTime.toISOString();
      
      // Fetch process IDs
      fetch(\`/api/process-ids?startTime=\${encodeURIComponent(startParam)}&endTime=\${encodeURIComponent(endParam)}\`)
        .then(response => response.json())
        .then(data => {
          if (data && Array.isArray(data)) {
            // Clear existing suggestions
            suggestionsContainer.innerHTML = '';
            
            // Add each process ID as a suggestion
            data.forEach(processId => {
              const suggestion = document.createElement('div');
              suggestion.textContent = processId;
              suggestion.addEventListener('click', () => {
                document.getElementById('processIdFilter').value = processId;
                suggestionsContainer.style.display = 'none';
              });
              suggestionsContainer.appendChild(suggestion);
            });
          }
        })
        .catch(error => {
          console.error('Error loading process ID suggestions:', error);
        });
    }
    
    // Show error message
    function showErrorMessage(message) {
      // Create toast notification
      const toast = document.createElement('div');
      toast.classList.add('toast-notification', 'error');
      toast.innerHTML = \`
        <div class="toast-header">
          <i class="bi bi-exclamation-triangle-fill"></i>
          <span>Error</span>
          <button class="toast-close">&times;</button>
        </div>
        <div class="toast-body">\${message}</div>
      \`;
      
      document.body.appendChild(toast);
      
      // Auto-remove after 5 seconds
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 5000);
      
      // Close button
      toast.querySelector('.toast-close').addEventListener('click', () => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      });
    }
    
    // Initialize traffic overview when page loads
    document.addEventListener('DOMContentLoaded', initializeTrafficOverview);
  `;
}

/**
 * Generate traffic overview API route setup 
 * @returns {String} API route setup code
 */
export function getTrafficApiSetup() {
  return `
  // Import necessary modules
  import { getTrafficData, getUniqueProcessIds } from './database/trafficService.js';
  
  // Setup traffic data API endpoints
  app.get('/api/traffic-data', async (req, res) => {
    try {
      const startTime = req.query.startTime ? new Date(req.query.startTime) : new Date(Date.now() - 3600000);
      const endTime = req.query.endTime ? new Date(req.query.endTime) : new Date();
      const interval = req.query.interval || '1min';
      const processIdFilter = req.query.processIdFilter || null;
      
      const data = await getTrafficData({
        startTime,
        endTime,
        interval,
        processIdFilter
      });
      
      res.json(data);
    } catch (error) {
      console.error('Error fetching traffic data:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // API endpoint for process ID suggestions
  app.get('/api/process-ids', async (req, res) => {
    try {
      const startTime = req.query.startTime ? new Date(req.query.startTime) : new Date(Date.now() - 3600000);
      const endTime = req.query.endTime ? new Date(req.query.endTime) : new Date();
      
      const processIds = await getUniqueProcessIds({
        startTime,
        endTime
      });
      
      res.json(processIds);
    } catch (error) {
      console.error('Error fetching process IDs:', error);
      res.status(500).json({ error: error.message });
    }
  });
  `;
}
