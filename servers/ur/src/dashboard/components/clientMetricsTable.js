/**
 * Component for displaying client metrics table
 * Shows aggregate statistics for IP addresses and referrers
 */

/**
 * Generate HTML for the client metrics tables
 * @param {Object} metrics Complete metrics object
 * @returns {String} HTML for the client metrics tables
 */
export function generateClientMetricsTable(metrics) {
  const { ipCounts, referrerCounts } = metrics;
  
  // Generate IP address metrics table
  const ipMetricsHtml = ipCounts
    .map(([ip, count]) => `
      <tr>
        <td>${ip}</td>
        <td>${count}</td>
      </tr>
    `).join('');
    
  // Generate referrer metrics table
  const referrerMetricsHtml = referrerCounts
    .map(([referrer, count]) => `
      <tr>
        <td>${referrer}</td>
        <td>${count}</td>
      </tr>
    `).join('');

  return `
    <div class="row">
      <div class="col-md-6">
        <div class="card">
          <div class="card-header">
            <h4>Top IP Addresses</h4>
          </div>
          <div class="card-body">
            <div class="table-responsive">
              <table class="table table-striped">
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
          </div>
        </div>
      </div>
      
      <div class="col-md-6">
        <div class="card">
          <div class="card-header">
            <h4>Top Referrers</h4>
          </div>
          <div class="card-body">
            <div class="table-responsive">
              <table class="table table-striped">
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
          </div>
        </div>
      </div>
    </div>
  `;
}
