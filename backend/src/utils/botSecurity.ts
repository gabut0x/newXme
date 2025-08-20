import { logger } from './logger.js';
import { RateLimiter, RATE_LIMITS } from './rateLimiter.js';
import { getDatabase } from '../database/init.js';
import { DateUtils } from './dateUtils.js';

interface SecurityContext {
  userId: number;
  username?: string;
  chatId: number;
  command: string;
  args?: string[];
}

interface SecurityResult {
  allowed: boolean;
  reason?: string;
  rateLimitInfo?: {
    remaining: number;
    resetTime: number | null;
  };
}

export class BotSecurity {
  private static instance: BotSecurity;
  private rateLimiter = RateLimiter.getInstance();
  private logger = logger;
  private db: any = null;
  
  // Whitelist of allowed commands
  private readonly ALLOWED_COMMANDS = [
    '/start',
    '/menu',
    '/topup',
    '/install',
    '/myquota',
    '/history',
    '/winver',
    '/versions',
    '/help',
    '/cancel'
  ];
  
  // Commands that require user to be registered
  private readonly REGISTERED_USER_COMMANDS = [
    '/menu',
    '/topup',
    '/install',
    '/myquota',
    '/balance',
    '/history'
  ];
  
  // Commands that require special permissions
  private readonly ADMIN_COMMANDS = [
    '/admin',
    '/broadcast',
    '/stats',
    '/users'
  ];

  private constructor() {
    // Initialize security monitoring
  }

  private initializeDb() {
    if (!this.db) {
      this.db = getDatabase();
    }
    return this.db;
  }

  public static getInstance(): BotSecurity {
    if (!BotSecurity.instance) {
      BotSecurity.instance = new BotSecurity();
    }
    return BotSecurity.instance;
  }

  public async checkSecurity(context: SecurityContext): Promise<SecurityResult> {
    try {
      // Enhanced logging for security monitoring
      this.logger.info('Security check initiated', {
        userId: context.userId,
        username: context.username,
        command: context.command,
        chatId: context.chatId,
        timestamp: new Date().toISOString()
      });
      
      // 1. Check if command is allowed
      const commandCheck = this.checkAllowedCommand(context.command);
      if (!commandCheck.allowed) {
        await this.logCommand(context.userId, context.command, 'blocked_invalid_command');
        return commandCheck;
      }
      
      // 1.1. Validate command arguments
      const argsCheck = this.validateCommandArguments(context.command, context.args);
      if (!argsCheck.allowed) {
        await this.logCommand(context.userId, context.command, 'blocked_invalid_args');
        return argsCheck;
      }

      // 2. Check rate limits
      const rateLimitCheck = await this.checkRateLimits(context);
      if (!rateLimitCheck.allowed) {
        await this.logCommand(context.userId, context.command, 'blocked_rate_limit');
        return rateLimitCheck;
      }

      // 3. Check user registration for protected commands
      if (this.REGISTERED_USER_COMMANDS.includes(context.command)) {
        const userCheck = await this.checkUserRegistration(context.userId, context.command);
        if (!userCheck.allowed) {
          await this.logCommand(context.userId, context.command, 'blocked_unregistered');
          return userCheck;
        }
      }

      // 4. Check admin permissions for admin commands
      if (this.ADMIN_COMMANDS.includes(context.command)) {
        const adminCheck = await this.checkAdminPermissions(context.userId);
        if (!adminCheck.allowed) {
          await this.logCommand(context.userId, context.command, 'blocked_no_admin');
          return adminCheck;
        }
      }

      // 5. Check for suspicious activity
      const suspiciousCheck = await this.checkSuspiciousActivity(context);
      if (!suspiciousCheck.allowed) {
        await this.logCommand(context.userId, context.command, 'blocked_suspicious');
        return suspiciousCheck;
      }

      // Log successful command for monitoring
      await this.logCommand(context.userId, context.command, 'success');
      
      // All checks passed
      return {
        allowed: true,
        rateLimitInfo: {
          remaining: this.rateLimiter.getRemainingRequests(
            `user:${context.userId}`,
            RATE_LIMITS.BOT_COMMANDS
          ),
          resetTime: this.rateLimiter.getResetTime(`user:${context.userId}`)
        }
      };

    } catch (error) {
      this.logger.error('Security check failed', { error, context });
      await this.logCommand(context.userId, context.command, 'error');
      return {
        allowed: false,
        reason: '❌ Validasi keamanan gagal. Silakan coba lagi nanti.'
      };
    }
  }

  private checkAllowedCommand(command: string): SecurityResult {
    // Additional validation for command format
    if (!command || typeof command !== 'string') {
      this.logger.warn('Invalid command format received', { command });
      return {
        allowed: false,
        reason: '❌ Format command tidak valid.'
      };
    }
    
    // Check for command injection attempts
    const suspiciousPatterns = [
      /[;&|`$(){}\[\]]/,  // Shell metacharacters
      /\.\.\//,           // Directory traversal
      /<script/i,         // Script injection
      /javascript:/i,     // JavaScript protocol
      /data:/i,           // Data protocol
      /vbscript:/i        // VBScript protocol
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(command)) {
        this.logger.warn('Potential command injection attempt detected', { 
          command,
          pattern: pattern.toString()
        });
        return {
          allowed: false,
          reason: '🚫 Command mengandung karakter yang tidak diizinkan untuk keamanan.'
        };
      }
    }
    
    // Check if command starts with forward slash
    if (!command.startsWith('/')) {
      this.logger.warn('Command does not start with forward slash', { command });
      return {
        allowed: false,
        reason: '❌ Command harus dimulai dengan "/".'
      };
    }
    
    // Check command length
    if (command.length > 50) {
      this.logger.warn('Command too long', { command, length: command.length });
      return {
        allowed: false,
        reason: '❌ Command terlalu panjang. Maksimal 50 karakter.'
      };
    }
    
    if (!this.ALLOWED_COMMANDS.includes(command) && !this.ADMIN_COMMANDS.includes(command)) {
      this.logger.warn(`Blocked unknown command: ${command}`);
      return {
        allowed: false,
        reason: `❓ Command "${command}" tidak dikenali. Gunakan /help untuk melihat daftar command yang tersedia.`
      };
    }
    
    return { allowed: true };
  }

  private async checkRateLimits(context: SecurityContext): Promise<SecurityResult> {
    const userIdentifier = `user:${context.userId}`;
    const globalIdentifier = 'global';
    
    // Check global rate limit first
    if (!this.rateLimiter.checkLimit(globalIdentifier, RATE_LIMITS.GLOBAL_COMMANDS)) {
      const globalBlockUntil = this.rateLimiter.getBlockUntil(globalIdentifier);
      const globalResetTime = this.rateLimiter.getResetTime(globalIdentifier);
      const globalUntil = globalBlockUntil ?? globalResetTime;
      return {
        allowed: false,
        reason: `Global rate limit exceeded. Please try again ${globalUntil ? `at ${new Date(globalUntil).toLocaleTimeString()}` : 'later'}.`
      };
    }
    
    // Check if user is connected to determine rate limit strictness
    const isUserConnected = await this.isUserConnected(context.userId);
    
    // Check user-specific rate limits based on command type and connection status
    let rateLimitConfig = RATE_LIMITS.BOT_COMMANDS;
    
    if (!isUserConnected) {
      // Apply stricter limits for unconnected users
      rateLimitConfig = RATE_LIMITS.UNCONNECTED_USER_COMMANDS;
      
      // Check for spam protection (very strict limits)
      const spamIdentifier = `spam:${context.userId}`;
      if (!this.rateLimiter.checkLimit(spamIdentifier, RATE_LIMITS.UNCONNECTED_SPAM_PROTECTION)) {
        // Log potential spam attempt
        this.logger.warn(`Spam protection triggered for unconnected user ${context.userId}`, {
          command: context.command,
          username: context.username
        });
        
        // Check if user should be temporarily blocked
        await this.handleSpamAttempt(context.userId, context.username || 'Unknown');
        
        const spamBlockUntil = this.rateLimiter.getBlockUntil(spamIdentifier);
        const spamResetTime = this.rateLimiter.getResetTime(spamIdentifier);
        const spamUntil = spamBlockUntil ?? spamResetTime;
        return {
          allowed: false,
          reason: `⚠️ Terlalu banyak percobaan. Akun Anda diblokir sementara. Silakan hubungkan akun Telegram Anda terlebih dahulu dengan /start, lalu coba lagi ${spamUntil ? `pada ${new Date(spamUntil).toLocaleTimeString()}` : 'nanti'}.`
        };
      }
    } else {
      // Connected users get normal rate limits based on command type
      if (context.command === '/topup') {
        rateLimitConfig = RATE_LIMITS.TOPUP_COMMANDS;
      } else if (context.command === '/install') {
        rateLimitConfig = RATE_LIMITS.INSTALL_COMMANDS;
      }
    }
    
    if (!this.rateLimiter.checkLimit(userIdentifier, rateLimitConfig)) {
      const blockUntil = this.rateLimiter.getBlockUntil(userIdentifier);
      const resetTime = this.rateLimiter.getResetTime(userIdentifier);
      const until = blockUntil ?? resetTime;
      const message = !isUserConnected 
        ? `⚠️ Rate limit terlampaui. Hubungkan akun Telegram Anda dengan /start untuk mendapatkan akses penuh. Coba lagi ${until ? `pada ${new Date(until).toLocaleTimeString()}` : 'nanti'}.`
        : `Rate limit exceeded. Please try again ${until ? `at ${new Date(until).toLocaleTimeString()}` : 'later'}.`;
      
      return {
        allowed: false,
        reason: message
      };
    }
    
    return { allowed: true };
  }

  private async checkUserRegistration(userId: number, command?: string): Promise<SecurityResult> {
    try {
      const db = this.initializeDb();
      const user = await db.get('SELECT * FROM users WHERE telegram_user_id = ? AND is_active = 1', [userId]);
      if (!user) {
        // Provide specific guidance based on the command attempted
        let specificMessage = '';
        switch (command) {
          case '/install':
            specificMessage = '\n\n💡 Untuk menggunakan fitur instalasi Windows, Anda perlu menghubungkan akun Telegram dengan akun XME Projects Anda.';
            break;
          case '/topup':
            specificMessage = '\n\n💰 Untuk melakukan topup quota, Anda perlu menghubungkan akun Telegram dengan akun XME Projects Anda.';
            break;
          case '/myquota':
            specificMessage = '\n\n📊 Untuk melihat quota Anda, Anda perlu menghubungkan akun Telegram dengan akun XME Projects Anda.';
            break;
          case '/history':
            specificMessage = '\n\n📋 Untuk melihat riwayat instalasi, Anda perlu menghubungkan akun Telegram dengan akun XME Projects Anda.';
            break;
          default:
            specificMessage = '\n\n🔗 Hubungkan akun Anda untuk mendapatkan akses penuh ke semua fitur bot.';
        }
        
        return {
          allowed: false,
          reason: `🚫 Akun Telegram belum terhubung dengan XME Projects.${specificMessage}\n\n📝 Gunakan /start untuk menghubungkan akun atau kunjungi website kami untuk mendaftar.`
        };
      }
      
      // Check if user is active
      if (!user.is_active) {
        return {
          allowed: false,
          reason: '❌ Akun Anda tidak aktif. Silakan hubungi support di xme.noreply@gmail.com untuk mengaktifkan kembali akun Anda.'
        };
      }
      
      // Check if user is temporarily locked
      if (user.locked_until) {
        const lockUntil = new Date(user.locked_until);
        if (lockUntil > new Date()) {
          return {
            allowed: false,
            reason: `🔒 Akun Anda diblokir sementara hingga ${lockUntil.toLocaleString('id-ID')}. Alasan: Pelanggaran kebijakan penggunaan.`
          };
        }
      }
      
      return { allowed: true };
    } catch (error) {
      this.logger.error('Failed to check user registration', { error, userId });
      return {
        allowed: false,
        reason: '❌ Tidak dapat memverifikasi status akun. Silakan coba lagi nanti.'
      };
    }
  }

  private async checkAdminPermissions(userId: number): Promise<SecurityResult> {
    try {
      const db = this.initializeDb();
      const user = await db.get('SELECT * FROM users WHERE telegram_user_id = ? AND is_active = 1', [userId]);
      if (!user || !user.admin) {
        this.logger.warn(`Unauthorized admin command attempt by user ${userId}`);
        return {
          allowed: false,
          reason: 'Anda tidak memiliki akses admin.'
        };
      }
      
      return { allowed: true };
    } catch (error) {
      this.logger.error('Failed to check admin permissions', { error, userId });
      return {
        allowed: false,
        reason: 'Unable to verify permissions'
      };
    }
  }

  private async checkSuspiciousActivity(context: SecurityContext): Promise<SecurityResult> {
    try {
      // Check for rapid command switching (potential bot behavior)
      const recentCommands = await this.getRecentCommands(context.userId, 60000); // Last minute
      
      if (recentCommands.length > 20) {
        this.logger.warn(`Suspicious activity detected for user ${context.userId}`, {
          commandCount: recentCommands.length,
          commands: recentCommands
        });
        
        return {
          allowed: false,
          reason: 'Suspicious activity detected. Please slow down.'
        };
      }
      
      // Check for repeated failed commands
      const failedCommands = recentCommands.filter(cmd => cmd.status === 'failed');
      if (failedCommands.length > 5) {
        return {
          allowed: false,
          reason: 'Too many failed attempts. Please try again later.'
        };
      }
      
      // Additional checks for unconnected users
      const isUserConnected = await this.isUserConnected(context.userId);
      if (!isUserConnected) {
        // Check command cooldown for unconnected users
        const cooldownCheck = await this.checkCommandCooldown(context.userId, context.command);
        if (!cooldownCheck.allowed) {
          return cooldownCheck;
        }
        
        // Stricter suspicious activity detection for unconnected users
        if (recentCommands.length > 8) { // Lower threshold for unconnected users
          this.logger.warn(`Suspicious activity from unconnected user ${context.userId}`, {
            commandCount: recentCommands.length,
            commands: recentCommands,
            username: context.username
          });
          
          return {
            allowed: false,
            reason: '⚠️ Aktivitas mencurigakan terdeteksi. Hubungkan akun Telegram Anda dengan /start untuk mendapatkan akses penuh.'
          };
        }
      }
      
      return { allowed: true };
    } catch (error) {
      this.logger.error('Failed to check suspicious activity', { error, context });
      // Don't block on error, just log it
      return { allowed: true };
    }
  }

  private async getRecentCommands(userId: number, timeWindowMs: number): Promise<any[]> {
    try {
      const cutoffTime = DateUtils.addMinutesJakarta(-Math.floor(timeWindowMs / 60000));
      
      // This would query a bot_command_logs table if it exists
      // For now, return empty array but log the attempt
      this.logger.debug('Checking recent commands for suspicious activity', {
        userId,
        timeWindowMs,
        cutoffTime
      });
      
      return [];
    } catch (error) {
      this.logger.error('Failed to get recent commands', { error, userId });
      return [];
    }
  }

  private validateCommandArguments(command: string, args?: string[]): SecurityResult {
    // Define expected argument patterns for each command
    const commandArgRules: { [key: string]: { maxArgs: number; pattern?: RegExp; required?: boolean } } = {
      '/start': { maxArgs: 1, pattern: /^[a-zA-Z0-9_-]*$/ }, // Optional connection token
      '/topup': { maxArgs: 2, pattern: /^[0-9]+$/ }, // Amount and optional payment method
      '/install': { maxArgs: 4 }, // ip, vps_password, win_version, rdp_password
      '/winver': { maxArgs: 0 }, // No arguments
      '/versions': { maxArgs: 0 }, // No arguments
      '/myquota': { maxArgs: 0 }, // No arguments
      '/history': { maxArgs: 1, pattern: /^[0-9]+$/ }, // Optional page number
      '/help': { maxArgs: 1, pattern: /^[a-zA-Z]+$/ }, // Optional command name
      '/menu': { maxArgs: 0 }, // No arguments
      '/cancel': { maxArgs: 0 } // No arguments
    };

    const rules = commandArgRules[command];
    if (!rules) {
      // Unknown command, let other checks handle it
      return { allowed: true };
    }

    const argCount = args?.length || 0;
    
    // Check argument count
    if (argCount > rules.maxArgs) {
      this.logger.warn('Too many arguments for command', { command, argCount, maxArgs: rules.maxArgs });
      return {
        allowed: false,
        reason: `❌ Command ${command} menerima maksimal ${rules.maxArgs} argumen, tetapi diberikan ${argCount}.`
      };
    }

    // Check required arguments
    if (rules.required && argCount === 0) {
      return {
        allowed: false,
        reason: `❌ Command ${command} memerlukan argumen.`
      };
    }

    // Validate argument patterns
    if (rules.pattern && args && args.length > 0) {
      for (const arg of args) {
        if (!arg || typeof arg !== 'string') {
          return {
            allowed: false,
            reason: '❌ Format argumen tidak valid.'
          };
        }

        // Check argument length
        if (arg.length > 100) {
          this.logger.warn('Argument too long', { command, arg: arg.substring(0, 50) + '...' });
          return {
            allowed: false,
            reason: '❌ Argumen terlalu panjang. Maksimal 100 karakter per argumen.'
          };
        }

        // Check for suspicious patterns
        const suspiciousPatterns = [
          /[<>"'&;|`$(){}\[\]]/,  // Potential injection characters
          /\.\.[\/\\]/,          // Directory traversal
          /(script|javascript|vbscript|onload|onerror)/i, // Script injection
          /\x00/,                 // Null bytes
          /(union|select|insert|update|delete|drop|create|alter)/i // SQL injection
        ];

        for (const pattern of suspiciousPatterns) {
          if (pattern.test(arg)) {
            this.logger.warn('Suspicious argument pattern detected', { 
              command, 
              arg: arg.substring(0, 50),
              pattern: pattern.toString()
            });
            return {
              allowed: false,
              reason: '🚫 Argumen mengandung karakter yang tidak diizinkan untuk keamanan.'
            };
          }
        }

        // Validate against command-specific pattern
        if (!rules.pattern.test(arg)) {
          this.logger.warn('Argument does not match expected pattern', { command, arg });
          return {
            allowed: false,
            reason: `❌ Format argumen untuk ${command} tidak valid.`
          };
        }
      }
    }

    return { allowed: true };
  }

  public async logCommand(userId: number, command: string, result: 'success' | 'failed' | 'blocked_invalid_command' | 'blocked_invalid_args' | 'blocked_rate_limit' | 'blocked_unregistered' | 'blocked_no_admin' | 'blocked_suspicious' | 'error', error?: string): Promise<void> {
    try {
      // Log command execution for security monitoring
      this.logger.info('Bot command executed', {
        userId,
        command,
        result,
        error,
        timestamp: new Date().toISOString()
      });
      
      // Store in database for audit trail if bot_command_logs table exists
      try {
        const db = this.initializeDb();
        await db.run(`
          INSERT INTO bot_command_logs (telegram_user_id, command, result, error_message, created_at)
          VALUES (?, ?, ?, ?, ?)
        `, [
          userId,
          command,
          result,
          error || null,
          DateUtils.nowSQLite()
        ]);
      } catch (dbError) {
        // Ignore database errors for command logging (table might not exist)
        this.logger.debug('Could not log command to database (table might not exist)', { dbError });
      }
    } catch (error) {
      this.logger.error('Failed to log command', { error, userId, command });
    }
  }

  public async blockUser(userId: number, reason: string, durationMs?: number): Promise<void> {
    try {
      const identifier = `user:${userId}`;
      
      // Block in rate limiter
      this.rateLimiter.reset(identifier);
      
      // If duration specified, set a temporary block
      if (durationMs) {
        // Update user status in database for temporary block
        try {
          const db = this.initializeDb();
          const blockUntil = DateUtils.addMinutesJakarta(Math.floor(durationMs / 60000));
          await db.run(
            'UPDATE users SET locked_until = ?, updated_at = ? WHERE telegram_user_id = ?',
            [blockUntil, DateUtils.nowSQLite(), userId]
          );
        } catch (dbError) {
          this.logger.error('Failed to update user block status in database', { dbError, userId });
        }
        
        this.logger.warn(`Temporarily blocked user ${userId}`, { reason, durationMs });
      } else {
        // Permanent block - deactivate user
        try {
          const db = this.initializeDb();
          await db.run(
            'UPDATE users SET is_active = 0, updated_at = ? WHERE telegram_user_id = ?',
            [DateUtils.nowSQLite(), userId]
          );
        } catch (dbError) {
          this.logger.error('Failed to deactivate user in database', { dbError, userId });
        }
        
        this.logger.warn(`Permanently blocked user ${userId}`, { reason });
      }
      
    } catch (error) {
      this.logger.error('Failed to block user', { error, userId, reason });
    }
  }

  public async unblockUser(userId: number): Promise<void> {
    try {
      const identifier = `user:${userId}`;
      this.rateLimiter.unblock(identifier);
      this.rateLimiter.reset(identifier);
      
      // Unblock in database
      try {
        const db = this.initializeDb();
        await db.run(
          'UPDATE users SET is_active = 1, locked_until = NULL, updated_at = ? WHERE telegram_user_id = ?',
          [DateUtils.nowSQLite(), userId]
        );
      } catch (dbError) {
        this.logger.error('Failed to unblock user in database', { dbError, userId });
      }
      
      this.logger.info(`Unblocked user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to unblock user', { error, userId });
    }
  }

  public getSecurityStats(): any {
    return {
      rateLimiter: this.rateLimiter.getStats(),
      allowedCommands: this.ALLOWED_COMMANDS.length,
      adminCommands: this.ADMIN_COMMANDS.length,
      registeredUserCommands: this.REGISTERED_USER_COMMANDS.length,
      lastCheck: new Date().toISOString()
    };
  }

  private async isUserConnected(userId: number): Promise<boolean> {
    try {
      const db = this.initializeDb();
      const user = await db.get('SELECT id FROM users WHERE telegram_user_id = ? AND is_active = 1', [userId]);
      return !!user;
    } catch (error) {
      this.logger.error('Failed to check user connection status', { error, userId });
      return false; // Assume not connected on error for security
    }
  }

  private async handleSpamAttempt(userId: number, username: string): Promise<void> {
    try {
      // Check if user has previous spam warnings
      const warningCount = await this.getSpamWarningCount(userId);
      
      if (warningCount >= 2) {
        // Third strike - temporary block for 1 hour
        await this.blockUser(userId, `Spam protection: Multiple violations by ${username}`, 60 * 60 * 1000);
        this.logger.warn(`User ${userId} (${username}) temporarily blocked for spam after ${warningCount + 1} warnings`);
        
        // Reset warning count after blocking
        await this.resetSpamWarnings(userId);
      } else {
        // Increment warning count
        await this.incrementSpamWarning(userId);
        this.logger.warn(`Spam warning ${warningCount + 1}/3 issued to user ${userId} (${username})`);
      }
    } catch (error) {
      this.logger.error('Failed to handle spam attempt', { error, userId, username });
    }
  }

  private async getSpamWarningCount(userId: number): Promise<number> {
    try {
      const db = this.initializeDb();
      const result = await db.get(
        'SELECT warning_count FROM spam_warnings WHERE telegram_user_id = ? AND created_at > datetime("now", "-24 hours")',
        [userId]
      );
      return result?.warning_count || 0;
    } catch (error) {
      // Table might not exist, create it
      await this.createSpamWarningsTable();
      return 0;
    }
  }

  private async incrementSpamWarning(userId: number): Promise<void> {
    try {
      const db = this.initializeDb();
      await db.run(`
        INSERT OR REPLACE INTO spam_warnings (telegram_user_id, warning_count, created_at, updated_at)
        VALUES (?, COALESCE((SELECT warning_count FROM spam_warnings WHERE telegram_user_id = ? AND created_at > datetime("now", "-24 hours")), 0) + 1, datetime("now"), datetime("now"))
      `, [userId, userId]);
    } catch (error) {
      this.logger.error('Failed to increment spam warning', { error, userId });
    }
  }

  private async resetSpamWarnings(userId: number): Promise<void> {
    try {
      const db = this.initializeDb();
      await db.run('DELETE FROM spam_warnings WHERE telegram_user_id = ?', [userId]);
    } catch (error) {
      this.logger.error('Failed to reset spam warnings', { error, userId });
    }
  }

  private async createSpamWarningsTable(): Promise<void> {
    try {
      const db = this.initializeDb();
      await db.run(`
        CREATE TABLE IF NOT EXISTS spam_warnings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          telegram_user_id INTEGER NOT NULL,
          warning_count INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Create index for better performance
      await db.run('CREATE INDEX IF NOT EXISTS idx_spam_warnings_user_id ON spam_warnings(telegram_user_id)');
    } catch (error) {
      this.logger.error('Failed to create spam_warnings table', { error });
    }
  }

  private async checkCommandCooldown(userId: number, command: string): Promise<SecurityResult> {
    try {
      // Define cooldown periods for different commands (in seconds)
      const cooldownPeriods: { [key: string]: number } = {
        '/install': 30, // 30 seconds cooldown for install command
        '/topup': 20,   // 20 seconds cooldown for topup command
        '/myquota': 10, // 10 seconds cooldown for quota check
        '/history': 15, // 15 seconds cooldown for history
        '/winver': 10,  // 10 seconds cooldown for winver
        '/help': 5,     // 5 seconds cooldown for help
        '/start': 3     // 3 seconds cooldown for start
      };
      
      const cooldownSeconds = cooldownPeriods[command] || 5; // Default 5 seconds
      
      // Check if command is in cooldown
      const lastUsed = await this.getLastCommandTime(userId, command);
      if (lastUsed) {
        const timeSinceLastUse = Date.now() - lastUsed;
        const cooldownMs = cooldownSeconds * 1000;
        
        if (timeSinceLastUse < cooldownMs) {
          const remainingSeconds = Math.ceil((cooldownMs - timeSinceLastUse) / 1000);
          return {
            allowed: false,
            reason: `⏳ Cooldown aktif untuk command ${command}. Tunggu ${remainingSeconds} detik lagi. Hubungkan akun Anda dengan /start untuk menghilangkan cooldown.`
          };
        }
      }
      
      // Update last command time
      await this.updateLastCommandTime(userId, command);
      
      return { allowed: true };
    } catch (error) {
      this.logger.error('Failed to check command cooldown', { error, userId, command });
      return { allowed: true }; // Don't block on error
    }
  }

  private async getLastCommandTime(userId: number, command: string): Promise<number | null> {
    try {
      const db = this.initializeDb();
      const result = await db.get(
        'SELECT last_used FROM command_cooldowns WHERE telegram_user_id = ? AND command = ?',
        [userId, command]
      );
      return result ? new Date(result.last_used).getTime() : null;
    } catch (error) {
      // Table might not exist, create it
      await this.createCommandCooldownsTable();
      return null;
    }
  }

  private async updateLastCommandTime(userId: number, command: string): Promise<void> {
    try {
      const db = this.initializeDb();
      await db.run(`
        INSERT OR REPLACE INTO command_cooldowns (telegram_user_id, command, last_used, updated_at)
        VALUES (?, ?, datetime('now'), datetime('now'))
      `, [userId, command]);
    } catch (error) {
      this.logger.error('Failed to update last command time', { error, userId, command });
    }
  }

  private async createCommandCooldownsTable(): Promise<void> {
    try {
      const db = this.initializeDb();
      await db.run(`
        CREATE TABLE IF NOT EXISTS command_cooldowns (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          telegram_user_id INTEGER NOT NULL,
          command TEXT NOT NULL,
          last_used DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(telegram_user_id, command)
        )
      `);
      
      // Create index for better performance
      await db.run('CREATE INDEX IF NOT EXISTS idx_command_cooldowns_user_command ON command_cooldowns(telegram_user_id, command)');
    } catch (error) {
      this.logger.error('Failed to create command_cooldowns table', { error });
    }
  }
}