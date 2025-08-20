import { getDatabase } from '../database/init.js';
import { logger } from '../utils/logger.js';
import { DateUtils } from '../utils/dateUtils.js';
import { getEmailService } from './emailService.js';

export interface NotificationData {
  userId: number;
  type: 'install_completed' | 'install_failed' | 'quota_added' | 'system_alert';
  title: string;
  message: string;
  data?: any;
}

export interface InstallStatusUpdate {
  installId: number;
  userId: number;
  status: string;
  message: string;
  timestamp: string;
  ip?: string;
  winVersion?: string;
}

// In-memory storage for real-time notifications (in production, use Redis or WebSocket)
const activeConnections = new Map<number, any[]>(); // userId -> array of notification callbacks

// Debug tracking
const connectionStats = new Map<number, { count: number; lastActivity: string; lastNotification?: any }>();

export class NotificationService {
  /**
   * Register user for real-time notifications (dashboard connection)
   */
  static registerUser(userId: number, callback: (notification: any) => void): () => void {
    if (!activeConnections.has(userId)) {
      activeConnections.set(userId, []);
    }
    
    const userCallbacks = activeConnections.get(userId)!;
    userCallbacks.push(callback);
    
    // Update connection stats
    connectionStats.set(userId, {
      count: userCallbacks.length,
      lastActivity: new Date().toISOString()
    });
    
    logger.info('🔗 User registered for real-time notifications:', {
      userId,
      totalConnections: userCallbacks.length,
      timestamp: new Date().toISOString()
    });
    
    // Return unregister function
    return () => {
      const callbacks = activeConnections.get(userId);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
        if (callbacks.length === 0) {
          activeConnections.delete(userId);
          connectionStats.delete(userId);
        } else {
          // Update connection stats
          connectionStats.set(userId, {
            count: callbacks.length,
            lastActivity: new Date().toISOString()
          });
        }
      }
      logger.info('🔌 User unregistered from real-time notifications:', {
        userId,
        remainingConnections: callbacks?.length || 0
      });
    };
  }

  /**
   * Send real-time notification to user dashboard
   */
  static sendRealTimeNotification(userId: number, notification: any): void {
    const userCallbacks = activeConnections.get(userId);
    
    logger.info('🚀 Attempting to send real-time notification:', {
      userId,
      notificationType: notification.type,
      hasActiveConnections: !!userCallbacks,
      connectionCount: userCallbacks?.length || 0,
      notification: {
        type: notification.type,
        status: notification.status,
        message: notification.message
      }
    });
    
    if (userCallbacks && userCallbacks.length > 0) {
      let successfulCallbacks = 0;
      let failedCallbacks = 0;
      
      userCallbacks.forEach((callback, index) => {
        try {
          logger.info(`📡 Sending notification to callback ${index + 1}/${userCallbacks.length}:`, {
            userId,
            callbackIndex: index
          });
          
          callback(notification);
          successfulCallbacks++;
          
          logger.info(`✅ Callback ${index + 1} executed successfully`);
        } catch (error) {
          failedCallbacks++;
          logger.error(`❌ Error in callback ${index + 1}:`, error);
        }
      });
      
      // Update connection stats
      const stats = connectionStats.get(userId);
      if (stats) {
        stats.lastNotification = {
          type: notification.type,
          timestamp: new Date().toISOString(),
          successfulCallbacks,
          failedCallbacks
        };
        stats.lastActivity = new Date().toISOString();
        connectionStats.set(userId, stats);
      }
      
      logger.info('🎯 Real-time notification delivery complete:', {
        userId,
        notificationType: notification.type,
        totalCallbacks: userCallbacks.length,
        successfulCallbacks,
        failedCallbacks,
        deliveryTime: new Date().toISOString()
      });
    } else {
      logger.warn('⚠️  No active connections for user:', {
        userId,
        totalActiveUsers: activeConnections.size,
        allActiveUserIds: Array.from(activeConnections.keys())
      });
    }
  }

  /**
   * Notify installation status update (real-time to dashboard + Telegram if enabled)
   */
  static async notifyInstallStatusUpdate(update: InstallStatusUpdate): Promise<void> {
    const notification = {
      type: 'install_status_update',
      installId: update.installId,
      status: update.status,
      message: update.message,
      timestamp: update.timestamp,
      ip: update.ip,
      winVersion: update.winVersion
    };

    // Send real-time notification to dashboard
    this.sendRealTimeNotification(update.userId, notification);

    // Send Telegram notification ONLY for completed installations if user has enabled it
    if (update.status === 'completed') {
      try {
        const { TelegramBotService } = await import('./telegramBotService.js');
        const telegramSent = await TelegramBotService.sendInstallationNotification(update.userId, {
          status: update.status,
          ip: update.ip || 'Unknown',
          winVersion: update.winVersion || 'Unknown',
          message: update.message,
          installId: update.installId
        });

        logger.info('Installation completion notification sent to Telegram:', {
          userId: update.userId,
          installId: update.installId,
          status: update.status,
          message: update.message,
          timestamp: update.timestamp,
          telegramSent: telegramSent
        });
      } catch (error) {
        logger.error('Failed to send Telegram notification for installation completion:', {
          userId: update.userId,
          installId: update.installId,
          error: error instanceof Error ? error.message : error
        });
      }
    } else {
      logger.info('Skipping Telegram notification for non-completed status:', {
        status: update.status
      });
      
      // Still log the dashboard notification as successful
      logger.info('Install status update notification sent to dashboard only:', {
        userId: update.userId,
        installId: update.installId,
        status: update.status,
        message: update.message,
        timestamp: update.timestamp,
        telegramSkipped: true
      });
    }
  }

  /**
   * Send notification to user
   */
  static async sendNotification(notification: NotificationData): Promise<void> {
    try {
      const db = getDatabase();
      
      // Store notification in database (you can create a notifications table)
      // For now, we'll just log and send email
      
      logger.info('Sending notification:', {
        userId: notification.userId,
        type: notification.type,
        title: notification.title,
        message: notification.message
      });

      // Get user email
      const user = await db.get(
        'SELECT email, username FROM users WHERE id = ?',
        [notification.userId]
      );

      if (!user) {
        logger.error('User not found for notification:', { userId: notification.userId });
        return;
      }

      // Only send email for important notifications (quota_added)
      if (notification.type === 'quota_added') {
        await this.sendQuotaAddedEmail(user.email, user.username, notification.data);
      }
      
      // For install status updates, only send real-time notifications to dashboard
      if (notification.type === 'install_completed' || notification.type === 'install_failed') {
        // Send real-time notification instead of email
        this.sendRealTimeNotification(notification.userId, {
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          timestamp: DateUtils.nowISO()
        });
      }

    } catch (error: any) {
      logger.error('Failed to send notification:', {
        notification,
        error: error.message
      });
    }
  }



  /**
   * Send quota added notification
   */
  private static async sendQuotaAddedEmail(
    email: string, 
    username: string, 
    data: any
  ): Promise<void> {
    const subject = 'Quota Added Successfully - XME Projects';
    
    const text = `
Hello ${username},

Your quota has been successfully added to your account!

Transaction Details:
- Amount: ${data.quantity} quota
- Payment Method: ${data.paymentMethod}
- Transaction ID: ${data.reference}
- Added At: ${data.addedAt}

Your new quota balance: ${data.newBalance}

You can now use your quota to install Windows on your VPS servers.

Best regards,
The XME Projects Team
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Quota Added Successfully</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #3498db 0%, #2980b9 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
        .details { background: #fff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3498db; }
        .balance { background: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 5px; margin: 20px 0; color: #0c5460; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>💰 Quota Added Successfully!</h1>
            <p>Your account has been topped up</p>
        </div>
        <div class="content">
            <h2>Hello ${username}!</h2>
            <p>Great news! Your quota has been successfully added to your XME Projects account.</p>
            
            <div class="details">
                <h3>Transaction Details</h3>
                <p><strong>Amount:</strong> ${data.quantity} quota</p>
                <p><strong>Payment Method:</strong> ${data.paymentMethod}</p>
                <p><strong>Transaction ID:</strong> ${data.reference}</p>
                <p><strong>Added At:</strong> ${data.addedAt}</p>
            </div>
            
            <div class="balance">
                <strong>🎯 New Quota Balance:</strong> ${data.newBalance} quota available
            </div>
            
            <p>You can now use your quota to install Windows on your VPS servers. Each installation uses 1 quota.</p>
        </div>
        <div class="footer">
            <p>© 2024 XME Projects. All rights reserved.</p>
            <p>Thank you for your payment!</p>
        </div>
    </div>
</body>
</html>
    `;

    await getEmailService().sendEmail({
      to: email,
      subject,
      text,
      html
    });
  }


  /**
   * Notify installation completion
   */
  static async notifyInstallationCompleted(
    userId: number,
    installData: {
      ip: string;
      winVersion: string;
      rdpPassword: string;
    }
  ): Promise<void> {
    // Send real-time notification to dashboard only (no email)
    await this.notifyInstallStatusUpdate({
      installId: 0, // Will be set by caller
      userId,
      status: 'completed',
      message: `Windows installation completed successfully on ${installData.ip}`,
      timestamp: DateUtils.nowISO(),
      ip: installData.ip,
      winVersion: installData.winVersion
    });

    logger.info('Installation completion notification sent to dashboard:', {
      userId,
      ip: installData.ip,
      winVersion: installData.winVersion
    });
  }

  /**
   * Notify installation failure
   */
  static async notifyInstallationFailed(
    userId: number,
    installData: {
      ip: string;
      winVersion: string;
      error: string;
    }
  ): Promise<void> {
    // Send real-time notification to dashboard only (no email)
    await this.notifyInstallStatusUpdate({
      installId: 0, // Will be set by caller
      userId,
      status: 'failed',
      message: `Installation failed on ${installData.ip}: ${installData.error}`,
      timestamp: DateUtils.nowISO(),
      ip: installData.ip,
      winVersion: installData.winVersion
    });

    logger.info('Installation failure notification sent to dashboard:', {
      userId,
      ip: installData.ip,
      error: installData.error
    });
  }

  /**
   * Notify quota addition
   */
  static async notifyQuotaAdded(
    userId: number,
    quotaData: {
      quantity: number;
      paymentMethod: string;
      reference: string;
      newBalance: number;
    }
  ): Promise<void> {
    await this.sendNotification({
      userId,
      type: 'quota_added',
      title: 'Quota Added Successfully',
      message: `${quotaData.quantity} quota has been added to your account.`,
      data: {
        ...quotaData,
        addedAt: DateUtils.formatJakarta(DateUtils.now()) + ' WIB'
      }
    });
  }

  /**
   * Get connection debug information
   */
  static getConnectionDebugInfo(userId?: number): any {
    if (userId) {
      const userCallbacks = activeConnections.get(userId);
      const stats = connectionStats.get(userId);
      
      return {
        userId,
        hasActiveConnections: !!userCallbacks,
        connectionCount: userCallbacks?.length || 0,
        stats: stats || null,
        isRegistered: activeConnections.has(userId)
      };
    }
    
    // Return all connections info
    const allConnections: any[] = [];
    for (const [uid, callbacks] of activeConnections) {
      const stats = connectionStats.get(uid);
      allConnections.push({
        userId: uid,
        connectionCount: callbacks.length,
        stats: stats || null
      });
    }
    
    return {
      totalActiveUsers: activeConnections.size,
      connections: allConnections,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Test notification delivery for debugging
   */
  static async testNotificationDelivery(userId: number): Promise<boolean> {
    logger.info('🧪 Testing notification delivery for user:', { userId });
    
    const testNotification = {
      type: 'test',
      message: 'Test notification delivery',
      timestamp: new Date().toISOString(),
      testId: Math.random().toString(36).substring(7)
    };
    
    this.sendRealTimeNotification(userId, testNotification);
    
    // Check if delivery was recorded
    const stats = connectionStats.get(userId);
    const wasDelivered = stats?.lastNotification?.timestamp === testNotification.timestamp;
    
    logger.info('🧪 Test notification delivery result:', {
      userId,
      wasDelivered,
      testId: testNotification.testId,
      stats
    });
    
    return wasDelivered;
  }
}