import axios from 'axios';
import { logger } from '../utils/logger.js';

export class RecaptchaService {
  private static readonly RECAPTCHA_SECRET_KEY = process.env['RECAPTCHA_SECRET_KEY'];

  static async verifyToken(token: string, remoteip?: string): Promise<{ success: boolean; score?: number; error?: string }> {
    try {
      if (!this.RECAPTCHA_SECRET_KEY) {
        logger.warn('Recaptcha secret key is not configured');
        return { success: false, error: 'Recaptcha not configured' };
      }

      const payload: any = {
        secret: this.RECAPTCHA_SECRET_KEY,
        response: token
      };

      if (remoteip) payload.remoteip = remoteip;

      const response = await axios.post('https://www.google.com/recaptcha/api/siteverify', payload);
      const data = response.data;

      if (!data.success) {
        logger.warn('Recaptcha verification failed', { errorCodes: data['error-codes'] });
        return { success: false, error: 'Recaptcha verification failed' };
      }

      const minScore = parseFloat(process.env['RECAPTCHA_MIN_SCORE'] || '0.5');

      if (typeof data.score === 'number' && data.score < minScore) {
        logger.warn('Recaptcha score below threshold', { score: data.score, minScore });
        return { success: false, score: data.score, error: 'Low recaptcha score' };
      }

      return { success: true, score: data.score };
    } catch (error: any) {
      logger.error('Recaptcha verification error:', error);
      return { success: false, error: error.message || 'Recaptcha verification error' };
    }
  }
}

export const recaptchaService = new RecaptchaService();