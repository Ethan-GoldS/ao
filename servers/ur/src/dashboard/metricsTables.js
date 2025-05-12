/**
 * Dashboard metrics tables component
 * Generates HTML for recent requests, process metrics, and action metrics tables
 */

/**
 * Format a timestamp for display in the dashboard
 * @param {string} timestamp - ISO timestamp string
 * @returns {string} Formatted timestamp
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return 'Unknown';
  
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'Invalid Date';
    
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (err) {
    return 'Unknown';
  }
}

/**
 * Format a JSON object for display in an HTML table
 * @param {object} jsonObj - The JSON object to format
 * @returns {string} HTML representation of the object
 */
function formatJsonForDisplay(jsonObj) {
  if (!jsonObj) return 'None';
  
  try {
    // For complex objects, create a collapsible JSON viewer
    if (typeof jsonObj === 'object' && Object.keys(jsonObj).length > 0) {
      const formatted = JSON.stringify(jsonObj, null, 2)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\n/g, '<br>')
        .replace(/ /g, '&nbsp;');
        
      return `
        <details class="json-viewer">
          <summary>View JSON</summary>
          <pre>${formatted}</pre>
        </details>
      `;
    }
    
    return 'Empty Object';
  } catch (err) {
    return 'Invalid JSON';
  }
}

export function generateRecentRequestsTable(recentRequests, requestDetails) {
  // Filter out invalid records before processing
  const validRequests = recentRequests.filter(req => {
    // Check for minimum data quality requirements
    if (!req.processId) return false;
    
    // Filter out 0ms records that also have no method/path - these are likely invalid
    if (req.duration === 0 && (req.method === 'unknown' || !req.method) && (req.path === 'unknown' || !req.path)) {
      return false;
    }
    
    // Another strong signal of an invalid record is 0ms with no request body
    if (req.duration === 0 && !req.request_body && !req.request_raw && !req.rawBody) {
      return false;
    }
    
    // Keep records with valid data
    return true;
  });
  
  // Generate recent requests table with dropdowns for details
  const recentRequestsHtml = validRequests.map((req, index) => {
    // Try to get request details for this process ID
    const details = requestDetails[req.processId] || [];
    const detail = details.length > 0 ? details[0] : null;
    
    // Extract the actual request body from the JSONB column if available
    let requestBodyHtml = 'No body data';
    if (req.request_body) {
      const body = typeof req.request_body === 'string' 
        ? JSON.parse(req.request_body) 
        : req.request_body;
      requestBodyHtml = formatJsonForDisplay(body);
    }
    
    // Format the raw request data if available
    let rawRequestHtml = 'No raw data available';
    if (req.request_raw || req.rawBody) {
      try {
        const rawData = req.request_raw || req.rawBody;
        let parsedRaw = rawData;
        let isRequestBodyCaptured = false;
        
        // Try to parse the raw data if it's a string
        if (typeof rawData === 'string' && rawData.trim().startsWith('{')) {
          try {
            parsedRaw = JSON.parse(rawData);
            
            // Look specifically for body data in the parsed raw
            if (parsedRaw.body) {
              isRequestBodyCaptured = true;
            }
          } catch (e) {
            // Keep as string if parsing fails
            parsedRaw = rawData;
          }
        }
        
        // If we have a parsed body, display it more prominently
        if (isRequestBodyCaptured) {
          rawRequestHtml = `
            <div class="request-metadata">
              <h5>Request Headers & Metadata</h5>
              ${formatJsonForDisplay({ 
                headers: parsedRaw.headers || {}, 
                method: parsedRaw.method, 
                url: parsedRaw.url,
                query: parsedRaw.query
              })}
              <h5 class="request-body-header">Request Body Data</h5>
              ${formatJsonForDisplay(parsedRaw.body)}
            </div>
          `;
        } else {
          // Otherwise just show what we have
          rawRequestHtml = formatJsonForDisplay(parsedRaw);
        }
      } catch (err) {
        rawRequestHtml = `<pre>${(req.request_raw || req.rawBody || '').substr(0, 1000)}</pre>`;
      }
    }
    
    // Format the response body if available
    let responseBodyHtml = 'No response data available';
    if (req.response_body) {
      try {
        let parsedResponse = req.response_body;
        
        // Try to parse the response data if it's a string
        if (typeof req.response_body === 'string' && req.response_body.trim().startsWith('{')) {
          try {
            parsedResponse = JSON.parse(req.response_body);
          } catch (e) {
            // Keep as string if parsing fails
            parsedResponse = req.response_body;
          }
        }
        
        responseBodyHtml = formatJsonForDisplay(parsedResponse);
      } catch (err) {
        responseBodyHtml = `<pre>${(req.response_body || '').substr(0, 1000)}</pre>`;
      }
    }
    
    // Format the timestamp properly
    const formattedTimestamp = formatTimestamp(req.time_received || req.timestamp);
    
    // Create detailed dropdown content
    const detailsHtml = `
      <div class="details-content">
        <div class="details-section">
          <h4>Request Details</h4>
          <p><strong>Process ID:</strong> ${req.processId || req.process_id}</p>
          <p><strong>Tracking ID:</strong> <span class="tracking-id">${req.unique_id || 'Not available'}</span></p>
          <p><strong>Time Received:</strong> ${formatTimestamp(req.time_received)}</p>
          <p><strong>Method:</strong> ${req.request_method || req.method || 'unknown'}</p>
          <p><strong>Path:</strong> ${req.request_path || req.path || 'unknown'}</p>
          <p><strong>IP Address:</strong> ${req.request_ip || req.ip || 'unknown'}</p>
          <p><strong>User Agent:</strong> ${req.request_user_agent || req.userAgent || 'unknown'}</p>
          <p><strong>Referrer:</strong> ${req.request_referrer || req.referer || 'unknown'}</p>
          <p><strong>Origin:</strong> ${req.request_origin || req.origin || 'unknown'}</p>
          <p><strong>Content Type:</strong> ${req.request_content_type || req.contentType || 'unknown'}</p>
          <p><strong>Action:</strong> ${req.action || 'unknown'}</p>
          <p><strong>Duration:</strong> ${req.duration || 0}ms</p>
          <table>
            <tr><td>Request Body:</td><td>${requestBodyHtml}</td></tr>
            <tr><td>Raw Request:</td><td>${rawRequestHtml}</td></tr>
            <tr><td>Response Body:</td><td>${responseBodyHtml}</td></tr>
          </table>
        </div>
      </div>
    `;
    
    return `
      <tr>
        <td>${formattedTimestamp}</td>
        <td>
          <details>
            <div class="request-header" data-bs-toggle="collapse" href="#requestDetails${index}" role="button" aria-expanded="false">
              <div class="timestamp">${formatTimestamp(req.time_received)}</div>
              <div class="process-id" title="${req.process_id}">${req.process_id.substring(0, 12)}...</div>
              <div class="action">${req.action}</div>
              <div class="client-ip">${req.request_ip}</div>
              <div class="duration">${req.duration}ms</div>
              ${req.unique_id ? `<div class="unique-id" title="Tracking ID: ${req.unique_id}">ID: ${req.unique_id.substring(0, 8)}...</div>` : ''}
              <button class="copy-id-btn" data-process-id="${req.process_id}">Copy ID</button>
            </div>
            <div id="requestDetails${index}" class="collapse">
              ${detailsHtml}
            </div>
          </details>
        </td>
        <td>${req.action || 'N/A'}</td>
        <td>${req.request_ip || req.ip || 'N/A'}</td>
        <td>${req.duration || '0'}ms</td>
        <td>
          <button class="copy-btn" data-id="${req.process_id || req.processId}" title="Copy Process ID">
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
  // Generate IP address metrics
  const ipMetricsHtml = metrics.ipCounts
    .map(([ip, count]) => `
      <tr>
        <td>${ip}</td>
        <td>${count}</td>
      </tr>
    `).join('');
    
  // Generate referrer metrics
  const referrerMetricsHtml = metrics.referrerCounts
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
