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
import { InstallService } from '../services/installService.js';
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

      await InstallService.cancelInstallation(installId, req.user.id);

      res.json({
        success: true,
        message: 'Installation cancelled successfully. Your quota has been refunded.'
      });
    } catch (error: any) {
      logger.error('Failed to cancel installation:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to cancel installation',
        error: 'CANCELLATION_FAILED'
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

// Create new install request
router.post('/install',
  authenticateToken,
  requireVerifiedUser,
  validateRequest(installDataSchema),
  auditLogger('CREATE_INSTALL'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new NotFoundError('User not found');
    }

    const validatedData = req.body;
    
    // Process installation with comprehensive validation
    const result = await InstallService.processInstallation(
      req.user.id,
      validatedData.ip,
      validatedData.passwd_vps || '',
      validatedData.win_ver,
      validatedData.passwd_rdp || ''
    );

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: result.message,
        error: 'INSTALLATION_VALIDATION_FAILED'
      } as ApiResponse);
      return;
    }

    // Get the created install data
    const installData = await InstallService.getInstallById(result.installId!);

    res.status(201).json({
      success: true,
      message: result.message,
      data: installData
    } as ApiResponse);
  })
);

export { router as installRoutes };