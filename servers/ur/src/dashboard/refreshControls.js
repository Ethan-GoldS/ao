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
    </div>
  `;
}

export function getRefreshControlsScript() {
  return `
    // Auto-refresh functionality
    let refreshInterval;
    let isRefreshing = true;
    const refreshButton = document.getElementById('toggle-refresh');
    const refreshStatus = document.getElementById('refresh-status');
    const lastUpdatedSpan = document.getElementById('last-updated');
    
    function startAutoRefresh() {
      refreshInterval = setInterval(function() {
        if (isRefreshing) {
          window.location.reload();
        }
      }, 5000); // Refresh every 5 seconds
    }
    
    refreshButton.addEventListener('click', function() {
      isRefreshing = !isRefreshing;
      
      if (isRefreshing) {
        refreshButton.textContent = 'Pause';
        refreshButton.classList.remove('paused');
        refreshStatus.textContent = 'Auto-refreshes every 5 seconds';
      } else {
        refreshButton.textContent = 'Resume';
        refreshButton.classList.add('paused');
        refreshStatus.textContent = 'Auto-refresh paused';
      }
    });
    
    // Start auto-refresh when page loads
    startAutoRefresh();
  `;
}
