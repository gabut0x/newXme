import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { JWTPayload } from '../types/user.js';
import { SessionManager } from '../config/redis.js';
import { logger } from './logger.js';
import { DateUtils } from './dateUtils.js';

export class AuthUtils {
  private static _jwtSecret: string | null = null;
  // Use numeric seconds for jwt `expiresIn` to conform with strict typings
  private static get ACCESS_TOKEN_EXPIRES_SECONDS(): number {
    return this.parseDurationToSeconds(process.env['JWT_EXPIRES_IN'], 24 * 60 * 60);
  }
  private static get REFRESH_TOKEN_EXPIRES_SECONDS(): number {
    return this.parseDurationToSeconds(process.env['JWT_REFRESH_EXPIRES_IN'], 7 * 24 * 60 * 60);
  }
  private static readonly BCRYPT_ROUNDS = parseInt(process.env['BCRYPT_ROUNDS'] || '12');

  // Lazy-load JWT secret with validation
  private static get JWT_SECRET(): string {
    if (this._jwtSecret === null) {
      this._jwtSecret = this.validateJWTSecret();
    }
    return this._jwtSecret!;
  }

  // Parse duration strings like "15m", "24h", "7d" into seconds; fallback to defaultSeconds
  private static parseDurationToSeconds(value: string | undefined, defaultSeconds: number): number {
    if (!value) return defaultSeconds;
    const trimmed = value.trim().toLowerCase();
    const match = trimmed.match(/^(\d+)([smhd])?$/);
    if (!match) {
      const asNumber = Number(trimmed);
      return Number.isFinite(asNumber) && asNumber > 0 ? Math.floor(asNumber) : defaultSeconds;
    }
    const amount = Number(match[1]);
    const unit = match[2] as 's' | 'm' | 'h' | 'd' | undefined;
    if (!Number.isFinite(amount) || amount <= 0) return defaultSeconds;
    switch (unit) {
      case 's': return amount;
      case 'm': return amount * 60;
      case 'h': return amount * 60 * 60;
      case 'd': return amount * 24 * 60 * 60;
      default: return amount; // treat plain number as seconds
    }
  }

  // Validate and return JWT secret with security checks
  private static validateJWTSecret(): string {
    const secret = process.env['JWT_SECRET'];
    
    if (!secret) {
      logger.error('CRITICAL SECURITY WARNING: JWT_SECRET environment variable is not set!');
      throw new Error('JWT_SECRET environment variable is required for security');
    }
    
    if (secret.length < 32) {
      logger.error('CRITICAL SECURITY WARNING: JWT_SECRET is too short! Minimum 32 characters required.');
      throw new Error('JWT_SECRET must be at least 32 characters long for security');
    }
    
    // Check for weak/common secrets
    const weakSecrets = [
      'fallback-secret-key', 'your-super-secret-jwt-key', 'change-this-in-production',
      'secret', 'jwt-secret', 'your-jwt-secret', 'development', 'test', 'password'
    ];
    
    if (weakSecrets.some(weak => secret.toLowerCase().includes(weak))) {
      logger.error('CRITICAL SECURITY WARNING: JWT_SECRET appears to contain weak/default values!');
      throw new Error('JWT_SECRET contains weak/default values. Please use a strong, unique secret.');
    }
    
    // Check for sufficient entropy (basic check)
    const uniqueChars = new Set(secret).size;
    if (uniqueChars < 10) {
      logger.warn('WARNING: JWT_SECRET may have low entropy. Consider using a more complex secret.');
    }
    
    return secret;
  }

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
      expiresIn: this.ACCESS_TOKEN_EXPIRES_SECONDS,
      issuer: 'xme-projects',
      audience: 'xme-projects-users',
    });
  }

  static generateRefreshToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: this.REFRESH_TOKEN_EXPIRES_SECONDS,
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
    
    const minutes = parseInt(process.env['VERIFICATION_CODE_EXPIRES_MINUTES'] || '15', 10);
    const expiresInSeconds = Number.isFinite(minutes) && minutes > 0 ? minutes * 60 : 15 * 60;
    
    return jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: expiresInSeconds,
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

  // Generate password reset token
  static generatePasswordResetToken(userId: number, email: string): string {
    const payload = {
      userId,
      email,
      type: 'password_reset',
      iat: DateUtils.getJakartaUnixTimestamp()
    };
    
    const minutes = parseInt(process.env['VERIFICATION_CODE_EXPIRES_MINUTES'] || '15', 10);
    const expiresInSeconds = Number.isFinite(minutes) && minutes > 0 ? minutes * 60 : 15 * 60;
    
    return jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: expiresInSeconds,
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

  static async blacklistAllUserTokens(userId: number): Promise<void> {
    try {
      // This is a placeholder implementation since we don't have a way to track all tokens per user
      // In a production system, you might want to:
      // 1. Store token-to-user mapping in Redis
      // 2. Increment a user version number and check it during token verification
      // 3. Use a different approach like short-lived tokens with refresh tokens
      
      // For now, we'll log this action and rely on the password change invalidating sessions
      logger.info('All tokens invalidated for user (password reset):', { userId });
      
      // You could implement a user token version system here:
      // await SessionManager.incrementUserTokenVersion(userId);
    } catch (error) {
      logger.error('Failed to blacklist all user tokens:', error);
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