// Load environment variables first - before any other imports
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from the correct path
dotenv.config({ path: path.join(__dirname, '../.env') });

// Set timezone to Asia/Jakarta globally
process.env.TZ = 'Asia/Jakarta';

// Log timezone info for debugging
logger.info('Timezone Configuration:', {
  processEnvTZ: process.env.TZ,
  systemTime: new Date().toString(),
  jakartaTime: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
  utcTime: new Date().toISOString()
});

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { 
  securityHeaders, 
  requestLogger, 
  sqlInjectionProtection,
  validateContentType
} from './middleware/auth.js';
import { 
  bruteForceProtection,
  requestTimeout,
  requestSizeLimit
} from './middleware/security.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/user.js';
import adminRoutes from './routes/admin.js';
import { paymentRoutes } from './routes/payment.js';
import { initializeDatabase } from './database/init.js';
import { connectRedis } from './config/redis.js';
import { logger } from './utils/logger.js';
import { emailService } from './services/emailService.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Request timeout protection
app.use(requestTimeout(30000)); // 30 seconds

// Request size limiting
app.use(requestSizeLimit(10 * 1024 * 1024)); // 10MB

// Security middleware
app.use(securityHeaders);
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Brute force protection
app.use(bruteForceProtection(10, 15)); // 10 attempts per 15 minutes

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000'), // Reduced for security
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for OPTIONS requests
  skip: (req) => req.method === 'OPTIONS',
  // Enhanced rate limiting with user tracking
  keyGenerator: (req) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const userId = req.user?.id || 'anonymous';
    return `${ip}:${userId}`;
  }
});

app.use(limiter);

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      process.env.CORS_ORIGIN || 'http://localhost:5173',
      process.env.FRONTEND_URL || 'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5174'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      // In development, allow any localhost origin
      if (process.env.NODE_ENV === 'development' && origin?.includes('localhost')) {
        logger.info(`Development mode: allowing localhost origin: ${origin}`);
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With', 
    'Accept', 
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: ['Content-Length', 'X-Total-Count'],
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(204);
});

// Debug middleware for CORS
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path} - Origin: ${req.headers.origin || 'none'}`);
    if (req.method === 'OPTIONS') {
      logger.info('Preflight request detected');
    }
    next();
  });
}

// General middleware
app.use(compression());
app.use(morgan('combined', {
  stream: {
    write: (message: string) => {
      logger.info(message.trim());
    }
  }
}));

// Content-Type validation for POST/PUT requests
app.use(validateContentType(['application/json', 'multipart/form-data']));

app.use(express.json({ 
  limit: '10mb',
  strict: true, // Only parse arrays and objects
  type: 'application/json'
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb',
  parameterLimit: 100 // Limit number of parameters
}));
app.use(cookieParser());

// Request logging with security monitoring
app.use(requestLogger);

// SQL injection protection
app.use(sqlInjectionProtection);

// Serve static files for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  maxAge: '1d',
  etag: false,
  lastModified: false,
  setHeaders: (res, path) => {
    // Security headers for static files
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400');
  }
}));

// Health check endpoint
app.get('/health', (req, res) => {
  const jakartaTime = DateUtils.formatJakarta(new Date());
  const jakartaSQLite = DateUtils.nowSQLite();
  
  res.status(200).json({
    status: 'OK',
    timestamp: jakartaTime + ' WIB',
    sqlite_format: jakartaSQLite,
    utc_timestamp: new Date().toISOString(),
    timezone_env: process.env.TZ,
    timezone_offset: DateUtils.getJakartaOffset(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    timezone: 'Asia/Jakarta'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payment', paymentRoutes);

// Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    logger.info('Database initialized successfully');

    // Connect to Redis
    await connectRedis();
    logger.info('Redis connected successfully');

    // Test email service connection
    const emailConnected = await emailService.testConnection();
    if (emailConnected) {
      logger.info('Email service connected successfully');
    } else {
      logger.warn('Email service connection failed - emails will not work');
    }

    // Start server
    app.listen(PORT, () => {
      logger.info(`🚀 XME Projects API server running on port ${PORT}`);
      logger.info(`📊 Health check available at http://localhost:${PORT}/health`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

startServer();