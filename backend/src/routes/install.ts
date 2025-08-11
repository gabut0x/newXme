import express from 'express';
import { Request, Response } from 'express';
import { InstallService } from '../services/installService.js';
import { getDatabase } from '../database/init.js';
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
import { NotFoundError } from '../middleware/errorHandler.js';
import { ApiResponse } from '../types/user.js';

const router = express.Router();

// Configuration for download protection
const BLOCKED_USER_AGENTS_PATTERN = /bot|crawler|spider|scraper/i;
const ALLOWED_USER_AGENTS = ['curl', 'wget', 'aria2c', 'axel'];
const BASE_URLS: { [key: string]: string } = {
  'us': process.env['US_CDN_URL'] || 'https://us-cdn.example.com',
  'sg': process.env['SG_CDN_URL'] || 'https://sg-cdn.example.com',
  'eu': process.env['EU_CDN_URL'] || 'https://eu-cdn.example.com'
};

/**
 * Download redirect route with user-agent specific handling
 */
router.get('/download/:region/YXNpYS5sb2NhdGlvbi50by5zdG9yZS5maWxlLmd6Lkluc3RhbGxhdGlvbi55b3Uuc2hvbGRudC5zZWUudGhpcw/:filename(*)',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const region = req.params['region'];
      const filename = req.params['filename'];
      const userAgent = req.headers['user-agent']?.toLowerCase() || '';
      const ip = req.headers['cf-connecting-ip'] as string || req.ip || req.connection.remoteAddress || '';
      const signature = req.query['sig'] as string;

      // Validate required parameters
      if (!region || !filename || !signature) {
        logger.warn('Missing required parameters:', { region, filename, signature, ip });
        res.status(400).json({
          success: false,
          message: 'Missing required parameters'
        });
        return;
      }

      logger.info('Download request received:', {
        region,
        filename,
        userAgent,
        ip,
        signature
      });

      // Validate User-Agent - block suspicious agents
      if (BLOCKED_USER_AGENTS_PATTERN.test(userAgent)) {
        logger.warn('Blocked user agent detected:', { userAgent, ip });
        res.status(403).json({
          success: false,
          message: 'Access forbidden'
        });
        return;
      }

      // Validate User-Agent - only allow specific agents
      if (!ALLOWED_USER_AGENTS.some(agent => userAgent.includes(agent))) {
        logger.warn('Invalid user agent:', { userAgent, ip });
        res.status(403).json({
          success: false,
          message: 'Access forbidden'
        });
        return;
      }

      // Validate signature
      if (!InstallService.validateSignature(ip, filename, signature)) {
        logger.warn('Invalid signature:', { ip, filename, signature });
        res.status(403).json({
          success: false,
          message: 'Access forbidden'
        });
        return;
      }

      // Validate filename
      if (!filename.endsWith('.gz')) {
        logger.warn('Invalid filename:', { filename, ip });
        res.status(400).json({
          success: false,
          message: 'Invalid file type'
        });
        return;
      }

      // Validate region
      if (!BASE_URLS[region]) {
        logger.warn('Unsupported region:', { region, ip });
        res.status(404).json({
          success: false,
          message: 'Region not supported'
        });
        return;
      }

      // Handle installation status updates based on user-agent
      if (userAgent.includes('curl')) {
        // curl access means installation is preparing
        const db = getDatabase();
        const install = await db.get(
          'SELECT id, user_id, win_ver FROM install_data WHERE ip = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
          [ip, 'pending']
        );

        if (install) {
          await InstallService.updateInstallStatus(install.id, 'preparing', 'Installation is preparing - downloading configuration files', true);
          
          logger.info('Installation status updated to preparing via curl access:', {
            installId: install.id,
            userId: install.user_id,
            ip,
            filename
          });
        }
      } else if (userAgent.includes('wget')) {
        // wget access means installation is running
        const db = getDatabase();
        const install = await db.get(
          'SELECT id, user_id, win_ver FROM install_data WHERE ip = ? AND status IN (?, ?) ORDER BY created_at DESC LIMIT 1',
          [ip, 'pending', 'preparing']
        );

        if (install) {
          await InstallService.updateInstallStatus(install.id, 'running', 'Windows installation is now running - downloading files', true);
          
          logger.info('Installation status updated to running via wget access:', {
            installId: install.id,
            userId: install.user_id,
            ip,
            filename
          });
        }
      }

      // Log download access for tracking
      await InstallService.handleDownloadAccess(ip, filename, userAgent, region);

      // Construct file URL and redirect
      const fileUrl = `${BASE_URLS[region]}/${filename}`;
      
      logger.info('Redirecting to file URL:', {
        ip,
        filename,
        userAgent,
        region,
        fileUrl
      });

      // Set cache headers to prevent caching
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });

      // Redirect to actual file
      res.redirect(302, fileUrl);

    } catch (error: any) {
      logger.error('Download redirect failed:', {
        error: error.message,
        stack: error.stack,
        params: req.params,
        userAgent: req.headers['user-agent'],
        ip: req.ip
      });
      
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: 'DOWNLOAD_REDIRECT_FAILED'
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
      const idParam = req.params['id'];
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'Installation ID is required'
        });
        return;
      }
      
      const installId = parseInt(idParam);
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
      const idParam = req.params['id'];
      if (!idParam) {
        res.status(400).json({
          success: false,
          message: 'Installation ID is required'
        });
        return;
      }
      
      const installId = parseInt(idParam);
      
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