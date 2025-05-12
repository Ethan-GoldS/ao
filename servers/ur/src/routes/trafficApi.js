/**
 * Traffic API endpoint
 * Provides data for the traffic overview visualization
 */
import express from 'express';
import { logger } from '../logger.js';
import { query } from '../database/db.js';
import { format } from 'date-fns';

const router = express.Router();
const _logger = logger.child('trafficApi');

/**
 * Convert time range parameter to milliseconds
 * @param {string} timeRange - Time range (e.g., '1m', '1h', '1d')
 * @returns {number} Time range in milliseconds
 */
function timeRangeToMs(timeRange) {
  const units = {
    m: 60 * 1000, // minute in ms
    h: 60 * 60 * 1000, // hour in ms
    d: 24 * 60 * 60 * 1000 // day in ms
  };

  const value = parseInt(timeRange.slice(0, -1), 10);
  const unit = timeRange.slice(-1);

  if (isNaN(value) || !units[unit]) {
    _logger('Invalid time range format: %s', timeRange);
    return 60 * 60 * 1000; // default to 1 hour
  }

  return value * units[unit];
}

/**
 * Convert time interval parameter to Postgres interval string
 * @param {string} timeInterval - Time interval (e.g., '5s', '1m', '1h')
 * @returns {string} Postgres interval string
 */
function timeIntervalToPostgresInterval(timeInterval) {
  const units = {
    s: 'second',
    m: 'minute',
    h: 'hour',
    d: 'day'
  };

  const value = parseInt(timeInterval.slice(0, -1), 10);
  const unit = timeInterval.slice(-1);

  if (isNaN(value) || !units[unit]) {
    _logger('Invalid time interval format: %s', timeInterval);
    return '1 minute'; // default to 1 minute
  }

  return value + ' ' + units[unit];
}

/**
 * Get traffic data grouped by time interval
 * @param {string} timeRange - Time range parameter (e.g., '1h', '1d')
 * @param {string} timeInterval - Time interval parameter (e.g., '5s', '1m')
 * @param {string} processFilter - Optional process ID filter
 * @returns {Promise<Object>} Traffic data
 */
async function getTrafficData(timeRange, timeInterval, processFilter) {
  try {
    // Convert time range to milliseconds
    const rangeMs = timeRangeToMs(timeRange);
    const startTime = new Date(Date.now() - rangeMs);

    // Convert interval to Postgres interval
    const pgInterval = timeIntervalToPostgresInterval(timeInterval);
    
    // Handle seconds specially since PostgreSQL doesn't have direct second-level truncation
    const isSecondsInterval = pgInterval.includes('second');
    const truncationUnit = isSecondsInterval ? 'minute' : pgInterval.split(' ')[1];
    
    // For seconds intervals, we'll do additional filtering later
    const secondsValue = isSecondsInterval ? parseInt(pgInterval.split(' ')[0], 10) : 0;

    // Build the base query - use date_trunc for standard PostgreSQL compatibility
    let sql = 'WITH time_buckets AS (\n' +
      '        SELECT \n' +
      '          date_trunc(\'' + truncationUnit + '\', time_received) AS bucket_time,\n' +
      '          process_id,\n' +
      '          action,\n' +
      '          duration\n' +
      '        FROM metrics_requests\n' +
      '        WHERE time_received >= $1';

    const params = [startTime];
    let paramIndex = 2;

    // Add process filter if provided
    if (processFilter) {
      sql += ' AND process_id LIKE $' + paramIndex;
      params.push('%' + processFilter + '%');
      paramIndex++;
    }

    // Complete the query
    sql += '\n      ),\n' +
      '      bucket_stats AS (\n' +
      '        SELECT\n' +
      '          bucket_time,\n' +
      '          COUNT(*) AS request_count,\n' +
      '          COUNT(DISTINCT process_id) AS unique_process_count,\n' +
      '          array_agg(DISTINCT process_id) AS all_process_ids,\n' +
      '          array_agg(process_id) FILTER (WHERE process_id IN (\n' +
      '            SELECT process_id\n' +
      '            FROM time_buckets\n' +
      '            WHERE bucket_time = tb.bucket_time\n' +
      '            GROUP BY process_id\n' +
      '            ORDER BY COUNT(*) DESC\n' +
      '            LIMIT 5\n' +
      '          )) AS top_process_ids\n' +
      '        FROM time_buckets tb\n' +
      '        GROUP BY bucket_time\n' +
      '        ORDER BY bucket_time\n' +
      '      )\n' +
      '      SELECT\n' +
      '        bucket_time,\n' +
      '        request_count,\n' +
      '        unique_process_count,\n' +
      '        all_process_ids,\n' +
      '        top_process_ids,\n' +
      '        -- Calculate the request rate per minute\n' +
      '        CASE \n' +
      '          WHEN \'' + pgInterval + '\' LIKE \'%second%\' THEN request_count * (60.0 / ' + (secondsValue || 60) + ')\n' +
      '          WHEN \'' + pgInterval + '\' LIKE \'%minute%\' THEN request_count * (60.0 / ' + (pgInterval.split(' ')[0] || 1) + ')\n' +
      '          WHEN \'' + pgInterval + '\' LIKE \'%hour%\' THEN request_count / ' + (pgInterval.split(' ')[0] || 1) + ' * 60\n' +
      '          WHEN \'' + pgInterval + '\' LIKE \'%day%\' THEN request_count / (24 * ' + (pgInterval.split(' ')[0] || 1) + ') * 60\n' +
      '          ELSE request_count\n' +
      '        END AS request_rate,\n' +
      '        CASE \n' +
      '          WHEN \'' + pgInterval + '\' LIKE \'%second%\' THEN ' + (secondsValue || 60) + ' / 60.0\n' +
      '          WHEN \'' + pgInterval + '\' LIKE \'%minute%\' THEN ' + (pgInterval.split(' ')[0] || 1) + '\n' +
      '          WHEN \'' + pgInterval + '\' LIKE \'%hour%\' THEN ' + (pgInterval.split(' ')[0] || 1) + ' * 60\n' +
      '          WHEN \'' + pgInterval + '\' LIKE \'%day%\' THEN ' + (pgInterval.split(' ')[0] || 1) + ' * 24 * 60\n' +
      '          ELSE 1\n' +
      '        END AS duration_minutes\n' +
      '      FROM bucket_stats\n' +
      '      ORDER BY bucket_time ASC';

    // Execute the query
    const result = await query(sql, params);

    // Format the response
    const intervals = result.rows.map(row => {
      const bucketTime = new Date(row.bucket_time);
      
      return {
        timestamp: bucketTime.toISOString(),
        formattedTime: format(bucketTime, "MMM d, HH:mm:ss"),
        requestCount: parseInt(row.request_count, 10),
        uniqueProcessCount: parseInt(row.unique_process_count, 10),
        requestRate: parseFloat(row.request_rate),
        durationMinutes: parseFloat(row.duration_minutes),
        allProcessIds: row.all_process_ids || [],
        topProcessIds: row.top_process_ids || []
      };
    });

    return {
      timeRange,
      timeInterval,
      processFilter: processFilter || '',
      intervals
    };
  } catch (error) {
    _logger('Error fetching traffic data: %O', error);
    throw error;
  }
}

// Set up API routes
router.get('/traffic-data', async (req, res) => {
  try {
    const { timeRange = '1h', timeInterval = '1m', processFilter = '' } = req.query;
    
    _logger('Fetching traffic data: range=%s, interval=%s, filter=%s', 
      timeRange, timeInterval, processFilter || 'none');
    
    // Set timeout for query to prevent long-running queries
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Traffic data query timed out')), 15000);
    });
    
    // Use Promise.race to implement timeout
    const data = await Promise.race([
      getTrafficData(timeRange, timeInterval, processFilter),
      timeoutPromise
    ]);
    
    res.json(data);
  } catch (error) {
    _logger('Error handling traffic data request: %O', error);
    res.status(500).json({ error: 'Failed to retrieve traffic data' });
  }
});

/**
 * Mount the traffic API routes on the app
 * @param {object} app - Express application
 */
export function mountTrafficApi(app) {
  _logger('Mounting traffic API routes');
  app.use('/api', router);
}

export default router;
