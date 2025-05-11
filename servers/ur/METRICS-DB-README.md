# AO UR Server Metrics Database

This document describes the SQLite-based metrics system for the AO UR server.

## Database Overview

The metrics database is a SQLite database that stores detailed metrics about each request processed by the UR server. The database is designed to allow complex queries over request data, including filtering by time ranges, process IDs, IP addresses, and other criteria.

## Database Schema

The database consists of the following tables:

### `requests`

Stores basic information about each request:

```sql
CREATE TABLE requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  process_id TEXT,
  ip TEXT,
  action TEXT,
  duration INTEGER,
  unix_timestamp INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
```

| Column | Description |
|--------|-------------|
| id | Unique identifier for the request |
| timestamp | ISO timestamp of when the request was received |
| process_id | The AO process ID that was requested |
| ip | IP address of the requester |
| action | Action tag from the request body |
| duration | Request processing duration in milliseconds |
| unix_timestamp | Unix timestamp for easier time-based queries |
| created_at | Timestamp when the record was created |

### `processes`

Aggregated information about each process:

```sql
CREATE TABLE processes (
  process_id TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  total_requests INTEGER DEFAULT 0,
  avg_duration REAL DEFAULT 0
)
```

### `ip_addresses`

Aggregated information about each IP address:

```sql
CREATE TABLE ip_addresses (
  ip TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  total_requests INTEGER DEFAULT 0
)
```

### `actions`

Aggregated information about each action:

```sql
CREATE TABLE actions (
  action TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  total_requests INTEGER DEFAULT 0,
  avg_duration REAL DEFAULT 0
)
```

### `request_details`

Stores additional details about each request:

```sql
CREATE TABLE request_details (
  request_id INTEGER,
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (request_id, key),
  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
)
```

## Example Queries

### Get Requests by Process ID

```sql
SELECT * FROM requests 
WHERE process_id = '8N08BvmC34q9Hxj-YS6eAOd_cSmYqGpezPPHUYWJBhg'
ORDER BY timestamp DESC
LIMIT 100
```

### Get Requests in a Time Range

```sql
SELECT * FROM requests 
WHERE unix_timestamp BETWEEN 
  strftime('%s', '2025-05-10T00:00:00Z') * 1000 AND 
  strftime('%s', '2025-05-11T23:59:59Z') * 1000
```

### Count Requests by Hour

```sql
SELECT 
  strftime('%H', datetime(unix_timestamp / 1000, 'unixepoch')) as hour,
  COUNT(*) as count
FROM requests
GROUP BY hour
ORDER BY hour
```

### Top 10 Most Active Processes

```sql
SELECT process_id, total_requests
FROM processes
ORDER BY total_requests DESC
LIMIT 10
```

### Get Average Response Time by Action

```sql
SELECT action, avg_duration
FROM actions
ORDER BY avg_duration DESC
```

### Get Requests from a Specific IP Address

```sql
SELECT * FROM requests
WHERE ip = '84.239.43.165'
ORDER BY timestamp DESC
```

## JavaScript API

The metrics system provides several JavaScript functions for querying the database:

### `getMetrics()`

Returns all metrics for dashboard display.

### `searchMetrics(criteria)`

Searches for metrics based on various criteria:

```javascript
// Example:
const results = await searchMetrics({
  processId: '8N08BvmC34q9Hxj-YS6eAOd_cSmYqGpezPPHUYWJBhg',
  startTime: '2025-05-10T00:00:00Z',
  endTime: '2025-05-11T23:59:59Z',
  ip: '84.239.43.165'
});
```

### `getTimeSeriesData(options)`

Gets time series data for charting:

```javascript
// Example:
const timeData = await getTimeSeriesData({
  startTime: new Date('2025-05-10'),
  endTime: new Date('2025-05-11'),
  interval: '15min',
  processId: '8N08BvmC34q9Hxj-YS6eAOd_cSmYqGpezPPHUYWJBhg'
});
```

### `getRequestDetails(requestId)`

Gets detailed information for a specific request:

```javascript
// Example:
const details = await getRequestDetails(123);
```

## Database File Location

The SQLite database file is stored at:

```
./data/metrics/metrics.db
```

You can query this file directly using any SQLite client.
