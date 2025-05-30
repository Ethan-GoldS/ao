import { errFrom } from '../../domain/utils.js'

/**
 * A middleware that simply calls the next handler in the chain.
 *
 * If no errors are thrown, then this middleware simply returns the response.
 * If an error is thrown, it is caught, logged, then used to respond to the request.
 *
 * This is useful for handling thrown errors, and prevents having to call
 * next explictly. Instead, a more idiomatic thrown error can be used in subsequent handlers
 */
export const withErrorHandler = (handler) => (req, res) => {
  return Promise.resolve()
    .then(() => handler(req, res))
    .catch((err) => {
      const { domain: { logger } } = req
      
      // Check if this is a HashChain validation error
      const isHashChainError = err && err.message && err.message.includes('HashChain invalid');
      
      if (isHashChainError) {
        logger('Intercepted HashChain validation error in top-level handler. Returning graceful response:', err.message)
        
        // If the connection is still open, send a graceful response
        if (!res.raw.writableEnded) {
          return res.status(200).send({
            warning: 'HashChain validation issue detected. Operation partially completed.',
            details: `Some messages were skipped due to hash chain validation: ${err.message}`,
            Messages: [],
            Output: []
          })
        }
        return
      }
      
      // Handle other errors normally
      logger('An error bubbled to the top handler. Formatting and relaying to client:', err)
      const formatted = errFrom(err)
      if (res.raw.writableEnded) return

      res.status(err.status || 500).send({ error: formatted.message || 'Internal Server Error' })
    })
}
