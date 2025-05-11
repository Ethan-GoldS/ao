/**
 * Metrics service for collecting and analyzing UR server performance data
 */
export class MetricsService {
  constructor() {
    this.requests = [];
    this.maxStoredRequests = 1000; // Limit number of stored requests to prevent memory issues
    this.startTime = Date.now();
  }

  /**
   * Add a new request to the metrics collection
   */
  recordRequest(data) {
    // Keep collection size limited
    if (this.requests.length >= this.maxStoredRequests) {
      this.requests.shift();
    }
    
    this.requests.push({
      ...data,
      timestamp: Date.now()
    });
  }

  /**
   * Get statistics about requests
   */
  getStats() {
    const totalRequests = this.requests.length;
    let totalResponseTime = 0;
    const processCounts = {};
    const actionCounts = {};
    const endpointCounts = {};
    const responseTimes = [];

    // Analyze requests
    for (const req of this.requests) {
      if (req.responseTime) {
        totalResponseTime += req.responseTime;
        responseTimes.push(req.responseTime);
      }

      if (req.processId) {
        processCounts[req.processId] = (processCounts[req.processId] || 0) + 1;
      }

      if (req.action) {
        actionCounts[req.action] = (actionCounts[req.action] || 0) + 1;
      }

      if (req.endpoint) {
        endpointCounts[req.endpoint] = (endpointCounts[req.endpoint] || 0) + 1;
      }
    }

    // Calculate averages and percentiles
    const avgResponseTime = totalRequests > 0 ? totalResponseTime / totalRequests : 0;
    
    // Sort response times for percentile calculations
    responseTimes.sort((a, b) => a - b);
    
    const getPercentile = (arr, percentile) => {
      if (arr.length === 0) return 0;
      const index = Math.ceil(percentile / 100 * arr.length) - 1;
      return arr[index];
    };

    return {
      uptime: Date.now() - this.startTime,
      totalRequests,
      avgResponseTime,
      p50ResponseTime: getPercentile(responseTimes, 50),
      p90ResponseTime: getPercentile(responseTimes, 90),
      p99ResponseTime: getPercentile(responseTimes, 99),
      topProcesses: Object.entries(processCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
      topActions: Object.entries(actionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
      topEndpoints: Object.entries(endpointCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
      // Return the most recent requests for display
      recentRequests: this.requests
        .slice(-20)
        .reverse()
    };
  }

  /**
   * Get raw request data
   */
  getRawData() {
    return this.requests;
  }
}

// Create a singleton instance
export const metricsService = new MetricsService();
