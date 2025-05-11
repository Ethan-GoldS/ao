/**
 * Dashboard time chart component
 * Handles time range selection, interval controls, and chart rendering
 */

export function initializeTimeControls(timeSeriesData) {
  // Convert the raw data into a more usable format with actual Date objects
  const timeSeriesDataPoints = timeSeriesData.map(bucket => ({
    timestamp: new Date(bucket.timestamp),
    requests: bucket.totalRequests,
    processCounts: bucket.processCounts
  }));

  // Get current date/time for initializing the pickers
  const now = new Date();
  const sixHoursAgo = new Date(now.getTime() - (6 * 60 * 60 * 1000));
  
  // Format helper functions
  function formatDateForInput(date) {
    return date.toISOString().split('T')[0];
  }
  
  function formatTimeForInput(date) {
    // Format time as HH:MM
    return date.toTimeString().substring(0, 5);
  }

  // Return the time chart HTML
  return `
    <div class="time-controls">
      <div class="time-range-selector">
        <h3>Time Range Selection</h3>
        <div class="control-row">
          <div class="control-group">
            <label for="startDatePicker">Start Date:</label>
            <input type="date" id="startDatePicker" value="${formatDateForInput(sixHoursAgo)}">
          </div>
          <div class="control-group">
            <label for="startTimePicker">Start Time:</label>
            <input type="time" id="startTimePicker" step="60" value="${formatTimeForInput(sixHoursAgo)}">
          </div>
        </div>
        <div class="control-row">
          <div class="control-group">
            <label for="endDatePicker">End Date:</label>
            <input type="date" id="endDatePicker" value="${formatDateForInput(now)}">
          </div>
          <div class="control-group">
            <label for="endTimePicker">End Time:</label>
            <input type="time" id="endTimePicker" step="60" value="${formatTimeForInput(now)}">
          </div>
        </div>
        <div class="control-row">
          <div class="preset-buttons">
            <button class="time-preset" data-value="1h">Last Hour</button>
            <button class="time-preset active" data-value="6h">Last 6 Hours</button>
            <button class="time-preset" data-value="12h">Last 12 Hours</button>
            <button class="time-preset" data-value="24h">Last 24 Hours</button>
            <button class="time-preset" data-value="7d">Last 7 Days</button>
          </div>
        </div>
      </div>
      
      <div class="interval-selector">
        <h3>Interval Selection</h3>
        <div class="control-row">
          <select id="intervalSelector">
            <option value="minute">Minute</option>
            <option value="5min">5 Minutes</option>
            <option value="10min" selected>10 Minutes</option>
            <option value="15min">15 Minutes</option>
            <option value="30min">30 Minutes</option>
            <option value="hour">Hourly</option>
            <option value="day">Daily</option>
          </select>
          <button id="applyTimeSettings" class="apply-btn">Apply Changes</button>
        </div>
      </div>
    </div>
    
    <div class="chart-container">
      <canvas id="timeSeriesChart"></canvas>
    </div>
  `;
}

// JavaScript for time chart functionality - to be included in the dashboard JS section
export function getTimeChartScript(rawTimeData) {
  return `
    // Store the raw time series data for flexible filtering
    const rawTimeData = ${JSON.stringify(rawTimeData)};
    
    // Convert the raw data into a more usable format with actual Date objects
    const timeSeriesDataPoints = rawTimeData.map(bucket => ({
      timestamp: new Date(bucket.timestamp),
      requests: bucket.totalRequests,
      processCounts: bucket.processCounts
    }));
    
    // Initialize time chart
    const timeCtx = document.getElementById('timeSeriesChart').getContext('2d');
    let timeSeriesChart;
    
    // Format date for input fields
    function formatDateForInput(date) {
      return date.toISOString().split('T')[0];
    }
    
    // Format time for input fields (HH:MM)
    function formatTimeForInput(date) {
      return date.toTimeString().substring(0, 5);
    }
    
    // Initialize date/time pickers
    const startDatePicker = document.getElementById('startDatePicker');
    const startTimePicker = document.getElementById('startTimePicker');
    const endDatePicker = document.getElementById('endDatePicker');
    const endTimePicker = document.getElementById('endTimePicker');
    
    // Prepare interval dropdown
    const intervalSelector = document.getElementById('intervalSelector');
    
    // Create the initial chart
    function initializeTimeChart() {
      // Get the current time for end time
      const now = new Date();
      // Set end time to now if not already set
      if (!endDatePicker.value) {
        endDatePicker.value = formatDateForInput(now);
        endTimePicker.value = formatTimeForInput(now);
      }
      
      // Get date range from pickers
      const startDate = getStartDateTime();
      const endDate = getEndDateTime();
      
      // Filter data for selected range
      const filteredData = filterDataByTimeRange(startDate, endDate);
      
      // Group data by selected interval
      const groupedData = groupDataByInterval(filteredData, intervalSelector.value);
      
      // Sort data chronologically (oldest to newest)
      groupedData.sort((a, b) => a.timestamp - b.timestamp);
      
      // Extract labels and values (oldest on left, newest on right)
      const labels = groupedData.map(point => formatDateLabel(point.timestamp, intervalSelector.value));
      const values = groupedData.map(point => point.requests);
      
      // Create chart
      timeSeriesChart = new Chart(timeCtx, {
        type: 'line',
        data: {
          labels: labels,
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
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Number of Requests'
              }
            },
            x: {
              title: {
                display: true,
                text: getIntervalLabel(intervalSelector.value)
              }
            }
          }
        }
      });
    }
    
    // Helper functions for time range and interval handling
    
    // Get start date and time from pickers
    function getStartDateTime() {
      const date = new Date(startDatePicker.value + 'T' + startTimePicker.value);
      return date;
    }
    
    // Get end date and time from pickers
    function getEndDateTime() {
      const date = new Date(endDatePicker.value + 'T' + endTimePicker.value);
      return date;
    }
    
    // Filter data points by time range
    function filterDataByTimeRange(startTime, endTime) {
      return timeSeriesDataPoints.filter(point => {
        return point.timestamp >= startTime && point.timestamp <= endTime;
      });
    }
    
    // Get a descriptive label for the interval
    function getIntervalLabel(interval) {
      const labels = {
        'minute': 'Minute',
        '5min': '5 Minutes',
        '10min': '10 Minutes',
        '15min': '15 Minutes',
        '30min': '30 Minutes',
        'hour': 'Hour',
        'day': 'Day'
      };
      return labels[interval] || 'Time';
    }
    
    // Format date label based on interval
    function formatDateLabel(date, interval) {
      if (interval === 'minute') {
        return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
      } else if (interval.includes('min')) {
        return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
      } else if (interval === 'hour') {
        return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
      } else if (interval === 'day') {
        return date.toLocaleDateString([], {month: 'short', day: 'numeric'});
      }
      return date.toLocaleString();
    }
    
    // Group data by the selected interval
    function groupDataByInterval(data, interval) {
      if (data.length === 0) return [];
      
      // Sort data by timestamp (oldest first)
      const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp);
      
      // For simple visualization, just return the data if there aren't many points
      if (sortedData.length < 24) return sortedData;
      
      // Group the data based on interval
      const result = [];
      let currentGroup = {
        timestamp: sortedData[0].timestamp,
        requests: 0,
        processCounts: {}
      };
      
      // Determine grouping time increment in milliseconds
      let increment;
      switch(interval) {
        case 'minute': increment = 60 * 1000; break;
        case '5min': increment = 5 * 60 * 1000; break;
        case '10min': increment = 10 * 60 * 1000; break;
        case '15min': increment = 15 * 60 * 1000; break;
        case '30min': increment = 30 * 60 * 1000; break;
        case 'hour': increment = 60 * 60 * 1000; break;
        case 'day': increment = 24 * 60 * 60 * 1000; break;
        default: increment = 10 * 60 * 1000; // Default to 10 minutes
      }
      
      sortedData.forEach(point => {
        // Check if this point belongs to current group or starts a new one
        if (point.timestamp - currentGroup.timestamp > increment) {
          // Add current group to results and start a new one
          result.push(currentGroup);
          currentGroup = {
            timestamp: point.timestamp,
            requests: 0,
            processCounts: {}
          };
        }
        
        // Add point data to current group
        currentGroup.requests += point.requests;
        
        // Merge process counts
        Object.entries(point.processCounts).forEach(([process, count]) => {
          if (!currentGroup.processCounts[process]) {
            currentGroup.processCounts[process] = 0;
          }
          currentGroup.processCounts[process] += count;
        });
      });
      
      // Add the last group
      result.push(currentGroup);
      
      return result;
    }
    
    // Update the chart with new time range and interval
    function updateTimeChart() {
      // Always use the current time for the end time
      const now = new Date();
      endDatePicker.value = formatDateForInput(now);
      endTimePicker.value = formatTimeForInput(now);
      
      // Get date range
      const startDate = getStartDateTime();
      const endDate = getEndDateTime();
      
      // Filter and group data
      const filteredData = filterDataByTimeRange(startDate, endDate);
      const groupedData = groupDataByInterval(filteredData, intervalSelector.value);
      
      // Sort data chronologically (oldest to newest)
      groupedData.sort((a, b) => a.timestamp - b.timestamp);
      
      // Update chart data (oldest on left, newest on right)
      const labels = groupedData.map(point => formatDateLabel(point.timestamp, intervalSelector.value));
      const values = groupedData.map(point => point.requests);
      
      // Update chart
      if (timeSeriesChart) {
        timeSeriesChart.data.labels = labels;
        timeSeriesChart.data.datasets[0].data = values;
        timeSeriesChart.options.scales.x.title.text = getIntervalLabel(intervalSelector.value);
        timeSeriesChart.update();
      }
    }
    
    // Set up event listeners for time range controls
    document.getElementById('applyTimeSettings').addEventListener('click', function() {
      updateTimeChart();
    });
    
    // Handle preset time range buttons
    document.querySelectorAll('.time-preset').forEach(button => {
      button.addEventListener('click', function() {
        // Remove active class from all presets
        document.querySelectorAll('.time-preset').forEach(btn => btn.classList.remove('active'));
        // Add active class to clicked button
        this.classList.add('active');
        
        const value = this.dataset.value;
        // Always use the most current time for end time
        const now = new Date();
        let startDate;
        
        // Correctly set the time range based on preset value (going back from now)
        switch(value) {
          case '1h':
            // Go back 1 hour from current time
            startDate = new Date(now.getTime() - (1 * 60 * 60 * 1000));
            break;
          case '6h':
            // Go back 6 hours from current time
            startDate = new Date(now.getTime() - (6 * 60 * 60 * 1000));
            break;
          case '12h':
            // Go back 12 hours from current time
            startDate = new Date(now.getTime() - (12 * 60 * 60 * 1000));
            break;
          case '24h':
            // Go back 24 hours from current time
            startDate = new Date(now.getTime() - (24 * 60 * 60 * 1000));
            break;
          case '7d':
            // Go back 7 days from current time
            startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
            break;
          default:
            // Default to 6 hours ago if something goes wrong
            startDate = new Date(now.getTime() - (6 * 60 * 60 * 1000));
            break;
        }
        
        // Update date/time pickers - end time is ALWAYS now
        startDatePicker.value = formatDateForInput(startDate);
        startTimePicker.value = formatTimeForInput(startDate);
        endDatePicker.value = formatDateForInput(now);
        endTimePicker.value = formatTimeForInput(now);
        
        // Update chart
        updateTimeChart();
      });
    });
  `;
}
