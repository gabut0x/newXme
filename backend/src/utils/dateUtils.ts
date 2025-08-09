/**
 * Date utility functions for Asia/Jakarta timezone
 */

export class DateUtils {
  private static readonly JAKARTA_TIMEZONE = 'Asia/Jakarta';

  /**
   * Get current date/time in Asia/Jakarta timezone
   */
  static now(): Date {
    return new Date();
  }

  /**
   * Get current timestamp in Asia/Jakarta timezone as ISO string
   */
  static nowISO(): string {
    return new Date().toLocaleString('sv-SE', { 
      timeZone: this.JAKARTA_TIMEZONE 
    }).replace(' ', 'T') + '.000Z';
  }

  /**
   * Get current timestamp for SQLite (YYYY-MM-DD HH:MM:SS format)
   */
  static nowSQLite(): string {
    const now = new Date();
    const jakartaTime = new Date(now.toLocaleString("en-US", {
      timeZone: this.JAKARTA_TIMEZONE 
    }));
    
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
   * Format date to Asia/Jakarta timezone
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
   * Get date in Jakarta timezone for SQLite datetime() function
   */
  static getJakartaDateForSQL(): string {
    const now = new Date();
    const jakartaTime = new Date(now.toLocaleString("en-US", {timeZone: this.JAKARTA_TIMEZONE}));
    
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
   * Add minutes to current Jakarta time
   */
  static addMinutesJakarta(minutes: number): string {
    const now = new Date();
    const jakartaTime = new Date(now.toLocaleString("en-US", {timeZone: this.JAKARTA_TIMEZONE}));
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
    const now = new Date();
    const jakartaNow = new Date(now.toLocaleString("en-US", {timeZone: this.JAKARTA_TIMEZONE}));
    
    return dateObj < jakartaNow;
  }

  /**
   * Get Unix timestamp for Jakarta timezone
   */
  static getJakartaUnixTimestamp(): number {
    const now = new Date();
    const jakartaTime = new Date(now.toLocaleString("en-US", {timeZone: this.JAKARTA_TIMEZONE}));
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
}