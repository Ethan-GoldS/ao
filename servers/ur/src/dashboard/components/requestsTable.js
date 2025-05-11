/**
 * Component for displaying recent requests table
 * Shows detailed request information in an expandable format
 */

/**
 * Generate HTML for the recent requests table
 * @param {Array} recentRequests List of recent requests
 * @param {Object} requestDetails Detailed request information
 * @returns {String} HTML for the recent requests table
 */
export function generateRequestsTable(recentRequests, requestDetails) {
  // Generate recent requests table with dropdowns for details
  const recentRequestsHtml = recentRequests.map(req => {
    // Format timestamp for display
    const timestamp = new Date(req.timestamp).toLocaleString();
    
    // Format request body for display
    let requestBodyHtml = '';
    if (req.requestBody) {
      let displayBody;
      try {
        if (typeof req.requestBody === 'string') {
          displayBody = JSON.stringify(JSON.parse(req.requestBody), null, 2);
        } else {
          displayBody = JSON.stringify(req.requestBody, null, 2);
        }
        requestBodyHtml = `
          <h5>Request Body:</h5>
          <div class="request-body-preview">${displayBody}</div>
        `;
      } catch (e) {
        // If it's not valid JSON, display as string
        requestBodyHtml = `
          <h5>Request Body:</h5>
          <div class="request-body-preview">${req.requestBody.toString().substring(0, 500)}${req.requestBody.toString().length > 500 ? '...' : ''}</div>
        `;
      }
    }
    
    // Create detailed dropdown content
    const detailsHtml = `
      <div class="details-content">
        <h4>Request Details</h4>
        <table class="details-table">
          <tr><td>Method:</td><td>${req.method || 'N/A'}</td></tr>
          <tr><td>Path:</td><td>${req.path || 'N/A'}</td></tr>
          <tr><td>IP Address:</td><td>${req.ip || 'N/A'}</td></tr>
          <tr><td>User Agent:</td><td>${req.userAgent || 'N/A'}</td></tr>
          <tr><td>Referrer:</td><td>${req.referer || 'N/A'}</td></tr>
          <tr><td>Origin:</td><td>${req.origin || 'N/A'}</td></tr>
          <tr><td>Content Type:</td><td>${req.contentType || 'N/A'}</td></tr>
          <tr><td>Received:</td><td>${new Date(req.timeReceived).toLocaleString() || 'N/A'}</td></tr>
          <tr><td>Completed:</td><td>${new Date(req.timeCompleted).toLocaleString() || 'N/A'}</td></tr>
        </table>
        ${requestBodyHtml}
      </div>
    `;
    
    const truncatedProcessId = req.processId.length > 20 
      ? `${req.processId.substring(0, 10)}...${req.processId.substring(req.processId.length - 10)}` 
      : req.processId;
    
    return `
      <tr>
        <td>${timestamp}</td>
        <td>
          <details>
            <summary>${truncatedProcessId}</summary>
            <div class="process-details">
              ${detailsHtml}
            </div>
          </details>
        </td>
        <td>${req.action || 'N/A'}</td>
        <td>${req.ip || 'N/A'}</td>
        <td>${req.duration || 0}ms</td>
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
    <table class="table table-striped">
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
