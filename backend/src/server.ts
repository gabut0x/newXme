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

// Simple logger implementation (replace with proper logger later)
const logger = {
  info: (message: string, ...args: any[]) => {
    const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    console.log(`[${timestamp}] [INFO]:`, message, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    console.warn(`[${timestamp}] [WARN]:`, message, ...args);
  },
  error: (message: string, ...args: any[]) => {
    const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    console.error(`[${timestamp}] [ERROR]:`, message, ...args);
  }
};

// Log timezone info for debugging
logger.info('Timezone Configuration:', {
  processEnvTZ: process.env.TZ,
  systemTime: new Date().toString(),
  jakartaTime: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
  utcTime: new Date().toISOString()
});

// Third-party packages
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

// Custom middleware
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

// Route handlers
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/user.js';
import adminRoutes from './routes/admin.js';
import { paymentRoutes } from './routes/payment.js';
import { installRoutes } from './routes/install.js';
import { downloadRoutes } from './routes/download.js';
import { telegramRoutes } from './routes/telegram.js';

// Database and configuration
import { initializeDatabase } from './database/init.js';
import { connectRedis } from './config/redis.js';

// Services and utilities
import { emailService } from './services/emailService.js';
import { DateUtils } from './utils/dateUtils.js';
import { TelegramBotService } from './services/telegramBotService.js';
import { BotMonitor } from './utils/botMonitor.js';

const app = express();
const PORT = process.env['PORT'] || 3001;

// Request timeout protection
app.use(requestTimeout(30000)); // 30 seconds

// Request size limiting
app.use(requestSizeLimit(10 * 1024 * 1024)); // 10MB

// Security middleware
app.use(securityHeaders);
// Helmet security headers - disable CSP in development
if (process.env['NODE_ENV'] === 'production') {
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
} else {
  // Development - minimal helmet config
  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false, // Disable CSP in development
    hsts: false
  }));
}

// Brute force protection
app.use(bruteForceProtection(10, 15)); // 10 attempts per 15 minutes

// Enhanced rate limiting with environment-specific settings
const limiter = rateLimit({
  windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '900000'), // 15 minutes
  max: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] || (process.env['NODE_ENV'] === 'production' ? '500' : '1000')),
  message: {
    error: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: Math.ceil(parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '900000') / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for OPTIONS requests
  skip: (req) => req.method === 'OPTIONS',
  // Enhanced rate limiting with user and IP tracking
  keyGenerator: (req) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const userId = (req as any).user?.id || 'anonymous';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    // Log potential abuse attempts
    if (process.env['NODE_ENV'] === 'production') {
      logger.info('Rate limit key generated', {
        ip: ip === 'unknown' ? 'masked' : ip.substring(0, 10) + '...',
        userId: userId !== 'anonymous' ? userId : 'anonymous',
        userAgent: userAgent.substring(0, 50),
        method: req.method,
        path: req.path
      });
    }
    
    return `${ip}:${userId}:${req.method}`;
  },
  // Enhanced abuse detection
  handler: (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    logger.warn('SECURITY: Rate limit exceeded', {
      ip: process.env['NODE_ENV'] === 'production' ? 'masked' : ip,
      userAgent: userAgent.substring(0, 100),
      method: req.method,
      path: req.path,
      timestamp: new Date().toISOString()
    });
    
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil(parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '900000') / 1000)
    });
  }
});

app.use(limiter);

// CORS configuration with enhanced security
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // In production, be strict about origins
    const isProduction = process.env['NODE_ENV'] === 'production';
    
    // Get configured origins
    const allowedOrigins = [
      process.env['CORS_ORIGIN'] || 'http://localhost:5173',
      process.env['FRONTEND_URL'] || 'http://localhost:5173',
    ];
    
    // Add development origins only in development mode
    if (!isProduction) {
      allowedOrigins.push(
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5174'
      );
    }
    
    // Allow requests with no origin only in development (for mobile apps, Postman, etc.)
    if (!origin) {
      if (isProduction) {
        logger.warn('SECURITY: Blocked request with no origin in production');
        return callback(new Error('Origin header required in production'));
      } else {
        logger.info('Development: Allowing request with no origin');
        return callback(null, true);
      }
    }
    
    // Check if origin is allowed
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`SECURITY: CORS blocked unauthorized origin: ${origin}`, {
        origin,
        allowedOrigins: isProduction ? '[REDACTED]' : allowedOrigins,
        userAgent: 'N/A', // Will be available in middleware context
        timestamp: new Date().toISOString()
      });
      
      // In development, allow localhost origins with warning
      if (!isProduction && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
        logger.warn(`Development: Allowing localhost origin with warning: ${origin}`);
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS policy'));
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
    'Access-Control-Request-Headers',
    'X-CSRF-Token'  // Add CSRF token support
  ],
  exposedHeaders: ['Content-Length', 'X-Total-Count', 'X-RateLimit-Remaining'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: process.env['NODE_ENV'] === 'production' ? 86400 : 0  // Cache preflight for 24h in production only
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
if (process.env['NODE_ENV'] === 'development') {
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

// Force CORS headers on ALL requests as middleware
app.use((req, res, next) => {
  // Set CORS headers on every response
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
});

// Serve static files for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  maxAge: '1d',
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
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
    environment: process.env['NODE_ENV'] || 'development',
    timezone: 'Asia/Jakarta'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/install', installRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/', downloadRoutes); // Mount download routes at root level

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

    // Resume installation monitoring after server restart
    try {
      const { InstallService } = await import('./services/installService.js');
      await InstallService.resumeInstallationMonitoring();
      logger.info('Installation monitoring resumed successfully');
    } catch (error) {
      logger.error('Failed to resume installation monitoring:', error);
      // Don't exit - this is not critical for server startup
    }

    // Initialize Telegram Bot Service
    try {
      if (process.env['TELEGRAM_BOT_TOKEN']) {
        // Check if polling mode is enabled (to avoid webhook rate limits)
        const usePolling = process.env['TELEGRAM_USE_POLLING'] === 'true';
        const result = await TelegramBotService.startBot(usePolling);
        if (result.success) {
          logger.info(`Telegram Bot started successfully in ${usePolling ? 'polling' : 'webhook'} mode`);
          
          // Start BOT monitoring
          try {
            const botMonitor = BotMonitor.getInstance();
            botMonitor.start();
            logger.info('BOT monitoring started successfully');
          } catch (monitorError) {
            logger.error('Failed to start BOT monitoring:', monitorError);
          }
        } else {
          logger.warn('Failed to start Telegram Bot:', result.message);
        }
      } else {
        logger.warn('TELEGRAM_BOT_TOKEN not found - Telegram Bot will not start');
      }
    } catch (error) {
      logger.error('Failed to initialize Telegram Bot:', error);
      // Don't exit - this is not critical for server startup
    }

    // Start server
    app.listen(PORT, () => {
      logger.info(`🚀 XME Projects API server running on port ${PORT}`);
      logger.info(`📊 Health check available at http://localhost:${PORT}/health`);
      logger.info(`🌍 Environment: ${process.env['NODE_ENV'] || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  try {
    // Stop BOT monitoring
    const botMonitor = BotMonitor.getInstance();
    botMonitor.stop();
    logger.info('BOT monitoring stopped successfully');
    
    // Stop Telegram Bot
    await TelegramBotService.stopBot();
    logger.info('Telegram Bot stopped successfully');
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  try {
    // Stop BOT monitoring
    const botMonitor = BotMonitor.getInstance();
    botMonitor.stop();
    logger.info('BOT monitoring stopped successfully');
    
    // Stop Telegram Bot
    await TelegramBotService.stopBot();
    logger.info('Telegram Bot stopped successfully');
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
  }
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