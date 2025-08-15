import TelegramBot from 'node-telegram-bot-api';
import { logger } from '../utils/logger.js';
import { getDatabase } from '../database/init.js';
import { DateUtils } from '../utils/dateUtils.js';
import { apiService } from './apiService.js';
import { BotSecurity } from '../utils/botSecurity.js';
import { RateLimiter } from '../utils/rateLimiter.js';
import crypto from 'crypto';

// Telegram interfaces
interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface ConnectionToken {
  id: string;
  user_id: number;
  token: string;
  expires_at: string;
  created_at: string;
}

interface BotStatus {
  isRunning: boolean;
  startedAt?: Date;
  lastActivity?: Date;
  messageCount: number;
  errorCount: number;
  commandCount: number;
  userCount: number;
  lastError?: string;
  lastErrorAt?: Date;
}

interface BotMetrics {
  totalMessages: number;
  totalCommands: number;
  totalErrors: number;
  uniqueUsers: Set<number>;
  commandStats: Map<string, number>;
  errorStats: Map<string, number>;
  dailyStats: Map<string, { messages: number; commands: number; errors: number }>;
}

interface UserSession {
  userId: number;
  telegramUserId: number;
  currentAction?: string;
  data?: any;
  lastActivity: Date;
}

class TelegramBotService {
  private static bot: TelegramBot | null = null;
  private static security = BotSecurity.getInstance();
  private static rateLimiter = RateLimiter.getInstance();
  private static status: BotStatus = {
    isRunning: false,
    messageCount: 0,
    errorCount: 0,
    commandCount: 0,
    userCount: 0
  }

  // Handle topup process with specified quota quantity
  private static async handleTopupProcess(chatId: number, user: any, quantity: number): Promise<void> {
    if (quantity < 1) {
      await TelegramBotService.sendMessage(chatId,
        '❌ Jumlah quota terlalu kecil. Minimal 1 quota\n\n' +
        '💡 Contoh: /topup 5'
      );
      return;
    }

    if (quantity > 100) {
      await TelegramBotService.sendMessage(chatId,
        '❌ Jumlah quota terlalu besar. Maksimal 100 quota\n\n' +
        '💡 Contoh: /topup 20'
      );
      return;
    }

    try {
      // Step 1: Calculate topup amount using API
      await TelegramBotService.sendMessage(chatId, '🔄 Menghitung harga...');
      
      const calculationResponse = await fetch('http://localhost:5173/api/user/topup/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await TelegramBotService.generateUserToken(user.id)}`
        },
        body: JSON.stringify({ quantity })
      });

      if (!calculationResponse.ok) {
        throw new Error('Failed to calculate topup amount');
      }

      const calculationData = await calculationResponse.json();
      const calculation = calculationData.data;

      let discountText = '';
      if (calculation.discount_percentage > 0) {
        discountText = `\n🎉 Diskon ${calculation.discount_percentage}%: -Rp ${calculation.discount_amount.toLocaleString('id-ID')}`;
      }

      // Show calculation and ask for payment method
      const keyboard = {
        inline_keyboard: [
          [{ text: '💳 QRIS', callback_data: `topup_qris_${quantity}` }],
          [{ text: '🏦 Bank Transfer', callback_data: `topup_bank_${quantity}` }],
          [{ text: '❌ Batal', callback_data: 'topup_cancel' }]
        ]
      };

      await TelegramBotService.sendMessage(chatId,
        `💰 Konfirmasi Topup Quota\n\n` +
        `🎯 Jumlah Quota: ${quantity}\n` +
        `💵 Harga Normal: Rp ${calculation.total_amount.toLocaleString('id-ID')}${discountText}\n` +
        `💳 Total Bayar: Rp ${calculation.final_amount.toLocaleString('id-ID')}\n\n` +
        `Pilih metode pembayaran:`,
        { reply_markup: keyboard }
      );

      // Store user session for payment processing
      TelegramBotService.updateUserSession(user.telegram_user_id, {
        userId: user.id,
        telegramUserId: user.telegram_user_id,
        currentAction: 'topup_payment',
        data: { quantity, calculation },
        lastActivity: new Date()
      });

    } catch (error) {
      logger.error('Error in topup process:', error);
      await TelegramBotService.sendMessage(chatId,
        '❌ Terjadi kesalahan saat menghitung harga topup.\n\n' +
        'Silakan coba lagi nanti atau hubungi admin.'
      );
    }
  };
  private static metrics: BotMetrics = {
    totalMessages: 0,
    totalCommands: 0,
    totalErrors: 0,
    uniqueUsers: new Set<number>(),
    commandStats: new Map<string, number>(),
    errorStats: new Map<string, number>(),
    dailyStats: new Map<string, { messages: number; commands: number; errors: number }>()
  };
  private static userSessions: Map<number, UserSession> = new Map();
  private static readonly webhookUrl: string = process.env.WEBHOOK_URL || '';

  // Get bot token dynamically to ensure environment variables are loaded
  private static get botToken(): string {
    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    if (!token) {
      logger.error('TELEGRAM_BOT_TOKEN not found in environment variables');
      logger.error('Available env vars containing TELEGRAM:', 
        Object.keys(process.env).filter(key => key.includes('TELEGRAM')));
    }
    return token;
  }

  // Private constructor to prevent instantiation
  private constructor() {
    // This class is now fully static
  }

  // Get bot token and API URL
  private static get TELEGRAM_API_URL(): string {
    return `https://api.telegram.org/bot${this.botToken}`;
  }

  // Webhook methods removed - using polling mode only

  // Method getWebhookInfo removed - using polling mode only

  // Method deleteWebhook removed - using polling mode only

  static async getBotInfo(): Promise<any> {
    const botToken = this.botToken;
    if (!botToken) {
      logger.error('No Telegram bot token configured');
      return null;
    }

    try {
      const url = `https://api.telegram.org/bot${botToken}/getMe`;
      logger.debug('Getting bot info from:', { url: url.replace(botToken, 'HIDDEN') });
      
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

  static async setMyCommands(): Promise<boolean> {
    const botToken = this.botToken;
    if (!botToken) {
      logger.error('No Telegram bot token configured');
      return false;
    }

    const commands = [
      { command: 'start', description: 'Connect your account' },
      { command: 'menu', description: 'Show main menu' },
      { command: 'topup', description: 'Topup quota' },
      { command: 'install', description: 'Install Windows' },
      { command: 'myquota', description: 'Check quota and statistics' },
      { command: 'winver', description: 'Show Windows versions info' },
      { command: 'status', description: 'Check connection status' },
      { command: 'help', description: 'Show this help message' },
      { command: 'cancel', description: 'Cancel current operation' }
    ];

    try {
      const url = `https://api.telegram.org/bot${botToken}/setMyCommands`;
      logger.debug('Setting bot commands:', { url: url.replace(botToken, 'HIDDEN'), commands });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ commands })
      });

      const result = await response.json();
      
      logger.debug('Set commands API response:', {
        ok: result.ok,
        errorCode: result.error_code,
        description: result.description
      });
      
      if (result.ok) {
        logger.info('Telegram bot commands set successfully', { commands });
      } else {
        logger.error('Failed to set Telegram bot commands:', {
          errorCode: result.error_code,
          description: result.description
        });
      }
      
      return result.ok;
    } catch (error) {
      logger.error('Error setting bot commands:', error);
      return false;
    }
  }

  static async getMyCommands(): Promise<any> {
    const botToken = this.botToken;
    if (!botToken) {
      logger.error('No Telegram bot token configured');
      return null;
    }

    try {
      const url = `https://api.telegram.org/bot${botToken}/getMyCommands`;
      logger.debug('Getting bot commands:', { url: url.replace(botToken, 'HIDDEN') });
      
      const response = await fetch(url);
      const result = await response.json();
      
      logger.debug('Get commands API response:', {
        ok: result.ok,
        commands: result.result,
        errorCode: result.error_code,
        description: result.description
      });
      
      if (!result.ok) {
        logger.error('Telegram Bot API error in getMyCommands:', {
          errorCode: result.error_code,
          description: result.description
        });
      }
      
      return result.ok ? result.result : null;
    } catch (error) {
      logger.error('Error getting bot commands:', error);
      return null;
    }
  }

  // Connection token management
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

  // Enhanced sendMessage with rate limiting
  static async sendTelegramMessage(chatId: number, text: string): Promise<boolean> {
    if (!this.botToken) {
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
      // Get user's Telegram settings and RDP password for completed installations
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
      let message =
        `${statusEmoji} Installation Update\n\n` +
        `📋 Status: ${notification.status.toUpperCase()}\n` +
        `🖥️ Server: ${notification.ip}\n` +
        `💻 Windows: ${windowsVersionName}\n\n` +
        `${notification.message}`;

      // Add RDP connection details for completed installations
      if (notification.status.toLowerCase() === 'completed') {
        try {
          // Get RDP password from install_data
          const installData = await db.get(`
            SELECT passwd_rdp FROM install_data
            WHERE ip = ? AND status = 'completed' AND user_id = ?
            ORDER BY updated_at DESC LIMIT 1
          `, [notification.ip, userId]);

          if (installData && installData.passwd_rdp) {
            message += `\n\n🔐 <b>RDP Connection Details:</b>\n` +
                      `<b>Server:</b> <code>${notification.ip}:22</code>\n` +
                      `<b>Username:</b> <code>Administrator</code>\n` +
                      `<b>Password:</b> <code>${installData.passwd_rdp}</code>\n\n` +
                      `💡 <i>Tap to copy the connection details above</i>`;
          }
        } catch (rdpError) {
          logger.warn('Failed to get RDP password for completed installation:', rdpError);
        }
      }

      message += `\n\nCheck your dashboard for more details.`;

      return await this.sendTelegramMessage(user.telegram_user_id, message);
    } catch (error) {
      logger.error('Error sending installation notification:', error);
      return false;
    }
  }

  // Start bot with configurable mode (webhook or polling)
  // Simple polling mode like GitHub tutorial
  static async startBot(usePolling: boolean = true): Promise<{ success: boolean; message: string }> {
    try {
      if (TelegramBotService.status.isRunning) {
        logger.warn('Bot is already running');
        return { success: false, message: 'Bot is already running' };
      }

      if (!TelegramBotService.botToken) {
        throw new Error('Bot token is not configured');
      }

      // Create bot instance with simple polling like tutorial
      TelegramBotService.bot = new TelegramBot(TelegramBotService.botToken, { polling: true });
      
      // Setup simple event handlers like tutorial
      TelegramBotService.setupSimpleEventHandlers();
      
      TelegramBotService.status = {
        isRunning: true,
        startedAt: new Date(),
        lastActivity: new Date(),
        messageCount: 0,
        errorCount: 0,
        commandCount: 0,
        userCount: 0
      };

      logger.info('Telegram Bot started successfully with simple polling mode');
      return { success: true, message: 'Bot started successfully with polling' };
    } catch (error) {
      logger.error('Failed to start Telegram Bot:', error);
      TelegramBotService.status.errorCount++;
      return { success: false, message: `Failed to start bot: ${error}` };
    }
  }

  // Stop bot
  static async stopBot(): Promise<{ success: boolean; message: string }> {
    try {
      if (!TelegramBotService.status.isRunning || !TelegramBotService.bot) {
        logger.warn('Bot is not running');
        return { success: false, message: 'Bot is not running' };
      }

      // Stop polling if bot is using polling mode
      try {
        await TelegramBotService.bot.stopPolling();
        logger.info('Bot polling stopped successfully');
      } catch (error) {
        logger.warn('Error stopping polling (may not be in polling mode):', error);
      }
      
      TelegramBotService.bot = null;
      TelegramBotService.status.isRunning = false;
      TelegramBotService.userSessions.clear();

      TelegramBotService.logActivity('bot_stopped', {
        uptime: TelegramBotService.status.startedAt 
          ? Date.now() - TelegramBotService.status.startedAt.getTime() 
          : 0,
        totalMessages: TelegramBotService.metrics.totalMessages,
        totalCommands: TelegramBotService.metrics.totalCommands
      });

      logger.info('Telegram Bot stopped successfully');
      return { success: true, message: 'Bot stopped successfully' };
    } catch (error) {
      logger.error('Failed to stop Telegram Bot:', error);
      TelegramBotService.status.errorCount++;
      return { success: false, message: `Failed to stop bot: ${error}` };
    }
  }

  // Restart bot
  static async restartBot(): Promise<{ success: boolean; message: string }> {
    try {
      logger.info('Restarting Telegram Bot...');
      const stopResult = await TelegramBotService.stopBot();
      if (!stopResult.success) {
        return { success: false, message: `Failed to stop bot: ${stopResult.message}` };
      }
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      const startResult = await TelegramBotService.startBot();
      if (startResult.success) {
        logger.info('Telegram bot restarted successfully');
        return { success: true, message: 'Bot restarted successfully' };
      } else {
        logger.error('Failed to restart Telegram bot');
        return { success: false, message: `Failed to restart bot: ${startResult.message}` };
      }
    } catch (error) {
      logger.error('Failed to restart Telegram Bot:', error);
      return { success: false, message: `Failed to restart bot: ${error}` };
    }
  }

  // Get bot status
  static getStatus(): BotStatus {
    return { ...TelegramBotService.status };
  }

  // Handle webhook update from Telegram
  // Method handleWebhookUpdate removed - using polling mode only

  // Get bot statistics
  static getStats() {
    const uptime = TelegramBotService.status.startedAt 
      ? Date.now() - TelegramBotService.status.startedAt.getTime() 
      : 0;
    
    // Update user count
    TelegramBotService.status.userCount = TelegramBotService.metrics.uniqueUsers.size;
    
    return {
      isRunning: TelegramBotService.status.isRunning,
      startedAt: TelegramBotService.status.startedAt,
      lastActivity: TelegramBotService.status.lastActivity,
      messageCount: TelegramBotService.status.messageCount,
      errorCount: TelegramBotService.status.errorCount,
      commandCount: TelegramBotService.status.commandCount,
      userCount: TelegramBotService.status.userCount,
      uptime: uptime,
      uptimeFormatted: TelegramBotService.formatUptime(uptime),
      activeSessions: TelegramBotService.userSessions.size,
      metrics: {
        totalMessages: TelegramBotService.metrics.totalMessages,
        totalCommands: TelegramBotService.metrics.totalCommands,
        totalErrors: TelegramBotService.metrics.totalErrors,
        uniqueUsers: TelegramBotService.metrics.uniqueUsers.size,
        commandStats: Object.fromEntries(TelegramBotService.metrics.commandStats),
        errorStats: Object.fromEntries(TelegramBotService.metrics.errorStats),
        dailyStats: Object.fromEntries(TelegramBotService.metrics.dailyStats)
      }
    };
  }

  // Format uptime in human readable format
  private static formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  // Simple event handlers like GitHub tutorial
  private static setupSimpleEventHandlers(): void {
    if (!TelegramBotService.bot) return;

    // Handle /start command
    TelegramBotService.bot.onText(/\/start(.*)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      const token = match?.[1]?.trim();
      
      if (!userId) return;
      
      // Get user from database
      const user = await TelegramBotService.getUserByTelegramId(userId);
      
      // Build full command for token processing
      const fullCommand = token ? `/start ${token}` : '/start';
      
      await TelegramBotService.handleStartCommand(chatId, user, fullCommand);
    });

    // Handle /help command
    TelegramBotService.bot.onText(/\/help/, async (msg) => {
      const chatId = msg.chat.id;
      const helpText = `Available commands:\n/start - Start the bot\n/status - Check your account status\n/topup - Top up your account\n/help - Show this help message`;
      await TelegramBotService.bot?.sendMessage(chatId, helpText);
    });

    // Handle /status command
    TelegramBotService.bot.onText(/\/status/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id;
      
      if (!userId) return;
      
      // Get user from database
      const user = await TelegramBotService.getUserByTelegramId(userId);
      
      if (!user) {
        await TelegramBotService.sendMessage(chatId, 
          '❌ Akun Anda belum terhubung dengan sistem.\n\n' +
          'Silakan hubungkan akun Telegram Anda melalui dashboard web terlebih dahulu.'
        );
        return;
      }
      
      await TelegramBotService.handleStatusCommand(chatId, user);
    });

    // /topup command is handled in handleCommand method

    // Handle all other messages
    TelegramBotService.bot.on('message', async (msg) => {
      if (!msg.text?.startsWith('/')) {
        const chatId = msg.chat.id;
        await TelegramBotService.bot?.sendMessage(chatId, 'Please use /help to see available commands.');
      }
    });

    logger.info('Simple event handlers setup completed');
  }

  // Handle connection token for simple polling
  private static async handleConnectionToken(chatId: number, token: string, user: any): Promise<void> {
    try {
      if (!user) {
        await TelegramBotService.bot?.sendMessage(chatId, 'User information not available.');
        return;
      }

      // Find user by connection token
      const db = getDatabase();
      const connectionToken = await db.get(
        'SELECT * FROM telegram_connection_tokens WHERE token = ? AND expires_at > ? AND used_at IS NULL',
        [token, DateUtils.nowSQLite()]
      );

      if (!connectionToken) {
        await TelegramBotService.bot?.sendMessage(chatId, 'Invalid or expired connection token.');
        return;
      }

      // Update user with Telegram info
      const displayName = `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}`;
      await db.run(
        'UPDATE users SET telegram_user_id = ?, telegram_display_name = ?, telegram = ? WHERE id = ?',
        [user.id, displayName, user.username || null, connectionToken.user_id]
      );

      // Mark token as used
      await db.run('UPDATE telegram_connection_tokens SET used_at = ? WHERE token = ?', [DateUtils.nowSQLite(), token]);

      await TelegramBotService.bot?.sendMessage(chatId, 'Account successfully connected! You can now use bot commands.');
    } catch (error) {
      logger.error('Error handling connection token:', error);
      await TelegramBotService.bot?.sendMessage(chatId, 'Error connecting account. Please try again.');
    }
  }

  // Handle incoming messages
  private static async handleMessage(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const text = msg.text;
    const userId = msg.from?.id;

    if (!userId || !text) return;

    // Update metrics
    TelegramBotService.updateMetrics('message', userId, text);

    logger.info('Received message:', {
      chatId,
      userId,
      text: text.substring(0, 100),
      username: msg.from?.username
    });

    // Get user from database
    const user = await TelegramBotService.getUserByTelegramId(userId);
    
    if (!user && !text.startsWith('/start')) {
      await TelegramBotService.sendMessage(chatId, 
        '❌ Akun Anda belum terhubung dengan sistem.\n\n' +
        'Silakan hubungkan akun Telegram Anda melalui dashboard web terlebih dahulu.'
      );
      return;
    }

    // Handle commands
    if (text.startsWith('/')) {
      await TelegramBotService.handleCommand(chatId, text, user);
    } else {
      // Handle text input based on current session
      await TelegramBotService.handleTextInput(chatId, text, user);
    }
  }

  // Handle commands
  private static async handleCommand(chatId: number, command: string, user: any): Promise<void> {
    const cmd = command.split(' ')[0].toLowerCase();
    const args = command.split(' ').slice(1);

    // Handle /start command (for both registered and unregistered users)
    if (cmd === '/start') {
      await TelegramBotService.handleStartCommand(chatId, user, command);
      return;
    }
    
    if (cmd === '/winver') {
      await TelegramBotService.handleWinverCommand(chatId, user);
      return;
    }

    // For other commands, user must be registered
    if (!user) {
      await TelegramBotService.sendMessage(chatId, 
        '❌ Akun Anda belum terhubung dengan sistem.\n\n' +
        'Silakan hubungkan akun Telegram Anda melalui dashboard web terlebih dahulu.'
      );
      return;
    }

    // Security check
    const securityContext = {
      userId: user.id,
      username: user.username,
      chatId: chatId,
      command: cmd,
      args: args
    };

    const securityResult = await TelegramBotService.security.checkSecurity(securityContext);
    
    if (!securityResult.allowed) {
      await TelegramBotService.sendMessage(chatId, 
        `🚫 ${securityResult.reason || 'Command not allowed'}`
      );
      
      // Log security violation
      await TelegramBotService.security.logCommand(securityContext, 'failed', securityResult.reason);
      
      TelegramBotService.updateMetrics('error', user.id, { type: 'security_violation', command: cmd });
      return;
    }

    // Update command metrics
    TelegramBotService.status.commandCount++;
    TelegramBotService.metrics.totalCommands++;
    TelegramBotService.updateCommandStats(cmd);
    
    // Log command activity
    TelegramBotService.logActivity('command_executed', {
      command: cmd,
      userId: user.id,
      telegramUserId: user.telegram_user_id,
      username: user.username,
      rateLimitInfo: securityResult.rateLimitInfo
    });

    try {
      switch (cmd) {
        case '/menu':
          await TelegramBotService.showMainMenu(chatId, user);
          break;
        case '/topup':
          await TelegramBotService.handleTopupCommand(chatId, user, args);
          break;
        case '/install':
          await TelegramBotService.handleInstallCommand(chatId, user, args);
          break;
        case '/myquota':
          await TelegramBotService.handleMyQuotaCommand(chatId, user);
          break;
        case '/status':
          await TelegramBotService.handleStatusCommand(chatId, user);
          break;
        case '/help':
          await TelegramBotService.handleHelpCommand(chatId);
          break;
        case '/cancel':
          await TelegramBotService.handleCancelCommand(chatId, user);
          break;
        default:
          await TelegramBotService.sendMessage(chatId, 
            '❓ Perintah tidak dikenali.\n\n' +
            'Ketik /help untuk melihat daftar perintah yang tersedia.'
          );
          await TelegramBotService.security.logCommand(securityContext, 'failed', 'Unknown command');
          return;
      }
      
      // Log successful command execution
      await TelegramBotService.security.logCommand(securityContext, 'success');
      
    } catch (error) {
      logger.error('Command execution failed', { error, command: cmd, userId: user.id });
      
      await TelegramBotService.sendMessage(chatId, 
        '❌ Terjadi kesalahan saat memproses perintah. Silakan coba lagi nanti.'
      );
      
      // Log failed command execution
      await TelegramBotService.security.logCommand(securityContext, 'failed', error.message);
      
      TelegramBotService.updateMetrics('error', user.id, { type: 'command_execution_error', command: cmd, error: error.message });
    }
  }

  // Handle start command
  private static async handleStartCommand(chatId: number, user: any, fullCommand?: string): Promise<void> {
    // Check if there's a connection token in the command first
    if (fullCommand && fullCommand.includes(' ')) {
      const startMatch = fullCommand.match(/^\/start\s+(.+)$/);
      if (startMatch) {
        const token = startMatch[1];
        await TelegramBotService.processConnectionToken(chatId, token, user);
        return;
      }
    }

    // If user is already connected and no token provided, show welcome message
    if (user) {
      await TelegramBotService.sendMessage(chatId,
        `👋 Selamat datang kembali di XME Projects Bot!\n\n` +
        `🔗 Akun Terhubung: ${user.username}\n` +
        `📧 Email: ${user.email}\n` +
        `💰 Quota saat ini: ${user.quota}\n\n` +
        `🤖 Bot telah diperbarui ke sistem berbasis perintah!\n\n` +
        `📝 Perintah yang tersedia:\n` +
        `• /menu - Menu utama\n` +
        `• /topup [jumlah] - Topup quota (contoh: /topup 5)\n` +
        `• /install [ip] [pass] [winver] [rdppass] - Install Windows\n` +
        `• /myquota - Cek quota Anda\n` +
        `• /status - Status akun\n` +
        `• /winver - Info versi Windows server\n` +
        `• /help - Bantuan lengkap\n\n` +
        `💡 Tip: Gunakan perintah langsung untuk akses yang lebih cepat!`
      );
      return;
    }

    // Handle /start without token - user not connected
    await TelegramBotService.sendMessage(chatId,
      '👋 Selamat datang di XME Projects Bot!\n\n' +
      '🔗 Untuk menggunakan bot ini, Anda perlu menghubungkan akun Telegram dengan akun XME Projects Anda.\n\n' +
      '📱 Silakan buka dashboard web dan pilih "Connect Telegram" di pengaturan akun Anda.\n\n' +
      '🤖 Bot menggunakan sistem berbasis perintah untuk kemudahan penggunaan!'
    );
  }

  // Process connection token for /start command
  private static async processConnectionToken(chatId: number, token: string, existingUser: any): Promise<void> {
    try {
      const { getDatabase } = await import('../database/init.js');
      const { DateUtils } = await import('../utils/dateUtils.js');
      const db = getDatabase();
      
      // Find connection token in database
      const connectionToken = await db.get(`
        SELECT * FROM telegram_connection_tokens 
        WHERE token = ? AND expires_at > ? AND used_at IS NULL
      `, [token, DateUtils.nowSQLite()]);

      if (!connectionToken) {
        await TelegramBotService.sendMessage(chatId,
          '❌ Connection token is invalid or expired.\n\n' +
          'Please generate a new connection link from your dashboard settings.'
        );
        return;
      }

      // Mark token as used
      await db.run(`
        UPDATE telegram_connection_tokens 
        SET used_at = ?, telegram_user_id = ?
        WHERE id = ?
      `, [DateUtils.nowSQLite(), chatId, connectionToken.id]);

      // Get basic telegram user data (we don't have full user data in bot service)
      const telegramUsername = `user_${chatId}`;
      const displayName = 'Telegram User';
      
      // Update user with Telegram information
      await db.run(`
        UPDATE users 
        SET telegram = ?, telegram_user_id = ?, telegram_display_name = ?, updated_at = ?
        WHERE id = ?
      `, [telegramUsername, chatId, displayName, DateUtils.nowSQLite(), connectionToken.user_id]);

      // Get user information for welcome message
      const user = await db.get('SELECT username, email FROM users WHERE id = ?', [connectionToken.user_id]);

      await TelegramBotService.sendMessage(chatId,
        `✅ Successfully connected to XME Projects!\n\n` +
        `🔗 Account: ${user.username}\n` +
        `📧 Email: ${user.email}\n\n`
      );

      logger.info('Telegram account connected successfully:', {
        userId: connectionToken.user_id,
        telegramUserId: chatId,
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
            telegramUserId: chatId
          }
        });

        logger.info('Telegram connection success notification sent to user dashboard:', {
          userId: connectionToken.user_id,
          displayName
        });
      } catch (error) {
        logger.error('Failed to send real-time Telegram connection notification:', error);
      }
      
    } catch (error) {
      logger.error('Error processing connection token:', error);
      await TelegramBotService.sendMessage(chatId,
        '❌ Terjadi kesalahan saat menghubungkan akun.\n\n' +
        '🔄 Silakan coba lagi atau hubungi support jika masalah berlanjut.'
      );
    }
  }

  // Show main menu
  private static async showMainMenu(chatId: number, user: any): Promise<void> {
    if (!user) {
      await TelegramBotService.handleStartCommand(chatId, null);
      return;
    }

    await TelegramBotService.sendMessage(chatId,
      `👋 Halo ${user.username}!\n\n` +
      `💰 Quota saat ini: ${user.quota}\n` +
      `📧 Email: ${user.email}\n\n` +
      '🎯 Gunakan command berikut:\n\n' +
      '💰 /topup [jumlah] - Topup quota\n' +
      '🖥️ /install [ip] [password_vps] [win_ver] [password_rdp] - Install Windows\n' +
      '📊 /myquota - Cek status akun\n' +
      '📋 /status - Status koneksi\n' +
      '❓ /help - Bantuan'
    );
  }

  // Handle callback queries
  private static async handleCallbackQuery(query: TelegramBot.CallbackQuery): Promise<void> {
    const chatId = query.message?.chat.id;
    const data = query.data;
    const userId = query.from.id;

    if (!chatId || !data) return;

    // Answer callback query to remove loading state
    await TelegramBotService.bot?.answerCallbackQuery(query.id);

    const user = await TelegramBotService.getUserByTelegramId(userId);
    if (!user) {
      await TelegramBotService.sendMessage(chatId, '❌ Akun tidak ditemukan. Silakan hubungkan akun Anda terlebih dahulu.');
      return;
    }

    // Handle topup callbacks
    if (data.startsWith('topup_')) {
      await TelegramBotService.handleTopupCallback(chatId, user, data);
      return;
    }

    // Handle other callbacks
    if (data === 'back_to_menu') {
      await TelegramBotService.showMainMenu(chatId, user);
      return;
    }

    // Default fallback
    await TelegramBotService.sendMessage(chatId, 
      '⚠️ Callback tidak dikenali.\n\n' +
      'Gunakan perintah berikut:\n' +
      '• /menu - Menu utama\n' +
      '• /topup [jumlah] - Topup quota\n' +
      '• /install [ip] [pass] [winver] [rdppass] - Install Windows\n' +
      '• /myquota - Cek quota\n' +
      '• /status - Status akun\n' +
      '• /help - Bantuan'
    );
  }

  // Handle topup command
  private static async handleTopupCommand(chatId: number, user: any, args: string[] = []): Promise<void> {
    // Check if user provided quantity parameter: /topup [quantity]
    if (args.length === 1) {
      const quantity = parseInt(args[0]);
      if (isNaN(quantity) || quantity <= 0) {
        await this.sendMessage(chatId,
          '❌ Jumlah quota tidak valid.\n\n' +
          '💡 Contoh penggunaan: /topup 5'
        );
        return;
      }
      
      // Process topup with specified quantity
      await TelegramBotService.handleTopupProcess(chatId, user, quantity);
      return;
    }

    // Show usage instructions
    await this.sendMessage(chatId,
      '💰 Topup Quota\n\n' +
      `💰 Quota saat ini: ${user.quota}\n\n` +
      '💡 Gunakan format: /topup [jumlah_quota]\n\n' +
      '📝 Contoh:\n' +
      '• /topup 1 (Rp 5.000)\n' +
      '• /topup 5 (Rp 21.200 - diskon 12%)\n' +
      '• /topup 10 (Rp 40.000 - diskon 20%)\n' +
      '• /topup 20 (Rp 70.000 - diskon 30%)\n\n' +
      '🎉 Semakin banyak quota, semakin besar diskonnya!'
    );
  }

  // Handle install command
  private static async handleInstallCommand(chatId: number, user: any, args: string[] = []): Promise<void> {
    // Check if user provided parameters: /install [ipVPS] [passwdVPS] [winver] [passwdRDP]
    if (args.length === 4) {
      const [ipVPS, passwdVPS, winver, passwdRDP] = args;
      await TelegramBotService.handleDirectInstall(chatId, user, ipVPS, passwdVPS, winver, passwdRDP);
      return;
    }

    // Show usage instructions
    if (user.quota <= 0) {
      await TelegramBotService.sendMessage(chatId,
        '❌ Quota Anda tidak mencukupi untuk install Windows.\n\n' +
        '💰 Silakan topup quota terlebih dahulu dengan /topup [jumlah]'
      );
      return;
    }

    await TelegramBotService.sendMessage(chatId,
      '🖥️ Install Windows\n\n' +
      `💰 Quota saat ini: ${user.quota}\n` +
      '💸 Biaya install: 1 quota\n\n' +
      '📝 Format penggunaan:\n' +
      '/install [ipVPS] [passwdVPS] [winver] [passwdRDP]\n\n' +
      '🪟 Versi Windows yang tersedia:\n' +
      '• win10 - Windows 10\n' +
      '• win11 - Windows 11\n' +
      '• server2019 - Windows Server 2019\n' +
      '• server2022 - Windows Server 2022\n\n' +
      '💡 Contoh:\n' +
      '/install 192.168.1.100 mypassword123 win10 rdppassword123'
    );
  }

  // Handle direct install with parameters
  private static async handleDirectInstall(chatId: number, user: any, ipVPS: string, passwdVPS: string, winver: string, passwdRDP: string): Promise<void> {
    try {
      // Validate quota
      if (user.quota <= 0) {
        await TelegramBotService.sendMessage(chatId, '❌ Quota tidak mencukupi untuk install Windows.');
        return;
      }

      // Validate IP format
      const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      if (!ipRegex.test(ipVPS)) {
        await TelegramBotService.sendMessage(chatId, '❌ Format IP VPS tidak valid. Contoh: 192.168.1.100');
        return;
      }

      // Validate Windows version
      const validVersions = ['win10', 'win11', 'server2019', 'server2022'];
      if (!validVersions.includes(winver.toLowerCase())) {
        await TelegramBotService.sendMessage(chatId, 
          '❌ Versi Windows tidak valid.\n\n' +
          'Versi yang didukung:\n' +
          '• win10 - Windows 10\n' +
          '• win11 - Windows 11\n' +
          '• server2019 - Windows Server 2019\n' +
          '• server2022 - Windows Server 2022'
        );
        return;
      }

      // Validate password length
      if (passwdVPS.length < 6 || passwdRDP.length < 6) {
        await TelegramBotService.sendMessage(chatId, '❌ Password VPS dan RDP harus minimal 6 karakter.');
        return;
      }

      const versionMap: { [key: string]: string } = {
        'win10': 'Windows 10',
        'win11': 'Windows 11',
        'server2019': 'Windows Server 2019',
        'server2022': 'Windows Server 2022'
      };

      const windowsVersion = versionMap[winver.toLowerCase()];

      // Send confirmation message
      await TelegramBotService.sendMessage(chatId,
        '🔄 Memproses permintaan install...\n\n' +
        `🖥️ IP VPS: ${ipVPS}\n` +
        `🪟 Versi: ${windowsVersion}\n` +
        '⏱️ Estimasi waktu: 5-10 menit'
      );

      // Create install request via API
      const installResponse = await fetch('http://localhost:5173/api/user/install', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await TelegramBotService.generateUserToken(user.id)}`
        },
        body: JSON.stringify({
          win_version: winver.toLowerCase(), // Use original slug format
          vps_ip: ipVPS,
          vps_password: passwdVPS,
          rdp_password: passwdRDP,
          requested_via: 'telegram'
        })
      });

      if (!installResponse.ok) {
        const errorData = await installResponse.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(`API Error: ${errorData.message || 'Failed to create installation'}`);
      }

      const installData = await installResponse.json();
      const result = installData.data;

      await TelegramBotService.sendMessage(chatId,
        `✅ Permintaan install berhasil dibuat!\n\n` +
        `🖥️ IP VPS: ${ipVPS}\n` +
        `🪟 Versi: ${windowsVersion}\n` +
        `🆔 ID Install: ${result.id || 'N/A'}\n` +
        `📊 Status: ${result.status || 'pending'}\n\n` +
        `⏱️ Estimasi waktu: 5-10 menit\n` +
        `📱 Anda akan mendapat notifikasi saat selesai\n` +
        `🔍 Monitoring aktif - proses akan dipantau otomatis\n\n` +
        `🔍 Cek status: /status`
      );
    } catch (error) {
      logger.error('Error handling direct install:', error);
      await TelegramBotService.sendMessage(chatId, '❌ Terjadi kesalahan saat memproses install.');
    }
  }

  // Handle my quota command
  private static async handleMyQuotaCommand(chatId: number, user: any): Promise<void> {
    try {
      // Get user's detailed quota information
      const quotaInfo = await apiService.getUserQuotaInfo(user.id);
      
      if (quotaInfo.success) {
        const data = quotaInfo.data;
        await TelegramBotService.sendMessage(chatId,
          `💰 Informasi Quota Anda\n\n` +
          `👤 Username: ${user.username}\n` +
          `💎 Quota saat ini: ${data.current_quota || user.quota}\n` +
          `📊 Total quota digunakan: ${data.used_quota || 0}\n` +
          `📈 Total topup: ${data.total_topup || 0}\n\n` +
          `📋 Riwayat penggunaan:\n` +
          `🖥️ Install Windows: ${data.install_count || 0}x\n` +
          `💸 Total biaya install: ${data.install_cost || 0} quota\n\n` +
          `💡 Topup quota: /topup\n` +
          `🖥️ Install Windows: /install`
        );
      } else {
        // Fallback to basic quota info
        await TelegramBotService.sendMessage(chatId,
          `💰 Informasi Quota Anda\n\n` +
          `👤 Username: ${user.username}\n` +
          `💎 Quota saat ini: ${user.quota}\n\n` +
          `💡 Topup quota: /topup\n` +
          `🖥️ Install Windows: /install`
        );
      }
    } catch (error) {
      logger.error('Error handling quota command:', error);
      await TelegramBotService.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil informasi quota.');
    }
  }

  // Handle status command
  private static async handleStatusCommand(chatId: number, user: any): Promise<void> {
    try {
      const db = getDatabase();
      
      // Debug logging
      logger.info('handleStatusCommand called with user:', {
        id: user?.id,
        username: user?.username,
        email: user?.email,
        quota: user?.quota,
        telegram_user_id: user?.telegram_user_id,
        userType: typeof user,
        userKeys: user ? Object.keys(user) : 'null'
      });
      
      // Additional safety check
      if (!user) {
        logger.error('handleStatusCommand: user is null or undefined');
        await TelegramBotService.sendMessage(chatId, '❌ Error: User data not available.');
        return;
      }
      
      if (!user.id) {
        logger.error('handleStatusCommand: user.id is missing', { user });
        await TelegramBotService.sendMessage(chatId, '❌ Error: User ID not available.');
        return;
      }
      
      // Get recent installations
      logger.info('Querying recent installations for user_id:', user.id);
      const recentInstalls = await db.all(`
        SELECT status, ip, win_ver, created_at 
        FROM install_data 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT 5
      `, [user.id]);
      
      logger.info('Recent installations query result:', {
        userId: user.id,
        installCount: recentInstalls.length,
        installs: recentInstalls
      });

      let statusText = `📊 Status Akun\n\n`;
      statusText += `👤 Username: ${user.username || 'N/A'}\n`;
      statusText += `📧 Email: ${user.email || 'N/A'}\n`;
      statusText += `💰 Quota: ${user.quota || 'N/A'}\n\n`;
      
      logger.info('Generated status text prefix:', { statusText: statusText.substring(0, 100) });
      
      if (recentInstalls.length > 0) {
        statusText += `🖥️ Instalasi Terbaru:\n`;
        recentInstalls.forEach((install, index) => {
          const status = TelegramBotService.getStatusEmoji(install.status);
          statusText += `${index + 1}. ${status} ${install.ip} (${install.win_ver})\n`;
        });
      } else {
        statusText += `🖥️ Belum ada instalasi\n`;
      }

      const keyboard = {
        inline_keyboard: [[
          { text: '🔙 Kembali ke Menu', callback_data: 'back_to_menu' }
        ]]
      };

      await TelegramBotService.sendMessage(chatId, statusText, { reply_markup: keyboard });
    } catch (error) {
      logger.error('Error getting user status:', error);
      await TelegramBotService.sendMessage(chatId, '❌ Gagal mengambil status akun.');
    }
  }

  // Handle history command
  private static async handleHistoryCommand(chatId: number, user: any): Promise<void> {
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🖥️ Riwayat Install', callback_data: 'history_install' },
          { text: '💰 Riwayat Topup', callback_data: 'history_topup' }
        ],
        [
          { text: '🔙 Kembali ke Menu', callback_data: 'back_to_menu' }
        ]
      ]
    };

    await TelegramBotService.sendMessage(chatId,
      '📋 Pilih jenis riwayat yang ingin dilihat:',
      { reply_markup: keyboard }
    );
  }

  // Handle help command
  private static async handleHelpCommand(chatId: number): Promise<void> {
    const helpText = `❓ Bantuan XME Projects Bot\n\n` +
      `🤖 Perintah yang tersedia:\n` +
      `/start - Mulai menggunakan bot\n` +
      `/menu - Tampilkan menu utama\n` +
      `/topup [jumlah] - Topup quota (contoh: /topup 5)\n` +
      `/install - Install Windows (pilih versi)\n` +
      `/install [ipVPS] [passwdVPS] [winver] [passwdRDP] - Install langsung\n` +
      `/myquota - Cek quota dan statistik akun\n` +
      `/status - Lihat status akun\n` +
      `/winver - Lihat informasi versi Windows server\n` +
      `/help - Tampilkan bantuan\n` +
      `/cancel - Batalkan operasi saat ini\n\n` +
      `📋 Format Install Langsung:\n` +
      `• ipVPS: IP address VPS (contoh: 192.168.1.100)\n` +
      `• passwdVPS: Password VPS (min 6 karakter)\n` +
      `• winver: win10/win11/server2019/server2022\n` +
      `• passwdRDP: Password RDP (min 6 karakter)\n\n` +
      `💰 Format Topup:\n` +
      `• /topup 1 - Beli 1 quota (Rp 5.000)\n` +
      `• /topup 5 - Beli 5 quota (Rp 21.200 - diskon 12%)\n` +
      `• /topup 10 - Beli 10 quota (Rp 40.000 - diskon 20%)\n` +
      `• /topup 20 - Beli 20 quota (Rp 70.000 - diskon 30%)\n\n` +
      `💡 Tips:\n` +
      `• Parameter topup adalah jumlah quota, bukan rupiah\n` +
      `• Semakin banyak quota, semakin besar diskonnya\n` +
      `• Pastikan akun Telegram sudah terhubung dengan akun web\n` +
      `• Hubungi admin jika mengalami masalah`;

    const keyboard = {
      inline_keyboard: [[
        { text: '🔙 Kembali ke Menu', callback_data: 'back_to_menu' }
      ]]
    };

    await TelegramBotService.sendMessage(chatId, helpText, { reply_markup: keyboard });
  }

  // Handle cancel command
  private static async handleCancelCommand(chatId: number, user: any): Promise<void> {
    if (user) {
      TelegramBotService.userSessions.delete(user.telegram_user_id);
      await TelegramBotService.sendMessage(chatId, '✅ Operasi dibatalkan.');
      await TelegramBotService.showMainMenu(chatId, user);
    } else {
      await TelegramBotService.sendMessage(chatId, '✅ Operasi dibatalkan.');
    }
  }

  // Handle winver command
  private static async handleWinverCommand(chatId: number, user: any): Promise<void> {
    if (!user) {
      await TelegramBotService.sendMessage(chatId, 
        '❌ Akun Anda belum terhubung dengan sistem.\n\n' +
        'Silakan hubungkan akun Telegram Anda melalui dashboard web terlebih dahulu.'
      );
      return;
    }

    try {
      // Get Windows versions from API
      const windowsVersions = await apiService.getWindowsVersions();
      
      if (windowsVersions && windowsVersions.length > 0) {
        let versionText = '🖥️ Versi Windows yang Tersedia\n\n';
        
        windowsVersions.forEach((version: any, index: number) => {
          versionText += `${index + 1}. **${version.name}**\n`;
          versionText += `   📋 Slug: \`${version.slug}\`\n`;
          if (version.description) {
            versionText += `   📝 Deskripsi: ${version.description}\n`;
          }
          versionText += '\n';
        });
        
        versionText += `📅 Diambil pada: ${new Date().toLocaleString('id-ID')} WIB\n\n`;
        versionText += '💡 Gunakan slug untuk install: \`/install [ip] [pass_vps] [slug] [pass_rdp]\`';

        await TelegramBotService.sendMessage(chatId, versionText, { parse_mode: 'Markdown' });
      } else {
        await TelegramBotService.sendMessage(chatId, '❌ Tidak ada versi Windows yang tersedia saat ini.');
      }
    } catch (error) {
      logger.error('Error getting Windows versions from API:', error);
      await TelegramBotService.sendMessage(chatId, 
        '❌ Terjadi kesalahan saat mengambil informasi versi Windows.\n\n' +
        'Silakan coba lagi nanti atau hubungi admin.'
      );
    }
  }

  // Handle topup callback queries
  private static async handleTopupCallback(chatId: number, user: any, callbackData: string): Promise<void> {
    const parts = callbackData.split('_');
    const action = parts[1]; // qris, bank, cancel
    const quantity = parts[2] ? parseInt(parts[2]) : 0;

    if (action === 'cancel') {
      TelegramBotService.clearUserSession(user.telegram_user_id);
      await TelegramBotService.sendMessage(chatId, '❌ Topup dibatalkan.');
      return;
    }

    if (!quantity || quantity <= 0) {
      await TelegramBotService.sendMessage(chatId, '❌ Jumlah quota tidak valid.');
      return;
    }

    try {
      await TelegramBotService.sendMessage(chatId, '🔄 Memproses pembayaran...');

      // Determine payment method
      let paymentMethod = 'QRIS2'; // Default to QRIS2 as requested
      if (action === 'bank') {
        paymentMethod = 'BRIVA'; // or other bank method
      }

      // Create topup transaction using API
      const topupResponse = await fetch('http://localhost:5173/api/user/topup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await TelegramBotService.generateUserToken(user.id)}`
        },
        body: JSON.stringify({ 
          quantity, 
          payment_method: paymentMethod 
        })
      });

      if (!topupResponse.ok) {
        throw new Error('Failed to create topup transaction');
      }

      const topupData = await topupResponse.json();
      const transaction = topupData.data;

      // Clear user session
      TelegramBotService.clearUserSession(user.telegram_user_id);

      // Send transaction details
      let message = `✅ Transaksi Topup Berhasil Dibuat!\n\n`;
      message += `🆔 ID Transaksi: ${transaction.transaction_id}\n`;
      message += `📋 Reference: ${transaction.reference}\n`;
      message += `🎯 Jumlah Quota: ${transaction.quantity}\n`;
      message += `💰 Total Bayar: Rp ${transaction.final_amount.toLocaleString('id-ID')}\n`;
      message += `💳 Metode: ${transaction.payment_name}\n`;
      message += `⏰ Berlaku hingga: ${new Date(transaction.expired_time * 1000).toLocaleString('id-ID')} WIB\n\n`;

      if (transaction.pay_code) {
        message += `🔢 Kode Bayar: \`${transaction.pay_code}\`\n\n`;
      }

      // Send QR code if available
      if (transaction.qr_url && paymentMethod === 'QRIS2') {
        await TelegramBotService.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        
        // Send QR code image
        try {
          await TelegramBotService.bot?.sendPhoto(chatId, transaction.qr_url, {
            caption: '📱 Scan QR Code untuk pembayaran QRIS\n\n' +
                    '⚠️ QR Code akan expired sesuai waktu yang tertera di atas.'
          });
        } catch (qrError) {
          logger.error('Error sending QR code:', qrError);
          message += `🔗 Link QR Code: ${transaction.qr_url}\n\n`;
          await TelegramBotService.sendMessage(chatId, 'QR Code: ' + transaction.qr_url);
        }
      } else {
        if (transaction.checkout_url) {
          message += `🔗 Link Pembayaran: ${transaction.checkout_url}\n\n`;
        }
        await TelegramBotService.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      }

      message = '💡 **Petunjuk Pembayaran:**\n';
      message += '1. Lakukan pembayaran sesuai nominal yang tertera\n';
      message += '2. Quota akan otomatis bertambah setelah pembayaran berhasil\n';
      message += '3. Anda akan mendapat notifikasi status pembayaran\n';
      message += '4. Hubungi admin jika ada kendala\n\n';
      message += 'Gunakan /status untuk cek quota terbaru.';

      await TelegramBotService.sendMessage(chatId, message, { parse_mode: 'Markdown' });

    } catch (error) {
      logger.error('Error in topup callback:', error);
      await TelegramBotService.sendMessage(chatId,
        '❌ Terjadi kesalahan saat memproses topup.\n\n' +
        'Silakan coba lagi nanti atau hubungi admin.'
      );
    }
  }

  // Generate user token for API authentication
  private static async generateUserToken(userId: number): Promise<string> {
    try {
      // This is a simplified token generation
      // In production, use proper JWT with secret key
      const jwt = await import('jsonwebtoken');
      const secret = process.env.JWT_SECRET || 'your-secret-key';
      
      const token = jwt.sign(
        { 
          userId: userId,
          type: 'telegram_bot',
          iat: Math.floor(Date.now() / 1000)
        },
        secret,
        { expiresIn: '1h' }
      );
      
      return token;
    } catch (error) {
      logger.error('Error generating user token:', error);
      throw new Error('Failed to generate authentication token');
    }
  }

  // Handle text input
  private static async handleTextInput(chatId: number, text: string, user: any): Promise<void> {
    if (!user) return;

    const session = TelegramBotService.userSessions.get(user.telegram_user_id);
    if (!session || !session.currentAction) {
      await TelegramBotService.sendMessage(chatId, 
        '❓ Silakan pilih menu atau ketik /menu untuk melihat opsi yang tersedia.'
      );
      return;
    }

    switch (session.currentAction) {
      case 'awaiting_custom_topup':
        await TelegramBotService.processCustomTopupAmount(chatId, user, text);
        break;
      default:
        TelegramBotService.userSessions.delete(user.telegram_user_id);
        await TelegramBotService.sendMessage(chatId, '❓ Silakan pilih menu atau ketik /menu.');
        break;
    }
  }

  // Utility methods
  private static updateUserSession(userId: number, data: Partial<UserSession>) {
    const existing = TelegramBotService.userSessions.get(userId) || {
      userId: 0,
      telegramUserId: userId,
      lastActivity: new Date()
    };
    TelegramBotService.userSessions.set(userId, { ...existing, ...data });
  }

  private static clearUserSession(userId: number) {
    TelegramBotService.userSessions.delete(userId);
  }

  private static async getUserByTelegramId(telegramUserId: number): Promise<any> {
    try {
      const db = getDatabase();
      logger.info('getUserByTelegramId called with:', { telegramUserId });
      
      const user = await db.get(
        'SELECT * FROM users WHERE telegram_user_id = ?',
        [telegramUserId]
      );
      
      logger.info('getUserByTelegramId result:', {
        telegramUserId,
        userFound: !!user,
        userId: user?.id,
        username: user?.username,
        email: user?.email,
        quota: user?.quota
      });
      
      return user;
    } catch (error) {
      logger.error('Error getting user by Telegram ID:', error);
      return null;
    }
  }

  private static async sendMessage(chatId: number, text: string, options?: any): Promise<void> {
    try {
      if (!TelegramBotService.bot) {
        throw new Error('Bot is not initialized');
      }
      await TelegramBotService.bot.sendMessage(chatId, text, options);
    } catch (error) {
      logger.error('Error sending message:', error);
      TelegramBotService.handleError('send_message', error);
    }
  }

  private static getStatusEmoji(status: string): string {
    switch (status) {
      case 'completed': return '✅';
      case 'running': return '🔄';
      case 'pending': return '⏳';
      case 'failed': return '❌';
      case 'preparing': return '🔧';
      default: return '❓';
    }
  }

  // Handle user states (for multi-step interactions)
  private static async handleUserState(chatId: number, userId: number, text: string, state: string, user: any) {
    switch (state) {
      case 'awaiting_topup_amount':
        await TelegramBotService.processCustomTopupAmount(chatId, user, text);
        break;
      case 'awaiting_payment_method':
        await TelegramBotService.handlePaymentMethodSelection(chatId, userId, text, user);
        break;
      case 'awaiting_windows_version':
        await TelegramBotService.handleWindowsVersionSelection(chatId, userId, text, user);
        break;
      default:
        TelegramBotService.clearUserSession(userId);
        await TelegramBotService.bot!.sendMessage(chatId, '🤖 Gunakan /menu untuk melihat daftar perintah.');
        break;
    }
  }

  private static async handlePaymentMethodSelection(chatId: number, userId: number, text: string, user: any) {
    // Implementation for payment method selection
    await TelegramBotService.sendMessage(chatId, '💳 Metode pembayaran dipilih. Fitur ini akan segera tersedia.');
    TelegramBotService.clearUserSession(userId);
  }

  private static async handleWindowsVersionSelection(chatId: number, userId: number, text: string, user: any) {
    // Implementation for Windows version selection
    await TelegramBotService.sendMessage(chatId, '🪟 Versi Windows dipilih. Memulai instalasi...');
    TelegramBotService.clearUserSession(userId);
  }

  // Handle install history
  private static async handleInstallHistory(chatId: number, user: any): Promise<void> {
    try {
      const db = getDatabase();
      const installs = await db.all(`
        SELECT id, ip, win_version, status, created_at, completed_at
        FROM install_data 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT 10
      `, [user.id]);

      let historyText = '🖥️ Riwayat Install Windows\n\n';
      
      if (installs.length === 0) {
        historyText += '📝 Belum ada riwayat install';
      } else {
        installs.forEach((install, index) => {
          const status = TelegramBotService.getStatusEmoji(install.status);
          const date = DateUtils.formatDate(new Date(install.created_at));
          historyText += `${index + 1}. ${status} ${install.win_version}\n`;
          historyText += `   📍 IP: ${install.ip || 'Belum tersedia'}\n`;
          historyText += `   📅 ${date}\n\n`;
        });
      }

      const keyboard = {
        inline_keyboard: [[
          { text: '🔙 Kembali', callback_data: 'history' }
        ]]
      };

      await TelegramBotService.sendMessage(chatId, historyText, { reply_markup: keyboard });
    } catch (error) {
      logger.error('Error getting install history:', error);
      await TelegramBotService.sendMessage(chatId, '❌ Gagal mengambil riwayat install.');
    }
  }

  // Handle topup history
  private static async handleTopupHistory(chatId: number, user: any): Promise<void> {
    try {
      const db = getDatabase();
      const topups = await db.all(`
        SELECT amount, quota_added, status, created_at
        FROM topup_history 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT 10
      `, [user.id]);

      let historyText = '💰 Riwayat Topup\n\n';
      
      if (topups.length === 0) {
        historyText += '📝 Belum ada riwayat topup';
      } else {
        topups.forEach((topup, index) => {
          const status = topup.status === 'completed' ? '✅' : topup.status === 'pending' ? '⏳' : '❌';
          const date = DateUtils.formatDate(new Date(topup.created_at));
          historyText += `${index + 1}. ${status} Rp ${topup.amount.toLocaleString('id-ID')}\n`;
          historyText += `   🎯 +${topup.quota_added} quota\n`;
          historyText += `   📅 ${date}\n\n`;
        });
      }

      const keyboard = {
        inline_keyboard: [[
          { text: '🔙 Kembali', callback_data: 'history' }
        ]]
      };

      await TelegramBotService.sendMessage(chatId, historyText, { reply_markup: keyboard });
    } catch (error) {
      logger.error('Error getting topup history:', error);
      await TelegramBotService.sendMessage(chatId, '❌ Gagal mengambil riwayat topup.');
    }
  }

  // Send notification to user
  static async sendNotificationToUser(telegramUserId: number, message: string): Promise<boolean> {
    try {
      if (!TelegramBotService.bot || !TelegramBotService.status.isRunning) {
        return false;
      }
      
      await TelegramBotService.sendMessage(telegramUserId, message);
      return true;
    } catch (error) {
      logger.error('Error sending notification:', error);
      return false;
    }
  }

  // Send topup status notification
  static async sendTopupStatusNotification(userId: number, topupData: any): Promise<boolean> {
    try {
      const user = await TelegramBotService.getUserByTelegramId(topupData.telegram_user_id || userId);
      if (!user || !user.telegram_user_id) {
        return false;
      }

      let statusMessage = '';
      const statusEmoji = TelegramBotService.getStatusEmoji(topupData.status);
      
      switch (topupData.status) {
        case 'completed':
          statusMessage = `✅ Topup Berhasil!\n\n` +
            `🆔 ID: ${topupData.id}\n` +
            `💰 Nominal: Rp ${topupData.amount.toLocaleString('id-ID')}\n` +
            `🎯 Quota ditambahkan: ${Math.floor(topupData.amount / 10000)}\n` +
            `💳 Metode: ${topupData.payment_method.toUpperCase()}\n\n` +
            `🎉 Quota Anda telah berhasil ditambahkan!`;
          break;
        case 'failed':
          statusMessage = `❌ Topup Gagal\n\n` +
            `🆔 ID: ${topupData.id}\n` +
            `💰 Nominal: Rp ${topupData.amount.toLocaleString('id-ID')}\n` +
            `💳 Metode: ${topupData.payment_method.toUpperCase()}\n\n` +
            `😔 Pembayaran tidak berhasil. Silakan coba lagi.`;
          break;
        case 'expired':
          statusMessage = `⏰ Topup Kedaluwarsa\n\n` +
            `🆔 ID: ${topupData.id}\n` +
            `💰 Nominal: Rp ${topupData.amount.toLocaleString('id-ID')}\n` +
            `💳 Metode: ${topupData.payment_method.toUpperCase()}\n\n` +
            `⚠️ Batas waktu pembayaran telah habis.`;
          break;
        default:
          return false;
      }

      return await TelegramBotService.sendNotificationToUser(user.telegram_user_id, statusMessage);
    } catch (error) {
      logger.error('Error sending topup notification:', error);
      return false;
    }
  }

  // Update metrics
  private static updateMetrics(type: 'message' | 'command' | 'error', userId?: number, data?: any): void {
    const today = DateUtils.toJakartaSQLite(new Date()).split(' ')[0]; // Get only date part (YYYY-MM-DD)
    
    // Update daily stats
    const dailyStat = TelegramBotService.metrics.dailyStats.get(today) || { messages: 0, commands: 0, errors: 0 };
    
    switch (type) {
      case 'message':
        TelegramBotService.metrics.totalMessages++;
        dailyStat.messages++;
        if (userId) {
          TelegramBotService.metrics.uniqueUsers.add(userId);
        }
        break;
      case 'command':
        TelegramBotService.metrics.totalCommands++;
        dailyStat.commands++;
        break;
      case 'error':
        TelegramBotService.metrics.totalErrors++;
        dailyStat.errors++;
        break;
    }
    
    TelegramBotService.metrics.dailyStats.set(today, dailyStat);
  }

  // Update command statistics
  private static updateCommandStats(command: string): void {
    const count = TelegramBotService.metrics.commandStats.get(command) || 0;
    TelegramBotService.metrics.commandStats.set(command, count + 1);
  }

  // Handle errors with detailed tracking
  private static handleError(type: string, error: any): void {
    TelegramBotService.status.errorCount++;
    TelegramBotService.status.lastError = error.message || error.toString();
    TelegramBotService.status.lastErrorAt = new Date();
    
    // Update error statistics
    const errorCount = TelegramBotService.metrics.errorStats.get(type) || 0;
    TelegramBotService.metrics.errorStats.set(type, errorCount + 1);
    
    TelegramBotService.updateMetrics('error');
    
    // Log error activity
    TelegramBotService.logActivity('error_occurred', {
      errorType: type,
      errorMessage: error.message || error.toString(),
      errorStack: error.stack,
      timestamp: new Date().toISOString()
    });
  }

  // Get detailed metrics
  static getDetailedMetrics() {
    return {
      status: TelegramBotService.getStatus(),
      metrics: {
        messages: {
          total: TelegramBotService.metrics.totalMessages,
          daily: Object.fromEntries(TelegramBotService.metrics.dailyStats)
        },
        commands: {
          total: TelegramBotService.metrics.totalCommands,
          breakdown: Object.fromEntries(TelegramBotService.metrics.commandStats)
        },
        errors: {
          total: TelegramBotService.metrics.totalErrors,
          breakdown: Object.fromEntries(TelegramBotService.metrics.errorStats),
          lastError: TelegramBotService.status.lastError,
          lastErrorAt: TelegramBotService.status.lastErrorAt
        },
        users: {
          unique: TelegramBotService.metrics.uniqueUsers.size,
          activeSessions: TelegramBotService.userSessions.size
        }
      }
    };
  }

  // Reset metrics
  static resetMetrics(): void {
    TelegramBotService.metrics = {
      totalMessages: 0,
      totalCommands: 0,
      totalErrors: 0,
      uniqueUsers: new Set<number>(),
      commandStats: new Map<string, number>(),
      errorStats: new Map<string, number>(),
      dailyStats: new Map<string, { messages: number; commands: number; errors: number }>()
    };
    
    TelegramBotService.status.messageCount = 0;
    TelegramBotService.status.errorCount = 0;
    TelegramBotService.status.commandCount = 0;
    TelegramBotService.status.userCount = 0;
    TelegramBotService.status.lastError = undefined;
    TelegramBotService.status.lastErrorAt = undefined;
    
    logger.info('BOT metrics reset successfully');
  }

  // Log BOT activity
  private static logActivity(type: string, details: any): void {
    const logData = {
      timestamp: new Date().toISOString(),
      type,
      details,
      botStatus: {
        isRunning: TelegramBotService.status.isRunning,
        messageCount: TelegramBotService.status.messageCount,
        errorCount: TelegramBotService.status.errorCount,
        commandCount: TelegramBotService.status.commandCount,
        userCount: TelegramBotService.status.userCount
      }
    };
    
    logger.info(`BOT Activity [${type}]:`, logData);
  }

  // Get performance metrics
  static getPerformanceMetrics() {
    const uptime = TelegramBotService.status.startedAt 
      ? Date.now() - TelegramBotService.status.startedAt.getTime() 
      : 0;
    
    const messagesPerMinute = uptime > 0 ? (TelegramBotService.metrics.totalMessages / (uptime / 60000)) : 0;
    const commandsPerMinute = uptime > 0 ? (TelegramBotService.metrics.totalCommands / (uptime / 60000)) : 0;
    const errorRate = TelegramBotService.metrics.totalMessages > 0 
      ? (TelegramBotService.metrics.totalErrors / TelegramBotService.metrics.totalMessages) * 100 
      : 0;
    
    return {
      uptime: {
        ms: uptime,
        formatted: TelegramBotService.formatUptime(uptime)
      },
      throughput: {
        messagesPerMinute: Math.round(messagesPerMinute * 100) / 100,
        commandsPerMinute: Math.round(commandsPerMinute * 100) / 100
      },
      reliability: {
        errorRate: Math.round(errorRate * 100) / 100,
        successRate: Math.round((100 - errorRate) * 100) / 100
      },
      usage: {
        totalMessages: TelegramBotService.metrics.totalMessages,
        totalCommands: TelegramBotService.metrics.totalCommands,
        totalErrors: TelegramBotService.metrics.totalErrors,
        uniqueUsers: TelegramBotService.metrics.uniqueUsers.size,
        activeSessions: TelegramBotService.userSessions.size
      }
    };
  }

  // Send install status notification
  static async sendInstallStatusNotification(userId: number, installData: any): Promise<boolean> {
    try {
      const user = await TelegramBotService.getUserByTelegramId(installData.telegram_user_id || userId);
      if (!user || !user.telegram_user_id) {
        return false;
      }

      let statusMessage = '';
      const statusEmoji = TelegramBotService.getStatusEmoji(installData.status);
      
      switch (installData.status) {
        case 'completed':
          statusMessage = `✅ Install Windows Selesai!\n\n` +
            `🆔 ID: ${installData.id}\n` +
            `🖥️ Versi: ${installData.win_version}\n` +
            `🌐 IP: ${installData.server_ip || 'Sedang dialokasikan'}\n` +
            `👤 Username: ${installData.username || 'Administrator'}\n` +
            `🔑 Password: ${installData.password || 'Akan dikirim terpisah'}\n\n` +
            `🎉 Windows Anda siap digunakan!`;
          break;
        case 'failed':
          statusMessage = `❌ Install Windows Gagal\n\n` +
            `🆔 ID: ${installData.id}\n` +
            `🖥️ Versi: ${installData.win_version}\n\n` +
            `😔 Terjadi kesalahan saat install. Tim kami akan segera menangani.`;
          break;
        case 'processing':
          statusMessage = `⚙️ Install Sedang Diproses\n\n` +
            `🆔 ID: ${installData.id}\n` +
            `🖥️ Versi: ${installData.win_version}\n\n` +
            `⏱️ Estimasi: 5-10 menit\n` +
            `📱 Anda akan mendapat notifikasi saat selesai`;
          break;
        default:
          return false;
      }

      return await TelegramBotService.sendNotificationToUser(user.telegram_user_id, statusMessage);
    } catch (error) {
      logger.error('Error sending install notification:', error);
      return false;
    }
  }
}

// Export class for static usage
export { TelegramBotService };
export default TelegramBotService;