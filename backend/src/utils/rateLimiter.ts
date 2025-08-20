import { logger } from './logger.js';

interface RateLimitEntry {
  count: number;
  resetTime: number;
  blocked: boolean;
  blockUntil?: number;
}

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  blockDurationMs: number; // How long to block after exceeding limit
  skipSuccessfulRequests?: boolean;
}

export class RateLimiter {
  private static instance: RateLimiter;
  private limits: Map<string, RateLimitEntry> = new Map();
  private logger = logger;
  private cleanupInterval: NodeJS.Timeout;

  private constructor() {
    // Cleanup expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  public static getInstance(): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter();
    }
    return RateLimiter.instance;
  }

  public checkLimit(identifier: string, config: RateLimitConfig): boolean {
    const now = Date.now();
    const entry = this.limits.get(identifier);

    // Check if currently blocked
    if (entry?.blocked && entry.blockUntil && now < entry.blockUntil) {
      this.logger.warn(`Rate limit blocked for ${identifier}`, {
        blockUntil: new Date(entry.blockUntil),
        remainingMs: entry.blockUntil - now
      });
      return false;
    }

    // Initialize or reset if window expired
    if (!entry || now >= entry.resetTime) {
      this.limits.set(identifier, {
        count: 1,
        resetTime: now + config.windowMs,
        blocked: false
      });
      return true;
    }

    // Increment count
    entry.count++;

    // Check if limit exceeded
    if (entry.count > config.maxRequests) {
      entry.blocked = true;
      entry.blockUntil = now + config.blockDurationMs;
      
      this.logger.warn(`Rate limit exceeded for ${identifier}`, {
        count: entry.count,
        maxRequests: config.maxRequests,
        blockUntil: new Date(entry.blockUntil)
      });
      
      return false;
    }

    return true;
  }

  public getRemainingRequests(identifier: string, config: RateLimitConfig): number {
    const entry = this.limits.get(identifier);
    if (!entry || Date.now() >= entry.resetTime) {
      return config.maxRequests;
    }
    return Math.max(0, config.maxRequests - entry.count);
  }

  public getResetTime(identifier: string): number | null {
    const entry = this.limits.get(identifier);
    return entry?.resetTime || null;
  }

  public getBlockUntil(identifier: string): number | null {
    const entry = this.limits.get(identifier);
    return entry?.blockUntil || null;
  }

  public isBlocked(identifier: string): boolean {
    const entry = this.limits.get(identifier);
    if (!entry?.blocked) return false;
    
    const now = Date.now();
    if (entry.blockUntil && now >= entry.blockUntil) {
      // Unblock if block period expired
      entry.blocked = false;
      delete entry.blockUntil;
      return false;
    }
    
    return true;
  }

  public unblock(identifier: string): void {
    const entry = this.limits.get(identifier);
    if (entry) {
      entry.blocked = false;
      delete entry.blockUntil;
      this.logger.info(`Manually unblocked ${identifier}`);
    }
  }

  public reset(identifier: string): void {
    this.limits.delete(identifier);
    this.logger.info(`Reset rate limit for ${identifier}`);
  }

  public getStats(): { totalEntries: number; blockedEntries: number } {
    const totalEntries = this.limits.size;
    const blockedEntries = Array.from(this.limits.values())
      .filter(entry => entry.blocked).length;
    
    return { totalEntries, blockedEntries };
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [identifier, entry] of this.limits.entries()) {
      // Remove expired entries that are not blocked
      if (now >= entry.resetTime && !entry.blocked) {
        this.limits.delete(identifier);
        cleaned++;
      }
      // Remove entries where block period has expired
      else if (entry.blocked && entry.blockUntil && now >= entry.blockUntil) {
        entry.blocked = false;
        delete entry.blockUntil;
      }
    }
    
    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired rate limit entries`);
    }
  }

  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.limits.clear();
  }
}

// Predefined rate limit configurations
export const RATE_LIMITS = {
  // General bot commands (per user)
  BOT_COMMANDS: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 40, // increased to 40 per minute as requested
    blockDurationMs: 1 * 60 * 1000 // 1 minute block
  },
  
  // Stricter limits for unconnected users
  UNCONNECTED_USER_COMMANDS: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5, // was 3: allow a few more
    blockDurationMs: 5 * 60 * 1000 // was 10 min: reduce block to 5 minutes
  },
  
  // Very strict limits for repeated unconnected attempts
  UNCONNECTED_SPAM_PROTECTION: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 7, // was 5: slightly more tolerant
    blockDurationMs: 10 * 60 * 1000 // was 30 min: reduce block to 10 minutes
  },
  
  // Topup commands (per user) - more restrictive
  TOPUP_COMMANDS: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5, // was 3: allow a bit more
    blockDurationMs: 3 * 60 * 1000 // was 10 min: reduce block to 3 minutes
  },
  
  // Install commands (per user) - previously very restrictive
  INSTALL_COMMANDS: {
    windowMs: 2 * 60 * 1000, // was 5 min: shorter window
    maxRequests: 4, // was 2: allow more attempts per window
    blockDurationMs: 5 * 60 * 1000 // was 30 min: reduce block to 5 minutes
  },
  
  // Global rate limit (all users combined) - relax a bit
  GLOBAL_COMMANDS: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 200, // was 80: increase global throughput
    blockDurationMs: 1 * 60 * 1000 // was 3 min: reduce block to 1 minute
  }
};