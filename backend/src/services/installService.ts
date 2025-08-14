import { getDatabase } from '../database/init.js';
import { UserService } from './userService.js';
import { NotificationService } from './notificationService.js';
import { GeoIPService } from './geoipService.js';
import { ValidationUtils } from '../utils/validation.js';
import { logger } from '../utils/logger.js';
import { DateUtils } from '../utils/dateUtils.js';
import crypto from 'crypto';

export interface InstallResult {
  success: boolean;
  message: string;
  installId?: number;
}

export class InstallService {
  /**
   * Process installation request with comprehensive validation
   */
  static async processInstallation(
    userId: number,
    ip: string,
    sshPort: number = 22,
    authType: 'password' | 'ssh_key' = 'password',
    passwdVps: string = '',
    sshKey: string = '',
    winVer: string,
    passwdRdp: string = ''
  ): Promise<InstallResult> {
    const db = getDatabase();
    
    try {
      // Comprehensive input validation
      const validationResult = await this.validateInstallationInput({
        userId,
        ip,
        sshPort,
        authType,
        passwdVps,
        sshKey,
        winVer,
        passwdRdp
      });

      if (!validationResult.isValid) {
        return {
          success: false,
          message: validationResult.errors.join(', ')
        };
      }

      // Check user quota
      const hasQuota = await UserService.checkQuotaForInstallation(userId);
      if (!hasQuota) {
        return {
          success: false,
          message: 'Insufficient quota. Please purchase more quota to continue.'
        };
      }

      // Check for existing pending/running installations for this IP
      const existingInstall = await db.get(
        'SELECT id, status FROM install_data WHERE ip = ? AND status IN (?, ?, ?) ORDER BY created_at DESC LIMIT 1',
        [ip, 'pending', 'running', 'preparing']
      );

      if (existingInstall) {
        return {
          success: false,
          message: `Installation already in progress for IP ${ip}. Status: ${existingInstall.status}`
        };
      }

      // Deduct quota first
      const quotaDeducted = await UserService.decrementUserQuota(userId, 1);
      if (!quotaDeducted) {
        return {
          success: false,
          message: 'Failed to deduct quota. Please try again.'
        };
      }

      // Create installation record
      const result = await db.run(`
        INSERT INTO install_data (
          user_id, start_time, ip, ssh_port, auth_type, passwd_vps, ssh_key, 
          win_ver, passwd_rdp, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId,
        DateUtils.nowSQLite(),
        ip,
        sshPort,
        authType,
        authType === 'password' ? passwdVps : null,
        authType === 'ssh_key' ? sshKey : null,
        winVer,
        passwdRdp,
        'pending',
        DateUtils.nowSQLite(),
        DateUtils.nowSQLite()
      ]);

      const installId = result.lastID as number;

      // Send initial notification
      await NotificationService.notifyInstallStatusUpdate({
        installId,
        userId,
        status: 'pending',
        message: `Windows installation request created for ${ip}. Waiting for processing...`,
        timestamp: DateUtils.nowISO(),
        ip,
        winVersion: winVer
      });

      logger.info('Installation request created successfully:', {
        installId,
        userId,
        ip,
        sshPort,
        authType,
        winVer,
        hasSSHKey: authType === 'ssh_key' && !!sshKey,
        sshKeyLength: authType === 'ssh_key' ? sshKey.length : 0
      });

      return {
        success: true,
        message: 'Installation request created successfully. You will receive notifications about the progress.',
        installId
      };

    } catch (error: any) {
      logger.error('Installation processing failed:', {
        userId,
        ip,
        authType,
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        message: 'Failed to process installation request. Please try again.'
      };
    }
  }

  /**
   * Enhanced validation for installation input with better SSH key support
   */
  private static async validateInstallationInput(data: {
    userId: number;
    ip: string;
    sshPort: number;
    authType: 'password' | 'ssh_key';
    passwdVps: string;
    sshKey: string;
    winVer: string;
    passwdRdp: string;
  }): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate user ID
    if (!Number.isInteger(data.userId) || data.userId <= 0) {
      errors.push('Invalid user ID');
    }

    // Validate IP address
    if (!ValidationUtils.isValidIPv4(data.ip)) {
      errors.push('Invalid IPv4 address format');
    }

    // Validate SSH port
    if (!Number.isInteger(data.sshPort) || data.sshPort < 1 || data.sshPort > 65535) {
      errors.push('SSH port must be between 1 and 65535');
    }

    // Validate Windows version
    if (!data.winVer || data.winVer.trim() === '' || data.winVer === 'undefined') {
      errors.push('Windows version is required');
    } else {
      // Check if Windows version exists in database
      const db = getDatabase();
      const windowsVersion = await db.get('SELECT id FROM windows_versions WHERE slug = ?', [data.winVer]);
      if (!windowsVersion) {
        errors.push('Invalid Windows version selected');
      }
    }

    // Validate RDP password
    if (!data.passwdRdp || data.passwdRdp.trim() === '') {
      errors.push('RDP password is required');
    } else if (data.passwdRdp.startsWith('#')) {
      errors.push('RDP password cannot start with "#" character');
    }

    // Validate authentication method specific requirements
    if (data.authType === 'password') {
      if (!data.passwdVps || data.passwdVps.trim() === '') {
        errors.push('VPS password is required when using password authentication');
      }
    } else if (data.authType === 'ssh_key') {
      if (!data.sshKey || data.sshKey.trim() === '') {
        errors.push('SSH private key is required when using SSH key authentication');
      } else {
        // Enhanced SSH key validation
        const sshKeyValidation = this.validateSSHKeyAdvanced(data.sshKey);
        if (!sshKeyValidation.isValid) {
          errors.push(...sshKeyValidation.errors);
        } else {
          logger.info('SSH key validation passed:', {
            keyType: sshKeyValidation.keyType,
            keyLength: data.sshKey.length,
            userId: data.userId
          });
        }
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Advanced SSH key validation with better support for different formats
   */
  private static validateSSHKeyAdvanced(sshKey: string): { isValid: boolean; errors: string[]; keyType?: string } {
    const errors: string[] = [];
    
    if (!sshKey || typeof sshKey !== 'string') {
      errors.push('SSH key is required');
      return { isValid: false, errors };
    }

    const trimmedKey = sshKey.trim();
    
    if (trimmedKey.length === 0) {
      errors.push('SSH key cannot be empty');
      return { isValid: false, errors };
    }

    // Check for PEM format headers and footers
    if (!trimmedKey.includes('-----BEGIN') || !trimmedKey.includes('-----END')) {
      errors.push('SSH key must be in PEM format with -----BEGIN and -----END markers');
      return { isValid: false, errors };
    }

    // Enhanced supported private key types
    const supportedKeyTypes = [
      'OPENSSH PRIVATE KEY',    // Modern OpenSSH format (supports RSA, ED25519, ECDSA)
      'RSA PRIVATE KEY',        // Traditional RSA format
      'DSA PRIVATE KEY',        // DSA format (deprecated but still supported)
      'EC PRIVATE KEY',         // Elliptic Curve format
      'PRIVATE KEY',            // PKCS#8 format
      'ED25519 PRIVATE KEY'     // ED25519 specific format
    ];

    let detectedKeyType: string | null = null;
    
    // Check for supported key types
    for (const keyType of supportedKeyTypes) {
      if (trimmedKey.includes(`-----BEGIN ${keyType}-----`) && 
          trimmedKey.includes(`-----END ${keyType}-----`)) {
        detectedKeyType = keyType;
        break;
      }
    }

    if (!detectedKeyType) {
      // Log the actual headers found for debugging
      const beginMatch = trimmedKey.match(/-----BEGIN ([^-]+)-----/);
      const endMatch = trimmedKey.match(/-----END ([^-]+)-----/);
      
      logger.warn('Unsupported SSH key type detected:', {
        foundBeginType: beginMatch?.[1],
        foundEndType: endMatch?.[1],
        supportedTypes: supportedKeyTypes,
        keyPreview: trimmedKey.substring(0, 100) + '...'
      });
      
      errors.push(`Unsupported SSH key type. Found: ${beginMatch?.[1] || 'unknown'}. Supported types: OpenSSH, RSA, DSA, EC, ED25519, and PKCS#8 private keys`);
      return { isValid: false, errors };
    }

    // Validate key structure
    const lines = trimmedKey.split(/\r?\n/); // Handle both \n and \r\n line endings
    
    if (lines.length < 3) {
      errors.push(`SSH key appears to be incomplete - found ${lines.length} lines, minimum 3 required`);
      return { isValid: false, errors };
    }

    const beginLine = lines[0].trim();
    const endLine = lines[lines.length - 1].trim();
    
    if (!beginLine.startsWith('-----BEGIN') || !endLine.startsWith('-----END')) {
      errors.push('SSH key must start with -----BEGIN and end with -----END');
      return { isValid: false, errors };
    }

    // Extract and validate key type from begin/end lines
    const beginMatch = beginLine.match(/-----BEGIN (.+)-----/);
    const endMatch = endLine.match(/-----END (.+)-----/);
    
    if (!beginMatch || !endMatch || beginMatch[1] !== endMatch[1]) {
      errors.push(`SSH key begin and end markers do not match: BEGIN(${beginMatch?.[1]}) vs END(${endMatch?.[1]})`);
      return { isValid: false, errors };
    }

    // Validate base64 content (skip header/footer lines and metadata)
    const contentLines = lines.slice(1, -1);
    
    // Filter out metadata lines and empty lines
    const base64Lines = contentLines.filter(line => {
      const trimmed = line.trim();
      // Skip empty lines and metadata lines
      return trimmed.length > 0 && 
             !trimmed.startsWith('Proc-Type:') && 
             !trimmed.startsWith('DEK-Info:') &&
             !trimmed.includes(': ') && // Skip any line with ": " (metadata pattern)
             !/^[A-Za-z-]+:/.test(trimmed); // Skip lines starting with "Word:" pattern
    });
    
    const base64Content = base64Lines.join('');
    
    // Enhanced base64 validation
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    const base64ContentClean = base64Content.replace(/\s/g, ''); // Remove all whitespace
    
    if (base64ContentClean.length === 0) {
      errors.push('SSH key contains no valid base64 content');
      return { isValid: false, errors };
    }
    
    if (!base64Regex.test(base64ContentClean)) {
      errors.push('SSH key contains invalid base64 content');
      return { isValid: false, errors };
    }

    // Type-specific validation with more realistic length checks
    if (detectedKeyType === 'ED25519 PRIVATE KEY') {
      // ED25519 keys are typically 64 bytes (88 base64 chars) + some overhead
      if (base64ContentClean.length < 80 || base64ContentClean.length > 300) {
        errors.push(`ED25519 private key length appears invalid: ${base64ContentClean.length} characters (expected 80-300)`);
        return { isValid: false, errors };
      }
    } else if (detectedKeyType === 'RSA PRIVATE KEY') {
      // RSA keys vary by size: 2048-bit ≈ 1600+ chars, 4096-bit ≈ 3200+ chars
      if (base64ContentClean.length < 1000) {
        errors.push(`RSA private key appears too short: ${base64ContentClean.length} characters (expected at least 1000 for 2048-bit key)`);
        return { isValid: false, errors };
      }
    } else if (detectedKeyType === 'OPENSSH PRIVATE KEY') {
      // OpenSSH format can contain various key types
      if (base64ContentClean.length < 100) {
        errors.push(`OpenSSH private key appears too short: ${base64ContentClean.length} characters (expected at least 100)`);
        return { isValid: false, errors };
      }
    } else if (detectedKeyType === 'EC PRIVATE KEY') {
      // EC keys are typically smaller than RSA but larger than ED25519
      if (base64ContentClean.length < 100 || base64ContentClean.length > 1000) {
        errors.push(`EC private key length appears invalid: ${base64ContentClean.length} characters (expected 100-1000)`);
        return { isValid: false, errors };
      }
    }

    // Additional security validation
    try {
      // Try to decode base64 to ensure it's valid
      const decoded = Buffer.from(base64ContentClean, 'base64');
      if (decoded.length === 0) {
        errors.push('SSH key base64 content is empty after decoding');
        return { isValid: false, errors };
      }
    } catch (decodeError) {
      errors.push('SSH key contains invalid base64 encoding');
      return { isValid: false, errors };
    }

    logger.info('Advanced SSH key validation successful:', {
      keyType: detectedKeyType,
      totalLines: lines.length,
      contentLines: contentLines.length,
      base64Lines: base64Lines.length,
      base64Length: base64ContentClean.length,
      originalLength: sshKey.length
    });

    return {
      isValid: true,
      errors: [],
      keyType: detectedKeyType
    };
  }

  /**
   * Get installation by ID
   */
  static async getInstallById(installId: number): Promise<any> {
    const db = getDatabase();
    
    try {
      const install = await db.get('SELECT * FROM install_data WHERE id = ?', [installId]);
      return install;
    } catch (error) {
      logger.error('Failed to get install by ID:', error);
      return null;
    }
  }

  /**
   * Get user's active installations
   */
  static async getUserActiveInstalls(userId: number): Promise<any[]> {
    const db = getDatabase();
    
    try {
      const installs = await db.all(
        'SELECT * FROM install_data WHERE user_id = ? AND status IN (?, ?, ?) ORDER BY created_at DESC',
        [userId, 'pending', 'running', 'preparing']
      );
      return installs;
    } catch (error) {
      logger.error('Failed to get user active installs:', error);
      return [];
    }
  }

  /**
   * Update installation status
   */
  static async updateInstallStatus(
    installId: number, 
    status: string, 
    message: string = '',
    sendNotification: boolean = true
  ): Promise<void> {
    const db = getDatabase();
    
    try {
      // Get current install data
      const install = await db.get('SELECT * FROM install_data WHERE id = ?', [installId]);
      if (!install) {
        logger.error('Install not found for status update:', { installId });
        return;
      }

      // Update status
      await db.run(
        'UPDATE install_data SET status = ?, updated_at = ? WHERE id = ?',
        [status, DateUtils.nowSQLite(), installId]
      );

      // Send notification if requested
      if (sendNotification) {
        await NotificationService.notifyInstallStatusUpdate({
          installId,
          userId: install.user_id,
          status,
          message: message || `Installation status updated to ${status}`,
          timestamp: DateUtils.nowISO(),
          ip: install.ip,
          winVersion: install.win_ver
        });
      }

      logger.info('Installation status updated:', {
        installId,
        userId: install.user_id,
        oldStatus: install.status,
        newStatus: status,
        message
      });

    } catch (error) {
      logger.error('Failed to update install status:', error);
    }
  }

  /**
   * Generate download signature for protected files
   */
  static generateSignature(ip: string, filename: string, installId?: number): string {
    const secret = process.env.JWT_SECRET || 'fallback-secret';
    const timestamp = Math.floor(Date.now() / 1000);
    const data = `${ip}:${filename}:${timestamp}${installId ? `:${installId}` : ''}`;
    
    return crypto.createHmac('sha256', secret)
      .update(data)
      .digest('hex');
  }

  /**
   * Validate download signature
   */
  static validateSignature(ip: string, filename: string, signature: string): { isValid: boolean; installId?: number } {
    const secret = process.env.JWT_SECRET || 'fallback-secret';
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Try different timestamp windows (allow 1 hour window)
    for (let i = 0; i < 3600; i += 60) {
      const timestamp = currentTime - i;
      
      // Try without installId first
      const data1 = `${ip}:${filename}:${timestamp}`;
      const expectedSignature1 = crypto.createHmac('sha256', secret)
        .update(data1)
        .digest('hex');
      
      if (signature === expectedSignature1) {
        return { isValid: true };
      }
      
      // Try with different installId values
      for (let installId = 1; installId <= 1000; installId++) {
        const data2 = `${ip}:${filename}:${timestamp}:${installId}`;
        const expectedSignature2 = crypto.createHmac('sha256', secret)
          .update(data2)
          .digest('hex');
        
        if (signature === expectedSignature2) {
          return { isValid: true, installId };
        }
      }
    }
    
    return { isValid: false };
  }

  /**
   * Handle download access and update installation progress
   */
  static async handleDownloadAccess(
    installId: number,
    filename: string,
    userAgent: string,
    region: string,
    ip: string
  ): Promise<void> {
    try {
      const db = getDatabase();
      
      // Get installation data
      const install = await db.get('SELECT * FROM install_data WHERE id = ?', [installId]);
      if (!install) {
        logger.warn('Install not found for download access:', { installId, filename });
        return;
      }

      // Update status based on user agent and filename
      let newStatus = install.status;
      let message = '';

      if (userAgent.includes('curl') && install.status === 'pending') {
        newStatus = 'preparing';
        message = `Installation preparing - downloading configuration files from ${region}`;
      } else if (userAgent.includes('wget') && ['pending', 'preparing'].includes(install.status)) {
        newStatus = 'running';
        message = `Windows installation is now running - downloading ${filename} from ${region}`;
      }

      // Update status if changed
      if (newStatus !== install.status) {
        await this.updateInstallStatus(installId, newStatus, message, true);
      }

      // Log download access
      logger.info('Download access logged:', {
        installId,
        userId: install.user_id,
        filename,
        userAgent,
        region,
        ip,
        oldStatus: install.status,
        newStatus
      });

    } catch (error) {
      logger.error('Failed to handle download access:', error);
    }
  }

  /**
   * Resume installation monitoring after server restart
   */
  static async resumeInstallationMonitoring(): Promise<void> {
    try {
      const db = getDatabase();
      
      // Get all pending/running installations
      const activeInstalls = await db.all(
        'SELECT * FROM install_data WHERE status IN (?, ?, ?) ORDER BY created_at ASC',
        ['pending', 'preparing', 'running']
      );

      logger.info('Resuming installation monitoring:', {
        activeInstallsCount: activeInstalls.length
      });

      for (const install of activeInstalls) {
        // Send notification that monitoring has resumed
        await NotificationService.notifyInstallStatusUpdate({
          installId: install.id,
          userId: install.user_id,
          status: install.status,
          message: `Installation monitoring resumed - Status: ${install.status}`,
          timestamp: DateUtils.nowISO(),
          ip: install.ip,
          winVersion: install.win_ver
        });
      }

    } catch (error) {
      logger.error('Failed to resume installation monitoring:', error);
    }
  }
}