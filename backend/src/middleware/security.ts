import { Request, Response, NextFunction } from 'express';
import { AuthUtils } from '../utils/auth.js';
import { logger } from '../utils/logger.js';
import { ApiResponse } from '../types/user.js';

/**
 * Enhanced security middleware collection
 */

// CSRF Protection
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Skip CSRF for GET, HEAD, OPTIONS requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  const token = req.headers['x-csrf-token'] as string;
  const sessionToken = req.headers.authorization?.split(' ')[1];

  if (!token || !sessionToken) {
    res.status(403).json({
      success: false,
      message: 'CSRF token required',
      error: 'CSRF_TOKEN_MISSING'
    } as ApiResponse);
    return;
  }

  if (!AuthUtils.verifyCSRFToken(token, sessionToken)) {
    logger.error('CSRF attack detected:', {
      ip: AuthUtils.extractIPAddress(req),
      userAgent: AuthUtils.extractUserAgent(req),
      path: req.path,
      userId: req.user?.id
    });

    res.status(403).json({
      success: false,
      message: 'Invalid CSRF token',
      error: 'CSRF_TOKEN_INVALID'
    } as ApiResponse);
    return;
  }

  next();
}

// Request size limiting
export function requestSizeLimit(maxSize: number = 10 * 1024 * 1024) { // 10MB default
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    
    if (contentLength > maxSize) {
      res.status(413).json({
        success: false,
        message: 'Request entity too large',
        error: 'REQUEST_TOO_LARGE'
      } as ApiResponse);
      return;
    }

    next();
  };
}

// IP whitelist/blacklist
export function ipFilter(options: { whitelist?: string[]; blacklist?: string[] }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIp = AuthUtils.extractIPAddress(req);

    // Check blacklist first
    if (options.blacklist && options.blacklist.includes(clientIp)) {
      logger.warn('Blocked IP attempt:', {
        ip: clientIp,
        path: req.path,
        userAgent: AuthUtils.extractUserAgent(req)
      });

      res.status(403).json({
        success: false,
        message: 'Access denied',
        error: 'IP_BLOCKED'
      } as ApiResponse);
      return;
    }

    // Check whitelist if provided
    if (options.whitelist && !options.whitelist.includes(clientIp)) {
      logger.warn('Non-whitelisted IP attempt:', {
        ip: clientIp,
        path: req.path,
        userAgent: AuthUtils.extractUserAgent(req)
      });

      res.status(403).json({
        success: false,
        message: 'Access denied',
        error: 'IP_NOT_WHITELISTED'
      } as ApiResponse);
      return;
    }

    next();
  };
}

// Brute force protection
export function bruteForceProtection(maxAttempts: number = 10, windowMinutes: number = 15) {
  const attempts = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = AuthUtils.extractIPAddress(req);
    const now = Date.now();
    const windowMs = windowMinutes * 60 * 1000;

    const attemptData = attempts.get(ip);
    
    if (attemptData) {
      // Reset if window has passed
      if (now > attemptData.resetTime) {
        attempts.delete(ip);
      } else if (attemptData.count >= maxAttempts) {
        logger.warn('Brute force attempt blocked:', {
          ip,
          attempts: attemptData.count,
          path: req.path
        });

        res.status(429).json({
          success: false,
          message: 'Too many failed attempts. Please try again later.',
          error: 'BRUTE_FORCE_DETECTED',
          data: {
            retryAfter: Math.ceil((attemptData.resetTime - now) / 1000)
          }
        } as ApiResponse);
        return;
      }
    }

    // Track failed attempts on response
    res.on('finish', () => {
      if (res.statusCode === 401 || res.statusCode === 403) {
        const current = attempts.get(ip) || { count: 0, resetTime: now + windowMs };
        attempts.set(ip, {
          count: current.count + 1,
          resetTime: current.resetTime
        });
      } else if (res.statusCode === 200) {
        // Clear attempts on successful login
        attempts.delete(ip);
      }
    });

    next();
  };
}

// Request timeout middleware
export function requestTimeout(timeoutMs: number = 30000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        logger.error('Request timeout:', {
          method: req.method,
          path: req.path,
          ip: AuthUtils.extractIPAddress(req),
          timeout: timeoutMs
        });

        res.status(408).json({
          success: false,
          message: 'Request timeout',
          error: 'REQUEST_TIMEOUT'
        } as ApiResponse);
      }
    }, timeoutMs);

    res.on('finish', () => {
      clearTimeout(timeout);
    });

    next();
  };
}

// Audit logging middleware
export function auditLogger(action: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      logger.info('Audit log:', {
        action,
        userId: req.user?.id,
        ip: AuthUtils.extractIPAddress(req),
        userAgent: AuthUtils.extractUserAgent(req),
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      });
    });

    next();
  };
}

// Honeypot field detection
export function honeypotProtection(honeypotField: string = 'website') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.body && req.body[honeypotField]) {
      logger.warn('Honeypot triggered - potential bot detected:', {
        ip: AuthUtils.extractIPAddress(req),
        userAgent: AuthUtils.extractUserAgent(req),
        honeypotValue: req.body[honeypotField]
      });

      // Silently reject the request
      res.status(400).json({
        success: false,
        message: 'Invalid request',
        error: 'VALIDATION_ERROR'
      } as ApiResponse);
      return;
    }

    // Remove honeypot field from body
    if (req.body && req.body[honeypotField] !== undefined) {
      delete req.body[honeypotField];
    }

    next();
  };
}