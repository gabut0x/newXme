import express from 'express';
import { Request, Response } from 'express';
import { InstallService } from '../services/installService.js';
import { logger } from '../utils/logger.js';
import { DateUtils } from '../utils/dateUtils.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Base URLs for different regions
const BASE_URLS = {
  'asia': process.env['ASIA_BASE_URL'] || 'https://asia-files.example.com',
  'australia': process.env['AUSTRALIA_BASE_URL'] || 'https://au-files.example.com',
  'global': process.env['GLOBAL_BASE_URL'] || 'https://global-files.example.com'
};

// Allowed user agents
const ALLOWED_USER_AGENTS = ['wget', 'curl'];

// Blocked user agents pattern
const BLOCKED_USER_AGENTS_PATTERN = /bot|crawler|spider|scraper|facebook|twitter|linkedin|whatsapp|mozilla|chrome|safari|firefox|edge/i;

/**
 * Handle protected download requests
 */
router.get('/download/:region/YXNpYS5sb2NhdGlvbi50by5zdG9yZS5maWxlLmd6Lmluc3RhbGxhdGlvbi55b3Uuc2hvbGRudC5zZWUudGhpcw/:filename',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { region, filename } = req.params;
      const signature = req.query['sig'] as string;
      const userAgent = req.headers['user-agent'] || '';
      const ip = req.headers['cf-connecting-ip'] as string ||
                 req.headers['x-forwarded-for'] as string ||
                 req.ip ||
                 req.connection?.remoteAddress ||
                 'unknown';

      // Validate required parameters
      if (!region || !filename || !signature) {
        logger.warn('Missing required parameters:', { region, filename, signature: !!signature, ip });
        res.status(400).send('Missing required parameters');
        return;
      }

      // Validate User-Agent
      if (BLOCKED_USER_AGENTS_PATTERN.test(userAgent)) {
        logger.warn('Blocked user agent attempt:', { ip, userAgent, filename });
        res.status(403).send('Access denied');
        return;
      }

      if (!ALLOWED_USER_AGENTS.some(agent => userAgent.toLowerCase().includes(agent))) {
        logger.warn('Invalid user agent:', { ip, userAgent, filename });
        res.status(403).send('Access denied');
        return;
      }

      // Validate signature
      const signatureResult = InstallService.validateSignature(ip, filename, signature);
      if (!signatureResult.isValid || !signatureResult.installId) {
        logger.warn('Invalid signature:', { ip, filename, signature });
        res.status(403).send('Access denied');
        return;
      }

      const installId = signatureResult.installId;

      // Validate file extension
      if (!filename.endsWith('.gz')) {
        logger.warn('Invalid file extension:', { ip, filename });
        res.status(400).send('Invalid file type');
        return;
      }

      // Validate region
      if (!BASE_URLS[region as keyof typeof BASE_URLS]) {
        logger.warn('Unsupported region:', { region, ip, filename });
        res.status(404).send('Region not supported');
        return;
      }

      // Write to log file
      const logDir = path.join(__dirname, '../../logs');
      await fs.mkdir(logDir, { recursive: true });

      const logEntry = `${ip} - ${region}/${filename} - ${userAgent} - ${DateUtils.formatJakarta(DateUtils.now())} WIB\n`;
      const logFilePath = path.join(logDir, `${region}_download.log`);

      try {
        await fs.appendFile(logFilePath, logEntry);
      } catch (logError) {
        logger.error('Failed to write download log:', logError);
      }

      // Log download access and handle installation progress
      await InstallService.handleDownloadAccess(installId, filename, userAgent, region, ip);

      // Redirect to actual file
      const fileUrl = `${BASE_URLS[region as keyof typeof BASE_URLS]}/${filename}`;

      logger.info('Download redirect:', {
        ip,
        filename,
        region,
        userAgent,
        redirectTo: fileUrl
      });

      res.set({
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache'
      });

      res.redirect(302, fileUrl);

    } catch (error: any) {
      logger.error('Download handler error:', {
        error: error.message,
        params: req.params,
        query: req.query,
        ip: req.ip
      });

      res.status(500).send('Internal server error');
    }
  }
);

/**
 * Public root script endpoint
 */
router.get('/root', (_req: Request, res: Response): void => {
  try {
    // Shell script with proper escaping
    const script = `#!/bin/bash

# Cloud Vendor Detection Script
CLOUD_VENDOR="unknown"

if curl -s -m 2 http://169.254.169.254/opc/v1/instance/ >/dev/null; then
    CLOUD_VENDOR="oracle"
elif curl -s -m 2 http://169.254.169.254/latest/meta-data/ >/dev/null; then
    CLOUD_VENDOR="aws"
fi

# Generate random password
ROOT_PASS=$(openssl rand -base64 12)

# SSH Configuration
CONFIG_FILE="/etc/ssh/sshd_config"
sudo cp "$CONFIG_FILE" "$CONFIG_FILE.bak"

# Modify SSH config
sudo sed -i 's|^Include /etc/ssh/sshd_config.d/\\*.conf|#Include /etc/ssh/sshd_config.d/*.conf|' "$CONFIG_FILE"
sudo sed -i 's|^#\\?PermitRootLogin .*|PermitRootLogin yes|' "$CONFIG_FILE"
sudo sed -i 's|^#\\?PasswordAuthentication .*|PasswordAuthentication yes|' "$CONFIG_FILE"

echo "root:$ROOT_PASS" | sudo chpasswd
sudo usermod -s /bin/bash root

# Handle SSH authorized keys
if [ -f /root/.ssh/authorized_keys ]; then
    sudo mv /root/.ssh/authorized_keys /root/.ssh/authorized_keys.bak
fi

sudo chmod 700 /root/.ssh
sudo chown root: /root/.ssh

# Cloud-specific configuration
if [ "$CLOUD_VENDOR" == "oracle" ] || [ "$CLOUD_VENDOR" == "aws" ]; then
    if grep -q '^disable_root:' /etc/cloud/cloud.cfg; then
        sudo sed -i 's/^disable_root:.*/disable_root: 0/' /etc/cloud/cloud.cfg
    else
        echo 'disable_root: 0' | sudo tee -a /etc/cloud/cloud.cfg
    fi
fi

sudo passwd root
sudo systemctl restart sshd || sudo service ssh restart

# Colors for output
GREEN='\\033[0;32m'
NC='\\033[0m' # Reset color

echo -e "\\$\\{GREEN\\}# Root Access Granted (\\$\\{CLOUD_VENDOR\\})\\$\\{NC\\}"
echo -e "user : \\$\\{GREEN\\}root\\$\\{NC\\}"
echo -e "pass : \\$\\{GREEN\\}\\$\\{ROOT_PASS\\}\\$\\{NC\\}"
echo -e "\\$\\{GREEN\\}#========================\\$\\{NC\\}"
`;

    res.setHeader('Content-Type', 'text/plain');
    res.send(script);
  } catch (error: any) {
    logger.error('Root script error:', error);
    res.status(500).send('Internal server error');
  }
});

export { router as downloadRoutes };