import express from 'express';
import { Request, Response } from 'express';
import { getDatabase } from '../database/init.js';
import { 
  authenticateToken, 
  requireVerifiedUser,
  validateRequest,
  asyncHandler
} from '../middleware/auth.js';
import { updateProfileSchema, installDataSchema, ApiResponse } from '../types/user.js';
import { UserService } from '../services/userService.js';
import { logger } from '../utils/logger.js';
import { NotFoundError } from '../middleware/errorHandler.js';
import { z } from 'zod';
import { tripayService } from '../services/tripayService.js';

const router = express.Router();

// Get user profile
router.get('/profile',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new NotFoundError('User not found');
    }

    const db = getDatabase();
    const user = await db.get(`
      SELECT u.id, u.username, u.email, u.is_verified, u.admin, u.telegram, u.quota, u.created_at, u.last_login,
             p.first_name, p.last_name, p.phone, p.avatar_url, p.timezone, p.language, p.created_at as profile_created_at
      FROM users u
      LEFT JOIN user_profiles p ON u.id = p.user_id
      WHERE u.id = ?
    `, [req.user.id]);

    if (!user) {
      throw new NotFoundError('User not found');
    }

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
        SET status = ?, paid_at = ?, updated_at = datetime('now','localtime')
        WHERE reference = ?
      `, [
        callbackData.status,
        callbackData.status === 'PAID' ? new Date().toISOString() : null,
        callbackData.reference
      ]);

      // If payment is successful, add quota to user
      if (callbackData.status === 'PAID') {
        await UserService.incrementUserQuota(userId, quantity);
        
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
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new NotFoundError('User not found');
    }

    const validatedData = req.body;
    const db = getDatabase();

    // Check if profile exists
    const existingProfile = await db.get('SELECT id FROM user_profiles WHERE user_id = ?', [req.user.id]);

    if (existingProfile) {
      // Update existing profile
      await db.run(`
        UPDATE user_profiles 
        SET first_name = ?, last_name = ?, phone = ?, timezone = ?, language = ?, updated_at = datetime('now','localtime')
        WHERE user_id = ?
      `, [
        validatedData.firstName || null,
        validatedData.lastName || null,
        validatedData.phone || null,
        validatedData.timezone || 'UTC',
        validatedData.language || 'en',
        req.user.id
      ]);
    } else {
      // Create new profile
      await db.run(`
        INSERT INTO user_profiles (user_id, first_name, last_name, phone, timezone, language)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        req.user.id,
        validatedData.firstName || null,
        validatedData.lastName || null,
        validatedData.phone || null,
        validatedData.timezone || 'UTC',
        validatedData.language || 'en'
      ]);
    }

    // Get updated user data
    const user = await db.get(`
      SELECT u.id, u.username, u.email, u.is_verified, u.admin, u.telegram, u.quota, u.created_at, u.last_login,
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
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new NotFoundError('User not found');
    }

    const db = getDatabase();
    
    // Get user data
    const user = await db.get(`
      SELECT u.id, u.username, u.email, u.is_verified, u.admin, u.telegram, u.quota, u.created_at, u.last_login,
             p.first_name, p.last_name, p.phone, p.avatar_url, p.timezone, p.language, p.created_at as profile_created_at
      FROM users u
      LEFT JOIN user_profiles p ON u.id = p.user_id
      WHERE u.id = ?
    `, [req.user.id]);

    // Get user's install data count
    const installCount = await db.get(
      'SELECT COUNT(*) as count FROM install_data WHERE user_id = ?',
      [req.user.id]
    );

    // Get user's active installations
    const activeInstalls = await db.get(
      'SELECT COUNT(*) as count FROM install_data WHERE user_id = ? AND status IN (?, ?)',
      [req.user.id, 'pending', 'running']
    );

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
      quota: user.quota,
      created_at: user.created_at,
      last_login: user.last_login,
      profile
    };

    // Create notifications
    const notifications = [
      {
        id: 1,
        type: 'info',
        title: 'Welcome to XME Projects',
        message: 'Start by installing Windows on your VPS',
        timestamp: new Date().toISOString(),
        read: false
      }
    ];

    const dashboardData = {
      user: userData,
      stats: {
        totalVPS: installCount.count,
        activeConnections: activeInstalls.count,
        dataTransfer: '0 GB',
        uptime: '0%'
      },
      recentActivity: recentInstalls,
      notifications
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
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new NotFoundError('User not found');
    }

    const validatedData = req.body;
    const db = getDatabase();

    // Check user quota first
    const hasQuota = await UserService.checkQuotaForInstallation(req.user.id);
    if (!hasQuota) {
      res.status(400).json({
        success: false,
        message: 'Insufficient quota',
        error: 'Your quota is insufficient for Windows installation. Please top up your quota to proceed.'
      });
      return;
    }

    // Check if user has reached install limit (for free users)
    const userInstalls = await db.get(
      'SELECT COUNT(*) as count FROM install_data WHERE user_id = ?',
      [req.user.id]
    );

    // For now, allow unlimited installs for admin users, limit to 3 for regular users
    const user = await db.get('SELECT admin FROM users WHERE id = ?', [req.user.id]);
    if (user.admin !== 1 && userInstalls.count >= 3) {
      res.status(400).json({
        success: false,
        message: 'Install limit reached',
        error: 'Free users are limited to 3 installations. Please upgrade your plan.'
      });
      return;
    }

    // Deduct quota before creating install request
    const quotaDeducted = await UserService.decrementUserQuota(req.user.id, 1);
    if (!quotaDeducted) {
      res.status(400).json({
        success: false,
        message: 'Insufficient quota',
        error: 'Your quota is insufficient for Windows installation. Please top up your quota to proceed.'
      });
      return;
    }

    // Create new install request
    const result = await db.run(`
      INSERT INTO install_data (user_id, ip, passwd_vps, win_ver, passwd_rdp, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      req.user.id,
      validatedData.ip,
      validatedData.passwd_vps || null,
      validatedData.win_ver,
      validatedData.passwd_rdp || null,
      'pending'
    ]);

    const newInstall = await db.get('SELECT * FROM install_data WHERE id = ?', [result.lastID]);

    logger.info('Install request created:', {
      userId: req.user.id,
      installId: result.lastID,
      ip: validatedData.ip,
      quotaDeducted: 1
    });

    res.status(201).json({
      success: true,
      message: 'Install request created successfully',
      data: newInstall
    } as ApiResponse);
  })
);

// Get user's install history
router.get('/install-history',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new NotFoundError('User not found');
    }

    const db = getDatabase();
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
        payment_method, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      'PENDING'
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
          product_url: process.env.FRONTEND_URL || 'https://localhost:3000',
          image_url: product ? product.image_url : 'https://localhost/quota-install.jpg'
        }],
        return_url: `${process.env.FRONTEND_URL || 'https://localhost:3000'}/dashboard?payment=success`,
        expired_time: expiry
      };

      const tripayResponse = await tripayService.createTransaction(tripayRequest);

      // Update transaction with Tripay response
      await db.run(`
        UPDATE topup_transactions 
        SET reference = ?, payment_url = ?, checkout_url = ?, pay_code = ?, 
            status = ?, expired_time = ?, updated_at = datetime('now','localtime')
        WHERE id = ?
      `, [
        tripayResponse.data.reference,
        tripayResponse.data.pay_url,
        tripayResponse.data.checkout_url,
        tripayResponse.data.pay_code,
        tripayResponse.data.status,
        tripayResponse.data.expired_time,
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

export { router as userRoutes };
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
                   minimum_fee = ?, maximum_fee = ?, updated_at = datetime('now','localtime') 
               WHERE code = ?`,
              [
                channel.name,
                channel.type,
                channel.icon_url,
                channel.fee_customer?.flat || 0,
                channel.fee_customer?.percent || 0,
                channel.minimum_fee || 0,
                channel.maximum_fee || 0,
                channel.code
              ]
            );
          } else {
            // Insert new payment method (enabled by default)
            await db.run(
              `INSERT INTO payment_methods (code, name, type, icon_url, fee_flat, fee_percent, minimum_fee, maximum_fee, is_enabled)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
              [
                channel.code,
                channel.name,
                channel.type,
                channel.icon_url,
                channel.fee_customer?.flat || 0,
                channel.fee_customer?.percent || 0,
                channel.minimum_fee || 0,
                channel.maximum_fee || 0
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
