/**
 * Traffic Insights Component
 * A redesigned traffic overview with proper time ranges and intervals
 * Simpler, more elegant, and focused on showing reliable metrics
 */

/**
 * Generate HTML for the traffic insights component
 * @param {Array} timeSeriesData The time series data from the database
 * @returns {String} HTML for the traffic insights component
 */
export function generateTrafficInsightsHtml(timeSeriesData) {
  // Pre-populate time range options for quick selection
  const timeRangeOptions = [
    { value: '1', label: 'Last Hour' },
    { value: '6', label: 'Last 6 Hours' },
    { value: '12', label: 'Last 12 Hours' },
    { value: '24', label: 'Last Day' },
    { value: '48', label: 'Last 2 Days' },
    { value: '168', label: 'Last Week' }
  ];
  
  // Generate HTML for the time range selector
  const timeRangeOptionsHtml = timeRangeOptions.map(option => 
    `<option value="${option.value}"${option.value === '6' ? ' selected' : ''}>${option.label}</option>`
  ).join('');
  
  return `
    <div class="traffic-insights-container">
      <div class="chart-header">
        <h3>Traffic Insights</h3>
        <div class="chart-controls">
          <div class="control-group">
            <label for="timeRange">Time Range:</label>
            <select id="timeRange" class="form-control">
              ${timeRangeOptionsHtml}
            </select>
          </div>
          <div class="control-group">
            <label for="groupBy">Group By:</label>
            <select id="groupBy" class="form-control">
              <option value="hour" selected>Hourly</option>
              <option value="day">Daily</option>
            </select>
          </div>
          <button id="refreshTrafficData" class="btn btn-primary">Refresh</button>
        </div>
      </div>
      <div class="chart-container">
        <canvas id="trafficInsightsChart" height="250"></canvas>
      </div>
      <div class="insights-summary">
        <div class="insight-box" id="peakTraffic">
          <h4>Peak Traffic</h4>
          <div class="insight-value">Calculating...</div>
        </div>
        <div class="insight-box" id="totalRequests">
          <h4>Total Requests</h4>
          <div class="insight-value">Calculating...</div>
        </div>
        <div class="insight-box" id="avgRequestsPerHour">
          <h4>Avg Requests/Hour</h4>
          <div class="insight-value">Calculating...</div>
        </div>
        <div class="insight-box" id="uniqueProcesses">
          <h4>Unique Processes</h4>
          <div class="insight-value">Calculating...</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Generate JavaScript for the traffic insights chart
 * @param {Array} rawTimeData The raw time series data from the database
 * @returns {String} JavaScript for the traffic insights functionality
 */
export function getTrafficInsightsScript(rawTimeData) {
  return `
    // Store and preprocess the raw time data
    const rawTimeData = ${JSON.stringify(rawTimeData || [])};
    
    // Prepare the traffic insights chart
    let trafficChart = null;
    
    // Process the time data into a usable format
    function processTimeData(rawData, groupBy = 'hour') {
      if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
        console.log('No time series data available');
        return { 
          labels: [], 
          datasets: [{
            label: 'Requests',
            data: [],
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1
          }]
        };
      }
    
      // Convert timestamp strings to Date objects
      const timeData = rawData.map(item => ({
        ...item,
        timestamp: new Date(item.timestamp)
      }));
      
      // Sort by timestamp (oldest first)
      timeData.sort((a, b) => a.timestamp - b.timestamp);
      
      // Group data by the selected interval
      const groupedData = {};
      const labels = [];
      
      timeData.forEach(dataPoint => {
        let groupKey;
        let labelFormat;
        
        if (groupBy === 'day') {
          // Group by day - use date only
          groupKey = dataPoint.timestamp.toISOString().split('T')[0];
          labelFormat = { month: 'short', day: 'numeric' };
        } else {
          // Default: Group by hour
          groupKey = dataPoint.timestamp.toISOString().slice(0, 13); // YYYY-MM-DDTHH
          labelFormat = { hour: 'numeric', hour12: true };
        }
        
        if (!groupedData[groupKey]) {
          groupedData[groupKey] = {
            timestamp: dataPoint.timestamp,
            count: 0,
            processes: new Set()
          };
          
          // Format labels consistently based on the current grouping
          const formattedDate = dataPoint.timestamp.toLocaleDateString('en-US', labelFormat);
          labels.push(formattedDate);
        }
        
        groupedData[groupKey].count += dataPoint.requests || 0;
        
        // Process the process IDs to count unique processes
        if (dataPoint.processCounts) {
          Object.keys(dataPoint.processCounts).forEach(processId => {
            groupedData[groupKey].processes.add(processId);
          });
        }
      });
      
      // Convert grouped data to array format for chart.js
      const groupedArray = Object.values(groupedData);
      
      // Calculate insights for the summary boxes
      updateInsightsSummary(groupedArray);
      
      return {
        labels: labels,
        datasets: [{
          label: 'Requests',
          data: groupedArray.map(g => g.count),
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1,
          fill: true
        }]
      };
    }
    
    // Update the insights summary boxes
    function updateInsightsSummary(groupedData) {
      // Calculate peak traffic
      const peak = groupedData.length > 0 ? Math.max(...groupedData.map(g => g.count)) : 0;
      document.querySelector('#peakTraffic .insight-value').textContent = peak.toLocaleString();
      
      // Calculate total requests
      const total = groupedData.reduce((sum, item) => sum + item.count, 0);
      document.querySelector('#totalRequests .insight-value').textContent = total.toLocaleString();
      
      // Calculate average requests per hour
      const avg = groupedData.length > 0 ? Math.round(total / groupedData.length) : 0;
      document.querySelector('#avgRequestsPerHour .insight-value').textContent = avg.toLocaleString();
      
      // Count unique processes
      const allProcesses = new Set();
      groupedData.forEach(item => {
        item.processes.forEach(process => {
          allProcesses.add(process);
        });
      });
      document.querySelector('#uniqueProcesses .insight-value').textContent = allProcesses.size.toLocaleString();
    }
    
    // Render the traffic insights chart
    function renderTrafficInsightsChart() {
      const timeRange = document.getElementById('timeRange').value;
      const groupBy = document.getElementById('groupBy').value;
      
      // Filter data by selected time range
      const now = new Date();
      const rangeStart = new Date(now.getTime() - (timeRange * 60 * 60 * 1000));
      
      const filteredData = rawTimeData.filter(item => {
        const timestamp = new Date(item.timestamp);
        return timestamp >= rangeStart;
      });
      
      // Process the data
      const chartData = processTimeData(filteredData, groupBy);
      
      // Destroy existing chart if it exists
      if (trafficChart) {
        trafficChart.destroy();
      }
      
      // Get the chart context
      const ctx = document.getElementById('trafficInsightsChart').getContext('2d');
      
      // Configure chart options
      const chartOptions = {
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
              text: groupBy === 'day' ? 'Date' : 'Hour'
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              title: function(tooltipItems) {
                return tooltipItems[0].label;
              },
              label: function(context) {
                return '  Requests: ' + context.raw.toLocaleString();
              }
            }
          }
        },
        responsive: true,
        maintainAspectRatio: false
      };
      
      // Create the chart
      trafficChart = new Chart(ctx, {
        type: 'bar',
        data: chartData,
        options: chartOptions
      });
    }
    
    // Initialize the chart when the page loads
    document.addEventListener('DOMContentLoaded', function() {
      // Render the initial chart
      renderTrafficInsightsChart();
      
      // Set up event listeners
      document.getElementById('timeRange').addEventListener('change', renderTrafficInsightsChart);
      document.getElementById('groupBy').addEventListener('change', renderTrafficInsightsChart);
      document.getElementById('refreshTrafficData').addEventListener('click', function() {
        // Reload the page to get fresh data
        window.location.reload();
      });
    });
  `;
}

/**
 * Generate CSS for the traffic insights component
 * @returns {String} CSS for the traffic insights component
 */
export function getTrafficInsightsStyles() {
  return `
    .traffic-insights-container {
      background-color: #fff;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      padding: 20px;
      margin-bottom: 30px;
    }
    
    .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
    }
    
    .chart-header h3 {
      margin: 0;
      color: #333;
    }
    
    .chart-controls {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    
    .control-group {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    
    .control-group label {
      font-size: 12px;
      color: #666;
    }
    
    .form-control {
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 6px 12px;
      font-size: 14px;
    }
    
    .btn-primary {
      background-color: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      padding: 8px 15px;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    
    .btn-primary:hover {
      background-color: #0069d9;
    }
    
    .chart-container {
      position: relative;
      height: 250px;
      margin-bottom: 20px;
    }
    
    .insights-summary {
      display: flex;
      justify-content: space-between;
      gap: 15px;
      margin-top: 20px;
    }
    
    .insight-box {
      flex: 1;
      background-color: #f8f9fa;
      border-radius: 6px;
      padding: 15px;
      text-align: center;
    }
    
    .insight-box h4 {
      margin: 0 0 10px 0;
      font-size: 14px;
      color: #666;
    }
    
    .insight-value {
      font-size: 22px;
      font-weight: bold;
      color: #333;
    }
  `;
}
