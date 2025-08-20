import fs from 'fs';
import path from 'path';
import { DateUtils } from './dateUtils.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple logger utility
export class Logger {
  private logDir: string;
  private logFile: string;
  private errorLogFile: string;
  private accessLogFile: string;

  constructor() {
    this.logDir = path.join(__dirname, '../../logs');
    this.logFile = path.join(this.logDir, 'app.log');
    this.errorLogFile = path.join(this.logDir, 'error.log');
    this.accessLogFile = path.join(this.logDir, 'access.log');
    this.ensureLogDirectory();
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private formatMessage(level: string, message: string, meta?: any): string {
    const timestamp = DateUtils.formatJakarta(DateUtils.now());
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp} WIB] ${level.toUpperCase()}: ${message}${metaStr}\n`;
  }

  private writeToFile(formattedMessage: string, logFile?: string): void {
    try {
      const targetFile = logFile || this.logFile;
      fs.appendFileSync(targetFile, formattedMessage);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  private log(level: string, message: string, meta?: any): void {
    const formattedMessage = this.formatMessage(level, message, meta);
    
    // Write to console
    if (level === 'error') {
      console.error(formattedMessage.trim());
    } else if (level === 'warn') {
      console.warn(formattedMessage.trim());
    } else {
      console.log(formattedMessage.trim());
    }

    // Write to appropriate log files
    this.writeToFile(formattedMessage, this.logFile);
    
    // Write errors to separate error log
    if (level === 'error') {
      this.writeToFile(formattedMessage, this.errorLogFile);
    }
    
    // Write access logs to separate file if it's a request log
    if (meta && (meta.method || meta.url || meta.statusCode)) {
      this.writeToFile(formattedMessage, this.accessLogFile);
    }
  }

  info(message: string, meta?: any): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: any): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: any): void {
    this.log('error', message, meta);
  }

  debug(message: string, meta?: any): void {
    if (process.env['NODE_ENV'] === 'development') {
      this.log('debug', message, meta);
    }
  }

  // Specific log methods for different types
  access(message: string, meta?: any): void {
    const formattedMessage = this.formatMessage('access', message, meta);
    this.writeToFile(formattedMessage, this.accessLogFile);
  }

  security(message: string, meta?: any): void {
    const formattedMessage = this.formatMessage('security', message, meta);
    this.writeToFile(formattedMessage, this.logFile);
    this.writeToFile(formattedMessage, this.errorLogFile);
    console.warn(formattedMessage.trim());
  }
}

export const logger = new Logger();