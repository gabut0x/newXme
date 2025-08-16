import TelegramBot from 'node-telegram-bot-api';
import { getDatabase } from '../database/init.js';
import { logger } from '../utils/logger.js';
import { DateUtils } from '../utils/dateUtils.js';
import { BotSecurity } from '../utils/botSecurity.js';
import { RateLimiter } from '../utils/rateLimiter.js';
import { UserService } from './userService.js';
import { InstallService } from './installService.js';
import { tripayService } from './tripayService.js';
import crypto from 'crypto';

interface BotStatus {
  isRunning: boolean;
  mode: 'polling' | 'webhook' | 'stopped';
  startedAt: string | null;
  lastActivity: string | null;
  messageCount: number;
  errorCount: number;
  userCount: number;
}

interface BotStats {
  totalMessages: number;
  totalCommands: number;
  totalErrors: number;
  uniqueUsers: number;
  commandStats: { [command: string]: number };
  dailyStats: { [date: string]: { messages: number; commands: number; errors: number } };
}

interface DetailedMetrics {
  uptime: {
    startedAt: string | null;
    uptimeMs: number;
    formatted: string;
  };
  usage: {
    totalMessages: number;
    totalCommands: number;
    totalErrors: number;
    uniqueUsers: number;
    averageResponseTime: number;
  };
  reliability: {
    errorRate: number;
    successRate: number;
    lastError: string | null;
  };
  metrics: {
    messages: {
      total: number;
      daily: { [date: string]: any };
    };
    commands: { [command: string]: number };
    users: Set<number>;
  };
}

interface PerformanceMetrics {
  uptime: {
    startedAt: string | null;
    uptimeMs: number;
    formatted: string;
  };
  usage: {
    totalMessages: number;
    totalCommands: number;
    totalErrors: number;
    uniqueUsers: number;
  };
  reliability: {
    errorRate: number;
    successRate: number;
  };
}

interface ConnectedUser {
  id: number;
  username: string;
  email: string;
  quota: number;
  telegram_user_id: number;
  telegram_display_name: string;
  telegram_notifications: boolean;
  is_verified: boolean;
  is_active: boolean;
}

export class TelegramBotService {
  private static bot: TelegramBot | null = null;
  private static isRunning = false;
  private static mode: 'polling' | 'webhook' | 'stopped' = 'stopped';
  private static startedAt: string | null = null;
  private static lastActivity: string | null = null;
  private static messageCount = 0;
  private static errorCount = 0;
  private static userCount = 0;
  private static commandStats: { [command: string]: number } = {};
  private static dailyStats: { [date: string]: { messages: number; commands: number; errors: number } } = {};
  private static uniqueUsers = new Set<number>();
  private static lastError: string | null = null;
  private static responseTimes: number[] = [];

  private static get BOT_TOKEN() {
    return process.env['TELEGRAM_BOT_TOKEN'];
  }

  private static readonly POLLING_INTERVAL = parseInt(process.env['TELEGRAM_POLLING_INTERVAL'] || '2000');

  /**
   * Start the Telegram bot
   */
  static async startBot(usePolling: boolean = true): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.BOT_TOKEN) {
        return { success: false, message: 'Telegram bot token not configured' };
      }

      if (this.isRunning) {
        return { success: false, message: 'Bot is already running' };
      }

      // Create bot instance
      this.bot = new TelegramBot(this.BOT_TOKEN, {
        polling: usePolling ? {
          interval: this.POLLING_INTERVAL,
          autoStart: false,
          params: {
            timeout: 10,
            allowed_updates: ['message', 'callback_query']
          }
        } : false
      });

      // Set up message handlers
      this.setupMessageHandlers();

      // Start polling if enabled
      if (usePolling) {
        await this.bot.startPolling();
        this.mode = 'polling';
        logger.info('Telegram bot started in polling mode');
      } else {
        this.mode = 'webhook';
        logger.info('Telegram bot started in webhook mode');
      }

      this.isRunning = true;
      this.startedAt = DateUtils.nowISO();
      this.lastActivity = DateUtils.nowISO();

      // Set bot commands
      await this.setMyCommands();

      logger.info('Telegram bot started successfully', {
        mode: this.mode,
        startedAt: this.startedAt
      });

      return { success: true, message: `Bot started successfully in ${this.mode} mode` };
    } catch (error: any) {
      logger.error('Failed to start Telegram bot:', error);
      this.isRunning = false;
      this.bot = null;
      return { success: false, message: error.message || 'Failed to start bot' };
    }
  }

  /**
   * Stop the Telegram bot
   */
  static async stopBot(): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.isRunning || !this.bot) {
        return { success: false, message: 'Bot is not running' };
      }

      if (this.mode === 'polling') {
        await this.bot.stopPolling();
      }

      this.bot = null;
      this.isRunning = false;
      this.mode = 'stopped';

      logger.info('Telegram bot stopped successfully');
      return { success: true, message: 'Bot stopped successfully' };
    } catch (error: any) {
      logger.error('Failed to stop Telegram bot:', error);
      return { success: false, message: error.message || 'Failed to stop bot' };
    }
  }

  /**
   * Restart the Telegram bot
   */
  static async restartBot(): Promise<{ success: boolean; message: string }> {
    try {
      const usePolling = this.mode === 'polling' || process.env['TELEGRAM_USE_POLLING'] === 'true';
      
      await this.stopBot();
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      
      return await this.startBot(usePolling);
    } catch (error: any) {
      logger.error('Failed to restart Telegram bot:', error);
      return { success: false, message: error.message || 'Failed to restart bot' };
    }
  }

  /**
   * Setup message handlers
   */
  private static setupMessageHandlers(): void {
    if (!this.bot) return;

    // Handle all messages
    this.bot.on('message', async (msg) => {
      try {
        this.updateActivity();
        this.messageCount++;
        this.uniqueUsers.add(msg.from?.id || 0);
        this.updateDailyStats('messages');

        const userId = msg.from?.id;
        const chatId = msg.chat.id;
        const text = msg.text || '';
        const username = msg.from?.username || msg.from?.first_name || 'Unknown';

        logger.info('Telegram message received:', {
          userId,
          chatId,
          username,
          text: text.substring(0, 100),
          timestamp: DateUtils.nowISO()
        });

        // Handle commands
        if (text.startsWith('/')) {
          await this.handleCommand(msg);
        } else {
          // Handle non-command messages
          await this.handleNonCommand(msg);
        }
      } catch (error: any) {
        logger.error('Error handling message:', error);
        this.errorCount++;
        this.updateDailyStats('errors');
      }
    });

    // Handle callback queries (inline keyboard buttons)
    this.bot.on('callback_query', async (query) => {
      try {
        this.updateActivity();
        await this.handleCallbackQuery(query);
      } catch (error: any) {
        logger.error('Error handling callback query:', error);
        this.errorCount++;
      }
    });

    // Handle polling errors
    this.bot.on('polling_error', (error) => {
      logger.error('Telegram polling error:', error);
      this.errorCount++;
      this.lastError = error.message;
    });

    // Handle webhook errors
    this.bot.on('webhook_error', (error) => {
      logger.error('Telegram webhook error:', error);
      this.errorCount++;
      this.lastError = error.message;
    });
  }

  /**
   * Handle bot commands with improved parsing and validation
   */
  private static async handleCommand(msg: TelegramBot.Message): Promise<void> {
    const startTime = Date.now();
    
    try {
      const userId = msg.from?.id;
      const chatId = msg.chat.id;
      const text = msg.text || '';
      const username = msg.from?.username || msg.from?.first_name || 'Unknown';

      if (!userId) {
        await this.sendMessage(chatId, '❌ Unable to identify user. Please try again.');
        return;
      }

      // Parse command and arguments
      const parts = text.trim().split(/\s+/);
      const command = parts[0].toLowerCase();
      const args = parts.slice(1);

      // Update command statistics
      this.commandStats[command] = (this.commandStats[command] || 0) + 1;
      this.updateDailyStats('commands');

      // Security check
      const security = BotSecurity.getInstance();
      const securityResult = await security.checkSecurity({
        userId,
        username,
        chatId,
        command,
        args
      });

      if (!securityResult.allowed) {
        await this.sendMessage(chatId, `🚫 ${securityResult.reason}`);
        await security.logCommand({ userId, username, chatId, command, args }, 'failed', securityResult.reason);
        return;
      }

      // Handle specific commands
      switch (command) {
        case '/start':
          await this.handleStartCommand(chatId, userId, username, args);
          break;
        case '/help':
          await this.handleHelpCommand(chatId, userId);
          break;
        case '/install':
          await this.handleInstallCommand(chatId, userId, args);
          break;
        case '/myquota':
        case '/quota':
          await this.handleQuotaCommand(chatId, userId);
          break;
        case '/topup':
          await this.handleTopupCommand(chatId, userId, args);
          break;
        case '/winver':
        case '/versions':
          await this.handleWinverCommand(chatId, userId);
          break;
        case '/history':
          await this.handleHistoryCommand(chatId, userId);
          break;
        case '/cancel':
          await this.handleCancelCommand(chatId, userId);
          break;
        default:
          await this.handleUnknownCommand(chatId, command);
          break;
      }

      // Log successful command execution
      await security.logCommand({ userId, username, chatId, command, args }, 'success');

      // Record response time
      const responseTime = Date.now() - startTime;
      this.responseTimes.push(responseTime);
      if (this.responseTimes.length > 100) {
        this.responseTimes = this.responseTimes.slice(-100);
      }

    } catch (error: any) {
      logger.error('Command handling error:', error);
      this.errorCount++;
      this.lastError = error.message;
      
      const chatId = msg.chat.id;
      await this.sendMessage(chatId, '❌ Terjadi kesalahan saat memproses perintah. Silakan coba lagi.');
    }
  }

  /**
   * Handle /start command with connection token support
   */
  private static async handleStartCommand(chatId: number, userId: number, username: string, args: string[]): Promise<void> {
    try {
      // Check if this is a connection token
      if (args.length > 0) {
        const token = args[0];
        const connectionResult = await this.handleConnectionToken(chatId, userId, username, token);
        if (connectionResult) {
          return; // Connection handled successfully
        }
      }

      // Check if user is already connected
      const user = await this.getConnectedUser(userId);
      
      if (user) {
        // User is already connected
        const welcomeMessage = `🎉 Selamat datang kembali, ${user.username}!

Akun Telegram Anda sudah terhubung dengan XME Projects.

💰 Quota tersisa: ${user.quota}
📧 Email: ${user.email}
✅ Status: ${user.is_verified ? 'Verified' : 'Not Verified'}

Gunakan perintah berikut:
• /install [ip] [vps_pass] [win_ver] [rdp_pass] - Install Windows
• /myquota - Cek quota tersisa
• /topup [qty] - Topup quota
• /winver - Lihat versi Windows tersedia
• /history - Riwayat instalasi
• /help - Bantuan lengkap`;

        await this.sendMessage(chatId, welcomeMessage);
      } else {
        // User not connected
        const welcomeMessage = `👋 Selamat datang di XME Projects Bot!

Untuk menggunakan bot ini, Anda perlu menghubungkan akun Telegram dengan akun XME Projects Anda.

📝 Cara menghubungkan akun:
1. Login ke dashboard XME Projects
2. Buka pengaturan profil
3. Klik "Connect Telegram"
4. Ikuti instruksi yang diberikan

Jika Anda belum memiliki akun, silakan daftar terlebih dahulu di website kami.

🌐 Website: ${process.env['FRONTEND_URL'] || 'https://xmeprojects.com'}`;

        await this.sendMessage(chatId, welcomeMessage);
      }
    } catch (error: any) {
      logger.error('Error in start command:', error);
      await this.sendMessage(chatId, '❌ Terjadi kesalahan. Silakan coba lagi.');
    }
  }

  /**
   * Handle connection token from /start command
   */
  private static async handleConnectionToken(chatId: number, userId: number, username: string, token: string): Promise<boolean> {
    try {
      const db = getDatabase();
      
      // Find valid connection token
      const connectionToken = await db.get(
        'SELECT * FROM telegram_connection_tokens WHERE token = ? AND expires_at > ? AND used_at IS NULL',
        [token, DateUtils.nowSQLite()]
      );

      if (!connectionToken) {
        await this.sendMessage(chatId, '❌ Token koneksi tidak valid atau sudah kedaluwarsa. Silakan generate token baru dari dashboard.');
        return false;
      }

      // Get user data
      const user = await db.get('SELECT * FROM users WHERE id = ?', [connectionToken.user_id]);
      if (!user) {
        await this.sendMessage(chatId, '❌ User tidak ditemukan. Silakan coba lagi.');
        return false;
      }

      // Check if this Telegram account is already connected to another user
      const existingConnection = await db.get('SELECT * FROM users WHERE telegram_user_id = ? AND id != ?', [userId, user.id]);
      if (existingConnection) {
        await this.sendMessage(chatId, '❌ Akun Telegram ini sudah terhubung dengan user lain. Satu akun Telegram hanya bisa terhubung dengan satu akun XME Projects.');
        return false;
      }

      // Update user with Telegram information
      await db.run(
        'UPDATE users SET telegram_user_id = ?, telegram_display_name = ?, telegram = ?, updated_at = ? WHERE id = ?',
        [userId, username, `@${username}`, DateUtils.nowSQLite(), user.id]
      );

      // Mark token as used
      await db.run(
        'UPDATE telegram_connection_tokens SET used_at = ?, telegram_user_id = ? WHERE id = ?',
        [DateUtils.nowSQLite(), userId, connectionToken.id]
      );

      // Send success message
      const successMessage = `✅ Akun Telegram berhasil terhubung!

🎉 Selamat datang, ${user.username}!

Akun Telegram Anda (@${username}) telah berhasil terhubung dengan akun XME Projects.

💰 Quota tersisa: ${user.quota}

Sekarang Anda dapat menggunakan perintah berikut:
• /install [ip] [vps_pass] [win_ver] [rdp_pass] - Install Windows
• /myquota - Cek quota tersisa  
• /topup [qty] - Topup quota
• /winver - Lihat versi Windows tersedia
• /history - Riwayat instalasi
• /help - Bantuan lengkap`;

      await this.sendMessage(chatId, successMessage);

      logger.info('Telegram account connected successfully:', {
        userId: user.id,
        username: user.username,
        telegramUserId: userId,
        telegramUsername: username
      });

      // Send real-time notification to dashboard
      try {
        const { NotificationService } = await import('./notificationService.js');
        NotificationService.sendRealTimeNotification(user.id, {
          type: 'telegram_connection_success',
          status: 'connected',
          message: `Telegram account @${username} connected successfully!`,
          timestamp: new Date().toISOString(),
          data: {
            telegramUsername: username,
            telegramUserId: userId
          }
        });
        
        logger.info('Telegram connection notification sent to dashboard:', {
          userId: user.id,
          telegramUsername: username
        });
      } catch (notificationError) {
        logger.error('Failed to send telegram connection notification:', notificationError);
      }

      return true;
    } catch (error: any) {
      logger.error('Error handling connection token:', error);
      await this.sendMessage(chatId, '❌ Terjadi kesalahan saat menghubungkan akun. Silakan coba lagi.');
      return false;
    }
  }

  /**
   * Handle /install command with parameters
   * Format: /install [ip] [vps_password] [win_version] [rdp_password]
   */
  private static async handleInstallCommand(chatId: number, userId: number, args: string[]): Promise<void> {
    try {
      const user = await this.getConnectedUser(userId);
      if (!user) {
        await this.sendNotConnectedMessage(chatId);
        return;
      }

      if (!user.is_verified) {
        await this.sendMessage(chatId, '❌ Akun Anda belum terverifikasi. Silakan verifikasi email terlebih dahulu di dashboard web.');
        return;
      }

      // Check if user has sufficient quota
      if (user.quota <= 0) {
        await this.sendMessage(chatId, `❌ Quota tidak mencukupi!

💰 Quota tersisa: ${user.quota}
📋 Dibutuhkan: 1 quota untuk install Windows

Gunakan /topup [qty] untuk menambah quota.`);
        return;
      }

      // Validate command format
      if (args.length < 4) {
        await this.sendMessage(chatId, `❌ Format perintah salah!

📝 Format yang benar:
/install &lt;ip&gt; &lt;vps_password&gt; &lt;win_version&gt; &lt;rdp_password&gt;

📋 Contoh:
/install 192.168.1.100 mypassword win11-pro MyRdpPass123

💡 Tips:
• Gunakan /winver untuk melihat versi Windows yang tersedia
• Password RDP tidak boleh dimulai dengan karakter #
• Pastikan VPS Anda online dan dapat diakses`);
        return;
      }

      const [ip, vpsPassword, winVersion, rdpPassword] = args;

      // Validate parameters
      const validation = this.validateInstallParameters(ip, vpsPassword, winVersion, rdpPassword);
      if (!validation.isValid) {
        await this.sendMessage(chatId, `❌ ${validation.error}`);
        return;
      }

      // Show confirmation
      const confirmMessage = `🖥️ Konfirmasi Install Windows

📋 Detail Instalasi:
• IP VPS: ${ip}
• Versi Windows: ${winVersion}
• Quota akan digunakan: 1
• Sisa quota setelah install: ${user.quota - 1}

⚠️ Pastikan VPS Anda:
• Sudah online dan dapat diakses
• Menggunakan Ubuntu 20/22 atau Debian 12
• Memiliki akses root dengan password yang benar
• Memiliki koneksi internet yang stabil

Lanjutkan instalasi?`;

      await this.sendMessage(chatId, confirmMessage, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Ya, Install Sekarang', callback_data: `confirm_install_${ip}_${vpsPassword}_${winVersion}_${rdpPassword}` }
            ],
            [
              { text: '❌ Batal', callback_data: 'cancel_install' }
            ]
          ]
        }
      });

    } catch (error: any) {
      logger.error('Error in install command:', error);
      await this.sendMessage(chatId, '❌ Terjadi kesalahan saat memproses perintah install.');
    }
  }

  /**
   * Handle /myquota command
   */
  private static async handleQuotaCommand(chatId: number, userId: number): Promise<void> {
    try {
      const user = await this.getConnectedUser(userId);
      if (!user) {
        await this.sendNotConnectedMessage(chatId);
        return;
      }

      // Get detailed quota information
      const db = getDatabase();
      const [installStats, topupStats] = await Promise.all([
        db.get(`
          SELECT 
            COUNT(*) as total_installs,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_installs,
            SUM(CASE WHEN status IN ('pending', 'running', 'preparing') THEN 1 ELSE 0 END) as active_installs
          FROM install_data 
          WHERE user_id = ?
        `, [user.id]),
        db.get(`
          SELECT 
            COALESCE(SUM(quantity), 0) as total_topup,
            COUNT(*) as topup_count
          FROM topup_transactions 
          WHERE user_id = ? AND status = 'PAID'
        `, [user.id])
      ]);

      const quotaMessage = `💰 Status Quota - ${user.username}

📊 Quota Saat Ini: ${user.quota}

📈 Statistik:
• Total Install: ${installStats?.total_installs || 0}
• Install Berhasil: ${installStats?.completed_installs || 0}
• Install Aktif: ${installStats?.active_installs || 0}
• Total Topup: ${topupStats?.total_topup || 0} quota
• Jumlah Topup: ${topupStats?.topup_count || 0} kali

📅 Bergabung: ${new Date(user.created_at).toLocaleDateString('id-ID')}

💡 Gunakan /topup [qty] untuk menambah quota
📋 Gunakan /install untuk memulai instalasi Windows`;

      await this.sendMessage(chatId, quotaMessage);

    } catch (error: any) {
      logger.error('Error in quota command:', error);
      await this.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil informasi quota.');
    }
  }

  /**
   * Handle /topup command with quantity parameter
   * Format: /topup [quantity]
   */
  private static async handleTopupCommand(chatId: number, userId: number, args: string[]): Promise<void> {
    try {
      const user = await this.getConnectedUser(userId);
      if (!user) {
        await this.sendNotConnectedMessage(chatId);
        return;
      }

      if (args.length === 0) {
        await this.sendMessage(chatId, `💰 Topup Quota

📝 Format perintah:
/topup [quantity]

📋 Contoh:
/topup 5
/topup 10
/topup 25

💡 Diskon otomatis:
• 5 quota: 12% OFF
• 6-10 quota: 20% OFF  
• 11-19 quota: 25% OFF
• 20+ quota: 30% OFF

💵 Harga per quota: Rp 5.000`);
        return;
      }

      const quantity = parseInt(args[0]);
      if (isNaN(quantity) || quantity <= 0) {
        await this.sendMessage(chatId, '❌ Quantity harus berupa angka positif. Contoh: /topup 5');
        return;
      }

      if (quantity > 1000) {
        await this.sendMessage(chatId, '❌ Maksimal topup 1000 quota per transaksi.');
        return;
      }

      // Calculate pricing
      const calculation = await this.calculateTopupPrice(quantity);
      
      // Get available payment methods
      const paymentMethods = await this.getAvailablePaymentMethods();
      if (paymentMethods.length === 0) {
        await this.sendMessage(chatId, '❌ Tidak ada metode pembayaran yang tersedia saat ini.');
        return;
      }

      const topupMessage = `💰 Topup ${quantity} Quota

💵 Detail Harga:
• Harga per quota: ${this.formatCurrency(calculation.unitPrice)}
• Subtotal: ${this.formatCurrency(calculation.totalAmount)}
${calculation.discountAmount > 0 ? `• Diskon (${calculation.discountPercentage}%): -${this.formatCurrency(calculation.discountAmount)}` : ''}
• Total Bayar: ${this.formatCurrency(calculation.finalAmount)}

Pilih metode pembayaran:`;

      // Create payment method buttons (max 2 per row)
      const keyboard = [];
      for (let i = 0; i < paymentMethods.length; i += 2) {
        const row = [];
        row.push({ text: paymentMethods[i].name, callback_data: `topup_${quantity}_${paymentMethods[i].code}` });
        if (paymentMethods[i + 1]) {
          row.push({ text: paymentMethods[i + 1].name, callback_data: `topup_${quantity}_${paymentMethods[i + 1].code}` });
        }
        keyboard.push(row);
      }
      keyboard.push([{ text: '❌ Batal', callback_data: 'cancel_topup' }]);

      await this.sendMessage(chatId, topupMessage, {
        reply_markup: { inline_keyboard: keyboard }
      });

    } catch (error: any) {
      logger.error('Error in topup command:', error);
      await this.sendMessage(chatId, '❌ Terjadi kesalahan saat memproses topup.');
    }
  }

  /**
   * Handle /winver command
   */
  private static async handleWinverCommand(chatId: number, userId: number): Promise<void> {
    try {
      const user = await this.getConnectedUser(userId);
      if (!user) {
        await this.sendNotConnectedMessage(chatId);
        return;
      }

      // Get available Windows versions
      const db = getDatabase();
      const versions = await db.all('SELECT * FROM windows_versions ORDER BY name');

      if (versions.length === 0) {
        await this.sendMessage(chatId, '❌ Tidak ada versi Windows yang tersedia saat ini.');
        return;
      }

      let versionMessage = `🖥️ Versi Windows Tersedia

📋 Daftar versi yang dapat diinstall:\n`;

      versions.forEach((version, index) => {
        versionMessage += `${index + 1}. ${version.name} (${version.slug})\n`;
      });

      versionMessage += `\n💡 Gunakan slug dalam perintah install:
/install [ip] [vps_pass] [slug] [rdp_pass]

📋 Contoh:
/install 192.168.1.100 mypass win11-pro MyRdpPass123`;

      await this.sendMessage(chatId, versionMessage);

    } catch (error: any) {
      logger.error('Error in winver command:', error);
      await this.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil daftar versi Windows.');
    }
  }

  /**
   * Handle /history command
   */
  private static async handleHistoryCommand(chatId: number, userId: number): Promise<void> {
    try {
      const user = await this.getConnectedUser(userId);
      if (!user) {
        await this.sendNotConnectedMessage(chatId);
        return;
      }

      // Get recent installations
      const db = getDatabase();
      const installations = await db.all(
        'SELECT * FROM install_data WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
        [user.id]
      );

      if (installations.length === 0) {
        await this.sendMessage(chatId, `📋 Riwayat Instalasi - ${user.username}

❌ Belum ada riwayat instalasi.

💡 Gunakan /install untuk memulai instalasi Windows pertama Anda.`);
        return;
      }

      let historyMessage = `📋 Riwayat Instalasi - ${user.username}\n\n`;

      installations.forEach((install, index) => {
        const status = this.getStatusEmoji(install.status);
        const date = new Date(install.created_at).toLocaleDateString('id-ID');
        const time = new Date(install.created_at).toLocaleTimeString('id-ID', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        
        historyMessage += `${index + 1}. ${install.ip} - ${install.win_ver}\n`;
        historyMessage += `   ${status} ${install.status.toUpperCase()}\n`;
        historyMessage += `   📅 ${date} ${time}\n\n`;
      });

      historyMessage += `💡 Gunakan /install untuk instalasi baru`;

      await this.sendMessage(chatId, historyMessage);

    } catch (error: any) {
      logger.error('Error in history command:', error);
      await this.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil riwayat instalasi.');
    }
  }

  /**
   * Handle /help command
   */
  private static async handleHelpCommand(chatId: number, userId: number): Promise<void> {
    const helpMessage = `❓ Bantuan XME Projects Bot

📋 Perintah yang tersedia:

🔗 Koneksi:
• /start - Mulai menggunakan bot atau hubungkan akun

🖥️ Instalasi:
• /install [ip] [vps_pass] [win_ver] [rdp_pass] - Install Windows
• /winver - Lihat versi Windows tersedia
• /history - Riwayat instalasi

💰 Quota & Topup:
• /myquota - Cek quota tersisa
• /topup [qty] - Topup quota

🛠️ Lainnya:
• /help - Bantuan ini
• /cancel - Batalkan operasi

📋 Contoh Penggunaan:
/install 192.168.1.100 mypassword win11-pro MyRdpPass123
/topup 10
/myquota

💡 Tips:
• Pastikan VPS online sebelum install
• Password RDP tidak boleh dimulai dengan #
• Gunakan /winver untuk melihat slug versi Windows

🌐 Website: ${process.env['FRONTEND_URL'] || 'https://xmeprojects.com'}
📧 Support: xme.noreply@gmail.com`;

    await this.sendMessage(chatId, helpMessage);
  }

  /**
   * Handle /cancel command
   */
  private static async handleCancelCommand(chatId: number, userId: number): Promise<void> {
    await this.sendMessage(chatId, '✅ Operasi dibatalkan.');
  }

  /**
   * Handle unknown commands
   */
  private static async handleUnknownCommand(chatId: number, command: string): Promise<void> {
    await this.sendMessage(chatId, `❓ Perintah "${command}" tidak dikenali.

Gunakan /help untuk melihat daftar perintah yang tersedia.`);
  }

  /**
   * Handle non-command messages
   */
  private static async handleNonCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) return;

    const user = await this.getConnectedUser(userId);
    if (!user) {
      await this.sendNotConnectedMessage(chatId);
      return;
    }

    await this.sendMessage(chatId, `👋 Halo ${user.username}!

Saya tidak mengerti pesan tersebut. Gunakan perintah berikut:

• /help - Bantuan lengkap
• /install - Install Windows
• /myquota - Cek quota
• /topup - Topup quota
• /winver - Versi Windows
• /history - Riwayat instalasi`);
  }

  /**
   * Handle callback queries (inline keyboard buttons)
   */
  private static async handleCallbackQuery(query: TelegramBot.CallbackQuery): Promise<void> {
    try {
      const chatId = query.message?.chat.id;
      const userId = query.from.id;
      const data = query.data;

      if (!chatId || !data) return;

      // Answer the callback query to remove loading state
      await this.bot?.answerCallbackQuery(query.id);

      // Handle different callback data
      if (data.startsWith('confirm_install_')) {
        await this.handleInstallConfirmation(chatId, userId, data);
      } else if (data.startsWith('topup_')) {
        await this.handleTopupCallback(chatId, userId, data);
      } else if (data === 'cancel_install' || data === 'cancel_topup') {
        await this.sendMessage(chatId, '✅ Operasi dibatalkan.');
      } else {
        await this.sendMessage(chatId, '❓ Opsi tidak dikenali.');
      }
    } catch (error: any) {
      logger.error('Error handling callback query:', error);
      if (query.message?.chat.id) {
        await this.sendMessage(query.message.chat.id, '❌ Terjadi kesalahan. Silakan coba lagi.');
      }
    }
  }

  /**
   * Handle install confirmation callback
   */
  private static async handleInstallConfirmation(chatId: number, userId: number, data: string): Promise<void> {
    try {
      // Parse install parameters from callback data
      const parts = data.replace('confirm_install_', '').split('_');
      if (parts.length < 4) {
        await this.sendMessage(chatId, '❌ Data instalasi tidak valid.');
        return;
      }

      const [ip, vpsPassword, winVersion, rdpPassword] = parts;

      const user = await this.getConnectedUser(userId);
      if (!user) {
        await this.sendNotConnectedMessage(chatId);
        return;
      }

      // Double-check quota
      if (user.quota <= 0) {
        await this.sendMessage(chatId, '❌ Quota tidak mencukupi untuk instalasi.');
        return;
      }

      await this.sendMessage(chatId, '🔄 Memulai instalasi Windows...\n\nProses ini akan memakan waktu beberapa menit. Anda akan mendapat notifikasi ketika instalasi selesai.');

      // Process installation using InstallService
      const result = await InstallService.processInstallation(
        user.id,
        ip,
        vpsPassword,
        winVersion,
        rdpPassword
      );

      if (result.success) {
        await this.sendMessage(chatId, `✅ ${result.message}

📋 Detail:
• IP: ${ip}
• Windows: ${winVersion}
• Install ID: ${result.installId}

⏰ Estimasi waktu: 5-15 menit
🔔 Anda akan mendapat notifikasi otomatis ketika instalasi selesai.`);
      } else {
        await this.sendMessage(chatId, `❌ Instalasi gagal: ${result.message}`);
      }

    } catch (error: any) {
      logger.error('Error in install confirmation:', error);
      await this.sendMessage(chatId, '❌ Terjadi kesalahan saat memproses instalasi.');
    }
  }

  /**
   * Handle topup callback
   */
  private static async handleTopupCallback(chatId: number, userId: number, data: string): Promise<void> {
    try {
      // Parse topup data: topup_quantity_paymentmethod
      const parts = data.split('_');
      if (parts.length < 3) {
        await this.sendMessage(chatId, '❌ Data topup tidak valid.');
        return;
      }

      const quantity = parseInt(parts[1]);
      const paymentMethod = parts[2];

      const user = await this.getConnectedUser(userId);
      if (!user) {
        await this.sendNotConnectedMessage(chatId);
        return;
      }

      await this.sendMessage(chatId, '🔄 Membuat transaksi topup...');

      // Create topup transaction using internal API
      const result = await this.createTopupTransaction(user.id, quantity, paymentMethod);

      if (result.success && result.data) {
        const transaction = result.data;
        
        let paymentMessage = `✅ Transaksi topup berhasil dibuat!

📋 Detail Transaksi:
• Quantity: ${transaction.quantity} quota
• Total: ${this.formatCurrency(transaction.final_amount)}
• Metode: ${transaction.payment_name}
• Reference: ${transaction.reference}

💳 Untuk menyelesaikan pembayaran:
1. Klik link pembayaran di bawah
2. Ikuti instruksi pembayaran
3. Quota akan otomatis ditambahkan setelah pembayaran berhasil

⏰ Link berlaku sampai: ${new Date(transaction.expired_time * 1000).toLocaleString('id-ID')}`;

        const keyboard = [
          [{ text: '💳 Bayar Sekarang', url: transaction.checkout_url }]
        ];

        // Add QR code option if available
        if (transaction.qr_url) {
          keyboard.unshift([{ text: '📱 Lihat QR Code', url: transaction.qr_url }]);
        }

        await this.sendMessage(chatId, paymentMessage, {
          reply_markup: { inline_keyboard: keyboard }
        });
      } else {
        await this.sendMessage(chatId, `❌ Gagal membuat transaksi: ${result.message}`);
      }

    } catch (error: any) {
      logger.error('Error in topup callback:', error);
      await this.sendMessage(chatId, '❌ Terjadi kesalahan saat memproses topup.');
    }
  }

  /**
   * Get connected user by Telegram ID
   */
  private static async getConnectedUser(telegramUserId: number): Promise<ConnectedUser | null> {
    try {
      const db = getDatabase();
      const user = await db.get(`
        SELECT u.id, u.username, u.email, u.quota, u.telegram_user_id, u.telegram_display_name, 
               u.telegram_notifications, u.is_verified, u.is_active, u.created_at
        FROM users u 
        WHERE u.telegram_user_id = ? AND u.is_active = 1
      `, [telegramUserId]);

      return user || null;
    } catch (error: any) {
      logger.error('Error getting connected user:', error);
      return null;
    }
  }

  /**
   * Send not connected message
   */
  private static async sendNotConnectedMessage(chatId: number): Promise<void> {
    const message = `🔐 Akun Belum Terhubung

Untuk menggunakan bot ini, Anda perlu menghubungkan akun Telegram dengan akun XME Projects.

📝 Cara menghubungkan:
1. Login ke dashboard XME Projects
2. Buka pengaturan profil  
3. Klik "Connect Telegram"
4. Ikuti instruksi yang diberikan

Jika belum punya akun, daftar dulu di website kami.

🌐 Website: ${process.env['FRONTEND_URL'] || 'https://xmeprojects.com'}`;

    await this.sendMessage(chatId, message);
  }

  /**
   * Validate install parameters
   */
  private static validateInstallParameters(ip: string, vpsPassword: string, winVersion: string, rdpPassword: string): { isValid: boolean; error?: string } {
    // Validate IP format
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(ip)) {
      return { isValid: false, error: 'Format IP tidak valid. Contoh: 192.168.1.100' };
    }

    // Validate VPS password
    if (!vpsPassword || vpsPassword.length < 1) {
      return { isValid: false, error: 'Password VPS tidak boleh kosong.' };
    }

    // Validate Windows version format
    if (!winVersion || !/^[a-z0-9-_]+$/.test(winVersion)) {
      return { isValid: false, error: 'Format versi Windows tidak valid. Gunakan /winver untuk melihat versi yang tersedia.' };
    }

    // Validate RDP password
    if (!rdpPassword || rdpPassword.length <= 3) {
      return { isValid: false, error: 'Password RDP harus lebih dari 3 karakter.' };
    }

    if (rdpPassword.startsWith('#')) {
      return { isValid: false, error: 'Password RDP tidak boleh dimulai dengan karakter "#".' };
    }

    return { isValid: true };
  }

  /**
   * Calculate topup price with discounts
   */
  private static async calculateTopupPrice(quantity: number): Promise<{
    unitPrice: number;
    totalAmount: number;
    discountPercentage: number;
    discountAmount: number;
    finalAmount: number;
  }> {
    const unitPrice = 5000; // Base price per quota
    const totalAmount = quantity * unitPrice;
    
    let discountPercentage = 0;
    if (quantity >= 5 && quantity < 6) {
      discountPercentage = 12;
    } else if (quantity >= 6 && quantity <= 10) {
      discountPercentage = 20;
    } else if (quantity >= 11 && quantity <= 19) {
      discountPercentage = 25;
    } else if (quantity >= 20) {
      discountPercentage = 30;
    }

    const discountAmount = Math.floor(totalAmount * (discountPercentage / 100));
    const finalAmount = totalAmount - discountAmount;

    return {
      unitPrice,
      totalAmount,
      discountPercentage,
      discountAmount,
      finalAmount
    };
  }

  /**
   * Get available payment methods
   */
  private static async getAvailablePaymentMethods(): Promise<any[]> {
    try {
      const db = getDatabase();
      const methods = await db.all(
        'SELECT code, name, type FROM payment_methods WHERE is_enabled = 1 ORDER BY name LIMIT 10'
      );
      
      // If no methods in database, try to get from Tripay
      if (methods.length === 0) {
        const tripayMethods = await tripayService.getPaymentChannels();
        return tripayMethods.slice(0, 10); // Limit to 10 methods
      }
      
      return methods;
    } catch (error: any) {
      logger.error('Error getting payment methods:', error);
      return [];
    }
  }

  /**
   * Create topup transaction using internal services
   */
  private static async createTopupTransaction(userId: number, quantity: number, paymentMethod: string): Promise<{
    success: boolean;
    message: string;
    data?: any;
  }> {
    try {
      const db = getDatabase();

      // Get user data
      const user = await db.get('SELECT username, email FROM users WHERE id = ?', [userId]);
      if (!user) {
        return { success: false, message: 'User tidak ditemukan' };
      }

      // Calculate pricing
      const calculation = await this.calculateTopupPrice(quantity);

      // Generate merchant reference
      const merchantRef = tripayService.generateMerchantRef(userId, quantity);
      
      // Create transaction record
      const result = await db.run(`
        INSERT INTO topup_transactions (
          user_id, merchant_ref, amount, quantity, total_amount, 
          discount_percentage, discount_amount, final_amount, 
          payment_method, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId,
        merchantRef,
        calculation.unitPrice,
        quantity,
        calculation.totalAmount,
        calculation.discountPercentage,
        calculation.discountAmount,
        calculation.finalAmount,
        paymentMethod,
        'PENDING',
        DateUtils.nowSQLite(),
        DateUtils.nowSQLite()
      ]);

      // Create Tripay transaction
      const expiry = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours

      const tripayRequest = {
        method: paymentMethod,
        merchant_ref: merchantRef,
        amount: Math.round(calculation.finalAmount),
        customer_name: user.username,
        customer_email: user.email,
        customer_phone: '',
        order_items: [{
          sku: 'QUOTA-INSTALL',
          name: 'Quota Install',
          price: Math.round(calculation.finalAmount),
          quantity: 1,
          product_url: process.env['FRONTEND_URL'] || 'https://localhost:3000',
          image_url: 'https://localhost/quota-install.jpg'
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

      logger.info('Topup transaction created via Telegram bot:', {
        userId,
        transactionId: result.lastID,
        reference: tripayResponse.data.reference,
        amount: calculation.finalAmount,
        quantity
      });

      return {
        success: true,
        message: 'Transaksi berhasil dibuat',
        data: {
          transaction_id: result.lastID,
          reference: tripayResponse.data.reference,
          merchant_ref: merchantRef,
          quantity,
          total_amount: calculation.totalAmount,
          discount_percentage: calculation.discountPercentage,
          discount_amount: calculation.discountAmount,
          final_amount: calculation.finalAmount,
          checkout_url: tripayResponse.data.checkout_url,
          qr_url: tripayResponse.data.qr_url,
          pay_code: tripayResponse.data.pay_code,
          payment_method: tripayResponse.data.payment_method,
          payment_name: tripayResponse.data.payment_name,
          status: tripayResponse.data.status,
          expired_time: tripayResponse.data.expired_time
        }
      };

    } catch (error: any) {
      logger.error('Error creating topup transaction:', error);
      return {
        success: false,
        message: error.message || 'Gagal membuat transaksi topup'
      };
    }
  }

  /**
   * Send message with error handling
   */
  private static async sendMessage(chatId: number, text: string, options?: any): Promise<void> {
    try {
      if (!this.bot) {
        throw new Error('Bot not initialized');
      }

      // Split long messages if needed
      const maxLength = 4096;
      if (text.length > maxLength) {
        const chunks = this.splitMessage(text, maxLength);
        for (let i = 0; i < chunks.length; i++) {
          await this.bot.sendMessage(chatId, chunks[i], {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            ...(i === chunks.length - 1 ? options : {}) // Only add options to last message
          });
          
          // Small delay between messages
          if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      } else {
        await this.bot.sendMessage(chatId, text, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          ...options
        });
      }

      this.updateActivity();
    } catch (error: any) {
      logger.error('Error sending message:', error);
      this.errorCount++;
      this.lastError = error.message;
    }
  }

  /**
   * Split long messages into chunks
   */
  private static splitMessage(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let currentChunk = '';
    const lines = text.split('\n');

    for (const line of lines) {
      if ((currentChunk + line + '\n').length > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
        
        // If single line is too long, split it
        if (line.length > maxLength) {
          const words = line.split(' ');
          let currentLine = '';
          
          for (const word of words) {
            if ((currentLine + word + ' ').length > maxLength) {
              if (currentLine) {
                chunks.push(currentLine.trim());
                currentLine = '';
              }
              currentLine = word + ' ';
            } else {
              currentLine += word + ' ';
            }
          }
          
          if (currentLine) {
            currentChunk = currentLine;
          }
        } else {
          currentChunk = line + '\n';
        }
      } else {
        currentChunk += line + '\n';
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Format currency for Indonesian Rupiah
   */
  private static formatCurrency(amount: number): string {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  /**
   * Get status emoji for installation status
   */
  private static getStatusEmoji(status: string): string {
    switch (status.toLowerCase()) {
      case 'pending': return '⏳';
      case 'preparing': return '🔄';
      case 'running': return '⚡';
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'manual_review': return '👀';
      default: return '❓';
    }
  }

  /**
   * Generate connection token for linking Telegram account
   */
  static async generateConnectionToken(userId: number): Promise<{ token: string; link: string }> {
    try {
      const db = getDatabase();
      
      // Generate secure token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = DateUtils.addMinutesJakarta(10); // 10 minutes expiry
      
      // Store token in database
      await db.run(
        'INSERT INTO telegram_connection_tokens (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
        [crypto.randomUUID(), userId, token, expiresAt, DateUtils.nowSQLite()]
      );

      // Get bot info to create the link
      const botInfo = await this.getBotInfo();
      const botUsername = botInfo?.username || 'xmeprojectsbot';
      
      const link = `https://t.me/${botUsername}?start=${token}`;

      logger.info('Connection token generated:', {
        userId,
        token: token.substring(0, 8) + '...',
        expiresAt
      });

      return { token, link };
    } catch (error: any) {
      logger.error('Error generating connection token:', error);
      throw new Error('Failed to generate connection token');
    }
  }

  /**
   * Send installation notification to user
   */
  static async sendInstallationNotification(userId: number, data: {
    status: string;
    ip: string;
    winVersion: string;
    message: string;
  }): Promise<boolean> {
    try {
      const user = await this.getConnectedUser(userId);
      if (!user || !user.telegram_notifications) {
        return false; // User not connected or notifications disabled
      }

      const status = this.getStatusEmoji(data.status);
      const message = `🖥️ Update Install Windows

${status} Status: ${data.status.toUpperCase()}
🌐 IP: ${data.ip}
💿 Versi: ${data.winVersion}

📝 ${data.message}

⏰ ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`;

      await this.sendMessage(user.telegram_user_id, message);
      return true;
    } catch (error: any) {
      logger.error('Error sending installation notification:', error);
      return false;
    }
  }

  /**
   * Update activity timestamp
   */
  private static updateActivity(): void {
    this.lastActivity = DateUtils.nowISO();
  }

  /**
   * Update daily statistics
   */
  private static updateDailyStats(type: 'messages' | 'commands' | 'errors'): void {
    const today = new Date().toISOString().split('T')[0];
    
    if (!this.dailyStats[today]) {
      this.dailyStats[today] = { messages: 0, commands: 0, errors: 0 };
    }
    
    this.dailyStats[today][type]++;
  }

  /**
   * Get bot status
   */
  static getStatus(): BotStatus {
    return {
      isRunning: this.isRunning,
      mode: this.mode,
      startedAt: this.startedAt,
      lastActivity: this.lastActivity,
      messageCount: this.messageCount,
      errorCount: this.errorCount,
      userCount: this.uniqueUsers.size
    };
  }

  /**
   * Get bot statistics
   */
  static getStats(): BotStats {
    return {
      totalMessages: this.messageCount,
      totalCommands: Object.values(this.commandStats).reduce((sum, count) => sum + count, 0),
      totalErrors: this.errorCount,
      uniqueUsers: this.uniqueUsers.size,
      commandStats: { ...this.commandStats },
      dailyStats: { ...this.dailyStats }
    };
  }

  /**
   * Get detailed metrics
   */
  static getDetailedMetrics(): DetailedMetrics {
    const uptimeMs = this.startedAt ? Date.now() - new Date(this.startedAt).getTime() : 0;
    const totalCommands = Object.values(this.commandStats).reduce((sum, count) => sum + count, 0);
    const averageResponseTime = this.responseTimes.length > 0 
      ? this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length 
      : 0;

    return {
      uptime: {
        startedAt: this.startedAt,
        uptimeMs,
        formatted: this.formatUptime(uptimeMs)
      },
      usage: {
        totalMessages: this.messageCount,
        totalCommands,
        totalErrors: this.errorCount,
        uniqueUsers: this.uniqueUsers.size,
        averageResponseTime
      },
      reliability: {
        errorRate: this.messageCount > 0 ? (this.errorCount / this.messageCount) * 100 : 0,
        successRate: this.messageCount > 0 ? ((this.messageCount - this.errorCount) / this.messageCount) * 100 : 0,
        lastError: this.lastError
      },
      metrics: {
        messages: {
          total: this.messageCount,
          daily: { ...this.dailyStats }
        },
        commands: { ...this.commandStats },
        users: this.uniqueUsers
      }
    };
  }

  /**
   * Get performance metrics
   */
  static getPerformanceMetrics(): PerformanceMetrics {
    const uptimeMs = this.startedAt ? Date.now() - new Date(this.startedAt).getTime() : 0;
    const totalCommands = Object.values(this.commandStats).reduce((sum, count) => sum + count, 0);

    return {
      uptime: {
        startedAt: this.startedAt,
        uptimeMs,
        formatted: this.formatUptime(uptimeMs)
      },
      usage: {
        totalMessages: this.messageCount,
        totalCommands,
        totalErrors: this.errorCount,
        uniqueUsers: this.uniqueUsers.size
      },
      reliability: {
        errorRate: this.messageCount > 0 ? (this.errorCount / this.messageCount) * 100 : 0,
        successRate: this.messageCount > 0 ? ((this.messageCount - this.errorCount) / this.messageCount) * 100 : 0
      }
    };
  }

  /**
   * Reset metrics
   */
  static resetMetrics(): void {
    this.messageCount = 0;
    this.errorCount = 0;
    this.commandStats = {};
    this.dailyStats = {};
    this.uniqueUsers.clear();
    this.lastError = null;
    this.responseTimes = [];
    
    logger.info('Bot metrics reset successfully');
  }

  /**
   * Format uptime duration
   */
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

  /**
   * Get bot info
   */
  static async getBotInfo(): Promise<TelegramBot.User | null> {
    try {
      if (!this.bot) {
        // Create temporary bot instance to get info
        const tempBot = new TelegramBot(this.BOT_TOKEN || '', { polling: false });
        const info = await tempBot.getMe();
        return info;
      }
      
      return await this.bot.getMe();
    } catch (error: any) {
      logger.error('Error getting bot info:', error);
      return null;
    }
  }

  /**
   * Set bot commands
   */
  static async setMyCommands(): Promise<boolean> {
    try {
      if (!this.bot) {
        throw new Error('Bot not initialized');
      }

      const commands = [
        { command: 'start', description: 'Mulai menggunakan bot atau hubungkan akun' },
        { command: 'install', description: 'Install Windows: /install [ip] [vps_pass] [win_ver] [rdp_pass]' },
        { command: 'myquota', description: 'Cek quota tersisa' },
        { command: 'topup', description: 'Topup quota: /topup [quantity]' },
        { command: 'winver', description: 'Lihat versi Windows tersedia' },
        { command: 'history', description: 'Riwayat instalasi' },
        { command: 'help', description: 'Bantuan penggunaan lengkap' },
        { command: 'cancel', description: 'Batalkan operasi saat ini' }
      ];

      await this.bot.setMyCommands(commands);
      logger.info('Bot commands set successfully');
      return true;
    } catch (error: any) {
      logger.error('Error setting bot commands:', error);
      return false;
    }
  }

  /**
   * Get bot commands
   */
  static async getMyCommands(): Promise<TelegramBot.BotCommand[] | null> {
    try {
      if (!this.bot) {
        throw new Error('Bot not initialized');
      }

      return await this.bot.getMyCommands();
    } catch (error: any) {
      logger.error('Error getting bot commands:', error);
      return null;
    }
  }

  /**
   * Process webhook update
   */
  static async processWebhookUpdate(update: any): Promise<void> {
    try {
      if (!this.bot) {
        throw new Error('Bot not initialized');
      }

      // Process the update through the bot
      this.bot.processUpdate(update);
    } catch (error: any) {
      logger.error('Error processing webhook update:', error);
      this.errorCount++;
      this.lastError = error.message;
    }
  }
}

export default TelegramBotService;