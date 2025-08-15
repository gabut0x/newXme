import { logger } from './logger.js';
import { RateLimiter, RATE_LIMITS } from './rateLimiter.js';
import { getDatabase } from '../database/init.js';

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
    '/help',
    '/menu',
    '/topup',
    '/install',
    '/status',
    '/myquota',
    '/balance',
    '/history',
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
      // 1. Check if command is allowed
      const commandCheck = this.checkAllowedCommand(context.command);
      if (!commandCheck.allowed) {
        return commandCheck;
      }

      // 2. Check rate limits
      const rateLimitCheck = this.checkRateLimits(context);
      if (!rateLimitCheck.allowed) {
        return rateLimitCheck;
      }

      // 3. Check user registration for protected commands
      if (this.REGISTERED_USER_COMMANDS.includes(context.command)) {
        const userCheck = await this.checkUserRegistration(context.userId);
        if (!userCheck.allowed) {
          return userCheck;
        }
      }

      // 4. Check admin permissions for admin commands
      if (this.ADMIN_COMMANDS.includes(context.command)) {
        const adminCheck = await this.checkAdminPermissions(context.userId);
        if (!adminCheck.allowed) {
          return adminCheck;
        }
      }

      // 5. Check for suspicious activity
      const suspiciousCheck = await this.checkSuspiciousActivity(context);
      if (!suspiciousCheck.allowed) {
        return suspiciousCheck;
      }

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
      return {
        allowed: false,
        reason: 'Security check failed due to internal error'
      };
    }
  }

  private checkAllowedCommand(command: string): SecurityResult {
    if (!this.ALLOWED_COMMANDS.includes(command) && !this.ADMIN_COMMANDS.includes(command)) {
      this.logger.warn(`Blocked unknown command: ${command}`);
      return {
        allowed: false,
        reason: 'Command not recognized or not allowed'
      };
    }
    return { allowed: true };
  }

  private checkRateLimits(context: SecurityContext): SecurityResult {
    const userIdentifier = `user:${context.userId}`;
    const globalIdentifier = 'global';
    
    // Check global rate limit first
    if (!this.rateLimiter.checkLimit(globalIdentifier, RATE_LIMITS.GLOBAL_COMMANDS)) {
      return {
        allowed: false,
        reason: 'Global rate limit exceeded. Please try again later.'
      };
    }
    
    // Check user-specific rate limits based on command type
    let rateLimitConfig = RATE_LIMITS.BOT_COMMANDS;
    
    if (context.command === '/topup') {
      rateLimitConfig = RATE_LIMITS.TOPUP_COMMANDS;
    } else if (context.command === '/install') {
      rateLimitConfig = RATE_LIMITS.INSTALL_COMMANDS;
    }
    
    if (!this.rateLimiter.checkLimit(userIdentifier, rateLimitConfig)) {
      const resetTime = this.rateLimiter.getResetTime(userIdentifier);
      return {
        allowed: false,
        reason: `Rate limit exceeded. Please try again ${resetTime ? `at ${new Date(resetTime).toLocaleTimeString()}` : 'later'}.`
      };
    }
    
    return { allowed: true };
  }

  private async checkUserRegistration(userId: number): Promise<SecurityResult> {
    try {
      const db = this.initializeDb();
      const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
      if (!user) {
        return {
          allowed: false,
          reason: 'You need to register first. Please contact support.'
        };
      }
      
      // Check if user is active
      if (!user.is_active) {
        return {
          allowed: false,
          reason: 'Your account is not active. Please contact support.'
        };
      }
      
      return { allowed: true };
    } catch (error) {
      this.logger.error('Failed to check user registration', { error, userId });
      return {
        allowed: false,
        reason: 'Unable to verify user registration'
      };
    }
  }

  private async checkAdminPermissions(userId: number): Promise<SecurityResult> {
    try {
      const db = this.initializeDb();
      const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
      if (!user || !user.admin) {
        this.logger.warn(`Unauthorized admin command attempt by user ${userId}`);
        return {
          allowed: false,
          reason: 'Insufficient permissions'
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
      
      return { allowed: true };
    } catch (error) {
      this.logger.error('Failed to check suspicious activity', { error, context });
      // Don't block on error, just log it
      return { allowed: true };
    }
  }

  private async getRecentCommands(userId: number, timeWindowMs: number): Promise<any[]> {
    // This would typically query a command history table
    // For now, return empty array as placeholder
    return [];
  }

  public async logCommand(context: SecurityContext, result: 'success' | 'failed', error?: string): Promise<void> {
    try {
      // Log command execution for security monitoring
      this.logger.info('Bot command executed', {
        userId: context.userId,
        username: context.username,
        chatId: context.chatId,
        command: context.command,
        args: context.args,
        result,
        error,
        timestamp: new Date().toISOString()
      });
      
      // Here you could also store in database for audit trail
      // await this.db.logBotCommand(context, result, error);
    } catch (error) {
      this.logger.error('Failed to log command', { error, context });
    }
  }

  public async blockUser(userId: number, reason: string, durationMs?: number): Promise<void> {
    try {
      const identifier = `user:${userId}`;
      
      // Block in rate limiter
      this.rateLimiter.reset(identifier);
      
      // If duration specified, set a temporary block
      if (durationMs) {
        // This would typically update user status in database
        this.logger.warn(`Temporarily blocked user ${userId}`, { reason, durationMs });
      } else {
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
      registeredUserCommands: this.REGISTERED_USER_COMMANDS.length
    };
  }
}