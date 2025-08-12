import express from 'express';
import { Request, Response } from 'express';
import { TelegramService } from '../services/telegramService.js';
import { logger } from '../utils/logger.js';
import { authenticateToken, asyncHandler } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';

const router = express.Router();

// Telegram webhook handler
router.post('/webhook',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const update = req.body;
      
      logger.info('Received Telegram webhook update:', {
        updateId: update.update_id,
        messageId: update.message?.message_id,
        fromUser: update.message?.from?.username || update.message?.from?.id
      });

      // Process the update
      await TelegramService.processUpdate(update);

      // Respond with 200 OK to acknowledge receipt
      res.status(200).json({ ok: true });
    } catch (error) {
      logger.error('Error processing Telegram webhook:', error);
      // Still respond with 200 to prevent Telegram from retrying
      res.status(200).json({ ok: false, error: 'Internal server error' });
    }
  })
);

// Set webhook URL (admin only)
router.post('/set-webhook',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { webhook_url } = req.body;
    
    if (!webhook_url) {
      res.status(400).json({
        success: false,
        message: 'Webhook URL is required'
      });
      return;
    }

    try {
      const success = await TelegramService.setWebhook(webhook_url);
      
      if (success) {
        res.json({
          success: true,
          message: 'Webhook set successfully'
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to set webhook'
        });
      }
    } catch (error) {
      logger.error('Error setting webhook:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  })
);

// Get bot info (admin only)
router.get('/bot-info',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const botInfo = await TelegramService.getBotInfo();
      
      if (botInfo) {
        res.json({
          success: true,
          data: botInfo
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to get bot info'
        });
      }
    } catch (error) {
      logger.error('Error getting bot info:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  })
);

// Setup webhook automatically (admin only)
router.post('/setup',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      // Get bot info first
      const botInfo = await TelegramService.getBotInfo();
      logger.info('Bot Info:', botInfo);
      
      // Set webhook with current server URL
      const webhookUrl = `${process.env['APP_URL'] || 'http://localhost:3001'}/api/telegram/webhook`;
      const success = await TelegramService.setWebhook(webhookUrl);
      
      if (success) {
        // Get webhook info to confirm
        const webhookInfo = await TelegramService.getWebhookInfo();
        logger.info('Webhook Info:', webhookInfo);
        
        res.json({
          success: true,
          message: 'Telegram bot setup completed successfully',
          data: {
            botInfo,
            webhookUrl,
            webhookInfo,
            instructions: [
              'Webhook has been set up successfully',
              `Bot username: @${botInfo?.username || 'Unknown'}`,
              'Users can now connect their Telegram accounts',
              'Check the logs for any connection attempts'
            ]
          }
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to set webhook',
          data: { botInfo, webhookUrl }
        });
      }
    } catch (error: any) {
      logger.error('Error setting up Telegram bot:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to setup Telegram bot',
        error: error.message
      });
    }
  })
);

// Get webhook info (admin only)
router.get('/webhook-info',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const webhookInfo = await TelegramService.getWebhookInfo();
      
      res.json({
        success: true,
        data: webhookInfo
      });
    } catch (error) {
      logger.error('Error getting webhook info:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  })
);


export { router as telegramRoutes };