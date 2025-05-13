/**
 * Dashboard styles
 * Contains all CSS styles for the metrics dashboard
 */

export function getDashboardStyles() {
  return `
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding: 20px;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
    }
    h1, h2, h3, h4 {
      color: #444;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th, td {
      text-align: left;
      padding: 8px;
      border: 1px solid #ddd;
    }
    th {
      background-color: #f2f2f2;
    }
    tr:nth-child(even) {
      background-color: #f9f9f9;
    }
    .timestamp {
      font-size: 0.8em;
      color: #666;
      text-align: right;
    }
    .card {
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 15px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .stats-overview {
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }
    
    .stat-section {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-right: 10px;
    }
    
    .section-title {
      margin-top: 20px;
      margin-bottom: 10px;
      font-size: 1.2em;
      color: #333;
      font-weight: bold;
      border-bottom: 1px solid #ddd;
      padding-bottom: 5px;
    }
    
    .table-container {
      max-height: 400px;
      overflow-y: auto;
      margin-bottom: 20px;
      border: 1px solid #eee;
      border-radius: 4px;
    }
    
    .message-id-row td {
      font-family: monospace;
      font-size: 0.9em;
    }
    
    .no-data {
      text-align: center;
      font-style: italic;
      color: #777;
      padding: 20px;
    }
    .stat-box {
      flex: 1;
      min-width: 200px;
      margin: 0 10px 10px 0;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      text-align: center;
    }
    .stat-number {
      font-size: 2em;
      font-weight: bold;
      color: #0066cc;
    }
    .stat-label {
      font-size: 0.9em;
      color: #666;
    }
    .chart-container {
      position: relative;
      height: 300px;
      margin: 15px 0;
    }
    .mini-chart {
      height: 150px;
      margin: 10px 0;
    }
    .tabs {
      display: flex;
      margin-bottom: 20px;
    }
    .tab {
      padding: 8px 15px;
      cursor: pointer;
      background: #f2f2f2;
      border: 1px solid #ddd;
      border-bottom: none;
      margin-right: 5px;
      border-radius: 4px 4px 0 0;
    }
    .tab.active {
      background: #fff;
      font-weight: bold;
    }
    .tab-content {
      display: none;
      border: 1px solid #ddd;
      padding: 15px;
      border-radius: 0 4px 4px 4px;
    }
    .tab-content.active {
      display: block;
    }
    details {
      margin: 5px 0;
    }
    summary {
      cursor: pointer;
      padding: 5px;
      background: #f8f9fa;
      border-radius: 3px;
    }
    .process-details, .details-content {
      padding: 10px;
      margin-top: 5px;
      background: #f9f9f9;
      border: 1px solid #eee;
      border-radius: 3px;
    }
    .copy-btn {
      background: #0066cc;
      color: white;
      border: none;
      padding: 4px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 0.8em;
    }
    .copy-btn:hover {
      background: #0055aa;
    }
    .details-table {
      margin: 10px 0;
      font-size: 0.9em;
    }
    .details-table td:first-child {
      font-weight: bold;
      width: 120px;
    }
    .time-controls {
      margin: 20px 0;
      padding: 15px;
      background: #f9f9f9;
      border-radius: 4px;
      border: 1px solid #eee;
    }
    .control-row {
      display: flex;
      margin-bottom: 15px;
      align-items: center;
    }
    .control-group {
      margin-right: 20px;
      flex: 1;
    }
    .control-group label {
      display: block;
      margin-bottom: 5px;
      font-weight: bold;
      font-size: 0.9em;
      color: #555;
    }
    .control-group input, .control-group select {
      width: 100%;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
    }
    .time-range-selector, .interval-selector {
      margin-bottom: 20px;
    }
    .preset-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .time-preset {
      background: #f2f2f2;
      border: 1px solid #ddd;
      padding: 8px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.9em;
    }
    .time-preset:hover {
      background: #e0e0e0;
    }
    .time-preset.active {
      background: #0066cc;
      color: white;
      border-color: #0055aa;
    }
    .apply-btn {
      background: #0066cc;
      color: white;
      border: none;
      padding: 8px 15px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
      margin-left: 10px;
    }
    
    /* Request type styling */
    .request-type {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 0.8em;
      font-weight: bold;
      text-transform: uppercase;
    }
    
    .request-type.dry-run {
      background-color: #e6f7ff;
      color: #0066cc;
      border: 1px solid #99ccff;
    }
    
    .request-type.result {
      background-color: #f0f5e6;
      color: #4caf50;
      border: 1px solid #8bc34a;
    }
    
    .request-type.unknown {
      background-color: #f9f9f9;
      color: #9e9e9e;
      border: 1px solid #e0e0e0;
    }
    
    /* Type toggle container styling */
    .type-toggle-container {
      display: flex;
      margin-bottom: 15px;
    }
    
    .type-toggle {
      display: flex;
      border-radius: 4px;
      overflow: hidden;
      border: 1px solid #ddd;
    }
    
    .type-filter-btn {
      background: #f2f2f2;
      border: none;
      padding: 8px 15px;
      cursor: pointer;
      font-size: 0.9em;
      transition: background-color 0.2s;
      border-right: 1px solid #ddd;
    }
    
    .type-filter-btn:last-child {
      border-right: none;
    }
    
    .type-filter-btn:hover {
      background-color: #e0e0e0;
    }
    
    .type-filter-btn.active {
      background-color: #0066cc;
      color: white;
    }
    .apply-btn:hover {
      background: #0055aa;
    }
    #intervalSelector {
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      min-width: 150px;
    }
    .filter-group {
      margin-bottom: 15px;
    }
    .filter-input {
      padding: 5px;
      width: 200px;
    }
    .refresh-btn {
      background: #0066cc;
      color: white;
      border: none;
      padding: 4px 8px;
      border-radius: 3px;
      cursor: pointer;
      margin-left: 10px;
    }
    .refresh-btn.paused {
      background: #cc4400;
    }
  `;
}
