import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { ApiResponse } from '../types/user.js';
import { DateUtils } from '../utils/dateUtils.js';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  code?: string;
}

export function errorHandler(error: AppError, req: Request, res: Response, next: NextFunction): void {
  // Log the error
  logger.error('Error occurred:', {
    message: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id || 'anonymous',
    timestamp: DateUtils.formatJakarta(DateUtils.now()) + ' WIB'
  });

  // Default error values
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Internal server error';
  let errorCode = error.code || 'INTERNAL_ERROR';

  // Handle specific error types
  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
    errorCode = 'VALIDATION_ERROR';
  } else if (error.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid data format';
    errorCode = 'INVALID_FORMAT';
  } else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
    errorCode = 'INVALID_TOKEN';
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
    errorCode = 'TOKEN_EXPIRED';
  } else if (error.message?.includes('SQLITE_CONSTRAINT_UNIQUE')) {
    statusCode = 409;
    message = 'Resource already exists';
    errorCode = 'DUPLICATE_RESOURCE';
  } else if (error.message?.includes('ENOTFOUND') || error.message?.includes('ECONNREFUSED')) {
    statusCode = 503;
    message = 'Service temporarily unavailable';
    errorCode = 'SERVICE_UNAVAILABLE';
  }

  // Don't expose internal errors in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    message = 'Internal server error';
    errorCode = 'INTERNAL_ERROR';
  }

  const response: ApiResponse = {
    success: false,
    message,
    error: errorCode
  };

  // Add additional error details in development
  if (process.env.NODE_ENV === 'development') {
    response.data = {
      stack: error.stack,
      details: error.message
    };
  }

  res.status(statusCode).json(response);
}

export function notFoundHandler(req: Request, res: Response): void {
  const message = `Route ${req.originalUrl} not found`;
  
  logger.warn('Route not found:', {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json({
    success: false,
    message,
    error: 'ROUTE_NOT_FOUND'
  } as ApiResponse);
}

// Custom error classes
export class BadRequestError extends Error implements AppError {
  statusCode = 400;
  isOperational = true;
  code = 'BAD_REQUEST';

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'BadRequestError';
    if (code) this.code = code;
  }
}

export class UnauthorizedError extends Error implements AppError {
  statusCode = 401;
  isOperational = true;
  code = 'UNAUTHORIZED';

  constructor(message: string = 'Unauthorized', code?: string) {
    super(message);
    this.name = 'UnauthorizedError';
    if (code) this.code = code;
  }
}

export class ForbiddenError extends Error implements AppError {
  statusCode = 403;
  isOperational = true;
  code = 'FORBIDDEN';

  constructor(message: string = 'Forbidden', code?: string) {
    super(message);
    this.name = 'ForbiddenError';
    if (code) this.code = code;
  }
}

export class NotFoundError extends Error implements AppError {
  statusCode = 404;
  isOperational = true;
  code = 'NOT_FOUND';

  constructor(message: string = 'Resource not found', code?: string) {
    super(message);
    this.name = 'NotFoundError';
    if (code) this.code = code;
  }
}

export class ConflictError extends Error implements AppError {
  statusCode = 409;
  isOperational = true;
  code = 'CONFLICT';

  constructor(message: string = 'Resource conflict', code?: string) {
    super(message);
    this.name = 'ConflictError';
    if (code) this.code = code;
  }
}

export class InternalServerError extends Error implements AppError {
  statusCode = 500;
  isOperational = true;
  code = 'INTERNAL_ERROR';

  constructor(message: string = 'Internal server error', code?: string) {
    super(message);
    this.name = 'InternalServerError';
    if (code) this.code = code;
  }
}

export class ServiceUnavailableError extends Error implements AppError {
  statusCode = 503;
  isOperational = true;
  code = 'SERVICE_UNAVAILABLE';

  constructor(message: string = 'Service temporarily unavailable', code?: string) {
    super(message);
    this.name = 'ServiceUnavailableError';
    if (code) this.code = code;
  }
}