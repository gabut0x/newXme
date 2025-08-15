import express from 'express';
import { Request, Response } from 'express';
import { TelegramBotService } from '../services/telegramBotService.js';
import { logger } from '../utils/logger.js';
import { authenticateToken, asyncHandler } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';

const router = express.Router();

// Webhook routes disabled - using polling mode instead
// router.post('/webhook', ...) - removed because bot now uses polling mode

// Webhook setup routes disabled - using polling mode instead
// router.post('/set-webhook', ...) - removed because bot now uses polling mode

// Get bot info (admin only)
router.get('/bot-info',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const botInfo = await TelegramBotService.getBotInfo();
      
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

// Set bot commands (admin only)
router.post('/set-commands',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const success = await TelegramBotService.setMyCommands();
      
      if (success) {
        // Get bot commands to confirm
        const botCommands = await TelegramBotService.getMyCommands();
        
        res.json({
          success: true,
          message: 'Bot commands set successfully',
          data: {
            commands: botCommands
          }
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to set bot commands'
        });
      }
    } catch (error) {
      logger.error('Error setting bot commands:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  })
);

// Get bot commands (admin only)
router.get('/commands',
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const botCommands = await TelegramBotService.getMyCommands();
      
      if (botCommands !== null) {
        res.json({
          success: true,
          data: {
            commands: botCommands
          }
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Failed to get bot commands'
        });
      }
    } catch (error) {
      logger.error('Error getting bot commands:', error);
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
      const botInfo = await TelegramBotService.getBotInfo();
      logger.info('Bot Info:', botInfo);
      
      // Set bot commands (still useful for polling mode)
      const commandsSet = await TelegramBotService.setMyCommands();
      logger.info('Bot commands set:', commandsSet);
      
      // Get bot commands to confirm
      const botCommands = await TelegramBotService.getMyCommands();
      logger.info('Bot Commands:', botCommands);
      
      res.json({
        success: true,
        message: 'Telegram bot setup completed successfully (polling mode)',
        data: {
          botInfo,
          mode: 'polling',
          botCommands,
          commandsSet,
          instructions: [
            'Bot is running in polling mode',
            `Bot username: @${botInfo?.username || 'Unknown'}`,
            'Bot commands have been configured',
            'Users can now connect their Telegram accounts',
            'Available commands: /start, /help, /status, /topup',
            'Bot will automatically receive messages via polling'
          ]
        }
      });
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

// Webhook info route disabled - using polling mode instead
// router.get('/webhook-info', ...) - removed because bot now uses polling mode


export { router as telegramRoutes };