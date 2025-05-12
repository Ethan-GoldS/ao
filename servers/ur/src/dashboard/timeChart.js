/**
 * Dashboard time chart component
 * Handles time range selection, interval controls, and chart rendering
 */

export function initializeTimeControls(timeSeriesData, topProcessIds = []) {
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
  
  // Build the process filter options
  let processOptions = '<option value="" selected>All Processes</option>';
  
  // Add top processes as options
  if (topProcessIds && topProcessIds.length > 0) {
    topProcessIds.forEach(processId => {
      // Truncate long process IDs for display
      const displayId = processId.length > 12 ? 
        processId.substring(0, 10) + '...' : processId;
      processOptions += `<option value="${processId}">${displayId}</option>`;
    });
  }

  // Return the improved time chart HTML with process filtering and better layout
  return `
    <div class="time-controls-wrapper">
      <h3>Traffic Overview</h3>
      <div class="time-controls">
        <div class="control-section">
          <div class="preset-buttons">
            <span class="section-label">Quick Select:</span>
            <button class="time-preset" data-value="1h">Last Hour</button>
            <button class="time-preset active" data-value="6h">Last 6 Hours</button>
            <button class="time-preset" data-value="12h">Last 12 Hours</button>
            <button class="time-preset" data-value="24h">Last 24 Hours</button>
            <button class="time-preset" data-value="7d">Last 7 Days</button>
            <button class="time-preset" data-value="30d">Last 30 Days</button>
          </div>
        </div>
        
        <div class="control-section">
          <div class="time-range-section">
            <div class="time-range-selector">
              <span class="section-label">Custom Range:</span>
              <div class="date-time-inputs">
                <div class="date-time-group">
                  <div class="control-group">
                    <label for="startDatePicker">Start:</label>
                    <input type="date" id="startDatePicker" value="${formatDateForInput(sixHoursAgo)}">
                  </div>
                  <div class="control-group">
                    <label for="startTimePicker"></label>
                    <input type="time" id="startTimePicker" step="60" value="${formatTimeForInput(sixHoursAgo)}">
                  </div>
                </div>
                
                <span class="date-separator">to</span>
                
                <div class="date-time-group">
                  <div class="control-group">
                    <label for="endDatePicker">End:</label>
                    <input type="date" id="endDatePicker" value="${formatDateForInput(now)}">
                  </div>
                  <div class="control-group">
                    <label for="endTimePicker"></label>
                    <input type="time" id="endTimePicker" step="60" value="${formatTimeForInput(now)}">
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="control-section">
          <div class="filter-options">
            <div class="interval-selector">
              <label for="intervalSelector">Interval:</label>
              <select id="intervalSelector">
                <!-- Fine-grained intervals -->
                <option value="5sec">5 Seconds</option>
                <option value="10sec">10 Seconds</option>
                <option value="30sec">30 Seconds</option>
                <option value="minute">1 Minute</option>
                <option value="5min">5 Minutes</option>
                <option value="10min" selected>10 Minutes</option>
                <option value="15min">15 Minutes</option>
                <option value="30min">30 Minutes</option>
                
                <!-- Coarser intervals -->
                <option value="hour">1 Hour</option>
                <option value="2hour">2 Hours</option>
                <option value="6hour">6 Hours</option>
                <option value="12hour">12 Hours</option>
                <option value="day">1 Day</option>
                <option value="week">1 Week</option>
                <option value="month">1 Month</option>
              </select>
            </div>
            
            <div class="process-selector">
              <label for="processSelector">Process:</label>
              <select id="processSelector">
                ${processOptions}
              </select>
            </div>
            
            <button id="applyTimeSettings" class="apply-btn">Apply Filters</button>
          </div>
        </div>
      </div>
      
      <div class="chart-container">
        <canvas id="timeSeriesChart"></canvas>
      </div>
    </div>
  `;
}

// JavaScript for time chart functionality - to be included in the dashboard JS section
export function getTimeChartScript(rawTimeData) {
  return `
    // Store the raw time series data for flexible filtering
    const rawTimeData = ${JSON.stringify(rawTimeData)};
    
    // Debug time zone information
    console.log('Browser timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);
    console.log('UTC offset in minutes:', new Date().getTimezoneOffset());
    
    // Convert the raw data into a more usable format with actual Date objects
    // Always load timestamps correctly from ISO strings (which are UTC)
    const timeSeriesDataPoints = rawTimeData.map(bucket => ({
      timestamp: new Date(bucket.timestamp),
      requests: bucket.totalRequests,
      processCounts: bucket.processCounts
    }));
    
    // Useful constants for time interval conversions
    const timeIntervals = {
      // Fine-grained intervals
      '5sec': { ms: 5 * 1000, displayName: '5 Seconds' },
      '10sec': { ms: 10 * 1000, displayName: '10 Seconds' },
      '30sec': { ms: 30 * 1000, displayName: '30 Seconds' },
      'minute': { ms: 60 * 1000, displayName: '1 Minute' },
      '5min': { ms: 5 * 60 * 1000, displayName: '5 Minutes' },
      '10min': { ms: 10 * 60 * 1000, displayName: '10 Minutes' },
      '15min': { ms: 15 * 60 * 1000, displayName: '15 Minutes' },
      '30min': { ms: 30 * 60 * 1000, displayName: '30 Minutes' },
      // Coarser intervals
      'hour': { ms: 60 * 60 * 1000, displayName: '1 Hour' },
      '2hour': { ms: 2 * 60 * 60 * 1000, displayName: '2 Hours' },
      '6hour': { ms: 6 * 60 * 60 * 1000, displayName: '6 Hours' },
      '12hour': { ms: 12 * 60 * 60 * 1000, displayName: '12 Hours' },
      'day': { ms: 24 * 60 * 60 * 1000, displayName: '1 Day' },
      'week': { ms: 7 * 24 * 60 * 60 * 1000, displayName: '1 Week' },
      'month': { ms: 30 * 24 * 60 * 60 * 1000, displayName: '1 Month' },
    };
    
    // Log out some information about the data range loaded
    if (timeSeriesDataPoints.length > 0) {
      console.log('Time data spans from:', 
        timeSeriesDataPoints[0].timestamp.toLocaleString(), 'to',
        timeSeriesDataPoints[timeSeriesDataPoints.length-1].timestamp.toLocaleString());
    }
    
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
    
    // Initialize selectors
    const intervalSelector = document.getElementById('intervalSelector');
    const processSelector = document.getElementById('processSelector');
    
    // Create the initial chart
    function initializeTimeChart() {
      // Always make sure we're using the current time for end time
      const now = new Date();
      endDatePicker.value = formatDateForInput(now);
      endTimePicker.value = formatTimeForInput(now);
      
      // Get date range from pickers
      const startDate = getStartDateTime();
      const endDate = now; // Always use current time
      
      // Extract labels and values from the data we received from the server
      const labels = timeSeriesDataPoints.map(point => formatDateLabel(point.timestamp, intervalSelector.value));
      const values = timeSeriesDataPoints.map(point => point.requests);
      
      // Create chart with improved styling
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
            tension: 0.2,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: 'rgba(0, 102, 204, 1)',
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: {
            duration: 600
          },
          interaction: {
            mode: 'index',
            intersect: false
          },
          plugins: {
            tooltip: {
              enabled: true,
              mode: 'index',
              callbacks: {
                title: function(tooltipItems) {
                  if (tooltipItems.length > 0) {
                    const date = timeSeriesDataPoints[tooltipItems[0].dataIndex].timestamp;
                    return date.toLocaleString();
                  }
                  return '';
                }
              }
            },
            legend: {
              display: true,
              position: 'top'
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Number of Requests'
              },
              grid: {
                color: 'rgba(0, 0, 0, 0.05)'
              }
            },
            x: {
              title: {
                display: true,
                text: getIntervalLabel(intervalSelector.value)
              },
              grid: {
                color: 'rgba(0, 0, 0, 0.05)'
              },
              ticks: {
                maxRotation: 45,
                minRotation: 0
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
      
      console.log('Start date parsed:', date.toLocaleString());
      return date;
    }
    
    // Get end date and time from pickers
    function getEndDateTime() {
      // Parse individual components to ensure local time interpretation
      const dateParts = endDatePicker.value.split('-');
      const timeParts = endTimePicker.value.split(':');
      
      // Create date with local time values
      const date = new Date(
        parseInt(dateParts[0]),             // year
        parseInt(dateParts[1]) - 1,         // month (0-based)
        parseInt(dateParts[2]),             // day
        parseInt(timeParts[0]),             // hour
        parseInt(timeParts[1])              // minute
      );
      
      console.log('End date parsed:', date.toLocaleString());
      return date;
    }
    
    // Get a descriptive label for the interval
    function getIntervalLabel(interval) {
      return timeIntervals[interval] ? timeIntervals[interval].displayName : 'Time';
    }
    
    // Fetch fresh data from the server based on current filters
    async function fetchFilteredData() {
      // Display loading state
      const chartContainer = document.querySelector('.chart-container');
      if (chartContainer) {
        chartContainer.classList.add('loading');
      }
      
      // Get date range from pickers
      const startDate = getStartDateTime();
      const endDate = getEndDateTime();
      const interval = intervalSelector.value;
      const processId = processSelector.value;
      
      // Build query params
      const params = new URLSearchParams();
      params.append('startTime', startDate.toISOString());
      params.append('endTime', endDate.toISOString());
      params.append('interval', interval);
      
      if (processId) {
        params.append('processId', processId);
      }
      
      try {
        // Fetch fresh data from server with the filters applied
        console.log(`Fetching data with params: ${params.toString()}`);
        const response = await fetch(`/dashboard?${params.toString()}`);
        
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        // Parse the HTML response and extract the updated chart data
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Find the script tag containing the timeSeriesData
        const scriptTags = doc.querySelectorAll('script');
        let newTimeSeriesData = [];
        
        for (const script of scriptTags) {
          if (!script.textContent) continue;
          
          const scriptContent = script.textContent;
          if (scriptContent.includes('rawTimeData =')) {
            // Use a safer regex approach
            try {
              // Find the array pattern between rawTimeData = and the next semicolon
              const startIndex = scriptContent.indexOf('rawTimeData =') + 'rawTimeData ='.length;
              let endIndex = scriptContent.indexOf(';', startIndex);
              
              if (endIndex === -1) {
                // If no semicolon found, try to find the end of the array
                endIndex = scriptContent.indexOf('];', startIndex) + 1;
              }
              
              if (startIndex > 0 && endIndex > startIndex) {
                const jsonStr = scriptContent.substring(startIndex, endIndex).trim();
                newTimeSeriesData = JSON.parse(jsonStr);
                console.log('Successfully extracted new time series data', newTimeSeriesData);
                break;
              }
            } catch (e) {
              console.error('Failed to parse time series data:', e);
            }
          }
        }
        
        if (newTimeSeriesData.length > 0) {
          // Convert to usable format
          timeSeriesDataPoints = newTimeSeriesData.map(bucket => ({
            timestamp: new Date(bucket.timestamp),
            requests: bucket.totalRequests,
            processCounts: bucket.processCounts
          }));
          
          // Update the chart
          updateTimeChartWithNewData();
        } else {
          console.warn('No new time series data found in response');
          // Show a message to the user
          const chartContainer = document.querySelector('.chart-container');
          if (chartContainer) {
            const noDataMessage = document.createElement('div');
            noDataMessage.className = 'no-data-message';
            noDataMessage.textContent = 'No data available for the selected filters';
            chartContainer.appendChild(noDataMessage);
            setTimeout(() => {
              if (noDataMessage.parentNode) {
                noDataMessage.remove();
              }
            }, 3000);
          }
        }
      } catch (error) {
        console.error('Error fetching filtered data:', error);
        // Show error message
        alert('Failed to update chart data. Please try again.');
      } finally {
        // Remove loading state
        const chartContainer = document.querySelector('.chart-container');
        if (chartContainer) {
          chartContainer.classList.remove('loading');
        }
      }
    }
    
    // Format date label based on interval with proper timezone display
    function formatDateLabel(date, interval) {
      // Add timezone indicator to all time displays
      const options = { timeZoneName: 'short' };
      
      // Select format based on interval granularity
      if (interval.includes('sec')) {
        // For seconds-level intervals, show hour:minute:second
        return date.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
          timeZoneName: 'short'
        });
      } else if (interval === 'minute' || interval.includes('min') || interval === 'hour' || interval.includes('hour')) {
        // For minute/hour intervals show hour:minute
        return date.toLocaleTimeString([], {
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true,
          timeZoneName: 'short'
        });
      } else if (interval === 'day' || interval === 'week') {
        // For day/week intervals show month + day
        return date.toLocaleDateString([], {
          month: 'short', 
          day: 'numeric',
          timeZoneName: 'short'
        });
      } else if (interval === 'month') {
        // For month intervals show month + year
        return date.toLocaleDateString([], {
          month: 'short',
          year: 'numeric',
          timeZoneName: 'short'
        });
      }
      
      // Default format for other intervals
      return date.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short'
      });
    }
    
    // Update the chart with new data fetched from the server
    function updateTimeChartWithNewData() {
      console.log('Updating chart with new data points:', timeSeriesDataPoints.length);
      
      if (!timeSeriesChart) {
        console.warn('Chart not initialized yet');
        return;
      }
      
      if (timeSeriesDataPoints.length === 0) {
        console.warn('No data points to display');
        return;
      }
      
      // Format data points for the chart
      const interval = intervalSelector.value;
      const labels = timeSeriesDataPoints.map(point => formatDateLabel(point.timestamp, interval));
      const values = timeSeriesDataPoints.map(point => point.requests);
      
      // Update chart data and options
      timeSeriesChart.data.labels = labels;
      timeSeriesChart.data.datasets[0].data = values;
      timeSeriesChart.options.scales.x.title.text = getIntervalLabel(interval);
      
      // Update chart
      timeSeriesChart.update();
      
      console.log('Chart updated successfully');
    }
    
    // Group data by the selected interval
    function groupDataByInterval(data, interval) {
      console.log('Grouping data with interval:', interval);
      if (data.length === 0) {
        console.log('Warning: No data to group');
        return [];
      }
      
      // Sort data by timestamp (oldest first)
      const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp);
      console.log('Sorted data range:', 
                 sortedData[0].timestamp.toLocaleString(), ' to ', 
                 sortedData[sortedData.length-1].timestamp.toLocaleString());
      console.log('Data points count:', sortedData.length);
      
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
      console.log('Using increment of', increment, 'milliseconds');
      
      // For very small datasets, we might want to just return the raw data
      // But for consistency, we'll apply grouping in all cases
      
      // Create buckets for each time interval in the range
      const result = [];
      
      // Use the actual selected time range rather than just the data range
      // This ensures we show the full selected time range even if there's no data for some periods
      const startTime = getStartDateTime();
      const endTime = new Date(); // Current time
      
      console.log('Selected time range is from', startTime.toLocaleString(), 'to', endTime.toLocaleString());
      console.log('Data available from', sortedData.length > 0 ? sortedData[0].timestamp.toLocaleString() : 'N/A', 
                'to', sortedData.length > 0 ? sortedData[sortedData.length-1].timestamp.toLocaleString() : 'N/A');
      
      // Create regular, evenly-spaced buckets for the entire selected time range
      let currentTime = new Date(startTime);
      
      // Round down to the nearest interval boundary to ensure consistent buckets
      currentTime = new Date(
        Math.floor(currentTime.getTime() / increment) * increment
      );
      
      console.log('Starting buckets from', currentTime.toLocaleString(), 
                 '(Unix timestamp:', currentTime.getTime(), ')');
      
      // Create a bucket for each interval in the range
      while (currentTime <= endTime) {
        result.push({
          timestamp: new Date(currentTime),
          requests: 0,
          processCounts: {}
        });
        currentTime = new Date(currentTime.getTime() + increment);
      }
      
      console.log('Created', result.length, 'time buckets spanning from',
                result[0].timestamp.toLocaleString(), 'to',
                result[result.length-1].timestamp.toLocaleString());
      
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
      
      console.log('Created', result.length, 'time buckets');
      
      return result;
    }
    
    // Update the chart with new time range and interval by fetching fresh data from server
    function updateTimeChart() {
      // Fetch fresh data with the current filters
      fetchFilteredData();
    }
    
    // Set up event listeners for time range controls
    document.getElementById('applyTimeSettings').addEventListener('click', function() {
      // Add a loading indicator to the button
      const button = this;
      const originalText = button.textContent;
      button.textContent = 'Refreshing...';
      button.disabled = true;
      
      // Fetch new data from the server
      fetchFilteredData()
        .finally(() => {
          // Restore button state after loading completes (success or error)
          setTimeout(() => {
            button.textContent = originalText;
            button.disabled = false;
          }, 500);
        });
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
        let recommendedInterval = '10min'; // Default interval
        
        // Correctly set the time range based on preset value (going back from now)
        switch(value) {
          case '1h':
            // Go back 1 hour from current time
            startDate = new Date(now.getTime() - (1 * 60 * 60 * 1000));
            // For 1-hour view, 1-minute intervals make sense
            recommendedInterval = 'minute';
            break;
          case '6h':
            // Go back 6 hours from current time
            startDate = new Date(now.getTime() - (6 * 60 * 60 * 1000));
            // For 6-hour view, 10-minute intervals make sense
            recommendedInterval = '10min';
            break;
          case '12h':
            // Go back 12 hours from current time
            startDate = new Date(now.getTime() - (12 * 60 * 60 * 1000));
            // For 12-hour view, 15-minute intervals work well
            recommendedInterval = '15min';
            break;
          case '24h':
            // Go back 24 hours from current time
            startDate = new Date(now.getTime() - (24 * 60 * 60 * 1000));
            // For 24-hour view, 30-minute or hourly intervals make sense
            recommendedInterval = 'hour';
            break;
          case '7d':
            // Go back 7 days from current time
            startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
            // For 7-day view, 6-hour intervals make sense
            recommendedInterval = '6hour';
            break;
          case '30d':
            // Go back 30 days from current time
            startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
            // For 30-day view, daily intervals make sense
            recommendedInterval = 'day';
            break;
          default:
            // Default to 6 hours ago if something goes wrong
            startDate = new Date(now.getTime() - (6 * 60 * 60 * 1000));
            recommendedInterval = '10min';
            break;
        }
        
        // Update date/time pickers
        startDatePicker.value = formatDateForInput(startDate);
        startTimePicker.value = formatTimeForInput(startDate);
        endDatePicker.value = formatDateForInput(now);
        endTimePicker.value = formatTimeForInput(now);
        
        // Set recommended interval for this time range
        intervalSelector.value = recommendedInterval;
        
        // Add a loading indicator to the button
        const button = this;
        button.classList.add('loading');
        
        // Fetch data with the new time range
        fetchFilteredData().finally(() => {
          button.classList.remove('loading');
        });
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
