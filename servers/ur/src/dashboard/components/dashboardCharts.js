/**
 * Component for generating dashboard charts and action metrics
 * Shows metrics for different action types
 */

/**
 * Generate HTML for action metrics and charts
 * @param {Object} metrics Complete metrics object
 * @param {String} chartType Type of chart to generate
 * @returns {String} HTML for the action metrics
 */
export function generateDashboardCharts(metrics, chartType) {
  if (chartType === 'actions') {
    return generateActionMetricsTable(metrics);
  }
  return '';
}

/**
 * Generate HTML for action metrics table
 * @param {Object} metrics Complete metrics object
 * @returns {String} HTML for the action metrics table
 */
function generateActionMetricsTable(metrics) {
  const { actionCounts, actionTiming } = metrics;

  const actionMetricsHtml = Object.entries(actionCounts)
    .sort((a, b) => b[1] - a[1]) // Sort by count descending
    .map(([action, count]) => {
      const timing = actionTiming[action] || { avgDuration: 0 };
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
    <table class="table table-striped">
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
  `;
}
