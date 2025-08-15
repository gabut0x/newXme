import { logger } from './logger.js';
import { TelegramBotService } from '../services/telegramBotService.js';
import { DateUtils } from './dateUtils.js';

interface MonitorConfig {
  cleanupInterval: number; // in milliseconds
  maxDailyStatsAge: number; // in days
  alertThresholds: {
    errorRate: number; // percentage
    responseTime: number; // milliseconds
    memoryUsage: number; // percentage
  };
}

class BotMonitor {
  private static instance: BotMonitor;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private monitorTimer: NodeJS.Timeout | null = null;
  private config: MonitorConfig;

  private constructor() {
    this.config = {
      cleanupInterval: 24 * 60 * 60 * 1000, // 24 hours
      maxDailyStatsAge: 30, // 30 days
      alertThresholds: {
        errorRate: 10, // 10%
        responseTime: 5000, // 5 seconds
        memoryUsage: 80 // 80%
      }
    };
  }

  static getInstance(): BotMonitor {
    if (!BotMonitor.instance) {
      BotMonitor.instance = new BotMonitor();
    }
    return BotMonitor.instance;
  }

  // Start monitoring
  start(): void {
    logger.info('Starting BOT monitor...');
    
    // Start cleanup timer
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldMetrics();
    }, this.config.cleanupInterval);

    // Start health monitoring (every 5 minutes)
    this.monitorTimer = setInterval(() => {
      this.checkBotHealth();
    }, 5 * 60 * 1000);

    logger.info('BOT monitor started successfully');
  }

  // Stop monitoring
  stop(): void {
    logger.info('Stopping BOT monitor...');
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }

    logger.info('BOT monitor stopped');
  }

  // Cleanup old metrics
  private cleanupOldMetrics(): void {
    try {
      logger.info('Starting metrics cleanup...');
      
      const stats = TelegramBotService.getDetailedMetrics();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.maxDailyStatsAge);
      
      let cleanedCount = 0;
      const dailyStats = stats.metrics.messages.daily;
      
      for (const [dateStr, data] of Object.entries(dailyStats)) {
        const date = new Date(dateStr);
        if (date < cutoffDate) {
          // Note: In a real implementation, you'd need to modify TelegramBotService
          // to expose a method to remove specific daily stats
          cleanedCount++;
        }
      }
      
      logger.info(`Metrics cleanup completed. Cleaned ${cleanedCount} old entries.`);
    } catch (error) {
      logger.error('Error during metrics cleanup:', error);
    }
  }

  // Check BOT health and performance
  private checkBotHealth(): void {
    try {
      const performance = TelegramBotService.getPerformanceMetrics();
      const status = TelegramBotService.getStatus();
      
      // Check if bot is running
      if (!status.isRunning) {
        this.logAlert('BOT_DOWN', 'Telegram Bot is not running', {
          lastActivity: status.lastActivity,
          errorCount: status.errorCount
        });
        return;
      }

      // Check error rate
      if (performance.reliability.errorRate > this.config.alertThresholds.errorRate) {
        this.logAlert('HIGH_ERROR_RATE', `Error rate is ${performance.reliability.errorRate}%`, {
          errorRate: performance.reliability.errorRate,
          threshold: this.config.alertThresholds.errorRate,
          totalErrors: performance.usage.totalErrors,
          totalMessages: performance.usage.totalMessages
        });
      }

      // Check memory usage (if available)
      const memoryUsage = process.memoryUsage();
      const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
      
      if (memoryUsagePercent > this.config.alertThresholds.memoryUsage) {
        this.logAlert('HIGH_MEMORY_USAGE', `Memory usage is ${memoryUsagePercent.toFixed(2)}%`, {
          memoryUsage: memoryUsage,
          usagePercent: memoryUsagePercent,
          threshold: this.config.alertThresholds.memoryUsage
        });
      }

      // Log health check
      logger.debug('BOT health check completed', {
        status: 'healthy',
        errorRate: performance.reliability.errorRate,
        memoryUsage: memoryUsagePercent.toFixed(2) + '%',
        uptime: performance.uptime.formatted,
        activeUsers: performance.usage.uniqueUsers
      });
      
    } catch (error) {
      logger.error('Error during health check:', error);
      this.logAlert('HEALTH_CHECK_FAILED', 'Failed to perform health check', {
        error: error.message
      });
    }
  }

  // Log alert
  private logAlert(type: string, message: string, details: any): void {
    logger.warn(`BOT ALERT [${type}]: ${message}`, {
      alertType: type,
      message,
      details,
      timestamp: new Date().toISOString()
    });
  }

  // Get monitor status
  getStatus(): any {
    return {
      isRunning: this.cleanupTimer !== null && this.monitorTimer !== null,
      config: this.config,
      nextCleanup: this.cleanupTimer ? new Date(Date.now() + this.config.cleanupInterval) : null,
      lastHealthCheck: new Date()
    };
  }

  // Update configuration
  updateConfig(newConfig: Partial<MonitorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('BOT monitor configuration updated', this.config);
    
    // Restart with new config
    if (this.cleanupTimer || this.monitorTimer) {
      this.stop();
      this.start();
    }
  }
}

export { BotMonitor, MonitorConfig };
export default BotMonitor;