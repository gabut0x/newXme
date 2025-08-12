import { logger } from '../utils/logger.js';
import { getDatabase } from '../database/init.js';
import { DateUtils } from '../utils/dateUtils.js';
import crypto from 'crypto';

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TelegramMessage {
  message_id: number;
  from: TelegramUser;
  chat: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    type: string;
  };
  date: number;
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface ConnectionToken {
  id: string;
  user_id: number;
  token: string;
  expires_at: string;
  created_at: string;
}

export class TelegramService {
  private static get BOT_TOKEN(): string {
    // Check multiple possible sources
    const token = process.env['TELEGRAM_BOT_TOKEN'] || '';
    
    if (!token) {
      logger.error('TELEGRAM_BOT_TOKEN not found in environment variables');
      logger.error('Current working directory:', process.cwd());
      logger.error('Available TELEGRAM env vars:',
        Object.keys(process.env).filter(key => key.includes('TELEGRAM')));
      logger.error('Available env vars (first 10):',
        Object.keys(process.env).slice(0, 10));
    } else {
      logger.info(`Bot token loaded successfully (length: ${token.length})`);
    }
    
    return token;
  }
  
  private static get TELEGRAM_API_URL(): string {
    return `https://api.telegram.org/bot${this.BOT_TOKEN}`;
  }

  // Generate connection token for user
  static async generateConnectionToken(userId: number): Promise<{ token: string; link: string }> {
    const db = getDatabase();
    const token = crypto.randomBytes(32).toString('hex');
    const tokenId = crypto.randomUUID();
    const expiresAt = DateUtils.addMinutesJakarta(10); // 10 minutes expiry

    // Store connection token in database
    await db.run(`
      INSERT OR REPLACE INTO telegram_connection_tokens (id, user_id, token, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, [tokenId, userId, token, expiresAt, DateUtils.nowSQLite()]);

    const botUsername = process.env['TELEGRAM_BOT_USERNAME'] || 'winvpsautoTest_bot';
    const link = `https://t.me/${botUsername}?start=${token}`;

    logger.info('Generated Telegram connection token:', {
      userId,
      tokenId,
      expiresAt: expiresAt
    });

    return { token, link };
  }

  // Process /start command with connection token
  static async processStartCommand(telegramUserId: number, text: string, telegramUserData: TelegramUser): Promise<void> {
    const db = getDatabase();
    
    // Extract token from /start command
    const startMatch = text.match(/^\/start\s+(.+)$/);
    if (!startMatch) {
      // Regular start command without token
      await this.sendMessage(telegramUserId, 
        "Welcome to XME Projects! 🚀\n\n" +
        "To connect your account, please use the connection link from your dashboard settings."
      );
      return;
    }

    const token = startMatch[1];
    
    // Find connection token in database
    const connectionToken = await db.get(`
      SELECT * FROM telegram_connection_tokens 
      WHERE token = ? AND expires_at > ? AND used_at IS NULL
    `, [token, DateUtils.nowSQLite()]);

    if (!connectionToken) {
      await this.sendMessage(telegramUserId, 
        "❌ Connection token is invalid or expired.\n\n" +
        "Please generate a new connection link from your dashboard settings."
      );
      return;
    }

    // Mark token as used
    await db.run(`
      UPDATE telegram_connection_tokens 
      SET used_at = ?, telegram_user_id = ?
      WHERE id = ?
    `, [DateUtils.nowSQLite(), telegramUserId, connectionToken.id]);

    // Update user with Telegram information
    const telegramUsername = telegramUserData.username || `user_${telegramUserId}`;
    const displayName = `${telegramUserData.first_name}${telegramUserData.last_name ? ' ' + telegramUserData.last_name : ''}`;
    
    await db.run(`
      UPDATE users 
      SET telegram = ?, telegram_user_id = ?, telegram_display_name = ?, updated_at = ?
      WHERE id = ?
    `, [telegramUsername, telegramUserId, displayName, DateUtils.nowSQLite(), connectionToken.user_id]);

    // Get user information for welcome message
    const user = await db.get('SELECT username, email FROM users WHERE id = ?', [connectionToken.user_id]);

    await this.sendMessage(telegramUserId,
      `✅ Successfully connected to XME Projects!\n\n` +
      `🔗 Account: ${user.username}\n` +
      `📧 Email: ${user.email}\n\n` +
      `You will now receive notifications about your Windows installations. ` +
      `You can manage notification settings from your dashboard.`
    );

    logger.info('Telegram account connected successfully:', {
      userId: connectionToken.user_id,
      telegramUserId,
      telegramUsername,
      displayName
    });

    // Send real-time notification to user's dashboard using the same system as installation notifications
    try {
      const { NotificationService } = await import('./notificationService.js');
      
      // Send Telegram connection success notification
      NotificationService.sendRealTimeNotification(connectionToken.user_id, {
        type: 'telegram_connection_success',
        message: `🎉 Telegram Connected Successfully! Your account has been linked to ${displayName}.`,
        status: 'connected',
        timestamp: new Date().toISOString(),
        data: {
          telegramUsername: telegramUsername,
          displayName: displayName,
          telegramUserId: telegramUserId
        }
      });

      logger.info('Telegram connection success notification sent to user dashboard:', {
        userId: connectionToken.user_id,
        displayName
      });
    } catch (error) {
      logger.error('Failed to send real-time Telegram connection notification:', error);
    }
  }

  // Process other commands
  static async processCommand(telegramUserId: number, text: string): Promise<void> {
    const command = text.toLowerCase().trim();
    
    switch (command) {
      case '/help':
        await this.sendMessage(telegramUserId,
          "🤖 XME Projects Bot Commands:\n\n" +
          "/start - Connect your account\n" +
          "/status - Check connection status\n" +
          "/help - Show this help message\n\n" +
          "For more information, visit your dashboard settings."
        );
        break;
        
      case '/status':
        await this.checkConnectionStatus(telegramUserId);
        break;
        
      default:
        await this.sendMessage(telegramUserId,
          "❓ Unknown command. Use /help to see available commands."
        );
    }
  }

  // Check connection status
  static async checkConnectionStatus(telegramUserId: number): Promise<void> {
    const db = getDatabase();
    
    const user = await db.get(`
      SELECT username, email, telegram_notifications 
      FROM users 
      WHERE telegram_user_id = ?
    `, [telegramUserId]);

    if (user) {
      const notificationStatus = user.telegram_notifications ? '✅ Enabled' : '❌ Disabled';
      await this.sendMessage(telegramUserId,
        `📊 Connection Status:\n\n` +
        `🔗 Account: ${user.username}\n` +
        `📧 Email: ${user.email}\n` +
        `🔔 Notifications: ${notificationStatus}\n\n` +
        `You can manage settings from your dashboard.`
      );
    } else {
      await this.sendMessage(telegramUserId,
        "❌ Your Telegram account is not connected to any XME Projects account.\n\n" +
        "Please use the connection link from your dashboard settings to connect."
      );
    }
  }

  // Send message to user
  static async sendMessage(chatId: number, text: string): Promise<boolean> {
    if (!this.BOT_TOKEN) {
      logger.warn('Telegram bot token not configured');
      return false;
    }

    try {
      const response = await fetch(`${this.TELEGRAM_API_URL}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML'
        })
      });

      const result = await response.json();
      
      if (!result.ok) {
        logger.error('Failed to send Telegram message:', result);
        return false;
      }

      logger.debug('Telegram message sent successfully:', { chatId, textLength: text.length });
      return true;
    } catch (error) {
      logger.error('Error sending Telegram message:', error);
      return false;
    }
  }

  // Send installation notification
  static async sendInstallationNotification(userId: number, notification: {
    status: string;
    ip: string;
    winVersion: string;
    message: string;
  }): Promise<boolean> {
    const db = getDatabase();
    
    try {
      // Get user's Telegram settings
      const user = await db.get(`
        SELECT telegram_user_id, telegram_notifications, username
        FROM users
        WHERE id = ? AND telegram_user_id IS NOT NULL AND telegram_notifications = 1
      `, [userId]);

      if (!user) {
        logger.debug('User does not have Telegram notifications enabled:', { userId });
        return false;
      }

      // Get Windows version full name from database
      let windowsVersionName = notification.winVersion; // fallback to slug if query fails
      try {
        const windowsVersion = await db.get(`
          SELECT name FROM windows_versions WHERE slug = ?
        `, [notification.winVersion]);
        
        if (windowsVersion && windowsVersion.name) {
          windowsVersionName = windowsVersion.name;
        }
      } catch (versionError) {
        logger.warn('Failed to get Windows version name:', {
          slug: notification.winVersion,
          error: versionError instanceof Error ? versionError.message : versionError
        });
      }

      // Format notification message
      const statusEmoji = this.getStatusEmoji(notification.status);
      const message =
        `${statusEmoji} Installation Update\n\n` +
        `📋 Status: ${notification.status.toUpperCase()}\n` +
        `🖥️ Server: ${notification.ip}\n` +
        `💻 Windows: ${windowsVersionName}\n\n` +
        `${notification.message}\n\n` +
        `Check your dashboard for more details.`;

      return await this.sendMessage(user.telegram_user_id, message);
    } catch (error) {
      logger.error('Error sending installation notification:', error);
      return false;
    }
  }

  // Get status emoji
  private static getStatusEmoji(status: string): string {
    switch (status.toLowerCase()) {
      case 'completed': return '✅';
      case 'running': return '⚡';
      case 'pending': return '⏳';
      case 'failed': return '❌';
      case 'preparing': return '🔄';
      default: return '📋';
    }
  }

  // Process webhook update
  static async processUpdate(update: TelegramUpdate): Promise<void> {
    try {
      if (!update.message) {
        logger.debug('Received Telegram update without message');
        return;
      }

      const message = update.message;
      const telegramUserId = message.from.id;
      const text = message.text || '';

      logger.info('Processing Telegram message:', {
        telegramUserId,
        username: message.from.username,
        text: text.substring(0, 50) + (text.length > 50 ? '...' : '')
      });

      if (text.startsWith('/start')) {
        await this.processStartCommand(telegramUserId, text, message.from);
      } else if (text.startsWith('/')) {
        await this.processCommand(telegramUserId, text);
      } else {
        // Regular message
        await this.sendMessage(telegramUserId, 
          "👋 Hello! I'm the XME Projects bot.\n\n" +
          "Use /help to see available commands or visit your dashboard to manage your account."
        );
      }
    } catch (error) {
      logger.error('Error processing Telegram update:', error);
    }
  }

  // Set webhook URL
  static async setWebhook(webhookUrl: string): Promise<boolean> {
    if (!this.BOT_TOKEN) {
      logger.warn('Telegram bot token not configured');
      return false;
    }

    try {
      const response = await fetch(`${this.TELEGRAM_API_URL}/setWebhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ['message']
        })
      });

      const result = await response.json();
      
      if (result.ok) {
        logger.info('Telegram webhook set successfully:', { webhookUrl });
        return true;
      } else {
        logger.error('Failed to set Telegram webhook:', result);
        return false;
      }
    } catch (error) {
      logger.error('Error setting Telegram webhook:', error);
      return false;
    }
  }

  // Get bot info
  static async getBotInfo(): Promise<any> {
    if (!this.BOT_TOKEN) {
      logger.error('No Telegram bot token configured');
      return null;
    }

    try {
      const url = `${this.TELEGRAM_API_URL}/getMe`;
      logger.debug('Getting bot info from:', { url: url.replace(this.BOT_TOKEN, 'HIDDEN') });
      
      const response = await fetch(url);
      const result = await response.json();
      
      logger.debug('Bot info API response:', {
        ok: result.ok,
        errorCode: result.error_code,
        description: result.description,
        botId: result.result?.id
      });
      
      if (!result.ok) {
        logger.error('Telegram Bot API error:', {
          errorCode: result.error_code,
          description: result.description
        });
      }
      
      return result.ok ? result.result : null;
    } catch (error) {
      logger.error('Error getting bot info:', error);
      return null;
    }
  }

  // Get webhook info
  static async getWebhookInfo(): Promise<any> {
    if (!this.BOT_TOKEN) {
      return null;
    }

    try {
      const response = await fetch(`${this.TELEGRAM_API_URL}/getWebhookInfo`);
      const result = await response.json();
      return result.ok ? result.result : null;
    } catch (error) {
      logger.error('Error getting webhook info:', error);
      return null;
    }
  }

  // Delete webhook (for switching to long polling)
  static async deleteWebhook(): Promise<boolean> {
    if (!this.BOT_TOKEN) {
      return false;
    }

    try {
      const response = await fetch(`${this.TELEGRAM_API_URL}/deleteWebhook`, {
        method: 'POST'
      });

      const result = await response.json();
      return result.ok;
    } catch (error) {
      logger.error('Error deleting webhook:', error);
      return false;
    }
  }

}