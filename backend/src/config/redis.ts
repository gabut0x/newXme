import { createClient, type RedisClientType } from 'redis';
import { logger } from '../utils/logger.js';
import { DateUtils } from '../utils/dateUtils.js';

let redisClient: RedisClientType | null = null;

export async function connectRedis(): Promise<RedisClientType> {
  try {
    const password = process.env['REDIS_PASSWORD'];
    const baseOptions = {
      socket: {
        host: process.env['REDIS_HOST'] || 'localhost',
        port: parseInt(process.env['REDIS_PORT'] || '6379'),
      },
      database: parseInt(process.env['REDIS_DB'] || '0'),
    } as const;

    const options = {
      ...baseOptions,
      ...(password ? { password } : {}),
    };

    const client: RedisClientType = createClient(options as any);

    client.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });

    client.on('connect', () => {
      logger.info('Redis client connected');
    });

    client.on('ready', () => {
      logger.info('Redis client ready');
    });

    client.on('end', () => {
      logger.info('Redis client disconnected');
    });

    await client.connect();
    redisClient = client;
    
    // Test the connection
    await client.ping();
    logger.info('Redis connection established successfully');
    
    return client;
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
}

export function getRedisClient(): RedisClientType {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call connectRedis() first.');
  }
  return redisClient;
}

// Session management functions
export class SessionManager {
  private static readonly SESSION_PREFIX = 'session:';
  private static readonly USER_SESSIONS_PREFIX = 'user_sessions:';
  private static readonly BLACKLIST_PREFIX = 'blacklist:';
  // 2FA challenge prefix
  private static readonly TWOFA_CHALLENGE_PREFIX = '2fa_challenge:';
  
  static async createSession(userId: number, sessionData: any, expirationSeconds: number = 86400): Promise<string> {
    const client = getRedisClient();
    const jakartaTimestamp = DateUtils.getJakartaUnixTimestamp();
    const sessionId = `${userId}_${jakartaTimestamp}_${Math.random().toString(36).substr(2, 9)}`;
    const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
    const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
    
    // Add Jakarta timestamp to session data
    const sessionDataWithTime = {
      ...sessionData,
      createdAt: DateUtils.nowISO(),
      jakartaTime: DateUtils.formatJakarta(DateUtils.now())
    };
    
    await client.setEx(sessionKey, expirationSeconds, JSON.stringify(sessionDataWithTime));
    await client.sAdd(userSessionsKey, sessionId);
    await client.expire(userSessionsKey, expirationSeconds);
    
    return sessionId;
  }
  
  static async getSession(sessionId: string): Promise<any | null> {
    const client = getRedisClient();
    const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
    
    const sessionData = await client.get(sessionKey);
    return sessionData ? JSON.parse(sessionData) : null;
  }
  
  static async updateSession(sessionId: string, sessionData: any, expirationSeconds: number = 86400): Promise<void> {
    const client = getRedisClient();
    const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
    
    // Add Jakarta timestamp to session data
    const sessionDataWithTime = {
      ...sessionData,
      updatedAt: DateUtils.nowISO(),
      jakartaTime: DateUtils.formatJakarta(DateUtils.now())
    };
    
    await client.setEx(sessionKey, expirationSeconds, JSON.stringify(sessionDataWithTime));
  }
  
  static async deleteSession(sessionId: string): Promise<void> {
    const client = getRedisClient();
    const sessionKey = `${this.SESSION_PREFIX}${sessionId}`;
    
    // Get session data to find user ID
    const sessionData = await client.get(sessionKey);
    if (sessionData) {
      const data = JSON.parse(sessionData);
      const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${data.userId}`;
      await client.sRem(userSessionsKey, sessionId);
    }
    
    await client.del(sessionKey);
  }
  
  static async deleteAllUserSessions(userId: number): Promise<void> {
    const client = getRedisClient();
    const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
    
    const sessionIds = await client.sMembers(userSessionsKey);
    if (sessionIds.length > 0) {
      const pipeline = client.multi();
      const sessionKeys = sessionIds.map(id => `${this.SESSION_PREFIX}${id}`);
      for (const key of sessionKeys) {
        pipeline.del(key);
      }
      pipeline.del(userSessionsKey);
      await pipeline.exec();
    }
  }
  
  static async blacklistToken(token: string, expirationSeconds: number): Promise<void> {
    const client = getRedisClient();
    const blacklistKey = `${this.BLACKLIST_PREFIX}${token}`;
    
    await client.setEx(blacklistKey, expirationSeconds, 'blacklisted');
  }
  
  static async isTokenBlacklisted(token: string): Promise<boolean> {
    const client = getRedisClient();
    const blacklistKey = `${this.BLACKLIST_PREFIX}${token}`;
    
    const result = await client.get(blacklistKey);
    return result !== null;
  }
  
  static async getUserSessionCount(userId: number): Promise<number> {
    const client = getRedisClient();
    const userSessionsKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
    
    return await client.sCard(userSessionsKey);
  }

  // 2FA challenge helpers
  static async createTwoFAChallenge(userId: number, expirationSeconds: number = 300): Promise<string> {
    const client = getRedisClient();
    const challengeId = `${userId}_${DateUtils.getJakartaUnixTimestamp()}_${Math.random().toString(36).slice(2, 10)}`;
    const key = `${this.TWOFA_CHALLENGE_PREFIX}${challengeId}`;

    const payload = {
      userId,
      createdAt: DateUtils.nowISO(),
    };

    await client.setEx(key, expirationSeconds, JSON.stringify(payload));
    return challengeId;
  }

  static async getTwoFAChallenge(challengeId: string): Promise<{ userId: number; createdAt: string } | null> {
    const client = getRedisClient();
    const key = `${this.TWOFA_CHALLENGE_PREFIX}${challengeId}`;
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  }

  static async deleteTwoFAChallenge(challengeId: string): Promise<void> {
    const client = getRedisClient();
    const key = `${this.TWOFA_CHALLENGE_PREFIX}${challengeId}`;
    await client.del(key);
  }
}

// Rate limiting functions
export class RateLimiter {
  private static readonly RATE_LIMIT_PREFIX = 'rate_limit:';
  
  static async checkRateLimit(key: string, maxRequests: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const client = getRedisClient();
    const rateLimitKey = `${this.RATE_LIMIT_PREFIX}${key}`;
    
    const current = await client.get(rateLimitKey);
    const now = DateUtils.getJakartaUnixTimestamp() * 1000; // Convert to milliseconds
    
    if (!current) {
      await client.setEx(rateLimitKey, windowSeconds, '1');
      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetTime: now + windowSeconds * 1000
      };
    }

    const count = parseInt(current, 10);
    if (count >= maxRequests) {
      const ttl = await client.ttl(rateLimitKey);
      return {
        allowed: false,
        remaining: 0,
        resetTime: now + (ttl > 0 ? ttl * 1000 : windowSeconds * 1000)
      };
    }

    await client.incr(rateLimitKey);
    const ttl = await client.ttl(rateLimitKey);
    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - (count + 1)),
      resetTime: now + (ttl > 0 ? ttl * 1000 : windowSeconds * 1000)
    };
  }
}

// Cache manager functions
export class CacheManager {
  private static readonly CACHE_PREFIX = 'cache:';

  static async set(key: string, value: any, expirationSeconds: number = 3600): Promise<void> {
    const client = getRedisClient();
    const namespacedKey = `${this.CACHE_PREFIX}${key}`;
    await client.setEx(namespacedKey, expirationSeconds, JSON.stringify(value));
  }

  static async get(key: string): Promise<any | null> {
    const client = getRedisClient();
    const namespacedKey = `${this.CACHE_PREFIX}${key}`;
    const data = await client.get(namespacedKey);
    return data ? JSON.parse(data) : null;
  }

  static async delete(key: string): Promise<void> {
    const client = getRedisClient();
    const namespacedKey = `${this.CACHE_PREFIX}${key}`;
    await client.del(namespacedKey);
  }

  static async deletePattern(pattern: string): Promise<void> {
    const client = getRedisClient();
    const namespacedPattern = `${this.CACHE_PREFIX}${pattern}`;
    const keys = await client.keys(namespacedPattern);
    if (keys.length > 0) {
      const pipeline = client.multi();
      for (const k of keys) {
        pipeline.del(k);
      }
      await pipeline.exec();
    }
  }
}