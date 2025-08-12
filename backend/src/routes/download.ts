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
const BLOCKED_USER_AGENTS_PATTERN = /bot|crawler|spider|scraper|facebook|twitter|linkedin/i;

/**
 * Handle protected download requests
 */
router.get('/download/:region/YXNpYS5sb2NhdGlvbi50by5zdG9yZS5maWxlLmd6Lmluc3RhbGxhdGlvbi55b3Uuc2hvbGRudC5zZWUudGhpcw/:filename', 
  async (req: Request, res: Response) => {
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
        return res.status(400).send('Missing required parameters');
      }

      // Validate User-Agent
      if (BLOCKED_USER_AGENTS_PATTERN.test(userAgent)) {
        logger.warn('Blocked user agent attempt:', { ip, userAgent, filename });
        return res.status(403).send('Access denied');
      }

      if (!ALLOWED_USER_AGENTS.some(agent => userAgent.toLowerCase().includes(agent))) {
        logger.warn('Invalid user agent:', { ip, userAgent, filename });
        return res.status(403).send('Access denied');
      }

      // Validate signature
      if (!InstallService.validateSignature(ip, filename, signature)) {
        logger.warn('Invalid signature:', { ip, filename, signature });
        return res.status(403).send('Access denied');
      }

      // Validate file extension
      if (!filename.endsWith('.gz')) {
        logger.warn('Invalid file extension:', { ip, filename });
        return res.status(400).send('Invalid file type');
      }

      // Validate region
      if (!BASE_URLS[region as keyof typeof BASE_URLS]) {
        logger.warn('Unsupported region:', { region, ip, filename });
        return res.status(404).send('Region not supported');
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
      await InstallService.handleDownloadAccess(ip, filename, userAgent, region);

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

export { router as downloadRoutes };