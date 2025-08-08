import express from 'express';
import { Request, Response } from 'express';
import { tripayService } from '../services/tripayService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Get payment channels
router.get('/channels', async (req: Request, res: Response) => {
  try {
    const channels = await tripayService.getPaymentChannels();
    res.json({
      success: true,
      data: channels
    });
  } catch (error: any) {
    logger.error('Failed to get payment channels:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment channels',
      error: error.message
    });
  }
});

export { router as paymentRoutes };