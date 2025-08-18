// Node.js built-in modules
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Third-party packages
import { z } from 'zod';
import express, { Request, Response } from 'express';

// Database and configuration
import { getDatabase } from '../database/init.js';

// Custom middleware
import {
  authenticateToken,
  requireVerifiedUser,
  validateRequest,
  asyncHandler,
  validateNumericId,
  sqlInjectionProtection
} from '../middleware/auth.js';
import { requireAdmin, AuthenticatedRequest } from '../middleware/admin.js';
import { uploadProductImage } from '../middleware/upload.js';
import { auditLogger } from '../middleware/security.js';

// Types and schemas
import { windowsVersionSchema, productSchema } from '../types/user.js';
import { enable2FASchema, disable2FASchema } from '../types/user.js';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

// Services and utilities
import { tripayService } from '../services/tripayService.js';
import { DatabaseSecurity } from '../utils/dbSecurity.js';
import { DateUtils } from '../utils/dateUtils.js';
import { logger } from '../utils/logger.js';
import { BotSecurity } from '../utils/botSecurity.js';
import { RateLimiter } from '../utils/rateLimiter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Apply authentication and admin middleware to all routes
router.use(authenticateToken);
router.use(requireAdmin);
router.use(sqlInjectionProtection);

// Windows Versions Routes
router.get('/windows-versions', 
  auditLogger('ADMIN_GET_WINDOWS_VERSIONS'),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const db = getDatabase();
      const versions = await db.all('SELECT * FROM windows_versions ORDER BY created_at DESC');
      
      res.json({
        success: true,
        message: 'Windows versions retrieved successfully',
        data: versions
      });
    } catch (error) {
      logger.error('Error fetching windows versions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch windows versions',
        error: 'Internal server error'
      });
    }
  })
);

router.post('/windows-versions', 
  validateRequest(windowsVersionSchema),
  auditLogger('ADMIN_CREATE_WINDOWS_VERSION'),
  async (req: AuthenticatedRequest, res: Response) => {
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
  } catch (error) {
    logger.error('Error creating windows version:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create windows version',
      error: 'Internal server error'
    });
  }
});

router.put('/windows-versions/:id', 
  validateNumericId('id'),
  validateRequest(windowsVersionSchema),
  auditLogger('ADMIN_UPDATE_WINDOWS_VERSION'),
  async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
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
  } catch (error) {
    logger.error('Error updating windows version:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update windows version',
      error: 'Internal server error'
    });
  }
});

router.delete('/windows-versions/:id', 
  validateNumericId('id'),
  auditLogger('ADMIN_DELETE_WINDOWS_VERSION'),
  async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
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
  } catch (error) {
    logger.error('Error deleting windows version:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete windows version',
      error: 'Internal server error'
    });
  }
});

// Products Routes
router.get('/products', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDatabase();
    const products = await db.all('SELECT * FROM products ORDER BY created_at DESC');
    
    res.json({
      success: true,
      message: 'Products retrieved successfully',
      data: products
    });
  } catch (error) {
    logger.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: 'Internal server error'
    });
  }
});

router.post('/products', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Apply upload middleware within the route handler
  uploadProductImage(req, res, async (uploadErr) => {
    if (uploadErr) {
      logger.error('File upload error:', uploadErr);
      return res.status(400).json({
        success: false,
        message: uploadErr.message || 'File upload failed',
        error: 'UPLOAD_ERROR'
      });
    }

    try {
      // Handle file upload
      let imagePath = null;
      if (req.file) {
        // Create relative path for database storage
        imagePath = `/uploads/products/${req.file.filename}`;
      }

      // Parse form data
      const productData = {
        name: req.body.name,
        description: req.body.description || null,
        price: parseFloat(req.body.price) || 0,
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
    } catch (error) {
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
          error: error.errors[0].message
        });
        return;
      }
      
      logger.error('Error creating product:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create product',
        error: 'Internal server error'
      });
    }
  });
}));

router.put('/products/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  // Apply upload middleware within the route handler
  uploadProductImage(req, res, async (uploadErr) => {
    if (uploadErr) {
      logger.error('File upload error:', uploadErr);
      return res.status(400).json({
        success: false,
        message: uploadErr.message || 'File upload failed',
        error: 'UPLOAD_ERROR'
      });
    }

    try {
      const { id } = req.params;
      const db = getDatabase();
      
      // Check if product exists
      const existing = await db.get('SELECT * FROM products WHERE id = ?', [id]);
      if (!existing) {
        // Clean up uploaded file if product doesn't exist
        if (req.file) {
          fs.unlink(req.file.path, (err) => {
            if (err) logger.error('Failed to delete uploaded file:', err);
          });
        }
        
        res.status(404).json({
          success: false,
          message: 'Product not found',
          error: 'Product does not exist'
        });
        return;
      }
      
      // Handle file upload
      let imagePath = existing.image_url; // Keep existing image if no new file
      if (req.file) {
        // Delete old image file if it exists and is a local file
        if (existing.image_url && existing.image_url.startsWith('/uploads/')) {
          const oldImagePath = path.join(__dirname, '../..', existing.image_url);
          fs.unlink(oldImagePath, (err) => {
            if (err && err.code !== 'ENOENT') {
              logger.error('Failed to delete old image file:', err);
            }
          });
        }
        
        // Set new image path
        imagePath = `/uploads/products/${req.file.filename}`;
      }

      // Parse form data
      const productData = {
        name: req.body.name,
        description: req.body.description || null,
        price: parseFloat(req.body.price) || 0,
        image_url: imagePath
      };

      const validatedData = productSchema.parse(productData);
      
      await db.run(
        "UPDATE products SET name = ?, description = ?, price = ?, image_url = ?, updated_at = ? WHERE id = ?",
        [validatedData.name, validatedData.description || null, validatedData.price, validatedData.image_url || null, DateUtils.nowSQLite(), id]
      );
      
      const updatedProduct = await db.get('SELECT * FROM products WHERE id = ?', [id]);
      
      res.json({
        success: true,
        message: 'Product updated successfully',
        data: updatedProduct
      });
    } catch (error) {
      // Clean up uploaded file if update fails
      if (req.file) {
        fs.unlink(req.file.path, (err) => {
          if (err) logger.error('Failed to delete uploaded file:', err);
        });
      }

      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          error: error.errors[0].message
        });
        return;
      }
      
      logger.error('Error updating product:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update product',
        error: 'Internal server error'
      });
    }
  });
}));

router.delete('/products/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const db = getDatabase();
    
    // Check if product exists
    const existing = await db.get('SELECT id FROM products WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({
        success: false,
        message: 'Product not found',
        error: 'Product does not exist'
      });
      return;
    }
    
    await db.run('DELETE FROM products WHERE id = ?', [id]);
    
    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product',
      error: 'Internal server error'
    });
  }
});

// Users Management Routes
router.get('/users', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDatabase();
    const users = await db.all(`
      SELECT u.id, u.username, u.email, u.is_verified, u.is_active, u.admin, u.telegram, u.quota,
             u.created_at, u.last_login, u.failed_login_attempts,
             p.first_name, p.last_name, p.phone, p.avatar_url, p.timezone, p.language
      FROM users u
      LEFT JOIN user_profiles p ON u.id = p.user_id
      ORDER BY u.created_at DESC
    `);
    
    res.json({
      success: true,
      message: 'Users retrieved successfully',
      data: users
    });
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: 'Internal server error'
    });
  }
});

router.put('/users/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { is_active, admin, telegram, quota } = req.body;
    const db = getDatabase();
    
    // Check if user exists
    const existing = await db.get('SELECT id FROM users WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({
        success: false,
        message: 'User not found',
        error: 'User does not exist'
      });
      return;
    }
    
    // Prevent admin from deactivating themselves
    if (req.user?.id === parseInt(id) && is_active === false) {
      res.status(400).json({
        success: false,
        message: 'Cannot deactivate your own account',
        error: 'Self-deactivation not allowed'
      });
      return;
    }
    
    await db.run(
      "UPDATE users SET is_active = ?, admin = ?, telegram = ?, quota = ?, updated_at = ? WHERE id = ?",
      [is_active, admin || 0, telegram || null, quota || 0, DateUtils.nowSQLite(), id]
    );
    
    const updatedUser = await db.get(`
      SELECT u.id, u.username, u.email, u.is_verified, u.is_active, u.admin, u.telegram, u.quota,
             u.created_at, u.last_login, u.failed_login_attempts,
             p.first_name, p.last_name, p.phone, p.avatar_url, p.timezone, p.language
      FROM users u
      LEFT JOIN user_profiles p ON u.id = p.user_id
      WHERE u.id = ?
    `, [id]);
    
    res.json({
      success: true,
      message: 'User updated successfully',
      data: updatedUser
    });
  } catch (error) {
    logger.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: 'Internal server error'
    });
  }
});

// InstallData Management Routes
router.get('/install-data', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDatabase();
    const installData = await db.all(`
      SELECT i.*, u.username, u.email
      FROM install_data i
      JOIN users u ON i.user_id = u.id
      ORDER BY i.created_at DESC
    `);
    
    res.json({
      success: true,
      message: 'Install data retrieved successfully',
      data: installData
    });
  } catch (error) {
    logger.error('Error fetching install data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch install data',
      error: 'Internal server error'
    });
  }
});

router.put('/install-data/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const db = getDatabase();
    
    // Check if install data exists
    const existing = await db.get('SELECT id FROM install_data WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({
        success: false,
        message: 'Install data not found',
        error: 'Install data does not exist'
      });
      return;
    }
    
    await db.run(
      "UPDATE install_data SET status = ?, updated_at = ? WHERE id = ?",
      [status, DateUtils.nowSQLite(), id]
    );
    
    const updatedInstallData = await db.get(`
      SELECT i.*, u.username, u.email
      FROM install_data i
      JOIN users u ON i.user_id = u.id
      WHERE i.id = ?
    `, [id]);
    
    res.json({
      success: true,
      message: 'Install data updated successfully',
      data: updatedInstallData
    });
  } catch (error) {
    logger.error('Error updating install data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update install data',
      error: 'Internal server error'
    });
  }
});

router.delete('/install-data/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const db = getDatabase();
    
    // Check if install data exists
    const existing = await db.get('SELECT id FROM install_data WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({
        success: false,
        message: 'Install data not found',
        error: 'Install data does not exist'
      });
      return;
    }
    
    await db.run('DELETE FROM install_data WHERE id = ?', [id]);
    
    res.json({
      success: true,
      message: 'Install data deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting install data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete install data',
      error: 'Internal server error'
    });
  }
});

// Delete user route
router.delete('/users/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const db = getDatabase();
    
    // Check if user exists
    const existing = await db.get('SELECT id, username FROM users WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({
        success: false,
        message: 'User not found',
        error: 'User does not exist'
      });
      return;
    }
    
    // Prevent admin from deleting themselves
    if (req.user?.id === parseInt(id)) {
      res.status(400).json({
        success: false,
        message: 'Cannot delete your own account',
        error: 'Self-deletion not allowed'
      });
      return;
    }
    
    // Log deletion attempt
    DatabaseSecurity.logDatabaseOperation('DELETE_USER', 'users', req.user?.id, { targetUserId: id, targetUsername: existing.username });
    
    // Delete user (cascade will handle related records)
    await db.run('DELETE FROM users WHERE id = ?', [id]);
    
    logger.info('Admin deleted user:', {
      adminId: req.user?.id,
      deletedUserId: id,
      deletedUsername: existing.username
    });
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: 'Internal server error'
    });
  }
});

// Quota Management Routes for Admins
router.post('/users/:id/quota', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, operation } = req.body; // operation can be 'add' or 'set'
    const db = getDatabase();
    
    // Validate input
    if (!amount || isNaN(amount) || amount < 0) {
      res.status(400).json({
        success: false,
        message: 'Invalid amount',
        error: 'Amount must be a non-negative number'
      });
      return;
    }
    
    if (!operation || !['add', 'set'].includes(operation)) {
      res.status(400).json({
        success: false,
        message: 'Invalid operation',
        error: 'Operation must be either "add" or "set"'
      });
      return;
    }
    
    // Check if user exists
    const user = await db.get('SELECT id, quota FROM users WHERE id = ?', [id]);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
        error: 'User does not exist'
      });
      return;
    }
    
    let newQuota;
    if (operation === 'add') {
      newQuota = user.quota + amount;
    } else { // operation === 'set'
      newQuota = amount;
    }
    
    await db.run(
      "UPDATE users SET quota = ?, updated_at = ? WHERE id = ?",
      [newQuota, DateUtils.nowSQLite(), id]
    );
    
    logger.info('Admin updated user quota:', {
      adminId: req.user?.id,
      userId: id,
      operation,
      amount,
      oldQuota: user.quota,
      newQuota
    });
    
    res.json({
      success: true,
      message: `User quota ${operation === 'add' ? 'increased' : 'updated'} successfully`,
      data: {
        userId: id,
        oldQuota: user.quota,
        newQuota,
        operation,
        amount
      }
    });
  } catch (error) {
    logger.error('Error updating user quota:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user quota',
      error: 'Internal server error'
    });
  }
});

// Payment Methods Management Routes

// Get all payment methods with status
router.get('/payment-methods', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDatabase();
    
    // Fetch current payment channels from Tripay
    const tripayChannels = await tripayService.getPaymentChannels();
    
    // Get existing payment method settings from database
    const dbMethods = await db.all('SELECT * FROM payment_methods ORDER BY name ASC');
    
    // Merge Tripay data with database settings
    const paymentMethods = tripayChannels.map(channel => {
      const dbMethod = dbMethods.find(m => m.code === channel.code);
      return {
        code: channel.code,
        name: channel.name,
        type: channel.type,
        icon_url: channel.icon_url,
        fee_flat: channel.fee_customer?.flat || 0,
        fee_percent: channel.fee_customer?.percent || 0,
        minimum_fee: channel.minimum_fee || 0,
        maximum_fee: channel.maximum_fee || 0,
        is_enabled: dbMethod ? dbMethod.is_enabled === 1 : true,
        id: dbMethod?.id || null,
        created_at: dbMethod?.created_at || null,
        updated_at: dbMethod?.updated_at || null
      };
    });

    logger.info('Admin fetched payment methods:', {
      adminId: req.user?.id,
      totalMethods: paymentMethods.length,
      enabledMethods: paymentMethods.filter(m => m.is_enabled).length
    });

    res.json({
      success: true,
      message: 'Payment methods retrieved successfully',
      data: paymentMethods
    });
  } catch (error: any) {
    logger.error('Error fetching payment methods:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment methods',
      error: error.message
    });
  }
}));

// Update payment method settings
router.patch('/payment-methods/:code', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code } = req.params;
    const { is_enabled } = req.body;
    
    const db = getDatabase();
    
    // Check if payment method exists in our database
    const existingMethod = await db.get(
      'SELECT * FROM payment_methods WHERE code = ?',
      [code]
    );
    
    if (existingMethod) {
      // Update existing record
      await db.run(
        "UPDATE payment_methods SET is_enabled = ?, updated_at = ? WHERE code = ?",
        [is_enabled ? 1 : 0, DateUtils.nowSQLite(), code]
      );
    } else {
      // Get payment method details from Tripay
      const tripayChannels = await tripayService.getPaymentChannels();
      const channel = tripayChannels.find(c => c.code === code);
      
      if (!channel) {
        return res.status(404).json({
          success: false,
          message: 'Payment method not found'
        });
      }
      
      // Insert new record
      await db.run(
        `INSERT INTO payment_methods (code, name, type, icon_url, fee_flat, fee_percent, minimum_fee, maximum_fee, is_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          channel.code,
          channel.name,
          channel.type,
          channel.icon_url,
          channel.fee_customer?.flat || 0,
          channel.fee_customer?.percent || 0,
          channel.minimum_fee || 0,
          channel.maximum_fee || 0,
          is_enabled ? 1 : 0,
          DateUtils.nowSQLite(),
          DateUtils.nowSQLite()
        ]
      );
    }

    logger.info('Admin updated payment method:', {
      adminId: req.user?.id,
      paymentCode: code,
      isEnabled: is_enabled
    });

    res.json({
      success: true,
      message: 'Payment method updated successfully',
      data: { code, is_enabled }
    });
  } catch (error: any) {
    logger.error('Error updating payment method:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update payment method',
      error: error.message
    });
  }
}));

// Sync payment methods from Tripay
router.post('/payment-methods/sync', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDatabase();
    
    // Fetch current payment channels from Tripay
    const tripayChannels = await tripayService.getPaymentChannels();
    
    let syncedCount = 0;
    let newCount = 0;
    
    for (const channel of tripayChannels) {
      const existingMethod = await db.get(
        'SELECT * FROM payment_methods WHERE code = ?',
        [channel.code]
      );
      
      if (existingMethod) {
        // Update existing method with latest Tripay data
        await db.run(
          `UPDATE payment_methods 
           SET name = ?, type = ?, icon_url = ?, fee_flat = ?, fee_percent = ?, 
               minimum_fee = ?, maximum_fee = ?, updated_at = ? 
           WHERE code = ?`,
          [
            channel.name,
            channel.type,
            channel.icon_url,
            channel.fee_customer?.flat || 0,
            channel.fee_customer?.percent || 0,
            channel.minimum_fee || 0,
            channel.maximum_fee || 0,
            DateUtils.nowSQLite(),
            channel.code
          ]
        );
        syncedCount++;
      } else {
        // Insert new payment method (enabled by default)
        await db.run(
          `INSERT INTO payment_methods (code, name, type, icon_url, fee_flat, fee_percent, minimum_fee, maximum_fee, is_enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          [
            channel.code,
            channel.name,
            channel.type,
            channel.icon_url,
            channel.fee_customer?.flat || 0,
            channel.fee_customer?.percent || 0,
            channel.minimum_fee || 0,
            channel.maximum_fee || 0,
            DateUtils.nowSQLite(),
            DateUtils.nowSQLite()
          ]
        );
        newCount++;
      }
    }

    logger.info('Admin synced payment methods:', {
      adminId: req.user?.id,
      totalFromTripay: tripayChannels.length,
      syncedCount,
      newCount
    });

    res.json({
      success: true,
      message: 'Payment methods synced successfully',
      data: {
        totalFromTripay: tripayChannels.length,
        syncedCount,
        newCount
      }
    });
  } catch (error: any) {
    logger.error('Error syncing payment methods:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync payment methods',
      error: error.message
    });
  }
}));

// Telegram Bot Management Routes
router.get('/telegram-bot/status',
  auditLogger('ADMIN_GET_BOT_STATUS'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { TelegramBotService } = await import('../services/telegramBotService.js');
      const status = TelegramBotService.getStatus();
      
      res.json({
        success: true,
        message: 'Bot status retrieved successfully',
        data: status
      });
    } catch (error) {
      logger.error('Error getting bot status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get bot status',
        error: 'INTERNAL_ERROR'
      });
    }
  })
);

router.post('/telegram-bot/start',
  auditLogger('ADMIN_START_BOT'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { TelegramBotService } = await import('../services/telegramBotService.js');
      // Allow admin to specify polling mode to avoid webhook rate limits
      const usePolling = req.body.usePolling === true || process.env['TELEGRAM_USE_POLLING'] === 'true';
      const result = await TelegramBotService.startBot(usePolling);
      
      if (result.success) {
        logger.info(`Telegram bot started by admin user ${req.user?.id} in ${usePolling ? 'polling' : 'webhook'} mode`);
        res.json({
          success: true,
          message: `Bot started successfully in ${usePolling ? 'polling' : 'webhook'} mode`,
          data: { status: 'running', mode: usePolling ? 'polling' : 'webhook' }
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message || 'Failed to start bot',
          error: 'BOT_START_FAILED'
        });
      }
    } catch (error) {
      logger.error('Error starting bot:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to start bot',
        error: 'INTERNAL_ERROR'
      });
    }
  })
);

router.post('/telegram-bot/stop',
  auditLogger('ADMIN_STOP_BOT'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { TelegramBotService } = await import('../services/telegramBotService.js');
      const result = await TelegramBotService.stopBot();
      
      if (result.success) {
        logger.info(`Telegram bot stopped by admin user ${req.user?.id}`);
        res.json({
          success: true,
          message: 'Bot stopped successfully',
          data: { status: 'stopped' }
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message || 'Failed to stop bot',
          error: 'BOT_STOP_FAILED'
        });
      }
    } catch (error) {
      logger.error('Error stopping bot:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to stop bot',
        error: 'INTERNAL_ERROR'
      });
    }
  })
);

router.post('/telegram-bot/restart',
  auditLogger('ADMIN_RESTART_BOT'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { TelegramBotService } = await import('../services/telegramBotService.js');
      const result = await TelegramBotService.restartBot();
      
      if (result.success) {
        logger.info(`Telegram bot restarted by admin user ${req.user?.id}`);
        res.json({
          success: true,
          message: 'Bot restarted successfully',
          data: { status: 'running' }
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message || 'Failed to restart bot',
          error: 'BOT_RESTART_FAILED'
        });
      }
    } catch (error) {
      logger.error('Error restarting bot:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to restart bot',
        error: 'INTERNAL_ERROR'
      });
    }
  })
);

router.get('/telegram-bot/stats',
  auditLogger('ADMIN_GET_BOT_STATS'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { TelegramBotService } = await import('../services/telegramBotService.js');
      const stats = TelegramBotService.getStats();
      
      res.json({
        success: true,
        message: 'Bot statistics retrieved successfully',
        data: stats
      });
    } catch (error) {
      logger.error('Error getting bot stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get bot statistics',
        error: 'INTERNAL_ERROR'
      });
    }
  })
);

// Get detailed BOT metrics
router.get('/telegram-bot/metrics',
  auditLogger('ADMIN_GET_BOT_METRICS'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { TelegramBotService } = await import('../services/telegramBotService.js');
      const metrics = TelegramBotService.getDetailedMetrics();
      
      res.json({
        success: true,
        message: 'Bot metrics retrieved successfully',
        data: metrics
      });
    } catch (error) {
      logger.error('Error getting bot metrics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get bot metrics',
        error: 'INTERNAL_ERROR'
      });
    }
  })
);

// Get BOT performance metrics
router.get('/telegram-bot/performance',
  auditLogger('ADMIN_GET_BOT_PERFORMANCE'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { TelegramBotService } = await import('../services/telegramBotService.js');
      const performance = TelegramBotService.getPerformanceMetrics();
      
      res.json({
        success: true,
        data: performance
      });
    } catch (error) {
      logger.error('Error getting bot performance:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get bot performance'
      });
    }
  })
);

// Reset BOT metrics
router.post('/telegram-bot/reset-metrics',
  auditLogger('ADMIN_RESET_BOT_METRICS'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { TelegramBotService } = await import('../services/telegramBotService.js');
      TelegramBotService.resetMetrics();
      
      res.json({
        success: true,
        message: 'Bot metrics reset successfully'
      });
    } catch (error) {
      logger.error('Error resetting bot metrics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to reset bot metrics'
      });
    }
  })
);

// Get BOT monitor status
router.get('/telegram-bot/monitor',
  auditLogger('ADMIN_GET_BOT_MONITOR'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { BotMonitor } = await import('../utils/botMonitor.js');
      const monitor = BotMonitor.getInstance();
      const status = monitor.getStatus();
      
      // Flatten the structure to match frontend expectations
      const responseData = {
        isRunning: status.isRunning,
        alertThresholds: status.config.alertThresholds,
        nextCleanup: status.nextCleanup,
        lastHealthCheck: status.lastHealthCheck,
        config: status.config
      };
      
      res.json({
        success: true,
        data: responseData
      });
    } catch (error) {
      logger.error('Error getting bot monitor status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get bot monitor status'
      });
    }
  })
);

// Update BOT monitor configuration
router.put('/telegram-bot/monitor/config',
  auditLogger('ADMIN_UPDATE_BOT_MONITOR_CONFIG'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { BotMonitor } = await import('../utils/botMonitor.js');
      const monitor = BotMonitor.getInstance();
      
      const { cleanupInterval, maxDailyStatsAge, alertThresholds } = req.body;
      
      monitor.updateConfig({
        ...(cleanupInterval && { cleanupInterval }),
        ...(maxDailyStatsAge && { maxDailyStatsAge }),
        ...(alertThresholds && { alertThresholds })
      });
      
      res.json({
        success: true,
        message: 'Bot monitor configuration updated successfully'
      });
    } catch (error) {
      logger.error('Error updating bot monitor config:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update bot monitor configuration'
      });
    }
  })
);

// Bot Security Management Routes
router.get('/telegram-bot/security/stats',
  auditLogger('ADMIN_GET_BOT_SECURITY_STATS'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const security = BotSecurity.getInstance();
      const stats = security.getSecurityStats();
      
      res.json({
        success: true,
        message: 'Bot security stats retrieved successfully',
        data: stats
      });
    } catch (error) {
      logger.error('Error getting bot security stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get bot security stats',
        error: 'Internal server error'
      });
    }
  })
);

router.post('/telegram-bot/security/block-user',
  auditLogger('ADMIN_BLOCK_BOT_USER'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId, reason, durationMs } = req.body;
      
      if (!userId || !reason) {
        res.status(400).json({
          success: false,
          message: 'User ID and reason are required'
        });
        return;
      }
      
      const security = BotSecurity.getInstance();
      await security.blockUser(userId, reason, durationMs);
      
      res.json({
        success: true,
        message: `User ${userId} blocked successfully`,
        data: {
          userId,
          reason,
          durationMs,
          blockedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Error blocking user:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to block user',
        error: 'Internal server error'
      });
    }
  })
);

router.post('/telegram-bot/security/unblock-user',
  auditLogger('ADMIN_UNBLOCK_BOT_USER'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { userId } = req.body;
      
      if (!userId) {
        res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
        return;
      }
      
      const security = BotSecurity.getInstance();
      await security.unblockUser(userId);
      
      res.json({
        success: true,
        message: `User ${userId} unblocked successfully`,
        data: {
          userId,
          unblockedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Error unblocking user:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to unblock user',
        error: 'Internal server error'
      });
    }
  })
);

// Rate Limiter Management Routes
router.get('/telegram-bot/rate-limiter/stats',
  auditLogger('ADMIN_GET_RATE_LIMITER_STATS'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rateLimiter = RateLimiter.getInstance();
      const stats = rateLimiter.getStats();
      
      res.json({
        success: true,
        message: 'Rate limiter stats retrieved successfully',
        data: stats
      });
    } catch (error) {
      logger.error('Error getting rate limiter stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get rate limiter stats',
        error: 'Internal server error'
      });
    }
  })
);

router.post('/telegram-bot/rate-limiter/reset',
  auditLogger('ADMIN_RESET_RATE_LIMITER'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { identifier } = req.body;
      
      if (!identifier) {
        res.status(400).json({
          success: false,
          message: 'Identifier is required'
        });
        return;
      }
      
      const rateLimiter = RateLimiter.getInstance();
      rateLimiter.reset(identifier);
      
      res.json({
        success: true,
        message: `Rate limit reset for ${identifier}`,
        data: {
          identifier,
          resetAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Error resetting rate limit:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to reset rate limit',
        error: 'Internal server error'
      });
    }
  })
);

router.post('/telegram-bot/rate-limiter/unblock',
  auditLogger('ADMIN_UNBLOCK_RATE_LIMITER'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { identifier } = req.body;
      
      if (!identifier) {
        res.status(400).json({
          success: false,
          message: 'Identifier is required'
        });
        return;
      }
      
      const rateLimiter = RateLimiter.getInstance();
      rateLimiter.unblock(identifier);
      
      res.json({
        success: true,
        message: `Rate limit unblocked for ${identifier}`,
        data: {
          identifier,
          unblockedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Error unblocking rate limit:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to unblock rate limit',
        error: 'Internal server error'
      });
    }
  })
);

// Admin 2FA management routes
router.get('/2fa/status', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const db = getDatabase();
  const user = await db.get('SELECT id, two_factor_enabled, totp_secret, email, username FROM users WHERE id = ?', [req.user!.id]);
  res.json({
    success: true,
    data: {
      enabled: !!(user?.two_factor_enabled === 1 || user?.two_factor_enabled === true),
      hasSecret: !!user?.totp_secret
    }
  });
}));

router.post('/2fa/setup', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const db = getDatabase();
  const user = await db.get('SELECT id, email, username FROM users WHERE id = ?', [req.user!.id]);
  const secret = authenticator.generateSecret();
  const label = `${user.username} (${user.email})`;
  const issuer = process.env['APP_NAME'] || 'NewXme';
  const otpauth = authenticator.keyuri(user.email || user.username, issuer, secret);
  
  // Generate base64 PNG QR code (more reliable than SVG)
  const qrPngBuffer = await QRCode.toBuffer(otpauth, { 
    type: 'png', 
    width: 256,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  });
  const qrBase64 = `data:image/png;base64,${qrPngBuffer.toString('base64')}`;
  
  // Also generate SVG as fallback (with better sanitization)
  let qrSvg = await QRCode.toString(otpauth, { type: 'svg', width: 256, margin: 2 });
  
  // Improved SVG sanitization
  qrSvg = qrSvg
    .replace(/`/g, '') // Remove all backticks
    .replace(/xmlns="\s*([^"]*?)\s*"/g, 'xmlns="$1"') // Clean xmlns attribute
    .replace(/<svg\b(?![^>]*xmlns)/, '<svg xmlns="http://www.w3.org/2000/svg"'); // Ensure xmlns exists

  // Do not persist secret until verified; return for client to verify
  res.json({
    success: true,
    message: '2FA setup initiated',
    data: {
      secret,
      otpauth,
      qrSvg,
      qrBase64 // Add base64 PNG as primary option
    }
  });
}));

router.post('/2fa/enable', validateRequest(enable2FASchema), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { code, secret } = req.body;
  // Verify TOTP code with provided secret
  const isValid = authenticator.verify({ token: code, secret });
  if (!isValid) {
    return res.status(400).json({ success: false, message: 'Invalid 2FA code' });
  }
  const db = getDatabase();
  await db.run('UPDATE users SET two_factor_enabled = 1, totp_secret = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [secret, req.user!.id]);
  res.json({ success: true, message: '2FA enabled successfully' });
}));

router.post('/2fa/disable', validateRequest(disable2FASchema), asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { code } = req.body;
  const db = getDatabase();
  const user = await db.get('SELECT totp_secret FROM users WHERE id = ?', [req.user!.id]);
  if (!user?.totp_secret) {
    return res.status(400).json({ success: false, message: '2FA not enabled' });
  }
  const isValid = authenticator.verify({ token: code, secret: user.totp_secret });
  if (!isValid) {
    return res.status(400).json({ success: false, message: 'Invalid 2FA code' });
  }
  await db.run('UPDATE users SET two_factor_enabled = 0, totp_secret = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.user!.id]);
  res.json({ success: true, message: '2FA disabled successfully' });
}));

// Quota Management Routes for Admins
router.post('/users/:id/quota', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, operation } = req.body; // operation can be 'add' or 'set'
    const db = getDatabase();
    
    // Validate input
    if (!amount || isNaN(amount) || amount < 0) {
      res.status(400).json({
        success: false,
        message: 'Invalid amount',
        error: 'Amount must be a non-negative number'
      });
      return;
    }
    
    if (!operation || !['add', 'set'].includes(operation)) {
      res.status(400).json({
        success: false,
        message: 'Invalid operation',
        error: 'Operation must be either "add" or "set"'
      });
      return;
    }
    
    // Check if user exists
    const user = await db.get('SELECT id, quota FROM users WHERE id = ?', [id]);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
        error: 'User does not exist'
      });
      return;
    }
    
    let newQuota;
    if (operation === 'add') {
      newQuota = user.quota + amount;
    } else { // operation === 'set'
      newQuota = amount;
    }
    
    await db.run(
      "UPDATE users SET quota = ?, updated_at = ? WHERE id = ?",
      [newQuota, DateUtils.nowSQLite(), id]
    );
    
    logger.info('Admin updated user quota:', {
      adminId: req.user?.id,
      userId: id,
      operation,
      amount,
      oldQuota: user.quota,
      newQuota
    });
    
    res.json({
      success: true,
      message: `User quota ${operation === 'add' ? 'increased' : 'updated'} successfully`,
      data: {
        userId: id,
        oldQuota: user.quota,
        newQuota,
        operation,
        amount
      }
    });
  } catch (error) {
    logger.error('Error updating user quota:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user quota',
      error: 'Internal server error'
    });
  }
});

// Payment Methods Management Routes

// Get all payment methods with status
router.get('/payment-methods', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDatabase();
    
    // Fetch current payment channels from Tripay
    const tripayChannels = await tripayService.getPaymentChannels();
    
    // Get existing payment method settings from database
    const dbMethods = await db.all('SELECT * FROM payment_methods ORDER BY name ASC');
    
    // Merge Tripay data with database settings
    const paymentMethods = tripayChannels.map(channel => {
      const dbMethod = dbMethods.find(m => m.code === channel.code);
      return {
        code: channel.code,
        name: channel.name,
        type: channel.type,
        icon_url: channel.icon_url,
        fee_flat: channel.fee_customer?.flat || 0,
        fee_percent: channel.fee_customer?.percent || 0,
        minimum_fee: channel.minimum_fee || 0,
        maximum_fee: channel.maximum_fee || 0,
        is_enabled: dbMethod ? dbMethod.is_enabled === 1 : true,
        id: dbMethod?.id || null,
        created_at: dbMethod?.created_at || null,
        updated_at: dbMethod?.updated_at || null
      };
    });

    logger.info('Admin fetched payment methods:', {
      adminId: req.user?.id,
      totalMethods: paymentMethods.length,
      enabledMethods: paymentMethods.filter(m => m.is_enabled).length
    });

    res.json({
      success: true,
      message: 'Payment methods retrieved successfully',
      data: paymentMethods
    });
  } catch (error: any) {
    logger.error('Error fetching payment methods:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment methods',
      error: error.message
    });
  }
}));

// Update payment method settings
router.patch('/payment-methods/:code', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code } = req.params;
    const { is_enabled } = req.body;
    
    const db = getDatabase();
    
    // Check if payment method exists in our database
    const existingMethod = await db.get(
      'SELECT * FROM payment_methods WHERE code = ?',
      [code]
    );
    
    if (existingMethod) {
      // Update existing record
      await db.run(
        "UPDATE payment_methods SET is_enabled = ?, updated_at = ? WHERE code = ?",
        [is_enabled ? 1 : 0, DateUtils.nowSQLite(), code]
      );
    } else {
      // Get payment method details from Tripay
      const tripayChannels = await tripayService.getPaymentChannels();
      const channel = tripayChannels.find(c => c.code === code);
      
      if (!channel) {
        return res.status(404).json({
          success: false,
          message: 'Payment method not found'
        });
      }
      
      // Insert new record
      await db.run(
        `INSERT INTO payment_methods (code, name, type, icon_url, fee_flat, fee_percent, minimum_fee, maximum_fee, is_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          channel.code,
          channel.name,
          channel.type,
          channel.icon_url,
          channel.fee_customer?.flat || 0,
          channel.fee_customer?.percent || 0,
          channel.minimum_fee || 0,
          channel.maximum_fee || 0,
          is_enabled ? 1 : 0,
          DateUtils.nowSQLite(),
          DateUtils.nowSQLite()
        ]
      );
    }

    logger.info('Admin updated payment method:', {
      adminId: req.user?.id,
      paymentCode: code,
      isEnabled: is_enabled
    });

    res.json({
      success: true,
      message: 'Payment method updated successfully',
      data: { code, is_enabled }
    });
  } catch (error: any) {
    logger.error('Error updating payment method:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update payment method',
      error: error.message
    });
  }
}));

// Sync payment methods from Tripay
router.post('/payment-methods/sync', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const db = getDatabase();
    
    // Fetch current payment channels from Tripay
    const tripayChannels = await tripayService.getPaymentChannels();
    
    let syncedCount = 0;
    let newCount = 0;
    
    for (const channel of tripayChannels) {
      const existingMethod = await db.get(
        'SELECT * FROM payment_methods WHERE code = ?',
        [channel.code]
      );
      
      if (existingMethod) {
        // Update existing method with latest Tripay data
        await db.run(
          `UPDATE payment_methods 
           SET name = ?, type = ?, icon_url = ?, fee_flat = ?, fee_percent = ?, 
               minimum_fee = ?, maximum_fee = ?, updated_at = ? 
           WHERE code = ?`,
          [
            channel.name,
            channel.type,
            channel.icon_url,
            channel.fee_customer?.flat || 0,
            channel.fee_customer?.percent || 0,
            channel.minimum_fee || 0,
            channel.maximum_fee || 0,
            DateUtils.nowSQLite(),
            channel.code
          ]
        );
        syncedCount++;
      } else {
        // Insert new payment method (enabled by default)
        await db.run(
          `INSERT INTO payment_methods (code, name, type, icon_url, fee_flat, fee_percent, minimum_fee, maximum_fee, is_enabled, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          [
            channel.code,
            channel.name,
            channel.type,
            channel.icon_url,
            channel.fee_customer?.flat || 0,
            channel.fee_customer?.percent || 0,
            channel.minimum_fee || 0,
            channel.maximum_fee || 0,
            DateUtils.nowSQLite(),
            DateUtils.nowSQLite()
          ]
        );
        newCount++;
      }
    }

    logger.info('Admin synced payment methods:', {
      adminId: req.user?.id,
      totalFromTripay: tripayChannels.length,
      syncedCount,
      newCount
    });

    res.json({
      success: true,
      message: 'Payment methods synced successfully',
      data: {
        totalFromTripay: tripayChannels.length,
        syncedCount,
        newCount
      }
    });
  } catch (error: any) {
    logger.error('Error syncing payment methods:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync payment methods',
      error: error.message
    });
  }
}));

// Telegram Bot Management Routes
router.get('/telegram-bot/status',
  auditLogger('ADMIN_GET_BOT_STATUS'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { TelegramBotService } = await import('../services/telegramBotService.js');
      const status = TelegramBotService.getStatus();
      
      res.json({
        success: true,
        message: 'Bot status retrieved successfully',
        data: status
      });
    } catch (error) {
      logger.error('Error getting bot status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get bot status',
        error: 'INTERNAL_ERROR'
      });
    }
  })
);

router.post('/telegram-bot/start',
  auditLogger('ADMIN_START_BOT'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { TelegramBotService } = await import('../services/telegramBotService.js');
      // Allow admin to specify polling mode to avoid webhook rate limits
      const usePolling = req.body.usePolling === true || process.env['TELEGRAM_USE_POLLING'] === 'true';
      const result = await TelegramBotService.startBot(usePolling);
      
      if (result.success) {
        logger.info(`Telegram bot started by admin user ${req.user?.id} in ${usePolling ? 'polling' : 'webhook'} mode`);
        res.json({
          success: true,
          message: `Bot started successfully in ${usePolling ? 'polling' : 'webhook'} mode`,
          data: { status: 'running', mode: usePolling ? 'polling' : 'webhook' }
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message || 'Failed to start bot',
          error: 'BOT_START_FAILED'
        });
      }
    } catch (error) {
      logger.error('Error starting bot:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to start bot',
        error: 'INTERNAL_ERROR'
      });
    }
  })
);

router.post('/telegram-bot/stop',
  auditLogger('ADMIN_STOP_BOT'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { TelegramBotService } = await import('../services/telegramBotService.js');
      const result = await TelegramBotService.stopBot();
      
      if (result.success) {
        logger.info(`Telegram bot stopped by admin user ${req.user?.id}`);
        res.json({
          success: true,
          message: 'Bot stopped successfully',
          data: { status: 'stopped' }
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message || 'Failed to stop bot',
          error: 'BOT_STOP_FAILED'
        });
      }
    } catch (error) {
      logger.error('Error stopping bot:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to stop bot',
        error: 'INTERNAL_ERROR'
      });
    }
  })
);

router.post('/telegram-bot/restart',
  auditLogger('ADMIN_RESTART_BOT'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { TelegramBotService } = await import('../services/telegramBotService.js');
      const result = await TelegramBotService.restartBot();
      
      if (result.success) {
        logger.info(`Telegram bot restarted by admin user ${req.user?.id}`);
        res.json({
          success: true,
          message: 'Bot restarted successfully',
          data: { status: 'running' }
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message || 'Failed to restart bot',
          error: 'BOT_RESTART_FAILED'
        });
      }
    } catch (error) {
      logger.error('Error restarting bot:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to restart bot',
        error: 'INTERNAL_ERROR'
      });
    }
  })
);

router.get('/telegram-bot/stats',
  auditLogger('ADMIN_GET_BOT_STATS'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { TelegramBotService } = await import('../services/telegramBotService.js');
      const stats = TelegramBotService.getStats();
      
      res.json({
        success: true,
        message: 'Bot statistics retrieved successfully',
        data: stats
      });
    } catch (error) {
      logger.error('Error getting bot stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get bot statistics',
        error: 'INTERNAL_ERROR'
      });
    }
  })
);

// Get detailed BOT metrics
router.get('/telegram-bot/metrics',
  auditLogger('ADMIN_GET_BOT_METRICS'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { TelegramBotService } = await import('../services/telegramBotService.js');
      const metrics = TelegramBotService.getDetailedMetrics();
      
      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      logger.error('Error getting bot metrics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get bot metrics',
        error: 'INTERNAL_ERROR'
      });
    }
  })
);

export default router;