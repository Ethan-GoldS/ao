import { logger } from '../logger.js'

/**
 * Adds a route to allow manual retry of messages that failed due to rate limiting
 * or other issues.
 * 
 * This endpoint accepts:
 * - processId: The AO process ID
 * - timestamp: Optional timestamp to start processing from (defaults to current time)
 */
export const withRetryRoute = (app) => {
  app.post(
    '/retry/:processId',
    async (req, res) => {
      const {
        domain: { db },
        params: { processId },
        query: { timestamp }
      } = req

      const retryLogger = logger.child('retryRoute')
      const processTimestamp = timestamp ? Number(timestamp) : Date.now()
      const logId = `retry-${Date.now()}`
      
      try {
        // Insert the message into the MESSAGES table for recovery
        await db.run({
          sql: `INSERT INTO MESSAGES (id, timestamp, data, retries) VALUES (?, ?, ?, ?)`,
          parameters: [
            logId,
            Date.now(),
            JSON.stringify({
              tx: { 
                id: processId, 
                processId 
              },
              logId,
              timestamp: processTimestamp
            }),
            0
          ]
        })

        retryLogger({ 
          log: `Queued process ${processId} for recovery with timestamp ${processTimestamp}` 
        })

        res.status(202).send({ 
          message: 'Message queued for recovery',
          processId,
          timestamp: processTimestamp,
          logId
        })
      } catch (error) {
        retryLogger({ 
          log: `Error queuing process ${processId} for recovery: ${error.message}`,
          end: true 
        }, error)
        
        res.status(500).send({ 
          error: 'Failed to queue message for recovery',
          message: error.message
        })
      }
    }
  )
  return app
}
