import { getDatabase } from '../database/init.js';
import { logger } from '../utils/logger.js';
import { DateUtils } from '../utils/dateUtils.js';
import { DatabaseSecurity } from '../utils/dbSecurity.js';
import { GeoIPService } from './geoipService.js';
import { Client } from 'ssh2';
import { createConnection } from 'net';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface InstallValidationResult {
  isValid: boolean;
  error?: string;
  step?: string;
}

export interface OSInfo {
  name: string;
  version: string;
}

export class InstallService {
  private static readonly SUPPORTED_OS = {
    'Ubuntu': ['20', '22'],
    'Debian GNU/Linux': ['12']
  };

  private static get TRACK_SERVER(): string {
    return process.env['TRACK_SERVER'] || '';
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
    if (!this.validateIPv4(data.ip).isValid) {
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
   * Main installation process with comprehensive validation
   */
  static async processInstallation(
    userId: number,
    ip: string,
    sshPort: number,
    authType: 'password' | 'ssh_key',
    vpsPassword: string,
    sshKey: string,
    winVersion: string,
    rdpPassword: string
  ): Promise<{ success: boolean; message: string; installId?: number }> {
    const db = getDatabase();
    let installId: number | null = null;

    try {
      // Add detailed logging for debugging
      logger.info('Installation request received with parameters:', {
        userId,
        ip,
        sshPort,
        authType,
        winVersion: winVersion || 'UNDEFINED',
        winVersionType: typeof winVersion,
        rdpPasswordLength: rdpPassword?.length || 0,
        vpsPasswordLength: vpsPassword?.length || 0,
        sshKeyLength: sshKey?.length || 0,
        timestamp: DateUtils.formatJakarta(DateUtils.now()) + ' WIB'
      });

      // Use the enhanced validation method
      const validationResult = await this.validateInstallationInput({
        userId,
        ip,
        sshPort,
        authType,
        passwdVps: vpsPassword,
        sshKey,
        winVer: winVersion,
        passwdRdp: rdpPassword
      });

      if (!validationResult.isValid) {
        logger.error('Installation validation failed:', {
          userId,
          ip,
          errors: validationResult.errors
        });
        return {
          success: false,
          message: validationResult.errors.join('; ')
        };
      }

      logger.info('Starting Windows installation process:', {
        userId,
        ip,
        sshPort,
        authType,
        winVersion,
        timestamp: DateUtils.formatJakarta(DateUtils.now()) + ' WIB'
      });

      // Step 1: Validate user quota
      const quotaValidation = await this.validateUserQuota(userId);
      if (!quotaValidation.isValid) {
        return { success: false, message: quotaValidation.error! };
      }

      // Step 2: Check if VPS is online
      const onlineValidation = await this.validateVPSOnline(ip, sshPort);
      if (!onlineValidation.isValid) {
        return { success: false, message: onlineValidation.error! };
      }

      // Step 3: Validate SSH credentials
      const sshClient = await this.validateSSHCredentials(ip, sshPort, authType, vpsPassword, sshKey);
      if (!sshClient) {
        return { success: false, message: authType === 'password'
          ? 'SSH authentication failed. Please check your VPS password.'
          : 'SSH authentication failed. Please check your SSH key.' };
      }

      // Step 4: Validate OS support
      const osValidation = await this.validateOSSupport(sshClient);
      if (!osValidation.isValid) {
        sshClient.end();
        return { success: false, message: osValidation.error! };
      }

      // Deduct user quota
      await db.run(
        'UPDATE users SET quota = quota - 1, updated_at = ? WHERE id = ?',
        [DateUtils.nowSQLite(), userId]
      );

      // Create install record before execution
      const result = await db.run(`
        INSERT INTO install_data (user_id, ip, ssh_port, auth_type, passwd_vps, ssh_key, win_ver, passwd_rdp, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId,
        ip,
        sshPort,
        authType,
        authType === 'password' ? vpsPassword : null,
        authType === 'ssh_key' ? sshKey : null,
        winVersion,
        rdpPassword,
        'pending',
        DateUtils.nowSQLite(),
        DateUtils.nowSQLite()
      ]);

      installId = result.lastID as number;

      // Step 5: Execute installation script
      await this.executeInstallationScript(sshClient, userId, ip, winVersion, rdpPassword, installId);

      // Update status to pending (waiting for script execution)
      await this.updateInstallStatus(installId, 'pending', 'Installation script sent to VPS');

      // Start monitoring installation progress
      this.startInstallationMonitoring(installId, userId, ip);

      logger.info('Windows installation initiated successfully:', {
        userId,
        installId,
        ip,
        winVersion
      });

      return {
        success: true,
        message: 'Windows installation started successfully. You will be notified when the process is complete.',
        installId
      };

    } catch (error: any) {
      logger.error('Installation process failed:', {
        userId,
        ip,
        error: error.message,
        stack: error.stack
      });

      // Update install status to failed if we have an installId
      if (installId) {
        await this.updateInstallStatus(installId, 'failed', error.message);
      }

      return {
        success: false,
        message: error.message || 'Installation failed due to an unexpected error'
      };
    }
  }

  /**
   * Step 1: Validate user quota
   */
  private static async validateUserQuota(userId: number): Promise<InstallValidationResult> {
    try {
      const db = getDatabase();
      const user = await db.get('SELECT quota FROM users WHERE id = ?', [userId]);
      
      if (!user) {
        return { isValid: false, error: 'User not found', step: 'quota_validation' };
      }

      if (user.quota <= 0) {
        return { 
          isValid: false, 
          error: 'Insufficient quota. Please top up your quota to continue.', 
          step: 'quota_validation' 
        };
      }

      logger.info('Quota validation passed:', { userId, quota: user.quota });
      return { isValid: true, step: 'quota_validation' };
    } catch (error: any) {
      logger.error('Quota validation failed:', error);
      return { isValid: false, error: 'Failed to validate quota', step: 'quota_validation' };
    }
  }

  /**
   * Step 2: Validate Windows version
   */
  private static async validateWindowsVersion(winVersion: string): Promise<InstallValidationResult> {
    try {
      // Additional validation for undefined/empty values
      if (!winVersion || winVersion === 'undefined' || winVersion.trim() === '') {
        logger.error('Windows version is undefined or empty:', {
          winVersion,
          winVersionType: typeof winVersion
        });
        return {
          isValid: false,
          error: 'Windows version is required. Please select a valid Windows version from the dropdown.',
          step: 'windows_validation'
        };
      }

      const db = getDatabase();
      
      logger.info('Validating Windows version:', { winVersion });
      
      // Get all available versions for debugging
      const allVersions = await db.all('SELECT id, name, slug FROM windows_versions');
      logger.info('Available Windows versions in database:', allVersions);
      
      const version = await db.get('SELECT id FROM windows_versions WHERE slug = ?', [winVersion]);
      
      if (!version) {
        logger.error('Windows version not found:', { 
          winVersion, 
          availableVersions: allVersions.map(v => v.slug) 
        });
        return { 
          isValid: false, 
          error: `Invalid Windows version '${winVersion}'. Please select from available versions: ${allVersions.map(v => `${v.name} (${v.slug})`).join(', ')}`, 
          step: 'windows_validation' 
        };
      }

      logger.info('Windows version validation passed:', { winVersion });
      return { isValid: true, step: 'windows_validation' };
    } catch (error: any) {
      logger.error('Windows version validation failed:', error);
      return { isValid: false, error: 'Failed to validate Windows version', step: 'windows_validation' };
    }
  }

  /**
   * Step 3: Validate RDP password
   */
  private static validateRdpPassword(rdpPassword: string): InstallValidationResult {
    if (!rdpPassword || rdpPassword.length <= 3) {
      return { 
        isValid: false, 
        error: 'RDP password must be more than 3 characters', 
        step: 'rdp_password_validation' 
      };
    }

    if (rdpPassword.startsWith('#')) {
      return { 
        isValid: false, 
        error: 'RDP password cannot start with "#" character', 
        step: 'rdp_password_validation' 
      };
    }

    logger.info('RDP password validation passed');
    return { isValid: true, step: 'rdp_password_validation' };
  }

  /**
   * Step 4: Validate IPv4 address
   */
  private static validateIPv4(ip: string): InstallValidationResult {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
    if (!ipv4Regex.test(ip)) {
      return { 
        isValid: false, 
        error: 'Invalid IPv4 address format', 
        step: 'ipv4_validation' 
      };
    }

    // Additional validation for reserved IPs
    const parts = ip.split('.').map(Number);
    
    // Check for localhost
    if (parts[0] === 127) {
      return { 
        isValid: false, 
        error: 'Localhost IP addresses are not allowed', 
        step: 'ipv4_validation' 
      };
    }

    logger.info('IPv4 validation passed:', { ip });
    return { isValid: true, step: 'ipv4_validation' };
  }

  /**
   * Step 5: Check if VPS is online (custom SSH port)
   */
  private static async validateVPSOnline(ip: string, port: number = 22): Promise<InstallValidationResult> {
    return new Promise((resolve) => {
      const socket = createConnection({ host: ip, port, timeout: 7000 });
      
      socket.on('connect', () => {
        socket.destroy();
        logger.info('VPS online validation passed:', { ip, port });
        resolve({ isValid: true, step: 'vps_online_validation' });
      });

      socket.on('timeout', () => {
        socket.destroy();
        logger.warn('VPS connection timeout:', { ip, port });
        resolve({
          isValid: false,
          error: `VPS at ${ip}:${port} is not responding. Please check if the server is online and SSH is accessible on port ${port}.`,
          step: 'vps_online_validation'
        });
      });

      socket.on('error', (error) => {
        socket.destroy();
        logger.warn('VPS connection error:', { ip, port, error: error.message });
        resolve({
          isValid: false,
          error: `Cannot connect to VPS at ${ip}:${port}. Please verify the IP address, port, and ensure SSH is accessible.`,
          step: 'vps_online_validation'
        });
      });
    });
  }

  /**
   * Step 6: Validate SSH credentials with enhanced key parsing
   */
  private static async validateSSHCredentials(
    ip: string,
    port: number = 22,
    authType: 'password' | 'ssh_key',
    password: string,
    sshKey: string
  ): Promise<Client | null> {
    return new Promise((resolve) => {
      const client = new Client();
      let connectionTimeout: NodeJS.Timeout;
      
      connectionTimeout = setTimeout(() => {
        logger.warn('SSH connection timeout:', { ip, port, authType });
        client.end();
        resolve(null);
      }, 10000);
      
      client.on('ready', () => {
        clearTimeout(connectionTimeout);
        logger.info('SSH authentication successful:', { ip, port, authType });
        resolve(client);
      });

      client.on('error', (error) => {
        clearTimeout(connectionTimeout);
        logger.warn('SSH authentication failed:', { ip, port, authType, error: error.message });
        client.end();
        resolve(null);
      });

      try {
        const connectOptions: any = {
          host: ip,
          port: port,
          username: 'root',
          readyTimeout: 15000,
          keepaliveInterval: 30000,
          keepaliveCountMax: 3,
          algorithms: {
            kex: [
              'diffie-hellman-group14-sha256',
              'diffie-hellman-group16-sha512',
              'diffie-hellman-group14-sha1',
              'diffie-hellman-group1-sha1',
              'ecdh-sha2-nistp256',
              'ecdh-sha2-nistp384',
              'ecdh-sha2-nistp521',
              'curve25519-sha256@libssh.org',
              'curve25519-sha256'
            ],
            cipher: [
              'aes128-ctr',
              'aes192-ctr',
              'aes256-ctr',
              'aes128-gcm@openssh.com',
              'aes256-gcm@openssh.com',
              'chacha20-poly1305@openssh.com',
              'aes128-cbc',
              'aes192-cbc',
              'aes256-cbc'
            ],
            hmac: [
              'hmac-sha2-256',
              'hmac-sha2-512',
              'hmac-sha1',
              'hmac-sha2-256-etm@openssh.com',
              'hmac-sha2-512-etm@openssh.com',
              'hmac-sha1-96',
              'hmac-md5'
            ],
            compress: ['none', 'zlib']
          }
        };

        if (authType === 'password') {
          connectOptions.password = password;
          logger.info('Using password authentication for SSH connection');
        } else {
          // SSH key authentication - parse and validate the key
          const parsedKey = this.parseSSHKey(sshKey);
          if (!parsedKey) {
            logger.error('Failed to parse SSH key:', { 
              keyLength: sshKey.length,
              keyStart: sshKey.substring(0, 50),
              ip, 
              port 
            });
            clearTimeout(connectionTimeout);
            resolve(null);
            return;
          }
          logger.info('Using SSH key authentication:', {
            keyLength: parsedKey.length,
            keyType: this.detectSSHKeyType(parsedKey)
          });
          connectOptions.privateKey = parsedKey;
        }

        client.connect(connectOptions);
      } catch (error: any) {
        clearTimeout(connectionTimeout);
        logger.error('SSH connection setup failed:', { ip, port, authType, error: error.message });
        resolve(null);
      }
    });
  }

  /**
   * Enhanced SSH key parsing and validation
   */
  private static parseSSHKey(rawKey: string): string | null {
    try {
      if (!rawKey || typeof rawKey !== 'string') {
        logger.error('SSH key is empty or not a string');
        return null;
      }

      // Remove any extra whitespace and normalize line endings
      let cleanKey = rawKey.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      
      logger.info('Processing SSH key:', {
        originalLength: rawKey.length,
        cleanedLength: cleanKey.length,
        startsWithBegin: cleanKey.startsWith('-----BEGIN'),
        endsWithEnd: cleanKey.includes('-----END'),
        lineCount: cleanKey.split('\n').length
      });

      // Check if it's already in proper format
      if (cleanKey.startsWith('-----BEGIN') && cleanKey.includes('-----END')) {
        // Validate the key structure
        const lines = cleanKey.split('\n');
        const beginLine = lines[0];
        const endLine = lines[lines.length - 1];
        
        // Support multiple key types
        const supportedKeyTypes = [
          'OPENSSH PRIVATE KEY',
          'RSA PRIVATE KEY', 
          'DSA PRIVATE KEY',
          'EC PRIVATE KEY',
          'PRIVATE KEY',
          'ED25519 PRIVATE KEY'
        ];
        
        const isValidKeyType = supportedKeyTypes.some(keyType => 
          beginLine.includes(keyType) && endLine.includes(keyType)
        );
        
        if (!isValidKeyType) {
          logger.error('Unsupported SSH key type:', { beginLine, endLine });
          return null;
        }
        
        // Ensure proper line endings
        if (!cleanKey.endsWith('\n')) {
          cleanKey += '\n';
        }
        
        logger.info('SSH key validation successful:', {
          keyType: beginLine,
          lineCount: lines.length,
          hasProperEnding: cleanKey.endsWith('\n')
        });
        
        return cleanKey;
      }
      
      // If it's a single line key (like from copy-paste), try to format it
      if (cleanKey.includes('-----BEGIN') && cleanKey.includes('-----END')) {
        // Split by common delimiters and reconstruct
        let formattedKey = cleanKey;
        
        // Handle keys that were pasted as single line
        formattedKey = formattedKey.replace(/-----BEGIN ([^-]+)-----([^-]+)-----END ([^-]+)-----/g, 
          (match, beginType, content, endType) => {
            if (beginType !== endType) {
              logger.error('SSH key begin/end type mismatch:', { beginType, endType });
              return match;
            }
            
            // Clean and format the content
            const cleanContent = content.replace(/\s+/g, '');
            const lines = [];
            
            // Add header
            lines.push(`-----BEGIN ${beginType}-----`);
            
            // Split content into 64-character lines (standard for PEM format)
            for (let i = 0; i < cleanContent.length; i += 64) {
              lines.push(cleanContent.substring(i, i + 64));
            }
            
            // Add footer
            lines.push(`-----END ${endType}-----`);
            
            return lines.join('\n');
          }
        );
        
        if (!formattedKey.endsWith('\n')) {
          formattedKey += '\n';
        }
        
        logger.info('SSH key reformatted from single line:', {
          originalLength: cleanKey.length,
          formattedLength: formattedKey.length,
          lineCount: formattedKey.split('\n').length
        });
        
        return formattedKey;
      }
      
      logger.error('SSH key does not appear to be in valid PEM format:', {
        keyStart: cleanKey.substring(0, 100),
        keyLength: cleanKey.length,
        hasBegin: cleanKey.includes('-----BEGIN'),
        hasEnd: cleanKey.includes('-----END')
      });
      
      return null;
      
    } catch (error: any) {
      logger.error('SSH key parsing failed:', {
        error: error.message,
        keyLength: rawKey?.length || 0
      });
      return null;
    }
  }

  /**
   * Step 7: Validate OS support
   */
  private static async validateOSSupport(client: Client): Promise<InstallValidationResult> {
    return new Promise((resolve) => {
      let commandTimeout: NodeJS.Timeout;
      
      commandTimeout = setTimeout(() => {
        logger.error('OS validation command timeout');
        resolve({ 
          isValid: false, 
          error: 'Timeout while checking OS information', 
          step: 'os_validation' 
        });
      }, 10000);
      
      client.exec("cat /etc/os-release | grep -E '^(NAME|VERSION_ID)='", (err, stream) => {
        if (err) {
          clearTimeout(commandTimeout);
          logger.error('Failed to get OS info:', err);
          resolve({ 
            isValid: false, 
            error: 'Failed to retrieve OS information from VPS', 
            step: 'os_validation' 
          });
          return;
        }

        let output = '';
        
        stream.on('data', (data: Buffer) => {
          output += data.toString();
        });

        stream.on('close', () => {
          clearTimeout(commandTimeout);
          try {
            const osInfo = this.parseOSInfo(output);
            const isSupported = this.isOSSupported(osInfo);
            
            if (!isSupported) {
              resolve({ 
                isValid: false, 
                error: `Unsupported OS: ${osInfo.name} ${osInfo.version}. Please use Ubuntu 20/22 or Debian 12.`, 
                step: 'os_validation' 
              });
              return;
            }

            logger.info('OS validation passed:', osInfo);
            resolve({ isValid: true, step: 'os_validation' });
          } catch (error: any) {
            logger.error('OS info parsing failed:', error);
            resolve({ 
              isValid: false, 
              error: 'Failed to parse OS information', 
              step: 'os_validation' 
            });
          }
        });

        stream.on('error', (error: Error) => {
          clearTimeout(commandTimeout);
          logger.error('OS info stream error:', error);
          resolve({ 
            isValid: false, 
            error: 'Error reading OS information', 
            step: 'os_validation' 
          });
        });
      });
    });
  }

  /**
   * Step 8: Execute installation script remotely
   */
  private static async executeInstallationScript(
    client: Client,
    userId: number,
    ip: string,
    winVersion: string,
    rdpPassword: string,
    installId: number
  ): Promise<void> {
    try {
      // Get IP information for region determination
      const ipInfo = await GeoIPService.getIPInfo(ip);
      const region = GeoIPService.determineRegion(ipInfo.countryCode);
      
      // Generate protected download link
      const gzFilename = `${winVersion}.gz`;
      const signature = this.generateSignedUrl(ip, gzFilename, installId);
      const gzLink = `${this.TRACK_SERVER}/download/${region}/YXNpYS5sb2NhdGlvbi50by5zdG9yZS5maWxlLmd6Lmluc3RhbGxhdGlvbi55b3Uuc2hvbGRudC5zZWUudGhpcw/${gzFilename}${signature}`;

      logger.info('Generated installation link:', {
        userId,
        installId,
        ip,
        region,
        gzLink: gzLink
      });

      // Create and execute installation script with progress reporting
      const obfuscatedScript = await this.createInstallationScript(gzLink, rdpPassword);

      const command = this.buildExecutionCommand(obfuscatedScript);

      // Execute the command
      await this.executeRemoteCommand(client, command, userId, installId);

      // Log successful execution
      DatabaseSecurity.logDatabaseOperation('EXECUTE_INSTALL_SCRIPT', 'install_data', userId, {
        installId,
        ip,
        winVersion,
        region
      });

      logger.info('Installation script executed successfully:', {
        userId,
        installId,
        ip,
        region
      });

    } catch (error: any) {
      logger.error('Script execution failed:', {
        userId,
        installId,
        ip,
        error: error.message
      });
      throw error;
    } finally {
      client.end();
    }
  }

  /**
   * Parse OS information from /etc/os-release
   */
  private static parseOSInfo(output: string): OSInfo {
    const lines = output.trim().split('\n');
    const info: { [key: string]: string } = {};
    
    for (const line of lines) {
      const [key, value] = line.split('=');
      if (key && value) {
        info[key.trim()] = value.trim().replace(/"/g, '');
      }
    }

    return {
      name: info['NAME'] || 'Unknown',
      version: info['VERSION_ID'] || 'Unknown'
    };
  }

  /**
   * Check if OS is supported
   */
  private static isOSSupported(osInfo: OSInfo): boolean {
    const supportedVersions = this.SUPPORTED_OS[osInfo.name as keyof typeof this.SUPPORTED_OS];
    if (!supportedVersions) {
      return false;
    }

    return supportedVersions.some((version: string) => osInfo.version.startsWith(version));
  }

  /**
   * Generate signed URL for download protection
   */
  private static generateSignedUrl(ip: string, filename: string, installId: number): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const raw = `${ip}:${filename}:${installId}:${timestamp}`;
    const signature = crypto.createHash('sha256').update(raw).digest('hex');
    
    return `?sig=${timestamp}.${installId}.${signature}`;
  }

  /**
   * Create installation script with obfuscation
   */
  private static async createInstallationScript(gzLink: string, rdpPassword: string): Promise<Buffer> {
    try {
      // Read the base installation script template
      const scriptPath = path.join(__dirname, '../scripts/inst.sh');
      let scriptContent: string;
      
      try {
        scriptContent = await fs.readFile(scriptPath, 'utf-8');
      } catch (error) {
        // Fallback script if file doesn't exist
        scriptContent = this.getDefaultInstallScript();
      }

      let modifiedContent = scriptContent
        .replace(/__GZLINK__/g, gzLink)
        .replace(/__PASSWD__/g, rdpPassword);

      const first30Lines = modifiedContent.split('\n').slice(0, 30).join('\n');
      logger.info('Modified script (first 30 lines):', first30Lines);
      
      // Obfuscate using bash-obfuscate
      const obfuscated = await this.obfuscateScript(modifiedContent);
      
      return Buffer.from(obfuscated);
    } catch (error: any) {
      logger.error('Failed to create installation script:', error);
      throw new Error('Failed to prepare installation script');
    }
  }

  /**
   * Obfuscate script using bash-obfuscate npm package
   */
  private static async obfuscateScript(script: string): Promise<string> {
    const execAsync = promisify(exec);
    let tempInputFile: string | null = null;
    let tempOutputFile: string | null = null;
    
    try {
      // Create temporary files
      const tempDir = os.tmpdir();
      tempInputFile = path.join(tempDir, `input_${Date.now()}.sh`);
      tempOutputFile = path.join(tempDir, `output_${Date.now()}.sh`);
      
      // Write script to temporary input file
      await fs.writeFile(tempInputFile, script, 'utf8');
      
      // Execute bash-obfuscate command - input file should be positional argument, not -f flag
      const command = `bash-obfuscate "${tempInputFile}" -o "${tempOutputFile}"`;
      
      logger.info('Starting script obfuscation using bash-obfuscate...');
      
      try {
        const { stdout, stderr } = await execAsync(command);
        
        if (stderr) {
          logger.warn('bash-obfuscate stderr:', stderr);
        }
        
        if (stdout) {
          logger.info('bash-obfuscate stdout:', stdout);
        }
      } catch (execError: any) {
        // Check if bash-obfuscate is installed
        if (execError.code === 127 || execError.message.includes('command not found')) {
          throw new Error('bash-obfuscate is not installed. Please install it globally: npm install -g bash-obfuscate');
        }
        throw execError;
      }
      
      // Read the obfuscated script
      const obfuscatedScript = await fs.readFile(tempOutputFile, 'utf8');
      
      if (!obfuscatedScript || obfuscatedScript.trim().length === 0) {
        throw new Error('Obfuscation resulted in empty output');
      }
      
      logger.info('Script obfuscated successfully using bash-obfuscate:', obfuscatedScript.substring(0,1000));
      return obfuscatedScript;
      
    } catch (error: any) {
      logger.error('Script obfuscation failed:', error);
      
      if (error.message.includes('bash-obfuscate is not installed')) {
        throw error; // Re-throw installation error as-is
      }
      
      throw new Error(`Failed to obfuscate installation script: ${error.message}`);
      
    } finally {
      // Cleanup temporary files
      try {
        if (tempInputFile) {
          await fs.unlink(tempInputFile);
        }
        if (tempOutputFile) {
          await fs.unlink(tempOutputFile);
        }
      } catch (cleanupError) {
        logger.warn('Failed to cleanup temporary files:', cleanupError);
      }
    }
  }

  /**
   * Build the final execution command
   */
  private static buildExecutionCommand(obfuscatedScript: Buffer): string {
    const compressed = zlib.gzipSync(obfuscatedScript);
    const encoded = compressed.toString('base64');
    
    // Create a stealthy execution command
    const command = `setsid bash -c '{ exec -a "[kworker/u8:5-kworker/0:0]" bash <<<"echo \\"${encoded}\\" | base64 -d | gzip -d | exec -a \\"[kworker/u8:1-events]\\" bash -s" & }; disown' > /dev/null 2>&1`;
    logger.info('Compressed command script:', command);
    return command;
  }

  /**
   * Execute remote command via SSH
   */
  private static async executeRemoteCommand(
    client: Client,
    command: string,
    userId: number,
    installId: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let executionTimeout: NodeJS.Timeout;
      
      executionTimeout = setTimeout(() => {
        logger.error('Remote command execution timeout:', { userId, installId });
        reject(new Error('Installation command execution timeout'));
      }, 30000);
      
      client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(executionTimeout);
          logger.error('Failed to execute remote command:', { userId, installId, error: err.message });
          reject(new Error('Failed to execute installation command'));
          return;
        }

        let output = '';
        let errorOutput = '';

        stream.on('data', (data: Buffer) => {
          output += data.toString();
        });

        stream.stderr.on('data', (data: Buffer) => {
          errorOutput += data.toString();
        });

        stream.on('close', (code: number) => {
          clearTimeout(executionTimeout);
          if (code !== 0) {
            logger.error('Remote command failed:', {
              userId,
              installId,
              exitCode: code,
              output,
              errorOutput
            });
            reject(new Error(`Installation script failed with exit code ${code}`));
            return;
          }

          logger.info('Remote command executed successfully:', {
            userId,
            installId,
            exitCode: code
          });
          
          resolve();
        });

        stream.on('error', (error: Error) => {
          clearTimeout(executionTimeout);
          logger.error('Remote command stream error:', {
            userId,
            installId,
            error: error.message
          });
          reject(error);
        });
      });
    });
  }

  /**
   * Start monitoring installation progress with improved time-based checking
   */
  private static async startInstallationMonitoring(
    installId: number,
    userId: number,
    ip: string
  ): Promise<void> {
    // Start periodic monitoring every 5 seconds
    const monitoringInterval = setInterval(async () => {
      try {
        const install = await this.getInstallById(installId);
        if (!install) {
          clearInterval(monitoringInterval);
          return;
        }

        const updatedTime = new Date(install.updated_at).getTime();
        const now = Date.now();
        const minutesSinceUpdate = Math.floor((now - updatedTime) / (60 * 1000));

        // For pending/preparing status - check if no progress to 'running' within 3 minutes
        if (['pending', 'preparing'].includes(install.status)) {
          if (minutesSinceUpdate >= 3) {
            await this.updateInstallStatus(installId, 'failed', 'Installation failed to start within expected time');
            clearInterval(monitoringInterval);
            
            logger.warn('Installation failed to start within 3 minutes:', {
              installId,
              userId,
              ip,
              status: install.status,
              minutesSinceUpdate
            });
          }
        }
        // For running status - periodic RDP checking and timeout management
        else if (install.status === 'running') {
          // Start RDP checking after 3 minutes from when status became 'running'
          if (minutesSinceUpdate >= 3) {
            // Check RDP connectivity
            const isWindowsReady = await this.checkWindowsRDP(ip);
            
            if (isWindowsReady) {
              await this.updateInstallStatus(installId, 'completed', 'Windows installation completed successfully');
              clearInterval(monitoringInterval);
              
              logger.info('Installation completed - Windows RDP accessible:', {
                installId,
                userId,
                ip,
                minutesSinceRunning: minutesSinceUpdate
              });
            } else if (minutesSinceUpdate >= 15) {
              // If running for more than 15 minutes without RDP access, mark for manual review
              await this.updateInstallStatus(installId, 'manual_review', 'Installation taking longer than expected - requires manual verification');
              clearInterval(monitoringInterval);
              
              logger.warn('Installation requires manual review after 15 minutes:', {
                installId,
                userId,
                ip,
                minutesSinceRunning: minutesSinceUpdate
              });
            }
          }
        }
        // Stop monitoring for final states
        else if (['completed', 'failed', 'manual_review'].includes(install.status)) {
          clearInterval(monitoringInterval);
          logger.info('Monitoring stopped for final status:', {
            installId,
            status: install.status
          });
        }

      } catch (error: any) {
        logger.error('Installation monitoring check failed:', {
          installId,
          userId,
          error: error.message
        });
      }
    }, 5000); // Check every 5 seconds for running installations (RDP check)

    // Set a maximum monitoring duration (30 minutes) as a safety net
    setTimeout(() => {
      clearInterval(monitoringInterval);
      logger.info('Monitoring timeout reached for installation:', { installId });
    }, 30 * 60 * 1000); // 30 minutes max monitoring

    logger.info('Started enhanced installation monitoring:', {
      installId,
      userId,
      ip,
      checkInterval: '5 seconds',
      maxDuration: '30 minutes'
    });
  }

  /**
   * Resume installation monitoring after server restart
   * This should be called during server startup
   */
  static async resumeInstallationMonitoring(): Promise<void> {
    try {
      logger.info('Resuming installation monitoring after server restart...');
      
      const activeInstalls = await this.getAllActiveInstalls();
      logger.info(`Found ${activeInstalls.length} active installations to resume monitoring`);
      
      for (const install of activeInstalls) {
        const createdTime = new Date(install.created_at).getTime();
        const updatedTime = new Date(install.updated_at).getTime();
        const now = Date.now();
        const minutesSinceCreated = Math.floor((now - createdTime) / (60 * 1000));
        const minutesSinceUpdated = Math.floor((now - updatedTime) / (60 * 1000));
        
        logger.info(`Resuming monitoring for install ${install.id}:`, {
          installId: install.id,
          userId: install.user_id,
          ip: install.ip,
          status: install.status,
          minutesSinceCreated,
          minutesSinceUpdated
        });
        
        // Resume monitoring based on current status and elapsed time
        if (install.status === 'pending') {
          // If pending for more than 3 minutes, mark as failed
          if (minutesSinceCreated >= 3) {
            await this.updateInstallStatus(install.id, 'failed', 'Installation failed to start within expected time (detected during server restart recovery)');
            logger.info(`Marked install ${install.id} as failed (pending > 3 minutes)`);
          } else {
            // Resume monitoring with adjusted timeout
            const remainingTime = (3 * 60 * 1000) - (now - createdTime);
            this.scheduleFailureCheck(install.id, install.user_id, install.ip, remainingTime);
          }
        } else if (install.status === 'running') {
          // Check based on how long it's been running
          if (minutesSinceUpdated >= 15) {
            // Running for more than 15 minutes, mark for manual review
            await this.updateInstallStatus(install.id, 'manual_review', 'Installation taking longer than expected - requires manual verification (detected during server restart recovery)');
            logger.info(`Marked install ${install.id} for manual review (running > 15 minutes)`);
          } else if (minutesSinceUpdated >= 4) {
            // Running for more than 4 minutes, check Windows RDP
            const isWindowsReady = await this.checkWindowsRDP(install.ip);
            if (isWindowsReady) {
              await this.updateInstallStatus(install.id, 'completed', 'Windows installation completed successfully (detected during server restart recovery)');
              logger.info(`Marked install ${install.id} as completed (Windows RDP accessible)`);
            } else {
              // Schedule final check
              const remainingTime = (15 * 60 * 1000) - (now - updatedTime);
              this.scheduleManualReviewCheck(install.id, install.user_id, install.ip, remainingTime);
            }
          } else {
            // Still within normal running time, schedule appropriate checks
            const completionCheckTime = (4 * 60 * 1000) - (now - updatedTime);
            const manualReviewCheckTime = (15 * 60 * 1000) - (now - updatedTime);
            
            if (completionCheckTime > 0) {
              this.scheduleCompletionCheck(install.id, install.user_id, install.ip, completionCheckTime);
            }
            if (manualReviewCheckTime > 0) {
              this.scheduleManualReviewCheck(install.id, install.user_id, install.ip, manualReviewCheckTime);
            }
          }
        }
        // Note: 'manual_review' status doesn't need active monitoring
      }
      
      logger.info('Installation monitoring resume completed');
    } catch (error: any) {
      logger.error('Failed to resume installation monitoring:', error);
    }
  }

  /**
   * Get all active installations (pending, running, manual_review)
   */
  private static async getAllActiveInstalls(): Promise<any[]> {
    try {
      const db = getDatabase();
      const installs = await db.all(
        'SELECT * FROM install_data WHERE status IN (?, ?, ?) ORDER BY created_at ASC',
        ['pending', 'running', 'manual_review']
      );
      
      return installs || [];
    } catch (error: any) {
      logger.error('Failed to get all active installs:', error);
      return [];
    }
  }

  /**
   * Schedule failure check for pending installations
   */
  private static scheduleFailureCheck(installId: number, userId: number, ip: string, delay: number): void {
    if (delay <= 0) return;
    
    setTimeout(async () => {
      try {
        const install = await this.getInstallById(installId);
        if (install && install.status === 'pending') {
          await this.updateInstallStatus(installId, 'failed', 'Installation failed to start within expected time');
          logger.warn('Installation failed to start within 3 minutes:', { installId, userId, ip });
        }
      } catch (error: any) {
        logger.error('Scheduled failure check failed:', { installId, userId, error: error.message });
      }
    }, delay);
    
    logger.info(`Scheduled failure check for install ${installId} in ${Math.round(delay / 1000)}s`);
  }

  /**
   * Schedule completion check for running installations
   */
  private static scheduleCompletionCheck(installId: number, userId: number, ip: string, delay: number): void {
    if (delay <= 0) return;
    
    setTimeout(async () => {
      try {
        const install = await this.getInstallById(installId);
        if (install && install.status === 'running') {
          const isWindowsReady = await this.checkWindowsRDP(install.ip);
          if (isWindowsReady) {
            await this.updateInstallStatus(installId, 'completed', 'Windows installation completed successfully');
          } else {
            await this.updateInstallStatus(installId, 'manual_review', 'Installation completed but Windows RDP not accessible - requires manual verification');
          }
        }
      } catch (error: any) {
        logger.error('Scheduled completion check failed:', { installId, userId, error: error.message });
      }
    }, delay);
    
    logger.info(`Scheduled completion check for install ${installId} in ${Math.round(delay / 1000)}s`);
  }

  /**
   * Schedule manual review check for long-running installations
   */
  private static scheduleManualReviewCheck(installId: number, userId: number, ip: string, delay: number): void {
    if (delay <= 0) return;
    
    setTimeout(async () => {
      try {
        const install = await this.getInstallById(installId);
        if (install && install.status === 'running') {
          await this.updateInstallStatus(installId, 'manual_review', 'Installation taking longer than expected - requires manual verification');
          logger.warn('Installation requires manual review:', { installId, userId, ip, duration: '15+ minutes' });
        }
      } catch (error: any) {
        logger.error('Scheduled manual review check failed:', { installId, userId, error: error.message });
      }
    }, delay);
    
    logger.info(`Scheduled manual review check for install ${installId} in ${Math.round(delay / 1000)}s`);
  }

  /**
   * Check if Windows RDP is accessible
   */
  private static async checkWindowsRDP(ip: string, port: number = 22): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = createConnection({ host: ip, port, timeout: 5000 });
      
      socket.on('connect', () => {
        socket.destroy();
        logger.info('Windows RDP is accessible:', { ip, port });
        resolve(true);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });
    });
  }

  /**
   * Update installation status
   */
  static async updateInstallStatus(
    installId: number,
    status: string,
    message?: string,
    notifyUser: boolean = true
  ): Promise<void> {
    try {
      const db = getDatabase();
      
      // Get install data with user info for notifications
      const install = await db.get(
        'SELECT user_id, ip, win_ver, passwd_rdp FROM install_data WHERE id = ?',
        [installId]
      );
      
      await db.run(
        'UPDATE install_data SET status = ?, updated_at = ? WHERE id = ?',
        [status, DateUtils.nowSQLite(), installId]
      );

      logger.info('Install status updated:', {
        installId,
        status,
        message,
        timestamp: DateUtils.formatJakarta(DateUtils.now()) + ' WIB'
      });

      DatabaseSecurity.logDatabaseOperation('UPDATE_INSTALL_STATUS', 'install_data', undefined, {
        installId,
        status,
        message
      });

      // Send real-time notification to user dashboard
      if (notifyUser && install) {
        const { NotificationService } = await import('./notificationService.js');
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
    } catch (error: any) {
      logger.error('Failed to update install status:', {
        installId,
        status,
        error: error.message
      });
    }
  }

  /**
   * Get default installation script if file doesn't exist
   */
  private static getDefaultInstallScript(): string {
    return `#!/bin/bash
# Default installation script
echo "RDP Password: __PASSWD__"
sleep 5
curl -O __GZLINK__
`;
  }

  /**
   * Get installation by ID
   */
  static async getInstallById(installId: number): Promise<any> {
    try {
      const db = getDatabase();
      const install = await db.get(
        'SELECT * FROM install_data WHERE id = ?',
        [installId]
      );
      
      return install;
    } catch (error: any) {
      logger.error('Failed to get install by ID:', { installId, error: error.message });
      return null;
    }
  }

  /**
   * Detect SSH key type from parsed key
   */
  private static detectSSHKeyType(sshKey: string): string {
    if (sshKey.includes('-----BEGIN OPENSSH PRIVATE KEY-----')) {
      return 'OpenSSH';
    } else if (sshKey.includes('-----BEGIN RSA PRIVATE KEY-----')) {
      return 'RSA';
    } else if (sshKey.includes('-----BEGIN DSA PRIVATE KEY-----')) {
      return 'DSA';
    } else if (sshKey.includes('-----BEGIN EC PRIVATE KEY-----')) {
      return 'EC';
    } else if (sshKey.includes('-----BEGIN PRIVATE KEY-----')) {
      return 'PKCS#8';
    } else if (sshKey.includes('-----BEGIN ED25519 PRIVATE KEY-----')) {
      return 'ED25519';
    }
    return 'Unknown';
  }

  /**
   * Get user's active installations
   */
  static async getUserActiveInstalls(userId: number): Promise<any[]> {
    try {
      const db = getDatabase();
      const installs = await db.all(
        'SELECT * FROM install_data WHERE user_id = ? AND status IN (?, ?, ?) ORDER BY created_at DESC',
        [userId, 'pending', 'running', 'manual_review']
      );
      
      return installs;
    } catch (error: any) {
      logger.error('Failed to get user active installs:', { userId, error: error.message });
      return [];
    }
  }

  /**
   * Validate signature for download protection
   * @param ip - The IP address
   * @param filename - The filename
   * @param signature - The signature in format "timestamp.installId.signature"
   * @returns Object with validation result and installId if valid
   */
  static validateSignature(ip: string, filename: string, signature: string): { isValid: boolean; installId?: number } {
    try {
      const parts = signature.split('.');
      if (parts.length !== 3) {
        return { isValid: false };
      }
      
      const [timestampStr, installIdStr, sig] = parts;
      if (!timestampStr || !installIdStr || !sig) {
        return { isValid: false };
      }
      
      const timestamp = parseInt(timestampStr);
      const installId = parseInt(installIdStr);
      if (isNaN(timestamp) || isNaN(installId)) {
        return { isValid: false };
      }
      
      // Check expiration (6 minutes)
      const now = Math.floor(Date.now() / 1000);
      if (now - timestamp > 6 * 60) {
        return { isValid: false };
      }

      // Validate signature
      const raw = `${ip}:${filename}:${installId}:${timestamp}`;
      const expectedSig = crypto.createHash('sha256').update(raw).digest('hex');

      if (sig === expectedSig) {
        return { isValid: true, installId };
      }
      
      return { isValid: false };
    } catch (error) {
      logger.error('Signature validation failed:', error);
      return { isValid: false };
    }
  }

  /**
   * Handle download access tracking (called when gzLink is accessed)
   */
  static async handleDownloadAccess(
    installId: number,
    filename: string,
    userAgent: string,
    region: string,
    ip: string
  ): Promise<void> {
    try {
      // Log download access
      logger.info('Download access logged:', {
        installId,
        ip,
        filename,
        userAgent,
        region,
        timestamp: DateUtils.formatJakarta(DateUtils.now()) + ' WIB'
      });

      const db = getDatabase();

      // Get the specific installation by ID
      const install = await db.get(
        'SELECT id, user_id, win_ver, status FROM install_data WHERE id = ?',
        [installId]
      );

      if (!install) {
        logger.warn('Installation not found for download access:', { installId, ip, filename });
        return;
      }

      // If User-Agent contains 'curl', it means installation is preparing
      if (userAgent.toLowerCase().includes('curl') && install.status === 'pending') {
        await this.updateInstallStatus(installId, 'preparing', 'Installation is preparing - downloading configuration files', true);
        
        logger.info('Installation status updated to preparing via curl access:', {
          installId,
          userId: install.user_id,
          ip,
          filename
        });
      }
      // If User-Agent contains 'wget', it means installation is running
      else if (userAgent.toLowerCase().includes('wget') && ['pending', 'preparing'].includes(install.status)) {
        await this.updateInstallStatus(installId, 'running', 'Windows installation is now running - downloading files', true);
        
        logger.info('Installation status updated to running via wget access:', {
          installId,
          userId: install.user_id,
          ip,
          filename
        });
      }
    } catch (error: any) {
      logger.error('Failed to handle download access:', {
        installId,
        ip,
        filename,
        error: error.message
      });
    }
  }
}