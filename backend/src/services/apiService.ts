import { getDatabase, initializeDatabase } from '../database/init.js';
import { logger } from '../utils/logger.js';
import { DateUtils } from '../utils/dateUtils.js';
import { tripayService } from './tripayService.js';

/**
 * Internal API Service untuk komunikasi antar modul di backend
 * Menyediakan interface untuk mengakses data dan fungsi internal
 */
export class ApiService {
  private static instance: ApiService;
  private db: any;

  constructor() {
    // Database will be initialized when needed
    this.db = null;
  }

  private async initializeDb() {
    if (!this.db) {
      try {
        await initializeDatabase();
        this.db = getDatabase();
      } catch (error) {
        logger.error('Failed to initialize database in ApiService:', error);
        throw error;
      }
    }
    return this.db;
  }

  public static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  /**
   * Get user data by telegram user ID
   */
  async getUserByTelegramId(telegramUserId: number) {
    try {
      const db = await this.initializeDb();
      const query = `
        SELECT u.*, up.first_name, up.last_name, up.phone 
        FROM users u 
        LEFT JOIN user_profiles up ON u.id = up.user_id 
        WHERE u.telegram_user_id = ?
      `;
      const user = await db.get(query, [telegramUserId]);
      return user;
    } catch (error) {
      logger.error('Error getting user by telegram ID:', error);
      throw error;
    }
  }

  /**
   * Get user quota
   */
  async getUserQuota(userId: number): Promise<number> {
    try {
      const db = await this.initializeDb();
      const query = 'SELECT quota FROM users WHERE id = ?';
      const result = await db.get(query, [userId]);
      return result?.quota || 0;
    } catch (error) {
      logger.error('Error getting user quota:', error);
      throw error;
    }
  }

  /**
   * Get user's active installations
   */
  async getUserInstallations(userId: number) {
    try {
      const db = await this.initializeDb();
      const query = `
        SELECT id, ip, passwd_vps, win_ver, passwd_rdp, status, start_time, created_at
        FROM install_data 
        WHERE user_id = ? 
        ORDER BY created_at DESC
      `;
      const installations = await db.all(query, [userId]);
      return installations;
    } catch (error) {
      logger.error('Error getting user installations:', error);
      throw error;
    }
  }

  /**
   * Get available Windows versions
   */
  async getWindowsVersions() {
    try {
      const db = await this.initializeDb();
      const query = 'SELECT * FROM windows_versions ORDER BY name';
      const versions = await db.all(query);
      return versions;
    } catch (error) {
      logger.error('Error getting Windows versions:', error);
      throw error;
    }
  }

  /**
   * Get enabled payment methods for topup
   */
  async getEnabledPaymentMethods() {
    try {
      // Use the imported tripayService instance
      const paymentMethods = await tripayService.getPaymentChannels() as Array<{ active: boolean; [key: string]: any }>;
      
      // Filter only enabled methods
      return paymentMethods.filter((method) => method.active);
    } catch (error) {
      logger.error('Error getting payment methods:', error);
      throw error;
    }
  }

  /**
   * Calculate topup amount
   */
  async calculateTopupAmount(amount: number) {
    try {
      // Basic calculation - bisa disesuaikan dengan business logic
      const fee = Math.max(amount * 0.03, 5000); // 3% fee, minimum 5000
      const total = amount + fee;
      
      return {
        amount,
        fee,
        total
      };
    } catch (error) {
      logger.error('Error calculating topup amount:', error);
      throw error;
    }
  }

  /**
   * Create topup transaction
   */
  async createTopupTransaction(userId: number, amount: number, paymentMethod: string) {
    try {
      const calculation = await this.calculateTopupAmount(amount);
      // Use the imported tripayService instance
      
      // Create transaction via Tripay
      const transaction = await tripayService.createTransaction({
        method: paymentMethod,
        merchant_ref: `TOPUP_${userId}_${Date.now()}`,
        amount: calculation.total,
        customer_name: `User ${userId}`,
        customer_email: `user${userId}@example.com`,
        order_items: [{
          name: 'Topup Saldo',
          price: calculation.total,
          quantity: 1
        }]
      });

      // Save to database
      const query = `
        INSERT INTO topup_transactions 
        (user_id, amount, fee, total, payment_method, transaction_id, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
      `;
      
      const db = await this.initializeDb();
      const result = await db.run(query, [
        userId,
        calculation.amount,
        calculation.fee,
        calculation.total,
        paymentMethod,
        transaction.reference,
        DateUtils.nowSQLite()
      ]);

      return {
        id: result.lastID,
        ...calculation,
        paymentMethod,
        transactionId: transaction.reference,
        paymentUrl: transaction.checkout_url,
        status: 'pending'
      };
    } catch (error) {
      logger.error('Error creating topup transaction:', error);
      throw error;
    }
  }

  /**
   * Create topup request (simplified version for Telegram bot)
   */
  async createTopupRequest(userId: number, data: { amount: number; payment_method: string; requested_via?: string }) {
    try {
      const { amount, payment_method, requested_via = 'web' } = data;
      
      // Validate amount
      if (amount < 10000) {
        return {
          success: false,
          message: 'Minimal topup Rp 10.000'
        };
      }

      // Create transaction
      const transaction = await this.createTopupTransaction(userId, amount, payment_method);
      
      return {
        success: true,
        message: 'Topup request created successfully',
        data: {
          id: transaction.id,
          amount: transaction.amount,
          payment_method: payment_method,
          status: 'pending',
          requested_via
        }
      };
    } catch (error) {
      logger.error('Error creating topup request:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create topup request'
      };
    }
  }

  /**
   * Create Windows installation
   */
  async createInstallation(userId: number, windowsVersion: string) {
    try {
      // Check user quota
      const quota = await this.getUserQuota(userId);
      if (quota <= 0) {
        throw new Error('Insufficient quota');
      }

      // Create installation record
      const query = `
        INSERT INTO install_data 
        (user_id, win_ver, status, start_time, created_at)
        VALUES (?, ?, 'pending', ?, ?)
      `;
      
      const db = await this.initializeDb();
      const timestamp = DateUtils.nowSQLite();
      const result = await db.run(query, [
        userId,
        windowsVersion,
        timestamp,
        timestamp
      ]);

      // Decrease user quota
      const updateQuotaQuery = 'UPDATE users SET quota = quota - 1 WHERE id = ?';
      await db.run(updateQuotaQuery, [userId]);

      return {
        id: result.lastID,
        userId,
        windowsVersion,
        status: 'pending',
        startTime: timestamp
      };
    } catch (error) {
      logger.error('Error creating installation:', error);
      throw error;
    }
  }

  /**
   * Create install request (wrapper for createInstallation)
   */
  async createInstallRequest(userId: number, data: { 
    win_version: string; 
    vps_ip?: string;
    vps_password?: string;
    rdp_password?: string;
    requested_via?: string 
  }) {
    try {
      const result = await this.createInstallationWithDetails(userId, data);
      return {
        success: true,
        message: 'Install request created successfully',
        data: result
      };
    } catch (error) {
      logger.error('Error creating install request:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create install request',
        data: null
      };
    }
  }

  /**
   * Create installation with additional details using InstallService
   */
  async createInstallationWithDetails(userId: number, data: {
    win_version: string;
    vps_ip?: string;
    vps_password?: string;
    rdp_password?: string;
    requested_via?: string;
  }) {
    try {
      // Import InstallService dynamically to avoid circular dependency
      const { InstallService } = await import('./installService.js');
      
      // Use InstallService which includes monitoring integration
      const result = await InstallService.processInstallation(
        userId,
        data.vps_ip || '',
        data.vps_password || '',
        data.win_version,
        data.rdp_password || ''
      );

      if (!result.success) {
        throw new Error(result.message);
      }

      return {
        id: result.installId,
        userId,
        ip: data.vps_ip || '',
        windowsVersion: data.win_version,
        status: 'pending',
        requestedVia: data.requested_via || 'telegram',
        message: result.message
      };
    } catch (error) {
      logger.error('Error creating installation with details:', error);
      throw error;
    }
  }

  /**
   * Get user quota information with statistics
   */
  async getUserQuotaInfo(userId: number) {
    try {
      const db = await this.initializeDb();
      
      // Get user basic info
      const user = await db.get('SELECT quota, username FROM users WHERE id = ?', [userId]);
      if (!user) {
        throw new Error('User not found');
      }

      // Get installation statistics
      const [installStats, topupStats] = await Promise.all([
        db.get(`
          SELECT 
            COUNT(*) as install_count,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
            COUNT(*) as install_cost
          FROM install_data 
          WHERE user_id = ?
        `, [userId]),
        db.get(`
          SELECT 
            COALESCE(SUM(quantity), 0) as total_topup,
            COUNT(*) as topup_count
          FROM topup_data 
          WHERE user_id = ? AND status = 'PAID'
        `, [userId])
      ]);

      const quotaInfo = {
        current_quota: user.quota,
        username: user.username,
        install_count: installStats?.install_count || 0,
        completed_installs: installStats?.completed_count || 0,
        install_cost: installStats?.install_cost || 0,
        used_quota: installStats?.install_cost || 0,
        total_topup: topupStats?.total_topup || 0,
        topup_count: topupStats?.topup_count || 0
      };

      return {
        success: true,
        message: 'Quota information retrieved successfully',
        data: quotaInfo
      };
    } catch (error) {
      logger.error('Error getting user quota info:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to get quota information',
        data: null
      };
    }
  }

  /**
   * Get topup history for user
   */
  async getTopupHistory(userId: number, limit: number = 10) {
    try {
      const db = await this.initializeDb();
      const query = `
        SELECT * FROM topup_transactions 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT ?
      `;
      const history = await db.all(query, [userId, limit]);
      return history;
    } catch (error) {
      logger.error('Error getting topup history:', error);
      throw error;
    }
  }

  /**
   * Update user telegram notifications setting
   */
  async updateTelegramNotifications(userId: number, enabled: boolean) {
    try {
      const db = await this.initializeDb();
      const query = 'UPDATE users SET telegram_notifications = ? WHERE id = ?';
      await db.run(query, [enabled ? 1 : 0, userId]);
      return { success: true };
    } catch (error) {
      logger.error('Error updating telegram notifications:', error);
      throw error;
    }
  }

  /**
   * Get installation status
   */
  async getInstallationStatus(installationId: number) {
    try {
      const db = await this.initializeDb();
      const query = 'SELECT * FROM install_data WHERE id = ?';
      const installation = await db.get(query, [installationId]);
      return installation;
    } catch (error) {
      logger.error('Error getting installation status:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const apiService = ApiService.getInstance();
export default apiService;