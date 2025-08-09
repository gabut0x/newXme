/**
 * Date utility functions for Asia/Jakarta timezone
 */

export class DateUtils {
  private static readonly JAKARTA_TIMEZONE = 'Asia/Jakarta';

  /**
   * Get current date/time in Asia/Jakarta timezone
   */
  static now(): Date {
    const now = new Date();
    // Convert to Jakarta timezone
    const jakartaTime = new Date(now.toLocaleString("en-US", {
      timeZone: this.JAKARTA_TIMEZONE 
    }));
    return jakartaTime;
  }

  /**
   * Get current timestamp in Asia/Jakarta timezone as ISO string
   */
  static nowISO(): string {
    const jakartaTime = this.now();
    return jakartaTime.toISOString();
  }

  /**
   * Get current timestamp for SQLite (YYYY-MM-DD HH:MM:SS format) in Jakarta timezone
   */
  static nowSQLite(): string {
    const jakartaTime = this.now();
    
    // Format as YYYY-MM-DD HH:MM:SS for SQLite
    const year = jakartaTime.getFullYear();
    const month = String(jakartaTime.getMonth() + 1).padStart(2, '0');
    const day = String(jakartaTime.getDate()).padStart(2, '0');
    const hours = String(jakartaTime.getHours()).padStart(2, '0');
    const minutes = String(jakartaTime.getMinutes()).padStart(2, '0');
    const seconds = String(jakartaTime.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * Format date to Asia/Jakarta timezone display
   */
  static formatJakarta(date: Date | string): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleString('id-ID', {
      timeZone: this.JAKARTA_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  /**
   * Add minutes to current Jakarta time and return SQLite format
   */
  static addMinutesJakarta(minutes: number): string {
    const jakartaTime = this.now();
    jakartaTime.setMinutes(jakartaTime.getMinutes() + minutes);
    
    const year = jakartaTime.getFullYear();
    const month = String(jakartaTime.getMonth() + 1).padStart(2, '0');
    const day = String(jakartaTime.getDate()).padStart(2, '0');
    const hours = String(jakartaTime.getHours()).padStart(2, '0');
    const mins = String(jakartaTime.getMinutes()).padStart(2, '0');
    const secs = String(jakartaTime.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${mins}:${secs}`;
  }

  /**
   * Check if a date is in the past (Jakarta timezone)
   */
  static isPast(date: Date | string): boolean {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const jakartaNow = this.now();
    
    return dateObj < jakartaNow;
  }

  /**
   * Get Unix timestamp for Jakarta timezone
   */
  static getJakartaUnixTimestamp(): number {
    const jakartaTime = this.now();
    return Math.floor(jakartaTime.getTime() / 1000);
  }

  /**
   * Convert Unix timestamp to Jakarta timezone date string
   */
  static unixToJakartaString(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('id-ID', {
      timeZone: this.JAKARTA_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  /**
   * Convert any date to Jakarta timezone and return SQLite format
   */
  static toJakartaSQLite(date: Date | string): string {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const jakartaTime = new Date(dateObj.toLocaleString("en-US", {
      timeZone: this.JAKARTA_TIMEZONE 
    }));
    
    const year = jakartaTime.getFullYear();
    const month = String(jakartaTime.getMonth() + 1).padStart(2, '0');
    const day = String(jakartaTime.getDate()).padStart(2, '0');
    const hours = String(jakartaTime.getHours()).padStart(2, '0');
    const minutes = String(jakartaTime.getMinutes()).padStart(2, '0');
    const seconds = String(jakartaTime.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * Get Jakarta timezone offset in minutes
   */
  static getJakartaOffset(): number {
    const now = new Date();
    const utc = new Date(now.getTime() + (now.getTimezoneOffset() * 60000));
    const jakarta = new Date(utc.toLocaleString("en-US", {timeZone: this.JAKARTA_TIMEZONE}));
    return Math.floor((jakarta.getTime() - utc.getTime()) / 60000);
  }
}