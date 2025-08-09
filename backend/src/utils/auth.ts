import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { JWTPayload } from '../types/user.js';
import { SessionManager } from '../config/redis.js';
import { logger } from './logger.js';
import { DateUtils } from './dateUtils.js';

export class AuthUtils {
  private static readonly JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
  private static readonly JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
  private static readonly JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
  private static readonly BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');

  // Password hashing
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.BCRYPT_ROUNDS);
  }

  static async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // JWT token generation and verification
  static generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: this.JWT_EXPIRES_IN,
      issuer: 'xme-projects',
      audience: 'xme-projects-users',
    });
  }

  static generateRefreshToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: this.JWT_REFRESH_EXPIRES_IN,
      issuer: 'xme-projects',
      audience: 'xme-projects-users',
    });
  }

  static verifyToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET, {
        issuer: 'xme-projects',
        audience: 'xme-projects-users',
      }) as JWTPayload;
      
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token has expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      } else {
        throw new Error('Token verification failed');
      }
    }
  }

  static getTokenExpiration(token: string): number | null {
    try {
      const decoded = jwt.decode(token) as JWTPayload;
      return decoded.exp || null;
    } catch {
      return null;
    }
  }

  // Generate password reset token
  static generatePasswordResetToken(userId: number, email: string): string {
    const payload = {
      userId,
      email,
      type: 'password_reset',
      iat: DateUtils.getJakartaUnixTimestamp()
    };
    
    return jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: process.env.VERIFICATION_CODE_EXPIRES_MINUTES ? `${process.env.VERIFICATION_CODE_EXPIRES_MINUTES}m` : '15m',
      issuer: 'xme-projects',
      audience: 'xme-projects-reset',
    });
  }

  // Verify password reset token
  static verifyPasswordResetToken(token: string): { userId: number; email: string } | null {
    try {
      const decoded = jwt.verify(token, this.JWT_SECRET, {
        issuer: 'xme-projects',
        audience: 'xme-projects-reset',
      }) as any;
      
      if (decoded.type !== 'password_reset') {
        return null;
      }
      
      return {
        userId: decoded.userId,
        email: decoded.email
      };
    } catch (error) {
      return null;
    }
  }

  // Verification code generation
  static generateVerificationCode(): string {
    // Generate with Jakarta timestamp for uniqueness
    const timestamp = DateUtils.getJakartaUnixTimestamp();
    const random = crypto.randomInt(100000, 999999);
    return random.toString();
  }

  // Session token generation
  static generateSessionToken(): string {
    const timestamp = DateUtils.getJakartaUnixTimestamp();
    const random = crypto.randomBytes(32).toString('hex');
    return `${timestamp}_${random}`;
  }

  // Token blacklisting
  static async blacklistToken(token: string): Promise<void> {
    try {
      const expiration = this.getTokenExpiration(token);
      if (expiration) {
        const now = Math.floor(Date.now() / 1000);
        const remainingSeconds = expiration - now;
        
        if (remainingSeconds > 0) {
          await SessionManager.blacklistToken(token, remainingSeconds);
        }
      }
    } catch (error) {
      logger.error('Failed to blacklist token:', error);
    }
  }

  static async isTokenBlacklisted(token: string): Promise<boolean> {
    try {
      return await SessionManager.isTokenBlacklisted(token);
    } catch (error) {
      logger.error('Failed to check token blacklist:', error);
      return false;
    }
  }

  // Password strength validation
  static validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    
    if (password.length > 128) {
      errors.push('Password must be less than 128 characters long');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (!/[@$!%*?&]/.test(password)) {
      errors.push('Password must contain at least one special character (@$!%*?&)');
    }
    
    // Check for common patterns
    if (/(.)\1{2,}/.test(password)) {
      errors.push('Password cannot contain repeated characters');
    }
    
    const commonPasswords = [
      'password', '123456', '123456789', 'qwerty', 'abc123', 
      'password123', 'admin', 'letmein', 'welcome', 'monkey'
    ];
    
    if (commonPasswords.includes(password.toLowerCase())) {
      errors.push('Password is too common');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Generate secure random string
  static generateSecureRandomString(length: number = 32): string {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
  }

  // Rate limiting key generation
  static generateRateLimitKey(ip: string, action: string): string {
    return `${action}:${ip}`;
  }

  // Extract IP address from request
  static extractIPAddress(req: any): string {
    return req.ip || 
           req.connection?.remoteAddress || 
           req.socket?.remoteAddress || 
           req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
           'unknown';
  }

  // Extract user agent from request
  static extractUserAgent(req: any): string {
    return req.headers['user-agent'] || 'unknown';
  }

  // Sanitize user input
  static sanitizeInput(input: string): string {
    if (typeof input !== 'string') {
      return '';
    }
    
    return input
      .trim()
      .replace(/[<>]/g, '') // Remove HTML brackets
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
      .substring(0, 1000); // Limit length to prevent DoS
  }

  // Generate CSRF token
  static generateCSRFToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Verify CSRF token
  static verifyCSRFToken(token: string, sessionToken: string): boolean {
    try {
      const expectedToken = crypto.createHmac('sha256', this.JWT_SECRET)
        .update(sessionToken)
        .digest('hex');
      
      return crypto.timingSafeEqual(
        Buffer.from(token, 'hex'),
        Buffer.from(expectedToken, 'hex')
      );
    } catch {
      return false;
    }
  }
}