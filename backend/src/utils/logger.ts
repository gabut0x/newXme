import fs from 'fs';
import path from 'path';

// Simple logger utility
export class Logger {
  private logDir: string;
  private logFile: string;

  constructor() {
    this.logDir = path.join(process.cwd(), 'logs');
    this.logFile = path.join(this.logDir, 'app.log');
    this.ensureLogDirectory();
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private formatMessage(level: string, message: string, meta?: any): string {
    const timestamp = DateUtils.formatJakarta(new Date());
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp} WIB] ${level.toUpperCase()}: ${message}${metaStr}\n`;
  }

  private writeToFile(formattedMessage: string): void {
    try {
      fs.appendFileSync(this.logFile, formattedMessage);
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

    // Write to file in production
    if (process.env.NODE_ENV === 'production') {
      this.writeToFile(formattedMessage);
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
    if (process.env.NODE_ENV === 'development') {
      this.log('debug', message, meta);
    }
  }
}

export const logger = new Logger();