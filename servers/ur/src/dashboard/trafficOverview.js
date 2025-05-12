/**
 * Traffic Overview Component
 * Advanced metrics visualization with time-based filtering and process ID filtering
 */

/**
 * Generate the traffic overview component with flexible filtering options
 * @param {Object} trafficData - Data from getFlexibleTimeSeriesData
 * @returns {String} HTML for the traffic overview component
 */
export function generateTrafficOverview(trafficData = { timeSeriesData: [], timeLabels: [], uniqueProcessIds: [] }) {
  // Default values
  const timeRangeOptions = [
    { value: 1, label: '1 Minute' },
    { value: 30, label: '30 Minutes' },
    { value: 60, label: '1 Hour' },
    { value: 180, label: '3 Hours' },
    { value: 360, label: '6 Hours' },
    { value: 1440, label: '1 Day' },
    { value: 10080, label: '1 Week' }
  ];
  
  const intervalOptions = [
    { value: 5, label: '5 Seconds' },
    { value: 15, label: '15 Seconds' },
    { value: 30, label: '30 Seconds' },
    { value: 60, label: '1 Minute' },
    { value: 300, label: '5 Minutes' },
    { value: 600, label: '10 Minutes' },
    { value: 1800, label: '30 Minutes' },
    { value: 3600, label: '1 Hour' },
    { value: 14400, label: '4 Hours' },
    { value: 86400, label: '1 Day' }
  ];
  
  // Generate options for time range selector
  const timeRangeOptionsHtml = timeRangeOptions.map(option => 
    `<option value="${option.value}"${option.value === 60 ? ' selected' : ''}>${option.label}</option>`
  ).join('');
  
  // Generate options for interval selector
  const intervalOptionsHtml = intervalOptions.map(option => 
    `<option value="${option.value}"${option.value === 60 ? ' selected' : ''}>${option.label}</option>`
  ).join('');
  
  // Generate process ID filter options
  const processIdOptionsHtml = [
    '<option value="">All Process IDs</option>',
    ...(trafficData.uniqueProcessIds || []).map(pid => 
      `<option value="${pid}">${pid.substring(0, 12)}...</option>`
    )
  ].join('');
  
  // Prepare chart data
  const chartData = {
    labels: trafficData.timeLabels || [],
    datasets: [{
      label: 'Requests',
      data: (trafficData.timeSeriesData || []).map(d => d.requestCount || 0),
      borderColor: 'rgba(75, 192, 192, 1)',
      backgroundColor: 'rgba(75, 192, 192, 0.2)',
      borderWidth: 2,
      tension: 0.1,
      fill: true
    }]
  };
  
  // Convert chart data to JSON string for the frontend
  const chartDataJson = JSON.stringify(chartData).replace(/"/g, '&quot;');
  
  // Generate HTML table rows for time series data (most recent on right)
  const timeSeriesRows = [];
  
  // First row: Time labels
  const timeLabelsRow = `
    <tr>
      <th>Time</th>
      ${(trafficData.timeLabels || []).map(label => 
        `<td class="text-center">${label}</td>`
      ).reverse().join('')}
    </tr>
  `;
  timeSeriesRows.push(timeLabelsRow);
  
  // Second row: Request counts
  const requestCountsRow = `
    <tr>
      <th>Requests</th>
      ${(trafficData.timeSeriesData || []).map(d => 
        `<td class="text-center">${d.requestCount || 0}</td>`
      ).reverse().join('')}
    </tr>
  `;
  timeSeriesRows.push(requestCountsRow);
  
  // Third row: Average duration
  const avgDurationRow = `
    <tr>
      <th>Avg Duration (ms)</th>
      ${(trafficData.timeSeriesData || []).map(d => 
        `<td class="text-center">${Math.round(d.avgDuration || 0)}</td>`
      ).reverse().join('')}
    </tr>
  `;
  timeSeriesRows.push(avgDurationRow);
  
  // Create rows for each unique process ID (up to 10)
  const topProcessIds = (trafficData.uniqueProcessIds || []).slice(0, 10);
  topProcessIds.forEach(pid => {
    const processRow = `
      <tr>
        <th title="${pid}">${pid.substring(0, 8)}...</th>
        ${(trafficData.timeSeriesData || []).map(d => {
          const count = d.processCounts && d.processCounts[pid] ? d.processCounts[pid] : 0;
          return `<td class="text-center">${count}</td>`;
        }).reverse().join('')}
      </tr>
    `;
    timeSeriesRows.push(processRow);
  });
  
  // Maximum table width for responsive design
  const maxTableWidth = Math.min(trafficData.timeSeriesData?.length || 0, 50) * 80;
  
  return `
    <div class="metrics-panel traffic-overview">
      <h3>Traffic Overview</h3>
      
      <div class="filter-controls mb-3">
        <div class="row">
          <div class="col-md-4">
            <label for="timeRangeSelect">Time Range:</label>
            <select id="timeRangeSelect" class="form-control">
              ${timeRangeOptionsHtml}
            </select>
          </div>
          <div class="col-md-4">
            <label for="intervalSelect">Interval:</label>
            <select id="intervalSelect" class="form-control">
              ${intervalOptionsHtml}
            </select>
          </div>
          <div class="col-md-4">
            <label for="processIdFilter">Process ID Filter:</label>
            <select id="processIdFilter" class="form-control">
              ${processIdOptionsHtml}
            </select>
          </div>
        </div>
      </div>
      
      <div class="chart-container mb-3" style="position: relative; height: 200px;">
        <canvas id="trafficChart" data-chart='${chartDataJson}'></canvas>
      </div>
      
      <div class="table-responsive">
        <div class="table-wrapper" style="max-width: ${maxTableWidth}px; overflow-x: auto;">
          <table class="table table-striped table-bordered traffic-table">
            <thead>
              <tr class="text-right small text-muted">
                <th></th>
                <td colspan="${trafficData.timeLabels?.length || 0}" class="text-center">
                  Oldest → Most Recent 
                  <span class="float-right">
                    Total: <strong>${trafficData.totalRequests || 0}</strong> requests
                  </span>
                </td>
              </tr>
            </thead>
            <tbody>
              ${timeSeriesRows.join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    
    <script>
      // Initialize traffic overview controls
      document.addEventListener('DOMContentLoaded', function() {
        const timeRangeSelect = document.getElementById('timeRangeSelect');
        const intervalSelect = document.getElementById('intervalSelect');
        const processIdFilter = document.getElementById('processIdFilter');
        const trafficChart = document.getElementById('trafficChart');
        
        // Initial chart setup
        if (trafficChart) {
          setupTrafficChart();
        }
        
        // Event listeners for filter changes
        if (timeRangeSelect && intervalSelect && processIdFilter) {
          timeRangeSelect.addEventListener('change', updateTrafficOverview);
          intervalSelect.addEventListener('change', updateTrafficOverview);
          processIdFilter.addEventListener('change', updateTrafficOverview);
        }
        
        // Function to update traffic overview based on filters
        function updateTrafficOverview() {
          const timeRange = parseInt(timeRangeSelect.value, 10);
          const interval = parseInt(intervalSelect.value, 10);
          const processId = processIdFilter.value;
          
          // Don't allow intervals greater than the time range
          if (interval > timeRange * 60) {
            alert('Interval cannot be greater than the selected time range');
            intervalSelect.value = Math.min(interval, timeRange * 60).toString();
            return;
          }
          
          // Fetch updated data
          fetch('/api/dashboard/traffic-overview?' + new URLSearchParams({
            timeRangeMinutes: timeRange,
            intervalSeconds: interval,
            processIdFilter: processId
          }))
          .then(response => response.json())
          .then(data => {
            // Refresh the entire traffic overview section
            const overviewContainer = document.querySelector('.traffic-overview');
            if (overviewContainer && overviewContainer.parentNode) {
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = data.html;
              overviewContainer.parentNode.replaceChild(
                tempDiv.firstElementChild,
                overviewContainer
              );
              
              // Re-initialize controls and chart
              setupTrafficChart();
            }
          })
          .catch(error => {
            console.error('Error updating traffic overview:', error);
          });
        }
        
        // Function to set up the traffic chart
        function setupTrafficChart() {
          const trafficChart = document.getElementById('trafficChart');
          if (!trafficChart) return;
          
          const chartData = JSON.parse(trafficChart.getAttribute('data-chart') || '{}');
          if (!chartData.labels || !chartData.datasets) return;
          
          // Use Chart.js if available
          if (window.Chart) {
            new Chart(trafficChart, {
              type: 'line',
              data: chartData,
              options: {
                responsive: true,
                maintainAspectRatio: false,
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
                      text: 'Requests'
                    }
                  }
                }
              }
            });
          }
        }
      });
    </script>
  `;
}

/**
 * Generate a simple message for when no data is available
 * @returns {String} HTML for the no data message
 */
export function generateNoDataMessage() {
  return `
    <div class="metrics-panel">
      <h3>Traffic Overview</h3>
      <div class="alert alert-info">
        No traffic data available yet. Traffic will appear here as requests are processed.
      </div>
    </div>
  `;
}
