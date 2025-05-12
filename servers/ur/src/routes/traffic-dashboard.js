/**
 * Traffic metrics dashboard routes
 * Provides API endpoints for traffic visualization with flexible filtering options
 */
import express from 'express';
import { logger } from '../logger.js';
import { getTrafficData, getUniqueProcessIds, initializeTrafficService } from '../database/trafficService.js';

const _logger = logger.child('traffic-dashboard');
const router = express.Router();

// Initialize traffic service on startup
initializeTrafficService()
  .then(success => {
    if (success) {
      _logger('Traffic service initialized successfully');
    } else {
      _logger('WARNING: Traffic service initialization had issues');
    }
  })
  .catch(err => {
    _logger('ERROR: Failed to initialize traffic service: %O', err);
  });

// API endpoint for getting traffic data with filters
router.get('/traffic-data', async (req, res) => {
  try {
    const startTime = req.query.startTime ? new Date(req.query.startTime) : new Date(Date.now() - 3600000);
    const endTime = req.query.endTime ? new Date(req.query.endTime) : new Date();
    const interval = req.query.interval || '1min';
    const processIdFilter = req.query.processIdFilter || null;
    
    _logger('Traffic data request: range=%s to %s, interval=%s, processFilter=%s',
      startTime.toISOString(), 
      endTime.toISOString(), 
      interval,
      processIdFilter || 'none'
    );
    
    const data = await getTrafficData({
      startTime,
      endTime,
      interval,
      processIdFilter
    });
    
    res.json(data);
  } catch (error) {
    _logger('Error fetching traffic data: %O', error);
    res.status(500).json({ error: error.message || 'Failed to fetch traffic data' });
  }
});

// API endpoint for getting unique process IDs for filtering
router.get('/process-ids', async (req, res) => {
  try {
    const startTime = req.query.startTime ? new Date(req.query.startTime) : new Date(Date.now() - 3600000);
    const endTime = req.query.endTime ? new Date(req.query.endTime) : new Date();
    
    const processIds = await getUniqueProcessIds({
      startTime,
      endTime
    });
    
    res.json(processIds);
  } catch (error) {
    _logger('Error fetching process IDs: %O', error);
    res.status(500).json({ error: error.message || 'Failed to fetch process IDs' });
  }
});

export default router;
