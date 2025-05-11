/**
 * Component for displaying process metrics table
 * Shows aggregate statistics for each process ID
 */

/**
 * Generate HTML for the process metrics table
 * @param {Object} metrics Complete metrics object
 * @returns {String} HTML for the process metrics table
 */
export function generateProcessMetricsTable(metrics) {
  const { processCounts, processTiming, timeSeriesData, timeLabels, topProcessIds } = metrics;
  
  // Generate HTML for each process
  const processMetricsHtml = Object.entries(processCounts)
    .sort((a, b) => b[1] - a[1]) // Sort by count descending
    .map(([processId, count]) => {
      const timing = processTiming[processId] || { avgDuration: 0 };
      const isTopProcess = topProcessIds.includes(processId);
      
      // Create process-specific time series data if available
      const processTimeData = timeSeriesData.map(bucket => 
        bucket.processCounts[processId] || 0
      );
      
      // Truncate long process IDs for display
      const truncatedProcessId = processId.length > 20 
        ? `${processId.substring(0, 10)}...${processId.substring(processId.length - 10)}` 
        : processId;
      
      return `
        <tr>
          <td>
            <details>
              <summary>${truncatedProcessId}</summary>
              <div class="process-details">
                <h4>Process Request History</h4>
                ${isTopProcess ? 
                  `<div class="mini-chart" data-process-id="${processId}" data-time-labels='${JSON.stringify(timeLabels)}' data-values='${JSON.stringify(processTimeData)}'></div>` : 
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
    <table class="table table-striped">
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
  `;
}
