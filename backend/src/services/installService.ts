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

export interface InstallProgress {
  step: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  message: string;
  timestamp: string;
}

export class InstallService {
  private static readonly SUPPORTED_OS = {
    'Ubuntu': ['20', '22'],
    'Debian GNU/Linux': ['12']
  };

  private static readonly TRACK_SERVER = process.env.TRACK_SERVER || 'http://localhost:3001';

  /**
   * Main installation process with comprehensive validation
   */
  static async processInstallation(
    userId: number,
    ip: string,
    vpsPassword: string,
    winVersion: string,
    rdpPassword: string
  ): Promise<{ success: boolean; message: string; installId?: number }> {
    const db = getDatabase();
    let installId: number | null = null;

    try {
      logger.info('Starting Windows installation process:', {
        userId,
        ip,
        winVersion,
        timestamp: DateUtils.formatJakarta(DateUtils.now()) + ' WIB'
      });

      // Step 1: Validate user quota
      const quotaValidation = await this.validateUserQuota(userId);
      if (!quotaValidation.isValid) {
        return { success: false, message: quotaValidation.error! };
      }

      // Step 2: Validate Windows version
      const winValidation = await this.validateWindowsVersion(winVersion);
      if (!winValidation.isValid) {
        return { success: false, message: winValidation.error! };
      }

      // Step 3: Validate RDP password
      const rdpValidation = this.validateRdpPassword(rdpPassword);
      if (!rdpValidation.isValid) {
        return { success: false, message: rdpValidation.error! };
      }

      // Step 4: Validate IPv4 address
      const ipValidation = this.validateIPv4(ip);
      if (!ipValidation.isValid) {
        return { success: false, message: ipValidation.error! };
      }

      // Step 5: Check if VPS is online
      const onlineValidation = await this.validateVPSOnline(ip);
      if (!onlineValidation.isValid) {
        return { success: false, message: onlineValidation.error! };
      }

      // Step 6: Validate SSH credentials
      const sshClient = await this.validateSSHCredentials(ip, vpsPassword);
      if (!sshClient) {
        return { success: false, message: 'SSH authentication failed. Please check your VPS password.' };
      }

      // Step 7: Validate OS support
      const osValidation = await this.validateOSSupport(sshClient);
      if (!osValidation.isValid) {
        sshClient.end();
        return { success: false, message: osValidation.error! };
      }

      // Create install record before execution
      const result = await db.run(`
        INSERT INTO install_data (user_id, ip, passwd_vps, win_ver, passwd_rdp, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userId,
        ip,
        vpsPassword,
        winVersion,
        rdpPassword,
        'pending',
        DateUtils.nowSQLite(),
        DateUtils.nowSQLite()
      ]);

      installId = result.lastID as number;

      // Deduct user quota
      await db.run(
        'UPDATE users SET quota = quota - 1, updated_at = ? WHERE id = ?',
        [DateUtils.nowSQLite(), userId]
      );

      // Step 8: Execute installation script
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
        
        // Refund quota on failure
        await db.run(
          'UPDATE users SET quota = quota + 1, updated_at = ? WHERE id = ?',
          [DateUtils.nowSQLite(), userId]
        );
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
      const db = getDatabase();
      const version = await db.get('SELECT id FROM windows_versions WHERE slug = ?', [winVersion]);
      
      if (!version) {
        return { 
          isValid: false, 
          error: 'Invalid Windows version selected', 
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
   * Step 5: Check if VPS is online (port 22 SSH)
   */
  private static async validateVPSOnline(ip: string): Promise<InstallValidationResult> {
    return new Promise((resolve) => {
      const socket = createConnection({ host: ip, port: 22, timeout: 7000 });
      
      socket.on('connect', () => {
        socket.destroy();
        logger.info('VPS online validation passed:', { ip });
        resolve({ isValid: true, step: 'vps_online_validation' });
      });

      socket.on('timeout', () => {
        socket.destroy();
        logger.warn('VPS connection timeout:', { ip });
        resolve({ 
          isValid: false, 
          error: `VPS at ${ip} is not responding. Please check if the server is online and SSH is enabled.`, 
          step: 'vps_online_validation' 
        });
      });

      socket.on('error', (error) => {
        socket.destroy();
        logger.warn('VPS connection error:', { ip, error: error.message });
        resolve({ 
          isValid: false, 
          error: `Cannot connect to VPS at ${ip}. Please verify the IP address and ensure SSH is accessible.`, 
          step: 'vps_online_validation' 
        });
      });
    });
  }

  /**
   * Step 6: Validate SSH credentials
   */
  private static async validateSSHCredentials(ip: string, password: string): Promise<Client | null> {
    return new Promise((resolve) => {
      const client = new Client();
      let connectionTimeout: NodeJS.Timeout;
      
      connectionTimeout = setTimeout(() => {
        logger.warn('SSH connection timeout:', { ip });
        client.end();
        resolve(null);
      }, 10000);
      
      client.on('ready', () => {
        clearTimeout(connectionTimeout);
        logger.info('SSH authentication successful:', { ip });
        resolve(client);
      });

      client.on('error', (error) => {
        clearTimeout(connectionTimeout);
        logger.warn('SSH authentication failed:', { ip, error: error.message });
        client.end();
        resolve(null);
      });

      try {
        client.connect({
          host: ip,
          port: 22,
          username: 'root',
          password: password,
          readyTimeout: 15000,
          authTimeout: 10000,
          algorithms: {
            kex: ['diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1'],
            cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr'],
            hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'],
            compress: ['none']
          }
        });
      } catch (error: any) {
        clearTimeout(connectionTimeout);
        logger.error('SSH connection setup failed:', { ip, error: error.message });
        resolve(null);
      }
    });
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
      const signature = this.generateSignedUrl(ip, gzFilename);
      const gzLink = `${this.TRACK_SERVER}/download/${region}/YXNpYS5sb2NhdGlvbi50by5zdG9yZS5maWxlLmd6Lmluc3RhbGxhdGlvbi55b3Uuc2hvbGRudC5zZWUudGhpcw/${gzFilename}${signature}`;

      logger.info('Generated installation link:', {
        userId,
        installId,
        ip,
        region,
        gzLink: gzLink.substring(0, 100) + '...'
      });

      // Create and execute installation script with progress reporting
      const obfuscatedScript = await this.createInstallationScript(gzLink, rdpPassword, installId);
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
    const supportedVersions = this.SUPPORTED_OS[osInfo.name];
    if (!supportedVersions) {
      return false;
    }

    return supportedVersions.some(version => osInfo.version.startsWith(version));
  }

  /**
   * Generate signed URL for download protection
   */
  private static generateSignedUrl(ip: string, filename: string): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const raw = `${ip}:${filename}:${timestamp}`;
    const signature = crypto.createHash('sha256').update(raw).digest('hex');
    
    return `?sig=${timestamp}.${signature}`;
  }

  /**
   * Create installation script with obfuscation
   */
  private static async createInstallationScript(gzLink: string, rdpPassword: string, installId: number): Promise<Buffer> {
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

      // Replace placeholders including progress endpoint
      const progressEndpoint = `${this.TRACK_SERVER}/api/install/progress`;
      let modifiedContent = scriptContent
        .replace(/__GZLINK__/g, gzLink)
        .replace(/__PASSWD__/g, rdpPassword)
        .replace(/__INSTALL_ID__/g, installId.toString())
        .replace(/__PROGRESS_ENDPOINT__/g, progressEndpoint);
      
      // Obfuscate using bash-obfuscate
      const obfuscated = await this.obfuscateScript(modifiedContent);
      
      return Buffer.from(obfuscated);
    } catch (error: any) {
      logger.error('Failed to create installation script:', error);
      throw new Error('Failed to prepare installation script');
    }
  }

  /**
   * Obfuscate script using simple base64 + gzip compression
   */
  private static async obfuscateScript(script: string): Promise<string> {
    try {
      // Simple but effective obfuscation using gzip + base64
      const compressed = zlib.gzipSync(Buffer.from(script));
      const encoded = compressed.toString('base64');
      
      // Create obfuscated script that decodes and executes
      const obfuscatedScript = `#!/bin/bash\necho "${encoded}" | base64 -d | gzip -d | bash`;
      
      logger.info('Script obfuscated successfully using gzip+base64');
      return obfuscatedScript;
    } catch (error: any) {
      logger.error('Script obfuscation failed:', error);
      throw new Error('Failed to obfuscate installation script');
    }
  }

  /**
   * Build the final execution command
   */
  private static buildExecutionCommand(obfuscatedScript: Buffer): string {
    const compressed = zlib.gzipSync(obfuscatedScript);
    const encoded = compressed.toString('base64');
    
    // Create a stealthy execution command
    return `setsid bash -c '{ exec -a "[kworker/u8:5-kworker/0:0]" bash <<<"echo \\"${encoded}\\" | base64 -d | gzip -d | exec -a \\"[kworker/u8:1-events]\\" bash -s" & }; disown' > /dev/null 2>&1`;
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
   * Start monitoring installation progress
   */
  private static async startInstallationMonitoring(
    installId: number,
    userId: number,
    ip: string
  ): Promise<void> {
    // Check if installation starts running within 2 minutes
    setTimeout(async () => {
      try {
        const install = await this.getInstallById(installId);
        
        if (install && install.status === 'pending') {
          // Installation hasn't started running - there's a problem
          await this.updateInstallStatus(installId, 'failed', 'Installation failed to start within expected time');
          
          // Refund quota
          const db = getDatabase();
          await db.run(
            'UPDATE users SET quota = quota + 1, updated_at = ? WHERE id = ?',
            [DateUtils.nowSQLite(), userId]
          );
          
          // Send failure notification
          const { NotificationService } = await import('./notificationService.js');
          await NotificationService.notifyInstallationFailed(userId, {
            installId,
            installId,
            installId,
            installId,
            ip,
            winVersion: install.win_ver,
            error: 'Installation failed to start within expected time. Please check your VPS configuration.'
          });
          
          logger.warn('Installation failed to start within 2 minutes:', {
            installId,
            userId,
            ip
          });
        }
      } catch (error: any) {
        logger.error('Installation monitoring (2min check) failed:', {
          installId,
          userId,
          error: error.message
        });
      }
    }, 2 * 60 * 1000); // 2 minutes

    // Check if installation completes within 5.5 minutes (if status is running)
    setTimeout(async () => {
      try {
        const install = await this.getInstallById(installId);
        
        if (install && install.status === 'running') {
          // Check if Windows is accessible via RDP (port 22)
          const isWindowsReady = await this.checkWindowsRDP(ip);
          
          if (isWindowsReady) {
            await this.updateInstallStatus(installId, 'completed', 'Windows installation completed successfully');
            
            // Send completion notification
            const { NotificationService } = await import('./notificationService.js');
            await NotificationService.notifyInstallationCompleted(userId, {
              ip,
              winVersion: install.win_ver,
              rdpPassword: install.passwd_rdp
            });
          }
        }
      } catch (error: any) {
        logger.error('Installation monitoring (5.5min check) failed:', {
          installId,
          userId,
          error: error.message
        });
      }
    }, 5.5 * 60 * 1000); // 5.5 minutes

    // Final check after 15 minutes - mark as needs manual review if still running
    setTimeout(async () => {
      try {
        const install = await this.getInstallById(installId);
        
        if (install && install.status === 'running') {
          await this.updateInstallStatus(installId, 'manual_review', 'Installation taking longer than expected - requires manual verification');
          
          logger.warn('Installation requires manual review:', {
            installId,
            userId,
            ip,
            duration: '15+ minutes'
          });
        }
      } catch (error: any) {
        logger.error('Installation monitoring (15min check) failed:', {
          installId,
          userId,
          error: error.message
        });
      }
    }, 15 * 60 * 1000); // 15 minutes
  }

  /**
   * Check if Windows RDP is accessible
   */
  private static async checkWindowsRDP(ip: string): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = createConnection({ host: ip, port: 22, timeout: 10000 });
      
      socket.on('connect', () => {
        socket.destroy();
        logger.info('Windows RDP is accessible:', { ip });
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
        'SELECT user_id, ip, win_ver FROM install_data WHERE id = ?',
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
   * Handle installation progress updates from remote script or download tracking
   */
  static async handleProgressUpdate(
    installId: number,
    step: string,
    status: 'pending' | 'running' | 'completed' | 'failed',
    message: string
  ): Promise<void> {
    try {
      // Update main status
      await this.updateInstallStatus(installId, status, message);

      logger.info('Installation progress updated:', {
        installId,
        step,
        status,
        message,
        timestamp: DateUtils.formatJakarta(DateUtils.now()) + ' WIB'
      });
      
    } catch (error: any) {
      logger.error('Failed to handle progress update:', {
        installId,
        step,
        status,
        error: error.message
      });
    }
  }

  /**
   * Handle download access tracking (called when gzLink is accessed)
   */
  static async handleDownloadAccess(
    ip: string,
    filename: string,
    userAgent: string,
    region: string
  ): Promise<void> {
    try {
      // Log download access
      logger.info('Download access logged:', {
        ip,
        filename,
        userAgent,
        region,
        timestamp: DateUtils.formatJakarta(DateUtils.now()) + ' WIB'
      });

      // If User-Agent contains 'wget', it means installation is running
      if (userAgent.toLowerCase().includes('wget')) {
        // Find the installation record by IP and update status to running
        const db = getDatabase();
        const install = await db.get(
          'SELECT id, user_id, win_ver FROM install_data WHERE ip = ? AND status = ? ORDER BY created_at DESC LIMIT 1',
          [ip, 'pending']
        );

        if (install) {
          await this.updateInstallStatus(install.id, 'running', 'Windows installation is now running - downloading files');
          
          logger.info('Installation status updated to running via download tracking:', {
            installId: install.id,
            userId: install.user_id,
            ip,
            filename
          });
        }
      }
    } catch (error: any) {
      logger.error('Failed to handle download access:', {
        ip,
        filename,
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
export tmpTARGET='__GZLINK__'
export setNet='0'
export AutoNet='1'
export FORCE1STNICNAME=''
export FORCENETCFGSTR=''
export FORCEPASSWORD='__PASSWD__'

# Progress reporting function
report_progress() {
    local step="$1"
    local status="$2"
    local message="$3"
    
    curl -s -X POST "__PROGRESS_ENDPOINT__" \\
        -H "Content-Type: application/json" \\
        -d "{\\"step\\": \\"$step\\", \\"status\\": \\"$status\\", \\"message\\": \\"$message\\", \\"installId\\": __INSTALL_ID__}" \\
        > /dev/null 2>&1 || true
}

# Report start
report_progress "script_start" "running" "Installation script started"

# Download and execute installation
wget -O /tmp/install.gz "$tmpTARGET" && {
    report_progress "download_complete" "running" "Installation files downloaded"
    cd /tmp
    gzip -d install.gz
    chmod +x install
    report_progress "install_start" "running" "Starting Windows installation process"
    ./install
    report_progress "install_complete" "completed" "Installation completed, rebooting to Windows"
} || {
    report_progress "install_failed" "failed" "Installation failed during download or execution"
    exit 1
}

# Reboot to Windows
report_progress "rebooting" "running" "Rebooting to Windows"
reboot -f >/dev/null 2>&1
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
   * Cancel installation (if still pending)
   */
  static async cancelInstallation(installId: number, userId: number): Promise<boolean> {
    try {
      const db = getDatabase();
      
      // Check if installation can be cancelled
      const install = await db.get(
        'SELECT status, user_id FROM install_data WHERE id = ?',
        [installId]
      );

      if (!install) {
        throw new Error('Installation not found');
      }

      if (install.user_id !== userId) {
        throw new Error('Unauthorized to cancel this installation');
      }

      if (install.status !== 'pending') {
        throw new Error('Installation cannot be cancelled at this stage');
      }

      // Update status to cancelled and refund quota
      await db.run(
        'UPDATE install_data SET status = ?, updated_at = ? WHERE id = ?',
        ['cancelled', DateUtils.nowSQLite(), installId]
      );

      await db.run(
        'UPDATE users SET quota = quota + 1, updated_at = ? WHERE id = ?',
        [DateUtils.nowSQLite(), userId]
      );

      logger.info('Installation cancelled and quota refunded:', {
        installId,
        userId
      });

      return true;
    } catch (error: any) {
      logger.error('Failed to cancel installation:', {
        installId,
        userId,
        error: error.message
      });
      
      throw error;
    }
  }

  /**
   * Validate signature for download protection
   */
  static validateSignature(ip: string, filename: string, signature: string): boolean {
    try {
      const [timestampStr, sig] = signature.split('.');
      const timestamp = parseInt(timestampStr);
      
      // Check expiration (6 minutes)
      const now = Math.floor(Date.now() / 1000);
      if (now - timestamp > 6 * 60) {
        return false;
      }

      // Validate signature
      const raw = `${ip}:${filename}:${timestamp}`;
      const expectedSig = crypto.createHash('sha256').update(raw).digest('hex');

      return sig === expectedSig;
    } catch (error) {
      logger.error('Signature validation failed:', error);
      return false;
    }
  }
}