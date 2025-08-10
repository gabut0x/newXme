// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { AuthUtils } from '../utils/auth.js';
import { UserService } from '../services/userService.js';
import { RateLimiter } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { ApiResponse } from '../types/user.js';
import { DateUtils } from '../utils/dateUtils.js';

// ========================
// Express Request Augment
// ========================
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        username: string;
        email: string;
        isVerified: boolean;
        admin: number; // 1 = admin, 0 = non-admin
      };
    }
  }
}

// ========================
// Auth Middlewares
// ========================
export async function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Access token required',
        error: 'MISSING_TOKEN'
      } as ApiResponse);
      return;
    }

    // Check if token is blacklisted
    const isBlacklisted = await AuthUtils.isTokenBlacklisted(token);
    if (isBlacklisted) {
      res.status(401).json({
        success: false,
        message: 'Token has been revoked',
        error: 'TOKEN_REVOKED'
      } as ApiResponse);
      return;
    }

    // Verify token
    const decoded = AuthUtils.verifyToken(token);

    // Get user from database to ensure they still exist and are active
    const user = await UserService.getUserById(decoded.userId);
    if (!user || !user.is_active) {
      res.status(401).json({
        success: false,
        message: 'User not found or inactive',
        error: 'USER_INACTIVE'
      } as ApiResponse);
      return;
    }

    // Attach user to request (types above)
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      isVerified: user.is_verified,
      admin: user.admin
    };

    // (Opsional) kalau butuh timestamp Jakarta untuk log di handler selanjutnya:
    // res.locals.jakartaTime = `${DateUtils.formatJakarta(DateUtils.now())} WIB`;

    next();
  } catch (error) {
    logger.error('Authentication error:', error);

    let message = 'Invalid token';
    let errorCode = 'INVALID_TOKEN';

    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        message = 'Token has expired';
        errorCode = 'TOKEN_EXPIRED';
      } else if (error.message.includes('invalid')) {
        message = 'Invalid token format';
        errorCode = 'INVALID_TOKEN_FORMAT';
      }
    }

    res.status(401).json({
      success: false,
      message,
      error: errorCode
    } as ApiResponse);
  }
}

export function requireVerifiedUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
      error: 'NOT_AUTHENTICATED'
    } as ApiResponse);
    return;
  }

  if (!req.user.isVerified) {
    res.status(403).json({
      success: false,
      message: 'Email verification required',
      error: 'EMAIL_NOT_VERIFIED'
    } as ApiResponse);
    return;
  }

  next();
}

export function requireUnverifiedUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required',
      error: 'NOT_AUTHENTICATED'
    } as ApiResponse);
    return;
  }

  if (req.user.isVerified) {
    res.status(400).json({
      success: false,
      message: 'User is already verified',
      error: 'ALREADY_VERIFIED'
    } as ApiResponse);
    return;
  }

  next();
}

// ========================
// Rate Limiting
// ========================
export function createRateLimitMiddleware(
  action: string,
  maxRequests: number = 5,
  windowMinutes: number = 15
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ip = AuthUtils.extractIPAddress(req);
      const key = AuthUtils.generateRateLimitKey(ip, action);
      const windowSeconds = windowMinutes * 60;

      const result = await RateLimiter.checkRateLimit(key, maxRequests, windowSeconds);

      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
      });

      if (!result.allowed) {
        res.status(429).json({
          success: false,
          message: `Too many ${action} attempts. Please try again later.`,
          error: 'RATE_LIMIT_EXCEEDED',
          data: {
            retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
          }
        } as ApiResponse);
        return;
      }

      next();
    } catch (error) {
      logger.error('Rate limiting error:', error);
      // Continue without rate limiting if Redis is down
      next();
    }
  };
}

export const loginRateLimit = createRateLimitMiddleware('login', 5, 15);
export const registerRateLimit = createRateLimitMiddleware('register', 3, 60);
export const forgotPasswordRateLimit = createRateLimitMiddleware('forgot-password', 3, 15);
export const verifyEmailRateLimit = createRateLimitMiddleware('verify-email', 5, 15);
export const resendVerificationRateLimit = createRateLimitMiddleware('resend-verification', 3, 5);

// ========================
// Validation + Security
// ========================
export function validateRequest(schema: any) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const sanitizedBody = sanitizeRequestBody(req.body);
      const validatedData = schema.parse(sanitizedBody);
      req.body = validatedData;
      next();
    } catch (error: any) {
      logger.warn('Validation error:', {
        error: error.message,
        ip: AuthUtils.extractIPAddress(req),
        userAgent: AuthUtils.extractUserAgent(req),
        path: req.path,
        body: req.body
      });

      let errors: Array<{ field: string; message: string }> = [];

      if (error.errors && Array.isArray(error.errors)) {
        errors = error.errors.map((err: any) => {
          const field = err.path && err.path.length > 0 ? err.path.join('.') : 'unknown';
          let message = err.message || 'Invalid value';

          switch (err.code) {
            case 'too_small':
              if (err.type === 'string') {
                message = `${field} must be at least ${err.minimum} characters long`;
              }
              break;
            case 'too_big':
              if (err.type === 'string') {
                message = `${field} must be no more than ${err.maximum} characters long`;
              }
              break;
            case 'invalid_string':
              if (err.validation === 'email') {
                message = 'Please enter a valid email address';
              } else if (err.validation === 'regex') {
                if (field === 'username') {
                  message = 'Username can only contain letters, numbers, hyphens, and underscores';
                } else if (field === 'password') {
                  message = 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)';
                }
              }
              break;
            case 'custom':
              if (field === 'username' && message.includes('inappropriate')) {
                message = 'Username contains inappropriate content. Please choose a different username.';
              } else if (field === 'confirmPassword' && message.includes("don't match")) {
                message = 'Password confirmation does not match the password';
              }
              break;
            default:
              break;
          }

          return { field, message };
        });
      } else {
        errors = [{
          field: 'general',
          message: error.message || 'Validation failed. Please check your input and try again.'
        }];
      }

      let mainMessage = 'Validation failed';
      if (errors.length === 1 && errors[0]) {
        mainMessage = `Validation failed: ${errors[0].message}`;
      } else if (errors.length > 1) {
        mainMessage = `Validation failed for ${errors.length} field(s)`;
      }

      res.status(400).json({
        success: false,
        message: mainMessage,
        error: 'VALIDATION_ERROR',
        data: { errors }
      } as ApiResponse);
    }
  };
}

function sanitizeRequestBody(body: any): any {
  if (typeof body !== 'object' || body === null) return body;

  const sanitized: any = {};

  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') {
      sanitized[key] = value
        .trim()
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        .replace(/\s+/g, ' ');
    } else if (typeof value === 'number') {
      sanitized[key] = Number.isFinite(value) ? value : 0;
    } else if (typeof value === 'boolean') {
      sanitized[key] = Boolean(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => typeof item === 'string' ? item.trim() : item);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeRequestBody(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// ========================
// Headers & Logging
// ========================
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self';"
  });
  next();
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const ip = AuthUtils.extractIPAddress(req);
  const userAgent = AuthUtils.extractUserAgent(req);

  const suspiciousPatterns = [
    /union.*select/i,
    /drop.*table/i,
    /<script/i,
    /javascript:/i,
    /\.\.\/\.\.\//,
    /etc\/passwd/i,
    /cmd\.exe/i,
    /powershell/i
  ];

  const requestData = JSON.stringify({
    body: req.body,
    query: req.query,
    params: req.params
  });

  const hasSuspiciousContent = suspiciousPatterns.some(pattern =>
    pattern.test(requestData) || pattern.test(req.originalUrl)
  );

  if (hasSuspiciousContent) {
    logger.security('Suspicious request detected:', {
      method: req.method,
      url: req.originalUrl,
      ip,
      userAgent,
      body: req.body,
      query: req.query,
      params: req.params
    });
  }

  res.on('finish', () => {
    const duration = Date.now() - start;
    const userId = req.user?.id || 'anonymous';

    const logData = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip,
      userAgent,
      userId
    };

    if (res.statusCode >= 400) {
      logger.error('Request failed:', logData);
    } else {
      logger.access('Request completed:', logData);
    }
  });

  next();
}

// ========================
// Helpers
// ========================
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// IDOR protection
export function requireResourceOwnership(resourceIdParam: string = 'id', userIdField: string = 'user_id') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'Authentication required',
          error: 'NOT_AUTHENTICATED'
        } as ApiResponse);
        return;
      }

      // Skip for admin users
      if (req.user.admin === 1) {
        next();
        return;
      }

      const resourceId = req.params[resourceIdParam];
      if (!resourceId) {
        res.status(400).json({
          success: false,
          message: 'Resource ID required',
          error: 'MISSING_RESOURCE_ID'
        } as ApiResponse);
        return;
      }

      // Basic check for userId routes
      if (resourceIdParam === 'userId' && parseInt(resourceId) !== req.user.id) {
        logger.warn('IDOR attempt detected:', {
          userId: req.user.id,
          attemptedResourceId: resourceId,
          ip: AuthUtils.extractIPAddress(req),
          path: req.path
        });

        res.status(403).json({
          success: false,
          message: 'Access denied',
          error: 'INSUFFICIENT_PERMISSIONS'
        } as ApiResponse);
        return;
      }

      next();
    } catch (error) {
      logger.error('Resource ownership check failed:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: 'AUTHORIZATION_ERROR'
      } as ApiResponse);
    }
  };
}

// SQL injection detection
export function sqlInjectionProtection(req: Request, res: Response, next: NextFunction): void {
  const sqlPatterns = [
    /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b.*\b(from|where|into|values)\b)/i,
    /(--|\/\*|\*\/);/,
    /(\b(or|and)\b.*=.*\b(or|and)\b.*=)/i,
    /('.*'.*=.*'.*')/,
    /(0x[0-9a-f]+.*=)/i,
    /(\bchar\b|\bcast\b|\bconvert\b).*\(/i
  ];

  const checkForSqlInjection = (obj: any, path: string = ''): boolean => {
    if (typeof obj === 'string') {
      if (obj.length < 3) return false;

      if (path.includes('email') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(obj)) return false;
      if (path.includes('username') && /^[a-zA-Z0-9_-]+$/.test(obj)) return false;
      if (path.includes('password') && !/\b(select|union|drop|insert|update|delete|create|alter)\b/i.test(obj)) return false;

      return sqlPatterns.some(pattern => pattern.test(obj));
    }

    if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        if (checkForSqlInjection(value, currentPath)) {
          logger.error('SQL injection attempt detected:', {
            path: currentPath,
            value,
            ip: AuthUtils.extractIPAddress(req),
            userAgent: AuthUtils.extractUserAgent(req),
            userId: req.user?.id
          });
          return true;
        }
      }
    }

    return false;
  };

  if (checkForSqlInjection(req.body) ||
      checkForSqlInjection(req.query) ||
      checkForSqlInjection(req.params)) {
    res.status(400).json({
      success: false,
      message: 'Invalid input detected',
      error: 'MALICIOUS_INPUT'
    } as ApiResponse);
    return;
  }

  next();
}

// Upload guard
export function validateFileUpload(req: Request, res: Response, next: NextFunction): void {
  if (!req.file) {
    next();
    return;
  }

  const file = req.file;

  if (file.size > 5 * 1024 * 1024) {
    res.status(400).json({
      success: false,
      message: 'File too large',
      error: 'FILE_SIZE_EXCEEDED'
    } as ApiResponse);
    return;
  }

  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  if (!allowedMimeTypes.includes(file.mimetype)) {
    res.status(400).json({
      success: false,
      message: 'Invalid file type',
      error: 'INVALID_FILE_TYPE'
    } as ApiResponse);
    return;
  }

  const dangerousExtensions = ['.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar', '.php', '.asp', '.jsp'];
  const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));

  if (dangerousExtensions.includes(fileExtension)) {
    logger.error('Malicious file upload attempt:', {
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      ip: AuthUtils.extractIPAddress(req),
      userId: req.user?.id
    });

    res.status(400).json({
      success: false,
      message: 'File type not allowed',
      error: 'DANGEROUS_FILE_TYPE'
    } as ApiResponse);
    return;
  }

  next();
}

// Params guard
export function validateNumericId(paramName: string = 'id') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const id = req.params[paramName];

    if (!id || !/^\d+$/.test(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid ID format',
        error: 'INVALID_ID'
      } as ApiResponse);
      return;
    }

    const numericId = parseInt(id, 10);
    if (numericId <= 0 || numericId > Number.MAX_SAFE_INTEGER) {
      res.status(400).json({
        success: false,
        message: 'ID out of valid range',
        error: 'INVALID_ID_RANGE'
      } as ApiResponse);
      return;
    }

    next();
  };
}

// Content-Type guard
export function validateContentType(expectedTypes: string[] = ['application/json']) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'GET' || req.method === 'DELETE') {
      next();
      return;
    }

    const contentType = req.headers['content-type'];

    if (!contentType) {
      res.status(400).json({
        success: false,
        message: 'Content-Type header required',
        error: 'MISSING_CONTENT_TYPE'
      } as ApiResponse);
      return;
    }

    const isValidType = expectedTypes.some(type =>
      contentType.toLowerCase().includes(type.toLowerCase())
    );

    if (!isValidType) {
      res.status(415).json({
        success: false,
        message: 'Unsupported Media Type',
        error: 'INVALID_CONTENT_TYPE'
      } as ApiResponse);
      return;
    }

    next();
  };
}