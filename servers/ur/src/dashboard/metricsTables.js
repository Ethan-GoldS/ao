/**
 * Dashboard metrics tables component
 * Generates HTML for recent requests, process metrics, and action metrics tables
 */

export function generateRecentRequestsTable(recentRequests, requestDetails) {
  // Generate recent requests table with dropdowns for details
  const recentRequestsHtml = recentRequests.map((req, index) => {
    // Try to get request details for this process ID
    const details = requestDetails[req.processId] || [];
    const detail = details.length > 0 ? details[0] : null;
    
    // Create detailed dropdown content
    const detailsHtml = detail ? `
      <div class="details-content">
        <h4>Request Details</h4>
        <table class="details-table">
          <tr><td>Method:</td><td>${detail.method || 'N/A'}</td></tr>
          <tr><td>Path:</td><td>${detail.path || 'N/A'}</td></tr>
          <tr><td>IP Address:</td><td>${detail.ip || 'N/A'}</td></tr>
          <tr><td>User Agent:</td><td>${detail.userAgent || 'N/A'}</td></tr>
          <tr><td>Referrer:</td><td>${detail.referer || 'N/A'}</td></tr>
          <tr><td>Origin:</td><td>${detail.origin || 'N/A'}</td></tr>
          <tr><td>Content Type:</td><td>${detail.contentType || 'N/A'}</td></tr>
        </table>
      </div>
    ` : '<div class="details-content">No additional details available</div>';
    
    return `
      <tr>
        <td>${req.timestamp}</td>
        <td>
          <details>
            <summary>${req.processId}</summary>
            <div class="process-details">
              ${detailsHtml}
            </div>
          </details>
        </td>
        <td>${req.action || 'N/A'}</td>
        <td>${req.ip}</td>
        <td>${req.duration}ms</td>
        <td>
          <button class="copy-btn" data-id="${req.processId}" title="Copy Process ID">
            Copy ID
          </button>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="filter-group">
      <input type="text" class="filter-input" id="requestFilter" placeholder="Filter requests..." />
    </div>
    <table>
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Process ID</th>
          <th>Action</th>
          <th>IP</th>
          <th>Duration</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${recentRequestsHtml || '<tr><td colspan="6">No requests recorded yet</td></tr>'}
      </tbody>
    </table>
  `;
}

export function generateProcessMetricsTable(metrics) {
  const processMetricsHtml = Object.entries(metrics.processCounts)
    .sort((a, b) => b[1] - a[1]) // Sort by count descending
    .map(([processId, count]) => {
      const timing = metrics.processTiming[processId] || { avgDuration: 0 };
      const isTopProcess = metrics.topProcessIds.includes(processId);
      
      // Create process-specific time series data
      const processTimeData = metrics.timeSeriesData.map(bucket => 
        bucket.processCounts[processId] || 0
      );
      
      return `
        <tr>
          <td>
            <details>
              <summary>${processId}</summary>
              <div class="process-details">
                <h4>Process Request History</h4>
                ${isTopProcess ? 
                  `<div class="mini-chart" data-process-id="${processId}" data-time-labels='${JSON.stringify(metrics.timeLabels)}' data-values='${JSON.stringify(processTimeData)}'></div>` : 
                  '<p>Not enough data for visualization</p>'}
              </div>
            </details>
          </td>
          <td>${count}</td>
          <td>${timing.avgDuration.toFixed(2)}ms</td>
          <td>
            <button class="copy-btn" data-id="${processId}" title="Copy Process ID">
              Copy ID
            </button>
          </td>
        </tr>
      `;
    }).join('');

  return `
    <div class="filter-group">
      <input type="text" class="filter-input" id="processFilter" placeholder="Filter by process ID..." />
    </div>
    <table>
      <thead>
        <tr>
          <th>Process ID</th>
          <th>Request Count</th>
          <th>Average Duration</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${processMetricsHtml || '<tr><td colspan="4">No process metrics recorded yet</td></tr>'}
      </tbody>
    </table>
    <div class="chart-container">
      <h3>Top Process IDs by Request Count</h3>
      <canvas id="topProcessesChart"></canvas>
    </div>
  `;
}

export function generateActionMetricsTable(metrics) {
  const actionMetricsHtml = Object.entries(metrics.actionCounts)
    .sort((a, b) => b[1] - a[1]) // Sort by count descending
    .map(([action, count]) => {
      const timing = metrics.actionTiming[action] || { avgDuration: 0 };
      return `
        <tr class="action-row" data-action="${action}">
          <td>${action}</td>
          <td>${count}</td>
          <td>${timing.avgDuration.toFixed(2)}ms</td>
        </tr>
      `;
    }).join('');

  return `
    <div class="filter-group">
      <input type="text" class="filter-input" id="actionFilter" placeholder="Filter by action..." />
    </div>
    <table>
      <thead>
        <tr>
          <th>Action</th>
          <th>Request Count</th>
          <th>Average Duration</th>
        </tr>
      </thead>
      <tbody>
        ${actionMetricsHtml || '<tr><td colspan="3">No action metrics recorded yet</td></tr>'}
      </tbody>
    </table>
    <div class="chart-container">
      <h3>Actions by Request Count</h3>
      <canvas id="actionsChart"></canvas>
    </div>
  `;
}

export function generateClientMetricsTable(metrics) {
  // Helper to format metrics data that could be in array or object format
  const formatMetrics = (data) => {
    if (!data) return [];
    
    // If data is already in array format (from previous implementation)
    if (Array.isArray(data)) {
      return data;
    }
    
    // Convert object format to array format
    if (typeof data === 'object') {
      return Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 10);
    }
    
    return [];
  };
  
  // Generate IP address metrics
  const ipMetricsHtml = formatMetrics(metrics.ipCounts)
    .map(([ip, count]) => `
      <tr>
        <td>${ip}</td>
        <td>${count}</td>
      </tr>
    `).join('');
    
  // Generate referrer metrics
  const referrerMetricsHtml = formatMetrics(metrics.referrerCounts)
    .map(([referrer, count]) => `
      <tr>
        <td>${referrer}</td>
        <td>${count}</td>
      </tr>
    `).join('');

  return `
    <div class="card">
      <h3>Top IP Addresses</h3>
      <table>
        <thead>
          <tr>
            <th>IP Address</th>
            <th>Request Count</th>
          </tr>
        </thead>
        <tbody>
          ${ipMetricsHtml || '<tr><td colspan="2">No IP metrics recorded yet</td></tr>'}
        </tbody>
      </table>
    </div>
    
    <div class="card">
      <h3>Top Referrers</h3>
      <table>
        <thead>
          <tr>
            <th>Referrer</th>
            <th>Request Count</th>
          </tr>
        </thead>
        <tbody>
          ${referrerMetricsHtml || '<tr><td colspan="2">No referrer metrics recorded yet</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

export function getFilterScript() {
  return `
    // Filter functionality
    document.getElementById('requestFilter').addEventListener('input', function() {
      const filterValue = this.value.toLowerCase();
      const rows = document.querySelectorAll('#requests-tab tbody tr');
      
      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(filterValue) ? '' : 'none';
      });
    });
    
    document.getElementById('processFilter').addEventListener('input', function() {
      const filterValue = this.value.toLowerCase();
      const rows = document.querySelectorAll('#processes-tab tbody tr');
      
      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(filterValue) ? '' : 'none';
      });
    });
    
    document.getElementById('actionFilter').addEventListener('input', function() {
      const filterValue = this.value.toLowerCase();
      const rows = document.querySelectorAll('#actions-tab tbody tr');
      
      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(filterValue) ? '' : 'none';
      });
    });

    // Copy button functionality
    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const textToCopy = btn.dataset.id;
        navigator.clipboard.writeText(textToCopy).then(() => {
          const originalText = btn.innerText;
          btn.innerText = 'Copied!';
          setTimeout(() => {
            btn.innerText = originalText;
          }, 1000);
        });
      });
    });
  `;
}
