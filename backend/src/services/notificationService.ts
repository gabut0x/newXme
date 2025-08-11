import { getDatabase } from '../database/init.js';
import { logger } from '../utils/logger.js';
import { DateUtils } from '../utils/dateUtils.js';
import { emailService } from './emailService.js';

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
    
    logger.info('User registered for real-time notifications:', { userId });
    
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
        }
      }
      logger.info('User unregistered from real-time notifications:', { userId });
    };
  }

  /**
   * Send real-time notification to user dashboard
   */
  static sendRealTimeNotification(userId: number, notification: any): void {
    const userCallbacks = activeConnections.get(userId);
    if (userCallbacks && userCallbacks.length > 0) {
      userCallbacks.forEach(callback => {
        try {
          callback(notification);
        } catch (error) {
          logger.error('Error sending real-time notification:', error);
        }
      });
      
      logger.info('Real-time notification sent to user:', {
        userId,
        notificationType: notification.type,
        activeConnections: userCallbacks.length
      });
    } else {
      logger.debug('No active connections for user:', { userId });
    }
  }

  /**
   * Notify installation status update (real-time to dashboard)
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

    logger.info('Install status update notification sent:', {
      userId: update.userId,
      installId: update.installId,
      status: update.status,
      message: update.message
    });
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
   * Send installation completed notification
   */
  private static async sendInstallCompletedEmail(
    email: string, 
    username: string, 
    data: any
  ): Promise<void> {
    const subject = 'Windows Installation Completed - XME Projects';
    
    const text = `
Hello ${username},

Great news! Your Windows installation has been completed successfully.

Installation Details:
- IP Address: ${data.ip}
- Windows Version: ${data.winVersion}
- Status: Completed
- Completed At: ${data.completedAt}

You can now connect to your Windows RDP using:
- IP Address: ${data.ip}
- Username: Administrator
- Password: ${data.rdpPassword}

Please allow a few minutes for Windows to fully boot up before attempting to connect.

Best regards,
The XME Projects Team
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Windows Installation Completed</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #2ecc71 0%, #27ae60 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
        .details { background: #fff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2ecc71; }
        .credentials { background: #e8f5e8; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Windows Installation Completed!</h1>
            <p>Your VPS is now running Windows</p>
        </div>
        <div class="content">
            <h2>Hello ${username}!</h2>
            <p>Excellent news! Your Windows installation has been completed successfully and is ready to use.</p>
            
            <div class="details">
                <h3>Installation Details</h3>
                <p><strong>IP Address:</strong> ${data.ip}</p>
                <p><strong>Windows Version:</strong> ${data.winVersion}</p>
                <p><strong>Status:</strong> ✅ Completed</p>
                <p><strong>Completed At:</strong> ${data.completedAt}</p>
            </div>
            
            <div class="credentials">
                <h3>🔐 RDP Connection Details</h3>
                <p><strong>IP Address:</strong> ${data.ip}</p>
                <p><strong>Port:</strong> 3389</p>
                <p><strong>Username:</strong> Administrator</p>
                <p><strong>Password:</strong> ${data.rdpPassword}</p>
            </div>
            
            <div class="warning">
                <strong>⏰ Please Note:</strong> Allow 2-5 minutes for Windows to fully boot up before attempting to connect via RDP.
            </div>
            
            <p>You can now connect to your Windows desktop using any RDP client with the credentials provided above.</p>
        </div>
        <div class="footer">
            <p>© 2024 XME Projects. All rights reserved.</p>
            <p>Thank you for choosing XME Projects!</p>
        </div>
    </div>
</body>
</html>
    `;

    await emailService.sendEmail({
      to: email,
      subject,
      text,
      html
    });
  }

  /**
   * Send installation failed notification
   */
  private static async sendInstallFailedEmail(
    email: string, 
    username: string, 
    data: any
  ): Promise<void> {
    const subject = 'Windows Installation Failed - XME Projects';
    
    const text = `
Hello ${username},

We're sorry to inform you that your Windows installation has failed.

Installation Details:
- IP Address: ${data.ip}
- Windows Version: ${data.winVersion}
- Status: Failed
- Error: ${data.error}
- Failed At: ${data.failedAt}

Your quota has been automatically refunded to your account.

Please check the following and try again:
1. Ensure your VPS is online and accessible
2. Verify your VPS root password is correct
3. Make sure your VPS is running a supported OS (Ubuntu 20/22 or Debian 12)

If you continue to experience issues, please contact our support team.

Best regards,
The XME Projects Team
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Windows Installation Failed</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
        .details { background: #fff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #e74c3c; }
        .refund { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 20px 0; color: #155724; }
        .troubleshoot { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>❌ Installation Failed</h1>
            <p>Windows installation could not be completed</p>
        </div>
        <div class="content">
            <h2>Hello ${username}!</h2>
            <p>We're sorry to inform you that your Windows installation has encountered an error and could not be completed.</p>
            
            <div class="details">
                <h3>Installation Details</h3>
                <p><strong>IP Address:</strong> ${data.ip}</p>
                <p><strong>Windows Version:</strong> ${data.winVersion}</p>
                <p><strong>Status:</strong> ❌ Failed</p>
                <p><strong>Error:</strong> ${data.error}</p>
                <p><strong>Failed At:</strong> ${data.failedAt}</p>
            </div>
            
            <div class="refund">
                <strong>💰 Quota Refunded:</strong> Your quota has been automatically refunded to your account.
            </div>
            
            <div class="troubleshoot">
                <h3>🔧 Troubleshooting Steps</h3>
                <ul>
                    <li>Ensure your VPS is online and accessible</li>
                    <li>Verify your VPS root password is correct</li>
                    <li>Make sure your VPS is running Ubuntu 20/22 or Debian 12</li>
                    <li>Check that your VPS has sufficient disk space (at least 20GB)</li>
                    <li>Ensure your VPS has a stable internet connection</li>
                </ul>
            </div>
            
            <p>If you continue to experience issues, please contact our support team for assistance.</p>
        </div>
        <div class="footer">
            <p>© 2024 XME Projects. All rights reserved.</p>
            <p>Need help? Contact us at support@xmeprojects.com</p>
        </div>
    </div>
</body>
</html>
    `;

    await emailService.sendEmail({
      to: email,
      subject,
      text,
      html
    });
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

    await emailService.sendEmail({
      to: email,
      subject,
      text,
      html
    });
  }

  /**
   * Send generic notification email
   */
  private static async sendGenericNotificationEmail(
    email: string, 
    username: string, 
    notification: NotificationData
  ): Promise<void> {
    const subject = `${notification.title} - XME Projects`;
    
    const text = `
Hello ${username},

${notification.message}

Best regards,
The XME Projects Team
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${notification.title}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${notification.title}</h1>
        </div>
        <div class="content">
            <h2>Hello ${username}!</h2>
            <p>${notification.message}</p>
        </div>
        <div class="footer">
            <p>© 2024 XME Projects. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
    `;

    await emailService.sendEmail({
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
    // Send real-time notification to dashboard
    await this.notifyInstallStatusUpdate({
      installId: 0, // Will be set by caller
      userId,
      status: 'completed',
      message: `Windows installation completed successfully on ${installData.ip}`,
      timestamp: DateUtils.nowISO(),
      ip: installData.ip,
      winVersion: installData.winVersion
    });

    // Send completion email
    try {
      const db = getDatabase();
      const user = await db.get('SELECT email, username FROM users WHERE id = ?', [userId]);
      
      if (user) {
        await this.sendInstallCompletedEmail(user.email, user.username, {
          ip: installData.ip,
          winVersion: installData.winVersion,
          rdpPassword: installData.rdpPassword,
          completedAt: DateUtils.formatJakarta(DateUtils.now()) + ' WIB'
        });
      }
    } catch (error: any) {
      logger.error('Failed to send completion email:', error);
    }
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
    // Send real-time notification to dashboard
    await this.notifyInstallStatusUpdate({
      installId: 0, // Will be set by caller
      userId,
      status: 'failed',
      message: `Installation failed on ${installData.ip}: ${installData.error}`,
      timestamp: DateUtils.nowISO(),
      ip: installData.ip,
      winVersion: installData.winVersion
    });

    // Send failure email
    try {
      const db = getDatabase();
      const user = await db.get('SELECT email, username FROM users WHERE id = ?', [userId]);
      
      if (user) {
        await this.sendInstallFailedEmail(user.email, user.username, {
          ip: installData.ip,
          winVersion: installData.winVersion,
          error: installData.error,
          failedAt: DateUtils.formatJakarta(DateUtils.now()) + ' WIB'
        });
      }
    } catch (error: any) {
      logger.error('Failed to send failure email:', error);
    }
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
}