import express, { Response } from 'express';
import { z } from 'zod';
// Removed unused and missing-type imports
// import QRCode from 'qrcode';
// import * as OTPAuth from 'otpauth';
import fs from 'fs';

// Database and configuration
import { getDatabase } from '../database/init.js';

// Custom middleware
import {
  authenticateToken,
  validateRequest,
  asyncHandler,
  validateNumericId,
  sqlInjectionProtection
} from '../middleware/auth.js';
import { requireAdmin, AuthenticatedRequest } from '../middleware/admin.js';
import { auditLogger } from '../middleware/security.js';
import { uploadProductImage } from '../middleware/upload.js';

// Services and utilities
// Removed unused tripayService import
import { DatabaseSecurity } from '../utils/dbSecurity.js';
import { DateUtils } from '../utils/dateUtils.js';
import { logger } from '../utils/logger.js';
// Removed unused BotSecurity and RateLimiter imports

// Types and schemas
import { 
  windowsVersionSchema, 
  productSchema
} from '../types/user.js';

// Removed unused __filename and __dirname

const router = express.Router();

// Apply authentication and admin middleware to all routes
router.use(authenticateToken);
router.use(requireAdmin);
router.use(sqlInjectionProtection);

// Windows Versions Routes
router.get('/windows-versions', 
  auditLogger('ADMIN_GET_WINDOWS_VERSIONS'),
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const db = getDatabase();
      const versions = await db.all('SELECT * FROM windows_versions ORDER BY created_at DESC');
      
      res.json({
        success: true,
        message: 'Windows versions retrieved successfully',
        data: versions
      });
      return;
    } catch (error: any) {
      logger.error('Error fetching windows versions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch windows versions',
        error: 'Internal server error'
      });
      return;
    }
  })
);

router.post('/windows-versions', 
  validateRequest(windowsVersionSchema),
  auditLogger('ADMIN_CREATE_WINDOWS_VERSION'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const validatedData = req.body; // Already validated by middleware
      const db = getDatabase();
      
      // Log creation attempt
      DatabaseSecurity.logDatabaseOperation('CREATE_WINDOWS_VERSION', 'windows_versions', req.user?.id, validatedData);
      
      // Check if slug already exists
      const existing = await db.get('SELECT id FROM windows_versions WHERE slug = ?', [validatedData.slug]);
      if (existing) {
        res.status(400).json({
          success: false,
          message: 'Windows version with this slug already exists',
          error: 'Duplicate slug'
        });
        return;
      }
      
      const result = await db.run(
        'INSERT INTO windows_versions (name, slug, created_at, updated_at) VALUES (?, ?, ?, ?)',
        [validatedData.name, validatedData.slug, DateUtils.nowSQLite(), DateUtils.nowSQLite()]
      );
      
      const newVersion = await db.get('SELECT * FROM windows_versions WHERE id = ?', [result.lastID]);
      
      res.status(201).json({
        success: true,
        message: 'Windows version created successfully',
        data: newVersion
      });
      return;
    } catch (error: any) {
      logger.error('Error creating windows version:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create windows version',
        error: 'Internal server error'
      });
      return;
    }
  })
);

router.put('/windows-versions/:id', 
  validateNumericId('id'),
  validateRequest(windowsVersionSchema),
  auditLogger('ADMIN_UPDATE_WINDOWS_VERSION'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number.parseInt(String(req.params['id']), 10);
      const validatedData = req.body; // Already validated by middleware
      const db = getDatabase();
      
      // Log update attempt
      DatabaseSecurity.logDatabaseOperation('UPDATE_WINDOWS_VERSION', 'windows_versions', req.user?.id, { id, ...validatedData });
      
      // Check if version exists
      const existing = await db.get('SELECT id FROM windows_versions WHERE id = ?', [id]);
      if (!existing) {
        res.status(404).json({
          success: false,
          message: 'Windows version not found',
          error: 'Version does not exist'
        });
        return;
      }
      
      // Check if slug already exists for different version
      const slugExists = await db.get('SELECT id FROM windows_versions WHERE slug = ? AND id != ?', [validatedData.slug, id]);
      if (slugExists) {
        res.status(400).json({
          success: false,
          message: 'Windows version with this slug already exists',
          error: 'Duplicate slug'
        });
        return;
      }
      
      await db.run(
        "UPDATE windows_versions SET name = ?, slug = ?, updated_at = ? WHERE id = ?",
        [validatedData.name, validatedData.slug, DateUtils.nowSQLite(), id]
      );
      
      const updatedVersion = await db.get('SELECT * FROM windows_versions WHERE id = ?', [id]);
      
      res.json({
        success: true,
        message: 'Windows version updated successfully',
        data: updatedVersion
      });
      return;
    } catch (error: any) {
      logger.error('Error updating windows version:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update windows version',
        error: 'Internal server error'
      });
      return;
    }
  })
);

router.delete('/windows-versions/:id', 
  validateNumericId('id'),
  auditLogger('ADMIN_DELETE_WINDOWS_VERSION'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number.parseInt(String(req.params['id']), 10);
      const db = getDatabase();
      
      // Log deletion attempt
      DatabaseSecurity.logDatabaseOperation('DELETE_WINDOWS_VERSION', 'windows_versions', req.user?.id, { id });
      
      // Check if version exists
      const existing = await db.get('SELECT id FROM windows_versions WHERE id = ?', [id]);
      if (!existing) {
        res.status(404).json({
          success: false,
          message: 'Windows version not found',
          error: 'Version does not exist'
        });
        return;
      }
      
      await db.run('DELETE FROM windows_versions WHERE id = ?', [id]);
      
      res.json({
        success: true,
        message: 'Windows version deleted successfully'
      });
      return;
    } catch (error: any) {
      logger.error('Error deleting windows version:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete windows version',
        error: 'Internal server error'
      });
      return;
    }
  })
);

// Products Routes
router.get('/products', 
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const db = getDatabase();
      const products = await db.all('SELECT * FROM products ORDER BY created_at DESC');
      
      res.json({
        success: true,
        message: 'Products retrieved successfully',
        data: products
      });
      return;
    } catch (error: any) {
      logger.error('Error fetching products:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch products',
        error: 'Internal server error'
      });
      return;
    }
  })
);

router.post('/products', 
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Apply upload middleware within the route handler
    uploadProductImage(req, res, async (uploadErr: any) => {
      if (uploadErr) {
        logger.error('File upload error:', uploadErr);
        res.status(400).json({
          success: false,
          message: uploadErr.message || 'File upload failed',
          error: 'UPLOAD_ERROR'
        });
        return;
      }

      try {
        // Handle file upload
        let imagePath = null as string | null;
        if (req.file) {
          // Create relative path for database storage
          imagePath = `/uploads/products/${req.file.filename}`;
        }

        // Parse form data
        const productData = {
          name: req.body['name'],
          description: req.body['description'] || null,
          price: parseFloat(req.body['price']) || 0,
          image_url: imagePath
        };

        const validatedData = productSchema.parse(productData);
        const db = getDatabase();
        
        const result = await db.run(
          'INSERT INTO products (name, description, price, image_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          [validatedData.name, validatedData.description || null, validatedData.price, validatedData.image_url || null, DateUtils.nowSQLite(), DateUtils.nowSQLite()]
        );
        
        const newProduct = await db.get('SELECT * FROM products WHERE id = ?', [result.lastID]);
        
        res.status(201).json({
          success: true,
          message: 'Product created successfully',
          data: newProduct
        });
        return;
      } catch (error: any) {
        // Clean up uploaded file if validation fails
        if (req.file) {
          fs.unlink(req.file.path, (err) => {
            if (err) logger.error('Failed to delete uploaded file:', err);
          });
        }

        if (error instanceof z.ZodError) {
          res.status(400).json({
            success: false,
            message: 'Validation error',
            error: error.errors?.[0]?.message ?? 'Invalid input'
          });
          return;
        }
        
        logger.error('Error creating product:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to create product',
          error: 'Internal server error'
        });
        return;
      }
    });
  })
);

// Telegram Bot Management Routes
router.get('/telegram-bot/status',
  auditLogger('ADMIN_GET_BOT_STATUS'),
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const { TelegramBotService } = await import('../services/telegramBotService.js');
      const status = TelegramBotService.getStatus();
      
      res.json({
        success: true,
        message: 'Bot status retrieved successfully',
        data: status
      });
      return;
    } catch (error: any) {
      logger.error('Error getting bot status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get bot status',
        error: 'INTERNAL_ERROR'
      });
      return;
    }
  })
);

router.get('/telegram-bot/stats',
  auditLogger('ADMIN_GET_BOT_STATS'),
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const { TelegramBotService } = await import('../services/telegramBotService.js');
      const stats = TelegramBotService.getStats();
      
      res.json({
        success: true,
        message: 'Bot statistics retrieved successfully',
        data: stats
      });
      return;
    } catch (error: any) {
      logger.error('Error retrieving bot statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve bot statistics',
        error: 'INTERNAL_ERROR'
      });
      return;
    }
  })
);

export default router;