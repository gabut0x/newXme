// Third-party packages
import { z } from 'zod';
import express from 'express';
import { Request, Response } from 'express';

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
import { auditLogger } from '../middleware/security.js';
import { NotFoundError, BadRequestError } from '../middleware/errorHandler.js';

// Types and schemas
import { updateProfileSchema, installDataSchema, ApiResponse } from '../types/user.js';

// Services and utilities
import { UserService } from '../services/userService.js';
import { tripayService } from '../services/tripayService.js';
import { NotificationService } from '../services/notificationService.js';
import { InstallService } from '../services/installService.js';
import { DatabaseSecurity } from '../utils/dbSecurity.js';
import { DateUtils } from '../utils/dateUtils.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Apply security middleware to all routes
router.use(sqlInjectionProtection);

// Real-time notifications endpoint (Server-Sent Events)
router.get('/notifications/stream',
  asyncHandler(async (req: Request, res: Response) => {
    // Handle authentication for EventSource (which can't send custom headers)
    const authHeader = req.headers.authorization;
    const tokenFromHeader = authHeader && authHeader.split(' ')[1];
    const tokenFromQuery = req.query['token'] as string;
    const token = tokenFromHeader || tokenFromQuery;
    
    if (!token) {
      logger.warn('No token provided for notification stream');
      res.status(401).json({
        success: false,
        message: 'Access token required',
        error: 'MISSING_TOKEN'
      });
      return;
    }
    
    // Verify token manually since we can't use middleware with EventSource
    let user;
    try {
      const { AuthUtils } = await import('../utils/auth.js');
      const { UserService } = await import('../services/userService.js');
      
      // Check if token is blacklisted
      const isBlacklisted = await AuthUtils.isTokenBlacklisted(token);
      if (isBlacklisted) {
        logger.warn('Token is blacklisted for notification stream');
        res.status(401).json({
          success: false,
          message: 'Token has been revoked',
          error: 'TOKEN_REVOKED'
        });
        return;
      }

      // Verify token
      const decoded = AuthUtils.verifyToken(token);

      // Get user from database
      const userData = await UserService.getUserById(decoded.userId);
      if (!userData || !userData.is_active) {
        logger.warn('User not found or inactive for notification stream');
        res.status(401).json({
          success: false,
          message: 'User not found or inactive',
          error: 'USER_INACTIVE'
        });
        return;
      }
      
      if (!userData.is_verified) {
        logger.warn('User not verified for notification stream');
        res.status(403).json({
          success: false,
          message: 'Email verification required',
          error: 'EMAIL_NOT_VERIFIED'
        });
        return;
      }
      
      user = {
        id: userData.id,
        username: userData.username,
        email: userData.email,
        isVerified: userData.is_verified,
        admin: userData.admin
      };
      
      logger.info('User authenticated for notification stream:', { userId: user.id, username: user.username });
    } catch (error: any) {
      logger.error('Notification stream authentication error:', error);
      res.status(401).json({
        success: false,
        message: 'Invalid token',
        error: 'INVALID_TOKEN'
      });
      return;
    }

    // Set headers for Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial connection message
    res.write(`data: ${JSON.stringify({
      type: 'connection',
      message: 'Connected to notification stream',
      timestamp: DateUtils.nowISO()
    })}\n\n`);

    // Register user for notifications
    const unregister = NotificationService.registerUser(user.id, (notification) => {
      try {
        // SSE format: event: type\ndata: json\n\n
        const sseMessage = `data: ${JSON.stringify(notification)}\n\n`;
        logger.info('Writing SSE message:', {
          userId: user.id,
          message: sseMessage.replace(/\n/g, '\\n'),
          notification: notification
        });
        
        res.write(sseMessage);
        res.flush(); // Force flush the data
      } catch (error) {
        logger.error('Error writing notification to stream:', error);
        unregister();
      }
    });

    // Handle client disconnect
    req.on('close', () => {
      unregister();
      logger.info('User disconnected from notification stream:', { userId: user.id });
    });

    req.on('error', (error) => {
      logger.error('Notification stream error:', { userId: user.id, error });
      unregister();
    });

    // Additional cleanup for response object
    res.on('close', () => {
      unregister();
      logger.info('Response stream closed for user:', { userId: user.id });
    });

    // Keep connection alive with periodic heartbeat
    const heartbeat = setInterval(() => {
      try {
        res.write(`data: ${JSON.stringify({
          type: 'heartbeat',
          timestamp: DateUtils.nowISO()
        })}\n\n`);
      } catch (error) {
        logger.error('Error sending heartbeat:', error);
        clearInterval(heartbeat);
        unregister();
      }
    }, 30000); // Every 30 seconds

    req.on('close', () => {
      clearInterval(heartbeat);
    });
  })
);

// Get user profile
router.get('/profile',
  authenticateToken,
  auditLogger('GET_PROFILE'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new NotFoundError('User not found');
    }

    const db = getDatabase();
    
    // Use parameterized query to prevent SQL injection
    const user = await db.get(`
      SELECT u.id, u.username, u.email, u.is_verified, u.admin, u.telegram, u.telegram_user_id, u.telegram_display_name, u.telegram_notifications, u.quota, u.created_at, u.last_login,
             p.first_name, p.last_name, p.phone, p.avatar_url, p.timezone, p.language, p.created_at as profile_created_at
      FROM users u
      LEFT JOIN user_profiles p ON u.id = p.user_id
      WHERE u.id = ?
    `, [req.user.id]);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Log profile access for audit
    DatabaseSecurity.logDatabaseOperation('READ_PROFILE', 'users', req.user.id);
    // Format the response
    const profile = user.first_name ? {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      avatar_url: user.avatar_url,
      timezone: user.timezone,
      language: user.language,
      created_at: user.profile_created_at
    } : null;

    const userData = {
      id: user.id,
      username: user.username,
      email: user.email,
      is_verified: user.is_verified,
      admin: user.admin,
      telegram: user.telegram,
      telegram_user_id: user.telegram_user_id,
      telegram_display_name: user.telegram_display_name,
      telegram_notifications: user.telegram_notifications,
      quota: user.quota,
      created_at: user.created_at,
      last_login: user.last_login,
      profile
    };

    res.json({
      success: true,
      message: 'Profile retrieved successfully',
      data: { user: userData }
    } as ApiResponse);
  })
);
// Payment callback from Tripay
router.post('/payment/callback',
  asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers['x-callback-signature'] as string;
    const callbackData = req.body;

    if (!tripayService.validateCallback(signature, callbackData)) {
      res.status(400).json({
        success: false,
        message: 'Invalid callback signature'
      });
      return;
    }

    const db = getDatabase();
    
    try {
      // Find transaction by reference
      const transaction = await db.get(
        'SELECT * FROM topup_transactions WHERE reference = ?',
        [callbackData.reference]
      );

      if (!transaction) {
        res.status(404).json({
          success: false,
          message: 'Transaction not found'
        });
        return;
      }

      // Parse merchant_ref to extract userId and quantity
      const merchantRef = callbackData.merchant_ref || transaction.merchant_ref;
      const userMatch = merchantRef.match(/_U(\d+)_Q(\d+)/);
      
      let userId = transaction.user_id;
      let quantity = transaction.quantity;
      
      if (userMatch) {
        userId = parseInt(userMatch[1]);
        quantity = parseInt(userMatch[2]);
      }

      // Update transaction status
      await db.run(`
        UPDATE topup_transactions 
        SET status = ?, paid_at = ?, updated_at = ?
        WHERE reference = ?
      `, [
        callbackData.status,
        callbackData.status === 'PAID' ? DateUtils.nowSQLite() : null,
        DateUtils.nowSQLite(),
        callbackData.reference
      ]);

      // If payment is successful, add quota to user
      if (callbackData.status === 'PAID') {
        await UserService.incrementUserQuota(userId, quantity);
        
        // Get updated user quota for notification
        const updatedQuota = await UserService.getUserQuota(userId);
        
        // Send quota added notification
        await NotificationService.notifyQuotaAdded(userId, {
          quantity,
          paymentMethod: callbackData.payment_method || 'Unknown',
          reference: callbackData.reference,
          newBalance: updatedQuota
        });
        
        logger.info('Payment successful, quota added:', {
          userId: userId,
          reference: callbackData.reference,
          quantity: quantity,
          merchantRef: merchantRef
        });
      }

      logger.info('Payment callback processed:', {
        reference: callbackData.reference,
        status: callbackData.status
      });

      res.json({
        success: true,
        message: 'Callback processed successfully'
      });

    } catch (error: any) {
      logger.error('Payment callback error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  })
);

// Update user profile
router.put('/profile',
  authenticateToken,
  requireVerifiedUser,
  validateRequest(updateProfileSchema),
  auditLogger('UPDATE_PROFILE'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new NotFoundError('User not found');
    }

    const validatedData = req.body;
    const db = getDatabase();

    // Log profile update attempt
    DatabaseSecurity.logDatabaseOperation('UPDATE_PROFILE', 'user_profiles', req.user.id, validatedData);
    // Check if profile exists
    const existingProfile = await db.get('SELECT id FROM user_profiles WHERE user_id = ?', [req.user.id]);

    if (existingProfile) {
      // Update existing profile
      await db.run(`
        UPDATE user_profiles 
        SET first_name = ?, last_name = ?, phone = ?, timezone = ?, language = ?, updated_at = ?
        WHERE user_id = ?
      `, [
        validatedData.firstName || null,
        validatedData.lastName || null,
        validatedData.phone || null,
        validatedData.timezone || 'UTC',
        validatedData.language || 'en',
        DateUtils.nowSQLite(),
        req.user.id
      ]);
    } else {
      // Create new profile
      await db.run(`
        INSERT INTO user_profiles (user_id, first_name, last_name, phone, timezone, language, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        req.user.id,
        validatedData.firstName || null,
        validatedData.lastName || null,
        validatedData.phone || null,
        validatedData.timezone || 'UTC',
        validatedData.language || 'en',
        DateUtils.nowSQLite(),
        DateUtils.nowSQLite()
      ]);
    }

    // Get updated user data
    const user = await db.get(`
      SELECT u.id, u.username, u.email, u.is_verified, u.admin, u.telegram, u.telegram_user_id, u.telegram_display_name, u.telegram_notifications, u.quota, u.created_at, u.last_login,
             p.first_name, p.last_name, p.phone, p.avatar_url, p.timezone, p.language, p.created_at as profile_created_at
      FROM users u
      LEFT JOIN user_profiles p ON u.id = p.user_id
      WHERE u.id = ?
    `, [req.user.id]);

    const profile = user.first_name ? {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      avatar_url: user.avatar_url,
      timezone: user.timezone,
      language: user.language,
      created_at: user.profile_created_at
    } : null;

    const userData = {
      id: user.id,
      username: user.username,
      email: user.email,
      is_verified: user.is_verified,
      admin: user.admin,
      telegram: user.telegram,
      telegram_user_id: user.telegram_user_id,
      telegram_display_name: user.telegram_display_name,
      telegram_notifications: user.telegram_notifications,
      quota: user.quota,
      created_at: user.created_at,
      last_login: user.last_login,
      profile
    };

    logger.info('User profile updated:', {
      userId: req.user.id,
      updatedFields: Object.keys(validatedData)
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: userData }
    } as ApiResponse);
  })
);

// Get dashboard data
router.get('/dashboard',
  authenticateToken,
  requireVerifiedUser,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new NotFoundError('User not found');
    }

    const db = getDatabase();
    
    // Get user data
    const user = await db.get(`
      SELECT u.id, u.username, u.email, u.is_verified, u.admin, u.telegram, u.telegram_user_id, u.telegram_display_name, u.telegram_notifications, u.quota, u.created_at, u.last_login,
             p.first_name, p.last_name, p.phone, p.avatar_url, p.timezone, p.language, p.created_at as profile_created_at
      FROM users u
      LEFT JOIN user_profiles p ON u.id = p.user_id
      WHERE u.id = ?
    `, [req.user.id]);

    // Get comprehensive installation statistics
    const [totalInstalls, activeInstalls, completedInstalls, failedInstalls] = await Promise.all([
      db.get('SELECT COUNT(*) as count FROM install_data WHERE user_id = ?', [req.user.id]),
      db.get('SELECT COUNT(*) as count FROM install_data WHERE user_id = ? AND status IN (?, ?, ?)', [req.user.id, 'pending', 'running', 'manual_review']),
      db.get('SELECT COUNT(*) as count FROM install_data WHERE user_id = ? AND status = ?', [req.user.id, 'completed']),
      db.get('SELECT COUNT(*) as count FROM install_data WHERE user_id = ? AND status IN (?, ?)', [req.user.id, 'failed', 'cancelled'])
    ]);

    // Calculate success rate
    const successRate = totalInstalls.count > 0 
      ? Math.round((completedInstalls.count / totalInstalls.count) * 100)
      : 0;

    // Get recent install data
    const recentInstalls = await db.all(
      'SELECT * FROM install_data WHERE user_id = ? ORDER BY created_at DESC LIMIT 5',
      [req.user.id]
    );

    // Format user data
    const profile = user.first_name ? {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      avatar_url: user.avatar_url,
      timezone: user.timezone,
      language: user.language,
      created_at: user.profile_created_at
    } : null;

    const userData = {
      id: user.id,
      username: user.username,
      email: user.email,
      is_verified: user.is_verified,
      admin: user.admin,
      telegram: user.telegram,
      telegram_user_id: user.telegram_user_id,
      telegram_display_name: user.telegram_display_name,
      telegram_notifications: user.telegram_notifications,
      quota: user.quota,
      created_at: user.created_at,
      last_login: user.last_login,
      profile
    };

    const dashboardData = {
      user: userData,
      stats: {
        totalVPS: totalInstalls.count,
        activeConnections: activeInstalls.count,
        completedInstalls: completedInstalls.count,
        failedInstalls: failedInstalls.count,
        successRate: `${successRate}%`,
        quota: user.quota
      },
      recentActivity: recentInstalls
    };

    res.json({
      success: true,
      message: 'Dashboard data retrieved successfully',
      data: dashboardData
    } as ApiResponse);
  })
);

// Get Windows versions for install form
router.get('/windows-versions',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDatabase();
    const versions = await db.all('SELECT * FROM windows_versions ORDER BY name');
    
    res.json({
      success: true,
      message: 'Windows versions retrieved successfully',
      data: versions
    } as ApiResponse);
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

// Get user's install history
router.get('/install-history',
  authenticateToken,
  auditLogger('GET_INSTALL_HISTORY'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new NotFoundError('User not found');
    }

    const db = getDatabase();
    
    // Use parameterized query to prevent SQL injection
    const installs = await db.all(
      'SELECT * FROM install_data WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    
    res.json({
      success: true,
      message: 'Install history retrieved successfully',
      data: installs
    } as ApiResponse);
  })
);

// Get user quota
router.get('/quota',
  authenticateToken,
  auditLogger('GET_QUOTA'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new NotFoundError('User not found');
    }

    const quota = await UserService.getUserQuota(req.user.id);
    
    res.json({
      success: true,
      message: 'Quota retrieved successfully',
      data: { quota }
    } as ApiResponse);
  })
);

// Topup quota with payment gateway
const topupSchema = z.object({
  quantity: z.number().min(1, 'Quantity must be at least 1'),
  payment_method: z.string().min(1, 'Payment method is required')
});

router.post('/topup',
  authenticateToken,
  requireVerifiedUser,
  validateRequest(topupSchema),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new NotFoundError('User not found');
    }

    const { quantity, payment_method } = req.body;
    const db = getDatabase();

    // Get user data
    const user = await db.get('SELECT username, email FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Get product information from products table (id = 1) and calculate pricing with discount schema
    const product = await db.get('SELECT * FROM products WHERE id = 1');
    const productPrice = product ? product.price : 5000; // Use product price or fallback to 5000
    let discount = 0;
    
    if (quantity < 5) {
      discount = 0;
    } else if (quantity === 5) {
      discount = 0.12;
    } else if (quantity > 5 && quantity <= 10) {
      discount = 0.20;
    } else if (quantity >= 11 && quantity <= 19) {
      discount = 0.25;
    } else {
      discount = 0.30;
    }

    const totalAmount = quantity * productPrice;
    const discountAmount = totalAmount * discount;
    const finalAmount = totalAmount - discountAmount;

    // Generate merchant reference with user ID and quantity
    const merchantRef = tripayService.generateMerchantRef(req.user.id, quantity);
    
    // Create transaction record (reference will be set after Tripay response)
    const result = await db.run(`
      INSERT INTO topup_transactions (
        user_id, merchant_ref, amount, quantity, total_amount, 
        discount_percentage, discount_amount, final_amount, 
        payment_method, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      req.user.id,
      merchantRef,
      productPrice,
      quantity,
      totalAmount,
      discount * 100, // Store as percentage
      discountAmount,
      finalAmount,
      payment_method,
      'PENDING',
      DateUtils.nowSQLite(),
      DateUtils.nowSQLite()
    ]);

    try {
      // Get product information from products table (id = 1)
      const product = await db.get('SELECT * FROM products WHERE id = 1');
      
      // Create Tripay transaction
      const expiry = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours

      const tripayRequest = {
        method: payment_method,
        merchant_ref: merchantRef,
        amount: Math.round(finalAmount),
        customer_name: user.username,
        customer_email: user.email,
        customer_phone: '',
        order_items: [{
          sku: product ? `PRODUCT-${product.id}` : 'QUOTA-INSTALL',
          name: product ? product.name : 'Quota Install',
          price: Math.round(finalAmount),
          quantity: 1,
          product_url: process.env['FRONTEND_URL'] || 'https://localhost:3000',
          image_url: product ? product.image_url : 'https://localhost/quota-install.jpg'
        }],
        return_url: `${process.env['FRONTEND_URL'] || 'https://localhost:3000'}/dashboard?payment=success`,
        expired_time: expiry
      };

      const tripayResponse = await tripayService.createTransaction(tripayRequest);

      // Update transaction with Tripay response
      await db.run(`
        UPDATE topup_transactions 
        SET reference = ?, payment_url = ?, checkout_url = ?, pay_code = ?, 
            status = ?, expired_time = ?, updated_at = ?
        WHERE id = ?
      `, [
        tripayResponse.data.reference,
        tripayResponse.data.pay_url,
        tripayResponse.data.checkout_url,
        tripayResponse.data.pay_code,
        tripayResponse.data.status,
        tripayResponse.data.expired_time,
        DateUtils.nowSQLite(),
        result.lastID
      ]);

      logger.info('Topup transaction created:', {
        userId: req.user.id,
        transactionId: result.lastID,
        reference: tripayResponse.data.reference,
        amount: finalAmount,
        quantity
      });

      res.json({
        success: true,
        message: 'Topup transaction created successfully',
        data: {
          transaction_id: result.lastID,
          reference: tripayResponse.data.reference,
          merchant_ref: merchantRef,
          quantity,
          total_amount: totalAmount,
          discount_percentage: discount * 100,
          discount_amount: discountAmount,
          final_amount: finalAmount,
          checkout_url: tripayResponse.data.checkout_url,
          qr_url: tripayResponse.data.qr_url,
          pay_code: tripayResponse.data.pay_code,
          payment_method: tripayResponse.data.payment_method,
          payment_name: tripayResponse.data.payment_name,
          status: tripayResponse.data.status,
          expired_time: tripayResponse.data.expired_time
        }
      } as ApiResponse);

    } catch (tripayError: any) {
      // Update transaction status to failed
      await db.run(`
        UPDATE topup_transactions 
        SET status = 'FAILED', updated_at = ? 
        WHERE id = ?
      `, [DateUtils.nowSQLite(), result.lastID]);

      logger.error('Tripay transaction failed:', {
        userId: req.user.id,
        transactionId: result.lastID,
        error: tripayError.message
      });

      res.status(500).json({
        success: false,
        message: 'Payment gateway error',
        error: tripayError.message
      });
    }
  })
);

// Get topup history
router.get('/topup/history',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new NotFoundError('User not found');
    }

    const db = getDatabase();
    const transactions = await db.all(`
      SELECT * FROM topup_transactions 
      WHERE user_id = ? 
      ORDER BY created_at DESC
    `, [req.user.id]);
    
    res.json({
      success: true,
      message: 'Topup history retrieved successfully',
      data: transactions
    } as ApiResponse);
  })
);

// Calculate topup pricing
router.post('/topup/calculate',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { quantity } = req.body;
    
    if (!quantity || quantity <= 0) {
      res.status(400).json({
        success: false,
        message: 'Invalid quantity',
        error: 'Quantity must be a positive number'
      });
      return;
    }

    // Get product information from products table (id = 1) and calculate pricing with discount schema
    const db = getDatabase();
    const product = await db.get('SELECT * FROM products WHERE id = 1');
    const productPrice = product ? product.price : 5000; // Use product price or fallback to 5000
    let discount = 0;
    
    if (quantity < 5) {
      discount = 0;
    } else if (quantity === 5) {
      discount = 0.12;
    } else if (quantity > 5 && quantity <= 10) {
      discount = 0.20;
    } else if (quantity >= 11 && quantity <= 19) {
      discount = 0.25;
    } else {
      discount = 0.30;
    }

    const totalAmount = quantity * productPrice;
    const discountAmount = totalAmount * discount;
    const finalAmount = totalAmount - discountAmount;

    res.json({
      success: true,
      message: 'Price calculated successfully',
      data: {
        product: product || {
          id: 1,
          name: 'Quota Install',
          description: 'Quota Install for Windows Installation service',
          price: productPrice
        },
        quantity,
        total_amount: totalAmount,
        discount_percentage: discount * 100,
        discount_amount: discountAmount,
        final_amount: finalAmount
      }
    } as ApiResponse);
  })
);

// Update user password
const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters')
});

router.post('/update-password',
  authenticateToken,
  requireVerifiedUser,
  validateRequest(updatePasswordSchema),
  auditLogger('UPDATE_PASSWORD'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new NotFoundError('User not found');
    }

    const { currentPassword, newPassword } = req.body;
    const db = getDatabase();
    
    // Get current user data including password hash
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    // Verify current password
    const { AuthUtils } = await import('../utils/auth.js');
    const isCurrentPasswordValid = await AuthUtils.comparePassword(currentPassword, user.password_hash);
    
    if (!isCurrentPasswordValid) {
      res.status(400).json({
        success: false,
        message: 'Current password is incorrect',
        error: 'INVALID_CURRENT_PASSWORD'
      } as ApiResponse);
      return;
    }

    // Hash new password
    const newPasswordHash = await AuthUtils.hashPassword(newPassword);
    
    // Update password in database
    await db.run(
      'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
      [newPasswordHash, DateUtils.nowSQLite(), req.user.id]
    );

    logger.info('User password updated:', {
      userId: req.user.id,
      username: req.user.username
    });

    res.json({
      success: true,
      message: 'Password updated successfully'
    } as ApiResponse);
  })
);

// Connect Telegram account
router.post('/connect-telegram',
  authenticateToken,
  requireVerifiedUser,
  auditLogger('CONNECT_TELEGRAM'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new NotFoundError('User not found');
    }

    try {
      // Import TelegramBotService
      const { TelegramBotService } = await import('../services/telegramBotService.js');
      
      // Generate connection token and bot link
      const connectionData = await TelegramBotService.generateConnectionToken(req.user.id);
      
      logger.info('Telegram connection initiated:', {
        userId: req.user.id,
        username: req.user.username
      });

      res.json({
        success: true,
        message: 'Telegram connection link generated successfully',
        data: {
          telegramBotUrl: connectionData.link,
          instructions: 'Click the link to open Telegram and connect your account. The connection link expires in 10 minutes.',
          expiresInMinutes: 10
        }
      } as ApiResponse);
    } catch (error: any) {
      logger.error('Error generating Telegram connection:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate Telegram connection',
        error: error.message
      } as ApiResponse);
    }
  })
);

// Update Telegram notification settings
const telegramNotificationsSchema = z.object({
  enabled: z.boolean()
});

router.post('/telegram-notifications',
  authenticateToken,
  requireVerifiedUser,
  validateRequest(telegramNotificationsSchema),
  auditLogger('UPDATE_TELEGRAM_NOTIFICATIONS'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new NotFoundError('User not found');
    }

    const { enabled } = req.body;
    const db = getDatabase();
    
    // Check if user has Telegram connected
    const user = await db.get('SELECT telegram FROM users WHERE id = ?', [req.user.id]);
    if (!user || !user.telegram) {
      res.status(400).json({
        success: false,
        message: 'Telegram account not connected',
        error: 'TELEGRAM_NOT_CONNECTED'
      } as ApiResponse);
      return;
    }

    // Update notification preference
    await db.run(
      'UPDATE users SET telegram_notifications = ?, updated_at = ? WHERE id = ?',
      [enabled ? 1 : 0, DateUtils.nowSQLite(), req.user.id]
    );

    logger.info('Telegram notifications updated:', {
      userId: req.user.id,
      username: req.user.username,
      enabled
    });

    res.json({
      success: true,
      message: `Telegram notifications ${enabled ? 'enabled' : 'disabled'} successfully`
    } as ApiResponse);
  })
);

// Disconnect Telegram account
router.post('/disconnect-telegram',
  authenticateToken,
  requireVerifiedUser,
  auditLogger('DISCONNECT_TELEGRAM'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new NotFoundError('User not found');
    }

    const db = getDatabase();
    
    // Clear Telegram information from user account
    await db.run(`
      UPDATE users
      SET telegram = NULL, telegram_user_id = NULL, telegram_display_name = NULL,
          telegram_notifications = 0, updated_at = ?
      WHERE id = ?
    `, [DateUtils.nowSQLite(), req.user.id]);

    // Clean up any unused connection tokens for this user
    await db.run(
      'DELETE FROM telegram_connection_tokens WHERE user_id = ?',
      [req.user.id]
    );

    logger.info('Telegram account disconnected:', {
      userId: req.user.id,
      username: req.user.username
    });

    res.json({
      success: true,
      message: 'Telegram account disconnected successfully'
    } as ApiResponse);
  })
);

// Delete user account
router.delete('/account',
  authenticateToken,
  requireVerifiedUser,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new NotFoundError('User not found');
    }

    const db = getDatabase();
    
    // Delete user (cascade will handle related records)
    await db.run('DELETE FROM users WHERE id = ?', [req.user.id]);

    logger.info('User account deleted:', {
      userId: req.user.id,
      username: req.user.username
    });

    res.json({
      success: true,
      message: 'Account deleted successfully'
    } as ApiResponse);
  })
);

// Get enabled payment methods for users
router.get('/payment-methods/enabled', 
  authenticateToken,
  requireVerifiedUser,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const db = getDatabase();
      
      // Get enabled payment methods from database
      const enabledMethods = await db.all(
        'SELECT code, name, type, icon_url, fee_flat, fee_percent, minimum_fee, maximum_fee FROM payment_methods WHERE is_enabled = 1 ORDER BY name ASC'
      );
      
      // If no methods in database, sync from Tripay first
      if (enabledMethods.length === 0) {
        logger.info('No payment methods in database, syncing from Tripay');
        
        const tripayChannels = await tripayService.getPaymentChannels();
        
        // Insert methods using proper UPSERT logic to avoid constraint violations
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
          }
        }
        
        // Fetch again after sync
        const syncedMethods = await db.all(
          'SELECT code, name, type, icon_url, fee_flat, fee_percent, minimum_fee, maximum_fee FROM payment_methods WHERE is_enabled = 1 ORDER BY name ASC'
        );
        
        res.json({
          success: true,
          message: 'Payment methods retrieved successfully',
          data: syncedMethods
        });
      } else {
        res.json({
          success: true,
          message: 'Payment methods retrieved successfully',
          data: enabledMethods
        });
      }
    } catch (error: any) {
      logger.error('Error fetching enabled payment methods:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch payment methods',
        error: error.message
      });
    }
  })
);

// Test notification endpoint (for development/testing)
router.post('/test-notification',
  authenticateToken,
  requireVerifiedUser,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new NotFoundError('User not found');
    }

    // Send a test installation status notification
    await NotificationService.notifyInstallStatusUpdate({
      installId: 999,
      userId: req.user.id,
      status: 'completed',
      message: 'Test notification: Windows installation completed successfully',
      timestamp: DateUtils.nowISO(),
      ip: '192.168.1.100',
      winVersion: 'win11-pro'
    });

    res.json({
      success: true,
      message: 'Test notification sent successfully'
    } as ApiResponse);
  })
);

// Test dashboard refresh notification endpoint
router.post('/test-dashboard-refresh',
  authenticateToken,
  requireVerifiedUser,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new NotFoundError('User not found');
    }

    const { status = 'completed' } = req.body;
    
    logger.info('Test dashboard refresh notification request:', { userId: req.user.id, status });
    
    const testNotification = {
      type: 'install_status_update',
      status,
      message: `Installation ${status} - Dashboard should refresh automatically`,
      timestamp: DateUtils.nowISO(),
      ip: '192.168.1.100',
      installId: 999,
      winVersion: 'Windows 11 Pro'
    };
    
    NotificationService.sendRealTimeNotification(req.user.id, testNotification);
    
    res.json({
      success: true,
      message: 'Dashboard refresh test notification sent successfully',
      data: testNotification
    } as ApiResponse);
  })
);

// Debug: Check notification stream connections
router.get('/debug/connections',
  authenticateToken,
  requireVerifiedUser,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new NotFoundError('User not found');
    }
    
    const { NotificationService } = await import('../services/notificationService.js');
    
    const connectionsInfo = NotificationService.getConnectionDebugInfo(req.user.id);
    
    res.json({
      success: true,
      message: 'Connection debug info retrieved',
      data: connectionsInfo
    } as ApiResponse);
  })
);

// Debug: Get all connections info (admin-like view)
router.get('/debug/all-connections',
  authenticateToken,
  requireVerifiedUser,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new NotFoundError('User not found');
    }
    
    const { NotificationService } = await import('../services/notificationService.js');
    
    const allConnectionsInfo = NotificationService.getConnectionDebugInfo();
    
    res.json({
      success: true,
      message: 'All connections debug info retrieved',
      data: allConnectionsInfo
    } as ApiResponse);
  })
);

// Debug: Test notification delivery
router.post('/debug/test-delivery',
  authenticateToken,
  requireVerifiedUser,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new NotFoundError('User not found');
    }
    
    const { NotificationService } = await import('../services/notificationService.js');
    
    const deliveryResult = await NotificationService.testNotificationDelivery(req.user.id);
    const connectionInfo = NotificationService.getConnectionDebugInfo(req.user.id);
    
    res.json({
      success: true,
      message: 'Notification delivery test completed',
      data: {
        deliverySuccessful: deliveryResult,
        connectionInfo,
        timestamp: new Date().toISOString()
      }
    } as ApiResponse);
  })
);

// Debug: Send test notification with detailed logging
router.post('/debug/test-stream-notification',
  authenticateToken,
  requireVerifiedUser,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new NotFoundError('User not found');
    }

    const { status = 'completed', message = 'Test stream notification' } = req.body;
    
    logger.info('🧪 Sending debug stream notification:', {
      userId: req.user.id,
      status,
      timestamp: new Date().toISOString()
    });
    
    const testNotification = {
      type: 'install_status_update',
      status,
      message: `DEBUG: ${message}`,
      timestamp: DateUtils.nowISO(),
      ip: '192.168.1.100',
      installId: 999,
      winVersion: 'Windows 11 Pro'
    };
    
    const { NotificationService } = await import('../services/notificationService.js');
    
    // Send notification and log the result
    logger.info('🔔 About to send real-time notification:', testNotification);
    NotificationService.sendRealTimeNotification(req.user.id, testNotification);
    logger.info('✅ Real-time notification sent successfully');
    
    res.json({
      success: true,
      message: 'Debug stream notification sent',
      data: {
        notification: testNotification,
        userId: req.user.id,
        timestamp: new Date().toISOString()
      }
    } as ApiResponse);
  })
);

export { router as userRoutes };