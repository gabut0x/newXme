import express from 'express';
import { Request, Response } from 'express';
import { InstallService } from '../services/installService.js';
import { 
  authenticateToken, 
  requireVerifiedUser,
  validateRequest,
  asyncHandler,
  validateNumericId
} from '../middleware/auth.js';
import { auditLogger } from '../middleware/security.js';
import { installDataSchema } from '../types/user.js';
import { logger } from '../utils/logger.js';
import { z } from 'zod';

const router = express.Router();

// Progress update schema for remote script callbacks
const progressUpdateSchema = z.object({
  step: z.string().min(1, 'Step is required'),
  status: z.enum(['pending', 'running', 'completed', 'failed']),
  message: z.string().min(1, 'Message is required'),
  installId: z.number().optional()
});

/**
 * Handle installation progress updates from remote scripts
 * This endpoint will be called by the installation script running on the VPS
 */
router.post('/progress',
  validateRequest(progressUpdateSchema),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { step, status, message, installId } = req.body;
      
      // If installId is provided, update that specific installation
      if (installId) {
        await InstallService.handleProgressUpdate(installId, step, status, message);
      }

      // Log the progress update
      logger.info('Installation progress update received:', {
        step,
        status,
        message,
        installId,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json({
        success: true,
        message: 'Progress update received'
      });
    } catch (error: any) {
      logger.error('Failed to handle progress update:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process progress update',
        error: error.message
      });
    }
  })
);

/**
 * Get installation status by ID
 */
router.get('/status/:id',
  authenticateToken,
  requireVerifiedUser,
  validateNumericId('id'),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const installId = parseInt(req.params.id);
      const install = await InstallService.getInstallById(installId);
      
      if (!install) {
        res.status(404).json({
          success: false,
          message: 'Installation not found'
        });
        return;
      }

      // Check if user owns this installation (unless admin)
      if (req.user?.admin !== 1 && install.user_id !== req.user?.id) {
        res.status(403).json({
          success: false,
          message: 'Access denied'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Installation status retrieved',
        data: install
      });
    } catch (error: any) {
      logger.error('Failed to get installation status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve installation status',
        error: error.message
      });
    }
  })
);

/**
 * Cancel installation (if still pending)
 */
router.post('/cancel/:id',
  authenticateToken,
  requireVerifiedUser,
  validateNumericId('id'),
  auditLogger('CANCEL_INSTALLATION'),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const installId = parseInt(req.params.id);
      
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const cancelled = await InstallService.cancelInstallation(installId, req.user.id);
      
      if (!cancelled) {
        res.status(400).json({
          success: false,
          message: 'Installation cannot be cancelled'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Installation cancelled successfully. Your quota has been refunded.'
      });
    } catch (error: any) {
      logger.error('Failed to cancel installation:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to cancel installation'
      });
    }
  })
);

/**
 * Get user's active installations
 */
router.get('/active',
  authenticateToken,
  requireVerifiedUser,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
        return;
      }

      const activeInstalls = await InstallService.getUserActiveInstalls(req.user.id);
      
      res.json({
        success: true,
        message: 'Active installations retrieved',
        data: activeInstalls
      });
    } catch (error: any) {
      logger.error('Failed to get active installations:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve active installations',
        error: error.message
      });
    }
  })
);

export { router as installRoutes };