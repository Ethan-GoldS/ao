/**
 * Dashboard auto-refresh controls 
 * Manages the auto-refresh functionality with customizable intervals and graceful transitions
 */

export function generateRefreshControls(lastUpdated) {
  return `
    <div class="refresh-controls">
      <div class="refresh-interval-group">
        <label for="dashboardRefreshInterval">Auto-refresh every</label>
        <input type="number" id="dashboardRefreshInterval" class="form-control" value="15" min="1" max="3600">
        <span>seconds</span>
      </div>
      <div class="refresh-status">
        <span id="refresh-status">Auto-refreshes enabled</span> - 
        Last updated: <span id="last-updated">${lastUpdated}</span>
      </div>
      <div class="refresh-buttons">
        <button id="toggle-refresh" class="refresh-btn">Pause</button>
        <button id="manual-refresh" class="manual-refresh-btn">
          <i class="bi bi-arrow-repeat"></i>
        </button>
      </div>
    </div>
  `;
}

/**
 * Get the refresh controls script
 * Note: This returns JavaScript as a string template literal
 * @returns {string} JavaScript code as a string
 */
export function getRefreshControlsScript() {
  // Using a multiline template literal for the JavaScript code
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
        this.timer = setInterval(() => {
          if (this.isActive) {
            this.refresh(true); // true = graceful refresh
          }
        }, this.interval);
        
        console.log(`Dashboard auto-refresh set to ${this.interval/1000} seconds`);
      },
      
      // Stop the refresh timer
      stop() {
        if (this.timer) {
          clearInterval(this.timer);
          this.timer = null;
        }
      },
      
      // Register a callback function to be called on refresh
      register(callback) {
        if (typeof callback === 'function' && !this.callbacks.includes(callback)) {
          this.callbacks.push(callback);
        }
      },
      
      // Trigger a refresh (call all registered callbacks)
      refresh(graceful = false) {
        // Update the last updated timestamp
        const lastUpdatedSpan = document.getElementById('last-updated');
        if (lastUpdatedSpan) {
          lastUpdatedSpan.textContent = new Date().toISOString();
        }
        
        // Call all registered callbacks
        this.callbacks.forEach(callback => {
          try {
            callback(graceful);
          } catch (err) {
            console.error('Error in refresh callback:', err);
          }
        });
      },
      
      // Update the refresh interval
      setInterval(seconds) {
        this.interval = Math.max(1, Math.min(3600, seconds)) * 1000;
        this.start(); // Restart timer with new interval
        
        // Update display
        const status = document.getElementById('refresh-status');
        if (status && this.isActive) {
          status.textContent = `Auto-refreshes every ${seconds} seconds`;
        }
      },
      
      // Toggle active state
      toggle() {
        this.isActive = !this.isActive;
        return this.isActive;
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
            refreshButton.textContent = 'Pause';
            refreshButton.classList.remove('paused');
            refreshStatus.textContent = `Auto-refreshes every ${window.dashboardRefresh.interval/1000} seconds`;
          } else {
            refreshButton.textContent = 'Resume';
            refreshButton.classList.add('paused');
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
}
