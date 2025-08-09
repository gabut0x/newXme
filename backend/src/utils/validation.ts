import { z } from 'zod';
import { logger } from './logger.js';

/**
 * Enhanced validation utilities with security focus
 */
export class ValidationUtils {
  
  /**
   * Validate IPv4 address format
   */
  static isValidIPv4(ip: string): boolean {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4Regex.test(ip);
  }

  /**
   * Validate email format with additional security checks
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    
    // Basic format check
    if (!emailRegex.test(email)) {
      return false;
    }

    // Additional security checks
    if (email.length > 255) {
      return false;
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /\.\./,  // Double dots
      /^\./, // Starting with dot
      /\.$/, // Ending with dot
      /@.*@/, // Multiple @ symbols
    ];

    return !suspiciousPatterns.some(pattern => pattern.test(email));
  }

  /**
   * Validate username with security considerations
   */
  static isValidUsername(username: string): boolean {
    // Length check
    if (!username || username.length < 3 || username.length > 50) {
      return false;
    }

    // Character validation
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(username)) {
      return false;
    }

    // Prevent reserved usernames
    const reservedUsernames = [
      'admin', 'administrator', 'root', 'system', 'api', 'www', 'mail',
      'ftp', 'ssh', 'test', 'guest', 'anonymous', 'null', 'undefined'
    ];

    return !reservedUsernames.includes(username.toLowerCase());
  }

  /**
   * Validate password strength
   */
  static validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!password) {
      errors.push('Password is required');
      return { isValid: false, errors };
    }

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
    
    // Check for sequential characters
    if (/123|abc|qwe/i.test(password)) {
      errors.push('Password cannot contain sequential characters');
    }
    
    const commonPasswords = [
      'password', '123456', '123456789', 'qwerty', 'abc123', 
      'password123', 'admin', 'letmein', 'welcome', 'monkey',
      '12345678', 'password1', '123123', 'admin123'
    ];
    
    if (commonPasswords.includes(password.toLowerCase())) {
      errors.push('Password is too common');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Sanitize string input to prevent XSS
   */
  static sanitizeString(input: string): string {
    if (typeof input !== 'string') {
      return '';
    }

    return input
      .trim()
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // Remove control characters
  }

  /**
   * Validate file upload
   */
  static validateFileUpload(file: Express.Multer.File): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // File size validation (5MB)
    if (file.size > 5 * 1024 * 1024) {
      errors.push('File size must be less than 5MB');
    }

    // MIME type validation
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      errors.push('File must be an image (JPEG, PNG, WebP, or GIF)');
    }

    // File extension validation
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    if (!allowedExtensions.includes(fileExtension)) {
      errors.push('Invalid file extension');
    }

    // Filename validation
    if (file.originalname.length > 255) {
      errors.push('Filename is too long');
    }

    // Check for suspicious filenames
    const suspiciousPatterns = [
      /\.exe$/i, /\.bat$/i, /\.cmd$/i, /\.com$/i, /\.pif$/i,
      /\.scr$/i, /\.vbs$/i, /\.js$/i, /\.jar$/i, /\.php$/i,
      /\.asp$/i, /\.jsp$/i, /\.sh$/i, /\.py$/i
    ];

    if (suspiciousPatterns.some(pattern => pattern.test(file.originalname))) {
      errors.push('File type not allowed for security reasons');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate numeric ID parameter
   */
  static validateId(id: any): number | null {
    if (typeof id === 'string') {
      const parsed = parseInt(id, 10);
      if (Number.isInteger(parsed) && parsed > 0 && parsed <= Number.MAX_SAFE_INTEGER) {
        return parsed;
      }
    } else if (typeof id === 'number') {
      if (Number.isInteger(id) && id > 0 && id <= Number.MAX_SAFE_INTEGER) {
        return id;
      }
    }
    
    return null;
  }

  /**
   * Validate pagination parameters
   */
  static validatePagination(page: any, limit: any): { page: number; limit: number } {
    const safePage = Math.max(1, parseInt(page) || 1);
    const safeLimit = Math.max(1, Math.min(100, parseInt(limit) || 20)); // Max 100 items per page
    
    return { page: safePage, limit: safeLimit };
  }

  /**
   * Create secure Zod schema with additional validations
   */
  static createSecureSchema<T extends z.ZodRawShape>(shape: T): z.ZodObject<T> {
    return z.object(shape).strict(); // Reject unknown properties
  }
}