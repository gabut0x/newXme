import TelegramBot from 'node-telegram-bot-api';
import { getDatabase } from '../database/init.js';
import { logger } from '../utils/logger.js';
import { DateUtils } from '../utils/dateUtils.js';
import { BotSecurity } from '../utils/botSecurity.js';
import { RateLimiter } from '../utils/rateLimiter.js';
import { apiService } from './apiService.js';
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

  private static readonly BOT_TOKEN = process.env['TELEGRAM_BOT_TOKEN'];
  private static readonly WEBHOOK_URL = process.env['TELEGRAM_WEBHOOK_URL'];
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
   * Handle bot commands
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
      const [command, ...args] = text.split(' ');
      const commandLower = command.toLowerCase();

      // Update command statistics
      this.commandStats[commandLower] = (this.commandStats[commandLower] || 0) + 1;
      this.updateDailyStats('commands');

      // Security check
      const security = BotSecurity.getInstance();
      const securityResult = await security.checkSecurity({
        userId,
        username,
        chatId,
        command: commandLower,
        args
      });

      if (!securityResult.allowed) {
        await this.sendMessage(chatId, `🚫 ${securityResult.reason}`);
        await security.logCommand({ userId, username, chatId, command: commandLower, args }, 'failed', securityResult.reason);
        return;
      }

      // Handle specific commands
      switch (commandLower) {
        case '/start':
          await this.handleStartCommand(chatId, userId, username, args);
          break;
        case '/help':
          await this.handleHelpCommand(chatId, userId);
          break;
        case '/menu':
          await this.handleMenuCommand(chatId, userId);
          break;
        case '/topup':
          await this.handleTopupCommand(chatId, userId, args);
          break;
        case '/install':
          await this.handleInstallCommand(chatId, userId, args);
          break;
        case '/status':
        case '/myquota':
        case '/balance':
          await this.handleStatusCommand(chatId, userId);
          break;
        case '/history':
          await this.handleHistoryCommand(chatId, userId);
          break;
        case '/cancel':
          await this.handleCancelCommand(chatId, userId);
          break;
        default:
          await this.handleUnknownCommand(chatId, commandLower);
          break;
      }

      // Log successful command execution
      await security.logCommand({ userId, username, chatId, command: commandLower, args }, 'success');

      // Record response time
      const responseTime = Date.now() - startTime;
      this.responseTimes.push(responseTime);
      if (this.responseTimes.length > 100) {
        this.responseTimes = this.responseTimes.slice(-100); // Keep last 100 response times
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
   * Handle /start command
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

      // Check if user is already registered
      const user = await apiService.getUserByTelegramId(userId);
      
      if (user) {
        // User is already connected
        const welcomeMessage = `🎉 Selamat datang kembali, ${user.username}!

Akun Telegram Anda sudah terhubung dengan XME Projects.

Gunakan /menu untuk melihat opsi yang tersedia atau /help untuk bantuan.`;

        await this.sendMessage(chatId, welcomeMessage, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📋 Menu Utama', callback_data: 'main_menu' },
                { text: '❓ Bantuan', callback_data: 'help' }
              ]
            ]
          }
        });
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

        await this.sendMessage(chatId, welcomeMessage, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🌐 Buka Website', url: process.env['FRONTEND_URL'] || 'https://xmeprojects.com' }
              ],
              [
                { text: '❓ Bantuan', callback_data: 'help' }
              ]
            ]
          }
        });
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

Sekarang Anda dapat:
• 💰 Topup saldo
• 🖥️ Install Windows
• 📊 Cek status akun
• 📋 Lihat riwayat transaksi

Gunakan /menu untuk memulai atau /help untuk bantuan.`;

      await this.sendMessage(chatId, successMessage, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📋 Menu Utama', callback_data: 'main_menu' },
              { text: '📊 Status Akun', callback_data: 'account_status' }
            ]
          ]
        }
      });

      logger.info('Telegram account connected successfully:', {
        userId: user.id,
        username: user.username,
        telegramUserId: userId,
        telegramUsername: username
      });

      return true;
    } catch (error: any) {
      logger.error('Error handling connection token:', error);
      await this.sendMessage(chatId, '❌ Terjadi kesalahan saat menghubungkan akun. Silakan coba lagi.');
      return false;
    }
  }

  /**
   * Handle /help command
   */
  private static async handleHelpCommand(chatId: number, userId: number): Promise<void> {
    const helpMessage = `❓ Bantuan XME Projects Bot

📋 Perintah yang tersedia:
• /start - Mulai menggunakan bot
• /menu - Tampilkan menu utama
• /topup - Topup saldo akun
• /install - Install Windows
• /status - Cek status akun dan saldo
• /history - Lihat riwayat transaksi
• /help - Tampilkan bantuan ini
• /cancel - Batalkan operasi saat ini

💡 Tips:
• Pastikan akun Telegram sudah terhubung dengan akun XME Projects
• Gunakan /menu untuk akses cepat ke semua fitur
• Gunakan /status untuk cek saldo dan quota

🌐 Website: ${process.env['FRONTEND_URL'] || 'https://xmeprojects.com'}
📧 Support: xme.noreply@gmail.com`;

    await this.sendMessage(chatId, helpMessage, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📋 Menu Utama', callback_data: 'main_menu' },
            { text: '🌐 Website', url: process.env['FRONTEND_URL'] || 'https://xmeprojects.com' }
          ]
        ]
      }
    });
  }

  /**
   * Handle /menu command
   */
  private static async handleMenuCommand(chatId: number, userId: number): Promise<void> {
    const user = await this.getRegisteredUser(userId);
    if (!user) {
      await this.sendNotRegisteredMessage(chatId);
      return;
    }

    const menuMessage = `📋 Menu Utama - XME Projects

Halo ${user.username}! Pilih opsi di bawah ini:`;

    await this.sendMessage(chatId, menuMessage, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '💰 Topup Saldo', callback_data: 'topup_menu' },
            { text: '🖥️ Install Windows', callback_data: 'install_menu' }
          ],
          [
            { text: '📊 Status Akun', callback_data: 'account_status' },
            { text: '📋 Riwayat Transaksi', callback_data: 'transaction_history' }
          ],
          [
            { text: '❓ Bantuan', callback_data: 'help' },
            { text: '🌐 Dashboard Web', url: process.env['FRONTEND_URL'] || 'https://xmeprojects.com' }
          ]
        ]
      }
    });
  }

  /**
   * Handle /topup command
   */
  private static async handleTopupCommand(chatId: number, userId: number, args: string[]): Promise<void> {
    const user = await this.getRegisteredUser(userId);
    if (!user) {
      await this.sendNotRegisteredMessage(chatId);
      return;
    }

    // Show topup options
    const topupMessage = `💰 Topup Saldo

Pilih nominal topup yang diinginkan:

💡 Diskon otomatis:
• 5 quota: 12% OFF
• 6-10 quota: 20% OFF  
• 11-19 quota: 25% OFF
• 20+ quota: 30% OFF

Harga per quota: Rp 5.000`;

    await this.sendMessage(chatId, topupMessage, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '5 Quota (12% OFF)', callback_data: 'topup_5' },
            { text: '10 Quota (20% OFF)', callback_data: 'topup_10' }
          ],
          [
            { text: '15 Quota (25% OFF)', callback_data: 'topup_15' },
            { text: '25 Quota (30% OFF)', callback_data: 'topup_25' }
          ],
          [
            { text: '🔢 Custom Amount', callback_data: 'topup_custom' }
          ],
          [
            { text: '🔙 Kembali ke Menu', callback_data: 'main_menu' }
          ]
        ]
      }
    });
  }

  /**
   * Handle /install command
   */
  private static async handleInstallCommand(chatId: number, userId: number, args: string[]): Promise<void> {
    const user = await this.getRegisteredUser(userId);
    if (!user) {
      await this.sendNotRegisteredMessage(chatId);
      return;
    }

    // Check user quota
    const quota = await apiService.getUserQuota(userId);
    if (quota <= 0) {
      await this.sendMessage(chatId, `❌ Quota tidak mencukupi!

Saldo quota Anda: ${quota}
Dibutuhkan: 1 quota untuk install Windows

Silakan topup terlebih dahulu menggunakan /topup`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '💰 Topup Sekarang', callback_data: 'topup_menu' },
              { text: '📊 Cek Status', callback_data: 'account_status' }
            ]
          ]
        }
      });
      return;
    }

    // Get available Windows versions
    const versions = await apiService.getWindowsVersions();
    if (!versions || versions.length === 0) {
      await this.sendMessage(chatId, '❌ Tidak ada versi Windows yang tersedia saat ini.');
      return;
    }

    const installMessage = `🖥️ Install Windows

Quota tersedia: ${quota}
Pilih versi Windows yang ingin diinstall:`;

    // Create inline keyboard for Windows versions
    const keyboard = [];
    for (let i = 0; i < versions.length; i += 2) {
      const row = [];
      row.push({ text: versions[i].name, callback_data: `install_${versions[i].slug}` });
      if (versions[i + 1]) {
        row.push({ text: versions[i + 1].name, callback_data: `install_${versions[i + 1].slug}` });
      }
      keyboard.push(row);
    }
    keyboard.push([{ text: '🔙 Kembali ke Menu', callback_data: 'main_menu' }]);

    await this.sendMessage(chatId, installMessage, {
      reply_markup: { inline_keyboard: keyboard }
    });
  }

  /**
   * Handle /status command
   */
  private static async handleStatusCommand(chatId: number, userId: number): Promise<void> {
    const user = await this.getRegisteredUser(userId);
    if (!user) {
      await this.sendNotRegisteredMessage(chatId);
      return;
    }

    try {
      // Get user quota info
      const quotaInfo = await apiService.getUserQuotaInfo(userId);
      const installations = await apiService.getUserInstallations(userId);

      if (!quotaInfo.success) {
        await this.sendMessage(chatId, '❌ Gagal mengambil informasi akun. Silakan coba lagi.');
        return;
      }

      const data = quotaInfo.data;
      const activeInstalls = installations.filter(install => ['pending', 'running'].includes(install.status));

      const statusMessage = `📊 Status Akun - ${user.username}

💰 Saldo Quota: ${data.current_quota}
🖥️ Total Install: ${data.install_count}
✅ Install Berhasil: ${data.completed_installs}
🔄 Install Aktif: ${activeInstalls.length}

📈 Statistik:
• Total Topup: ${data.total_topup} quota
• Jumlah Topup: ${data.topup_count} kali
• Quota Terpakai: ${data.used_quota}

📅 Bergabung: ${new Date(user.created_at).toLocaleDateString('id-ID')}`;

      await this.sendMessage(chatId, statusMessage, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '💰 Topup', callback_data: 'topup_menu' },
              { text: '🖥️ Install', callback_data: 'install_menu' }
            ],
            [
              { text: '📋 Riwayat', callback_data: 'transaction_history' },
              { text: '📋 Menu Utama', callback_data: 'main_menu' }
            ]
          ]
        }
      });
    } catch (error: any) {
      logger.error('Error in status command:', error);
      await this.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil status akun.');
    }
  }

  /**
   * Handle /history command
   */
  private static async handleHistoryCommand(chatId: number, userId: number): Promise<void> {
    const user = await this.getRegisteredUser(userId);
    if (!user) {
      await this.sendNotRegisteredMessage(chatId);
      return;
    }

    try {
      // Get recent installations and topup history
      const installations = await apiService.getUserInstallations(userId);
      const topupHistory = await apiService.getTopupHistory(userId, 5);

      let historyMessage = `📋 Riwayat Transaksi - ${user.username}\n\n`;

      // Recent installations
      if (installations.length > 0) {
        historyMessage += `🖥️ Install Terakhir:\n`;
        installations.slice(0, 3).forEach((install, index) => {
          const status = this.getStatusEmoji(install.status);
          const date = new Date(install.created_at).toLocaleDateString('id-ID');
          historyMessage += `${index + 1}. ${install.win_ver} - ${install.ip}\n   ${status} ${install.status} (${date})\n`;
        });
        historyMessage += '\n';
      }

      // Recent topups
      if (topupHistory.length > 0) {
        historyMessage += `💰 Topup Terakhir:\n`;
        topupHistory.slice(0, 3).forEach((topup, index) => {
          const status = topup.status === 'PAID' ? '✅' : topup.status === 'UNPAID' ? '⏳' : '❌';
          const date = new Date(topup.created_at).toLocaleDateString('id-ID');
          const amount = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(topup.final_amount);
          historyMessage += `${index + 1}. ${topup.quantity} quota - ${amount}\n   ${status} ${topup.status} (${date})\n`;
        });
      } else {
        historyMessage += `💰 Belum ada riwayat topup\n`;
      }

      await this.sendMessage(chatId, historyMessage, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🌐 Lihat Detail di Web', url: `${process.env['FRONTEND_URL'] || 'https://xmeprojects.com'}/dashboard` }
            ],
            [
              { text: '🔙 Kembali ke Menu', callback_data: 'main_menu' }
            ]
          ]
        }
      });
    } catch (error: any) {
      logger.error('Error in history command:', error);
      await this.sendMessage(chatId, '❌ Terjadi kesalahan saat mengambil riwayat transaksi.');
    }
  }

  /**
   * Handle /cancel command
   */
  private static async handleCancelCommand(chatId: number, userId: number): Promise<void> {
    await this.sendMessage(chatId, '✅ Operasi dibatalkan. Kembali ke menu utama.', {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📋 Menu Utama', callback_data: 'main_menu' }
          ]
        ]
      }
    });
  }

  /**
   * Handle unknown commands
   */
  private static async handleUnknownCommand(chatId: number, command: string): Promise<void> {
    await this.sendMessage(chatId, `❓ Perintah "${command}" tidak dikenali.

Gunakan /help untuk melihat daftar perintah yang tersedia.`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '❓ Bantuan', callback_data: 'help' },
            { text: '📋 Menu Utama', callback_data: 'main_menu' }
          ]
        ]
      }
    });
  }

  /**
   * Handle non-command messages
   */
  private static async handleNonCommand(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const userId = msg.from?.id;

    if (!userId) return;

    const user = await this.getRegisteredUser(userId);
    if (!user) {
      await this.sendNotRegisteredMessage(chatId);
      return;
    }

    // Respond to non-command messages
    await this.sendMessage(chatId, `👋 Halo ${user.username}!

Saya tidak mengerti pesan tersebut. Gunakan perintah berikut:

• /menu - Menu utama
• /help - Bantuan
• /status - Status akun`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📋 Menu Utama', callback_data: 'main_menu' },
            { text: '❓ Bantuan', callback_data: 'help' }
          ]
        ]
      }
    });
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
      switch (data) {
        case 'main_menu':
          await this.handleMenuCommand(chatId, userId);
          break;
        case 'help':
          await this.handleHelpCommand(chatId, userId);
          break;
        case 'account_status':
          await this.handleStatusCommand(chatId, userId);
          break;
        case 'topup_menu':
          await this.handleTopupCommand(chatId, userId, []);
          break;
        case 'install_menu':
          await this.handleInstallCommand(chatId, userId, []);
          break;
        case 'transaction_history':
          await this.handleHistoryCommand(chatId, userId);
          break;
        default:
          // Handle specific callbacks
          if (data.startsWith('topup_')) {
            await this.handleTopupCallback(chatId, userId, data);
          } else if (data.startsWith('install_')) {
            await this.handleInstallCallback(chatId, userId, data);
          } else {
            await this.sendMessage(chatId, '❓ Opsi tidak dikenali.');
          }
          break;
      }
    } catch (error: any) {
      logger.error('Error handling callback query:', error);
      if (query.message?.chat.id) {
        await this.sendMessage(query.message.chat.id, '❌ Terjadi kesalahan. Silakan coba lagi.');
      }
    }
  }

  /**
   * Handle topup callback
   */
  private static async handleTopupCallback(chatId: number, userId: number, data: string): Promise<void> {
    const user = await this.getRegisteredUser(userId);
    if (!user) {
      await this.sendNotRegisteredMessage(chatId);
      return;
    }

    try {
      // Extract quantity from callback data
      const quantityMatch = data.match(/topup_(\d+)/);
      if (!quantityMatch) {
        await this.sendMessage(chatId, '❌ Format topup tidak valid.');
        return;
      }

      const quantity = parseInt(quantityMatch[1]);

      // Get payment methods
      const paymentMethods = await apiService.getEnabledPaymentMethods();
      if (!paymentMethods || paymentMethods.length === 0) {
        await this.sendMessage(chatId, '❌ Tidak ada metode pembayaran yang tersedia saat ini.');
        return;
      }

      // Calculate price
      const calculation = await apiService.calculateTopupAmount(quantity);
      const finalAmount = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(calculation.total);

      const paymentMessage = `💰 Topup ${quantity} Quota

💵 Total: ${finalAmount}
${calculation.fee > 0 ? `💳 Diskon: ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(calculation.fee)}` : ''}

Pilih metode pembayaran:`;

      // Create payment method buttons (limit to 3 per row)
      const keyboard = [];
      for (let i = 0; i < paymentMethods.length; i += 2) {
        const row = [];
        row.push({ text: paymentMethods[i].name, callback_data: `pay_${quantity}_${paymentMethods[i].code}` });
        if (paymentMethods[i + 1]) {
          row.push({ text: paymentMethods[i + 1].name, callback_data: `pay_${quantity}_${paymentMethods[i + 1].code}` });
        }
        keyboard.push(row);
      }
      keyboard.push([{ text: '🔙 Kembali', callback_data: 'topup_menu' }]);

      await this.sendMessage(chatId, paymentMessage, {
        reply_markup: { inline_keyboard: keyboard }
      });
    } catch (error: any) {
      logger.error('Error in topup callback:', error);
      await this.sendMessage(chatId, '❌ Terjadi kesalahan saat memproses topup.');
    }
  }

  /**
   * Handle install callback
   */
  private static async handleInstallCallback(chatId: number, userId: number, data: string): Promise<void> {
    const user = await this.getRegisteredUser(userId);
    if (!user) {
      await this.sendNotRegisteredMessage(chatId);
      return;
    }

    try {
      // Extract Windows version from callback data
      const versionMatch = data.match(/install_(.+)/);
      if (!versionMatch) {
        await this.sendMessage(chatId, '❌ Format install tidak valid.');
        return;
      }

      const winVersion = versionMatch[1];

      // Check quota again
      const quota = await apiService.getUserQuota(userId);
      if (quota <= 0) {
        await this.sendMessage(chatId, '❌ Quota tidak mencukupi untuk install Windows.');
        return;
      }

      const confirmMessage = `🖥️ Konfirmasi Install Windows

Versi: ${winVersion}
Quota akan digunakan: 1
Sisa quota setelah install: ${quota - 1}

⚠️ Pastikan VPS Anda:
• Sudah online dan dapat diakses
• Menggunakan Ubuntu 20/22 atau Debian 12
• Memiliki akses root
• Memiliki koneksi internet yang stabil

Lanjutkan install?`;

      await this.sendMessage(chatId, confirmMessage, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Ya, Install Sekarang', callback_data: `confirm_install_${winVersion}` }
            ],
            [
              { text: '❌ Batal', callback_data: 'install_menu' }
            ]
          ]
        }
      });
    } catch (error: any) {
      logger.error('Error in install callback:', error);
      await this.sendMessage(chatId, '❌ Terjadi kesalahan saat memproses install.');
    }
  }

  /**
   * Get registered user by Telegram ID
   */
  private static async getRegisteredUser(telegramUserId: number): Promise<any> {
    try {
      return await apiService.getUserByTelegramId(telegramUserId);
    } catch (error: any) {
      logger.error('Error getting registered user:', error);
      return null;
    }
  }

  /**
   * Send not registered message
   */
  private static async sendNotRegisteredMessage(chatId: number): Promise<void> {
    const message = `🔐 Akun Belum Terhubung

Untuk menggunakan bot ini, Anda perlu menghubungkan akun Telegram dengan akun XME Projects.

📝 Cara menghubungkan:
1. Login ke dashboard XME Projects
2. Buka pengaturan profil  
3. Klik "Connect Telegram"
4. Ikuti instruksi yang diberikan

Jika belum punya akun, daftar dulu di website kami.`;

    await this.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🌐 Buka Website', url: process.env['FRONTEND_URL'] || 'https://xmeprojects.com' }
          ],
          [
            { text: '❓ Bantuan', callback_data: 'help' }
          ]
        ]
      }
    });
  }

  /**
   * Send message with error handling
   */
  private static async sendMessage(chatId: number, text: string, options?: any): Promise<void> {
    try {
      if (!this.bot) {
        throw new Error('Bot not initialized');
      }

      await this.bot.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...options
      });

      this.updateActivity();
    } catch (error: any) {
      logger.error('Error sending message:', error);
      this.errorCount++;
      this.lastError = error.message;
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
      const user = await apiService.getUserByTelegramId(userId);
      if (!user || !user.telegram_user_id || !user.telegram_notifications) {
        return false; // User not connected or notifications disabled
      }

      const status = this.getStatusEmoji(data.status);
      const message = `🖥️ Update Install Windows

${status} Status: ${data.status.toUpperCase()}
🌐 IP: ${data.ip}
💿 Versi: ${data.winVersion}

📝 ${data.message}

⏰ ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`;

      await this.sendMessage(user.telegram_user_id, message, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📊 Cek Status', callback_data: 'account_status' },
              { text: '🌐 Dashboard', url: `${process.env['FRONTEND_URL'] || 'https://xmeprojects.com'}/dashboard` }
            ]
          ]
        }
      });

      return true;
    } catch (error: any) {
      logger.error('Error sending installation notification:', error);
      return false;
    }
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
        { command: 'start', description: 'Mulai menggunakan bot' },
        { command: 'menu', description: 'Tampilkan menu utama' },
        { command: 'topup', description: 'Topup saldo akun' },
        { command: 'install', description: 'Install Windows' },
        { command: 'status', description: 'Cek status akun' },
        { command: 'history', description: 'Lihat riwayat transaksi' },
        { command: 'help', description: 'Bantuan penggunaan' },
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

export { TelegramBotService };
export default TelegramBotService;