/**
 * Dashboard time chart component
 * Handles time range selection, interval controls, and chart rendering
 */

export function initializeTimeControls(timeSeriesData) {
  // Get current date/time for initializing the pickers
  const now = new Date();
  const sixHoursAgo = new Date(now.getTime() - (6 * 60 * 60 * 1000));
  
  // Format helper functions for date/time pickers
  function formatDateForInput(date) {
    // Format YYYY-MM-DD for date input using local timezone
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }
  
  function formatTimeForInput(date) {
    // Format HH:MM for time input using local timezone
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return hours + ':' + minutes;
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
    
    // Format date for input fields - uses local timezone
    function formatDateForInput(date) {
      // Format YYYY-MM-DD for date input using local timezone
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return year + '-' + month + '-' + day;
    }
    
    // Format time for input fields (HH:MM) - uses local timezone
    function formatTimeForInput(date) {
      // Format HH:MM for time input using local timezone
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return hours + ':' + minutes;
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
      // Always make sure we're using the current time for end time
      const now = new Date();
      endDatePicker.value = formatDateForInput(now);
      endTimePicker.value = formatTimeForInput(now);
      
      // Get date range from pickers
      const startDate = getStartDateTime();
      const endDate = now; // Always use current time
      
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
      // Parse individual components to ensure local time interpretation
      const dateParts = startDatePicker.value.split('-');
      const timeParts = startTimePicker.value.split(':');
      
      // Create date with local time values
      const date = new Date(
        parseInt(dateParts[0]),             // year
        parseInt(dateParts[1]) - 1,         // month (0-based)
        parseInt(dateParts[2]),             // day
        parseInt(timeParts[0]),             // hour
        parseInt(timeParts[1])              // minute
      );
      
      // Removed excessive logging
      return date;
    }
    
    // Get end date and time from pickers - always returns current time
    function getEndDateTime() {
      // Always use current time for end time
      const now = new Date();
      
      // Update the input fields with current time
      endDatePicker.value = formatDateForInput(now);
      endTimePicker.value = formatTimeForInput(now);
      
      // Removed excessive logging
      return now;
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
      // Format with both date and time for better readability
      if (interval === 'minute') {
        return date.toLocaleDateString([], {month: 'numeric', day: 'numeric'}) + ' ' + 
               date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
      } else if (interval.includes('min')) {
        return date.toLocaleDateString([], {month: 'numeric', day: 'numeric'}) + ' ' + 
               date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
      } else if (interval === 'hour') {
        return date.toLocaleDateString([], {month: 'numeric', day: 'numeric'}) + ' ' + 
               date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
      } else if (interval === 'day') {
        return date.toLocaleDateString([], {month: 'short', day: 'numeric', year: 'numeric'});
      }
      return date.toLocaleString();
    }
    
    // Group data by the selected interval
    function groupDataByInterval(data, interval) {
      // Removed excessive logging
      if (data.length === 0) return [];
      
      // Sort data by timestamp (oldest first)
      const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp);
      // Removed excessive logging
      
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
      // Removed excessive logging
      
      // For very small datasets, we might want to just return the raw data
      // But for consistency, we'll apply grouping in all cases
      
      // Create buckets for each time interval in the range
      const result = [];
      
      // Use the actual selected time range rather than just the data range
      // This ensures we show the full selected time range even if there's no data for some periods
      const startTime = getStartDateTime();
      const endTime = new Date(); // Current time
      
      // Removed excessive logging
      
      // Create regular, evenly-spaced buckets for the entire selected time range
      let currentTime = new Date(startTime);
      
      // Round down to the nearest interval boundary to ensure consistent buckets
      currentTime = new Date(
        Math.floor(currentTime.getTime() / increment) * increment
      );
      
      // Removed excessive logging
      
      // Create a bucket for each interval in the range
      while (currentTime <= endTime) {
        result.push({
          timestamp: new Date(currentTime),
          requests: 0,
          processCounts: {}
        });
        currentTime = new Date(currentTime.getTime() + increment);
      }
      
      // Removed excessive logging
      
      // Add data points to appropriate buckets
      sortedData.forEach(point => {
        // Find which bucket this point belongs to
        const bucketIndex = result.findIndex(bucket => {
          return point.timestamp >= bucket.timestamp && 
                 point.timestamp < new Date(bucket.timestamp.getTime() + increment);
        });
        
        if (bucketIndex >= 0) {
          // Add point data to bucket
          result[bucketIndex].requests += point.requests;
          
          // Merge process counts
          Object.entries(point.processCounts).forEach(([process, count]) => {
            if (!result[bucketIndex].processCounts[process]) {
              result[bucketIndex].processCounts[process] = 0;
            }
            result[bucketIndex].processCounts[process] += count;
          });
        }
      });
      
      // Removed excessive logging
      
      return result;
    }
    
    // Update the chart with new time range and interval
    function updateTimeChart() {
      // IMPORTANT: Always use the current time for the end time on every update
      const now = new Date();
      
      console.log('Current time:', now.toLocaleString());
      console.log('Current selected interval:', intervalSelector.value);
      
      // Force the end date/time to be now
      endDatePicker.value = formatDateForInput(now);
      endTimePicker.value = formatTimeForInput(now);
      
      // Get date range (using our updated end time)
      const startDate = getStartDateTime();
      const endDate = now; // Use now directly instead of getEndDateTime()
      
      console.log('Time range:', startDate.toLocaleString(), 'to', endDate.toLocaleString());
      
      // Filter data to the selected time range
      const filteredData = filterDataByTimeRange(startDate, endDate);
      console.log('Filtered data points:', filteredData.length);
      
      // Group data according to the selected interval
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
    
    // Add event listener for interval selection changes
    intervalSelector.addEventListener('change', function() {
      console.log('Interval changed to:', this.value);
      updateTimeChart();
    });
    
    // Initialize with default settings on page load
    document.addEventListener('DOMContentLoaded', function() {
      console.log('Dashboard initialized - setting 6h preset as default');
      
      // Set interval selector to 10 minutes
      intervalSelector.value = '10min';
      console.log('Setting default interval to 10min');
      
      // Click the 6h preset button to initialize with correct time range
      const sixHourPreset = document.querySelector('.time-preset[data-value="6h"]');
      if (sixHourPreset) {
        sixHourPreset.click();
      } else {
        // Fallback if button not found
        const now = new Date();
        const sixHoursAgo = new Date(now.getTime() - (6 * 60 * 60 * 1000));
        startDatePicker.value = formatDateForInput(sixHoursAgo);
        startTimePicker.value = formatTimeForInput(sixHoursAgo);
        endDatePicker.value = formatDateForInput(now);
        endTimePicker.value = formatTimeForInput(now);
        updateTimeChart();
      }
    });
    
    // Initialize the chart (will be called by the DOMContentLoaded handler)
    initializeTimeChart();
  `;
}
