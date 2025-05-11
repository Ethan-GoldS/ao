/**
 * Dashboard auto-refresh controls 
 * Manages the auto-refresh functionality with pause/resume capability
 */

export function generateRefreshControls(lastUpdated) {
  return `
    <div class="timestamp">
      <span id="refresh-status">Auto-refreshes every 5 seconds</span> - 
      Last updated: <span id="last-updated">${lastUpdated}</span>
      <button id="toggle-refresh" class="refresh-btn">Pause</button>
      <button id="manual-refresh" class="refresh-btn manual">Refresh Now</button>
    </div>
  `;
}

export function getRefreshControlsScript() {
  return `
    // Auto-refresh functionality using AJAX
    let refreshInterval;
    let isRefreshing = true;
    const refreshButton = document.getElementById('toggle-refresh');
    const refreshStatus = document.getElementById('refresh-status');
    const lastUpdatedSpan = document.getElementById('last-updated');
    
    // Fetch fresh metrics data via AJAX
    async function fetchMetricsData() {
      try {
        // Show loading indicator
        const timestamp = new Date().toISOString();
        lastUpdatedSpan.innerHTML = 'Refreshing...';
        
        // Fetch updated metrics data
        const response = await fetch('/dashboard/data?t=' + timestamp);
        if (!response.ok) throw new Error('Failed to fetch metrics data');
        
        const data = await response.json();
        
        // Update time series chart if it exists
        if (typeof updateTimeSeriesChart === 'function' && data.timeSeriesData) {
          updateTimeSeriesChart(data.timeSeriesData);
        }
        
        // Update summary stats
        if (data.totalRequests) {
          document.getElementById('total-requests').textContent = data.totalRequests.toLocaleString();
        }
        
        // Update other key metrics
        if (data.uniqueProcessIds) {
          document.getElementById('unique-processes').textContent = data.uniqueProcessIds.toLocaleString();
        }
        
        if (data.uniqueIps) {
          document.getElementById('unique-ips').textContent = data.uniqueIps.toLocaleString();
        }
        
        // Update last updated timestamp
        lastUpdatedSpan.innerHTML = new Date().toLocaleString();
        console.log('Dashboard data refreshed successfully at', new Date().toLocaleString());
      } catch (err) {
        console.error('Error refreshing dashboard data:', err);
        lastUpdatedSpan.innerHTML = 'Refresh failed! ' + new Date().toLocaleString();
      }
    }
    
    function startAutoRefresh() {
      // Fetch immediately on page load
      fetchMetricsData();
      
      // Then set interval for periodic refresh
      refreshInterval = setInterval(function() {
        if (isRefreshing) {
          fetchMetricsData();
        }
      }, 5000); // Refresh every 5 seconds
    }
    
    refreshButton.addEventListener('click', function() {
      isRefreshing = !isRefreshing;
      
      if (isRefreshing) {
        refreshButton.textContent = 'Pause';
        refreshButton.classList.remove('paused');
        refreshStatus.textContent = 'Auto-refreshes every 5 seconds';
        // Refresh immediately when resuming
        fetchMetricsData();
      } else {
        refreshButton.textContent = 'Resume';
        refreshButton.classList.add('paused');
        refreshStatus.textContent = 'Auto-refresh paused';
      }
    });
    
    // Manual refresh button event
    document.getElementById('manual-refresh').addEventListener('click', function() {
      fetchMetricsData();
    });
    
    // Start auto-refresh when page loads
    startAutoRefresh();
  `;
}
