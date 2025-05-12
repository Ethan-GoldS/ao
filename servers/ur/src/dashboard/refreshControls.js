/**
 * Dashboard auto-refresh controls 
 * Manages the auto-refresh functionality with customizable intervals and graceful transitions
 */

export function generateRefreshControls(lastUpdated) {
  return `
    <div class="refresh-controls">
      <div class="refresh-card">
        <div class="refresh-header">
          <h4>Auto-Refresh Settings</h4>
        </div>
        <div class="refresh-body">
          <div class="refresh-interval-group">
            <label for="dashboardRefreshInterval">Refresh interval:</label>
            <div class="refresh-input-group">
              <input type="number" id="dashboardRefreshInterval" class="form-control" value="15" min="1" max="3600">
              <span class="input-group-text">seconds</span>
            </div>
          </div>
          
          <div class="refresh-status">
            <div class="status-indicator">
              <span class="status-dot active" id="status-indicator-dot"></span>
              <span id="refresh-status">Auto-refreshes enabled</span>
            </div>
            <div class="last-updated">
              Last updated: <span id="last-updated">${lastUpdated}</span>
            </div>
          </div>
          
          <div class="refresh-buttons">
            <button id="toggle-refresh" class="btn btn-outline-primary refresh-btn">
              <i class="bi bi-pause-circle"></i> Pause
            </button>
            <button id="manual-refresh" class="btn btn-primary manual-refresh-btn">
              <i class="bi bi-arrow-repeat"></i> Refresh Now
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Get the refresh controls script
 * Note: This returns JavaScript as a string
 * @returns {string} JavaScript code as a string
 */
export function getRefreshControlsScript() {
  // Using a multiline string for the JavaScript code
  // This is valid code, ignore the lint errors in the string content
  /* eslint-disable */
  return `
    // Global refresh system
    window.dashboardRefresh = {
      interval: 15000, // Default 15 seconds
      isActive: true,
      timer: null,
      callbacks: [], // Functions to call on refresh
      
      // Start the refresh timer
      start() {
        // Clear any existing timer
        this.stop();
        
        // Create new timer
        this.timer = setInterval(function() {
          if (window.dashboardRefresh.isActive) {
            window.dashboardRefresh.refresh(true); // true = graceful refresh
          }
        }, window.dashboardRefresh.interval);
        
        console.log('Auto-refresh set to ' + (window.dashboardRefresh.interval/1000) + ' seconds');
      },
      
      // Stop the refresh timer
      stop() {
        if (window.dashboardRefresh.timer) {
          clearInterval(window.dashboardRefresh.timer);
          window.dashboardRefresh.timer = null;
        }
      },
      
      // Register a callback function to be called on refresh
      register(callback) {
        if (typeof callback === 'function' && !window.dashboardRefresh.callbacks.includes(callback)) {
          window.dashboardRefresh.callbacks.push(callback);
        }
      },
      
      // Trigger a refresh (call all registered callbacks)
      refresh(graceful) {
        // Update the last updated timestamp
        const lastUpdatedSpan = document.getElementById('last-updated');
        if (lastUpdatedSpan) {
          lastUpdatedSpan.textContent = new Date().toISOString();
        }
        
        // Call all registered callbacks
        window.dashboardRefresh.callbacks.forEach(function(callback) {
          try {
            callback(graceful);
          } catch (err) {
            console.error('Error in refresh callback:', err);
          }
        });
      },
      
      // Update the refresh interval
      setInterval(seconds) {
        window.dashboardRefresh.interval = Math.max(1, Math.min(3600, seconds)) * 1000;
        window.dashboardRefresh.start(); // Restart timer with new interval
        
        // Update display
        const status = document.getElementById('refresh-status');
        if (status && window.dashboardRefresh.isActive) {
          status.textContent = 'Auto-refreshes every ' + (window.dashboardRefresh.interval/1000) + ' seconds';
        }
      },
      
      // Toggle active state
      toggle() {
        window.dashboardRefresh.isActive = !window.dashboardRefresh.isActive;
        
        // Update status indicator
        const statusDot = document.getElementById('status-indicator-dot');
        if (statusDot) {
          if (window.dashboardRefresh.isActive) {
            statusDot.className = 'status-dot active';
          } else {
            statusDot.className = 'status-dot paused';
          }
        }
        
        return window.dashboardRefresh.isActive;
      }
    };
    
    // Initialize refresh controls
    function initializeRefreshControls() {
      const refreshButton = document.getElementById('toggle-refresh');
      const manualRefreshButton = document.getElementById('manual-refresh');
      const refreshStatus = document.getElementById('refresh-status');
      const intervalInput = document.getElementById('dashboardRefreshInterval');
      
      // Set initial refresh interval
      if (intervalInput) {
        const initialInterval = parseInt(intervalInput.value, 10) || 15;
        window.dashboardRefresh.setInterval(initialInterval);
        
        // Listen for interval changes
        intervalInput.addEventListener('change', function() {
          const seconds = parseInt(this.value, 10) || 15;
          window.dashboardRefresh.setInterval(seconds);
        });
      }
      
      // Set up toggle button
      if (refreshButton) {
        refreshButton.addEventListener('click', function() {
          const isActive = window.dashboardRefresh.toggle();
          
          if (isActive) {
            refreshButton.innerHTML = '<i class="bi bi-pause-circle"></i> Pause';
            refreshButton.classList.remove('btn-outline-secondary');
            refreshButton.classList.add('btn-outline-primary');
            const statusDot = document.getElementById('status-indicator-dot');
            if (statusDot) statusDot.className = 'status-dot active';
            refreshStatus.textContent = 'Auto-refreshes every ' + (window.dashboardRefresh.interval/1000) + ' seconds';
          } else {
            refreshButton.innerHTML = '<i class="bi bi-play-circle"></i> Resume';
            refreshButton.classList.remove('btn-outline-primary');
            refreshButton.classList.add('btn-outline-secondary');
            const statusDot = document.getElementById('status-indicator-dot');
            if (statusDot) statusDot.className = 'status-dot paused';
            refreshStatus.textContent = 'Auto-refresh paused';
          }
        });
      }
      
      // Set up manual refresh button
      if (manualRefreshButton) {
        manualRefreshButton.addEventListener('click', function() {
          // Manual refresh is never graceful
          window.dashboardRefresh.refresh(false);
        });
      }
      
      // Start auto-refresh
      window.dashboardRefresh.start();
    }
    
    // Initialize when DOM is ready
    document.addEventListener('DOMContentLoaded', initializeRefreshControls);
    
    // Backward compatibility for existing refresh mechanisms
    function startAutoRefresh() {
      // This is a stub function for backward compatibility
      console.log('Legacy startAutoRefresh called - using new mechanism');
    }
  `;
}
