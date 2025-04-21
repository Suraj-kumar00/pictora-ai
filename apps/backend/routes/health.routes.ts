import { Router } from 'express';

const router = Router();

/**
 * Health check endpoint
 * @route GET /api/health
 * @returns {Object} 200 - Health check response
 */
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'backend',
  });
});

export default router; 