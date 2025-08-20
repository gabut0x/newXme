import nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import { logger } from '../utils/logger.js';

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export interface VerificationEmailData {
  username: string;
  code: string;
  expirationMinutes: number;
}

export interface PasswordResetEmailData {
  username: string;
  code: string;
  expirationMinutes: number;
}

interface EmailData {
  to: string;
  subject: string;
  text?: string;
  html: string;
  code?: string;
}
export class EmailService {
  private transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo>;
  private fromAddress: string;

  constructor() {
    this.fromAddress = process.env['EMAIL_FROM'] || 'XME Notifications <no.reply@gmail.com>';

    // Utility to parse boolean-like env values flexibly
    const parseBool = (val?: string): boolean | undefined => {
      if (val == null) return undefined;
      const v = val.trim().toLowerCase();
      if (["true", "1", "yes", "y", "on"].includes(v)) return true;
      if (["false", "0", "no", "n", "off"].includes(v)) return false;
      return undefined; // unrecognized
    };

    // Create reusable transporter object using SMTP
    // Determine effective port and secure values with sensible defaults
    const hasEmailPort = typeof process.env['EMAIL_PORT'] === 'string' && process.env['EMAIL_PORT'] !== '';
    const port = hasEmailPort ? parseInt(process.env['EMAIL_PORT'] as string, 10) : 587; // default to STARTTLS
    const hasEmailSecure = typeof process.env['EMAIL_SECURE'] === 'string';
    const secureFromEnv = hasEmailSecure ? parseBool(process.env['EMAIL_SECURE'] as string) : undefined;

    const host = process.env['EMAIL_HOST'] || 'smtp.gmail.com';
    const isGmailHost = /gmail\.com$/i.test(host) || /googlemail\.com$/i.test(host);

    // Normalize Gmail app password (Google shows with spaces)
    const rawPass = process.env['EMAIL_PASS'] || '';
    const userRaw = process.env['EMAIL_USER'] || '';
    const user = userRaw.trim();
    const normalizedPass = isGmailHost || /@gmail\.com$/i.test(process.env['EMAIL_USER'] || '')
      ? rawPass.replace(/\s+/g, '')
      : rawPass.trim();

    // Derive effective secure/requireTLS based on host/port and env overrides
    let secure = typeof secureFromEnv === 'boolean' ? secureFromEnv : (port === 465);
    let requireTLS = false;

    if (isGmailHost) {
      if (port === 465) {
        secure = true; // Gmail implicit SSL
        requireTLS = false;
      } else if (port === 587) {
        secure = false; // STARTTLS
        requireTLS = true;
      }
    }

    if (process.env['EMAIL_REQUIRE_TLS'] === 'true') {
      requireTLS = true;
    }
    const requireTLSOverride = parseBool(process.env['EMAIL_REQUIRE_TLS']);
    if (typeof requireTLSOverride === 'boolean') {
      requireTLS = requireTLSOverride;
    }

    const insecureTls = parseBool(process.env['SMTP_INSECURE_TLS']) === true;

    const smtpConfig: SMTPTransport.Options = {
      host,
      port,
      secure,
      auth: {
        user,
        pass: normalizedPass, // Use App Password for Gmail (spaces removed)
      },
      requireTLS,
      // Enable debug logs in development to help diagnose connection issues (no credentials logged)
      logger: process.env['NODE_ENV'] === 'development',
      debug: process.env['NODE_ENV'] === 'development',
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      tls: insecureTls ? { rejectUnauthorized: false } : undefined
    };

    logger.info('SMTP effective configuration', {
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      requireTLS: smtpConfig.requireTLS,
      isGmailHost,
    });

    this.transporter = nodemailer.createTransport(smtpConfig);
  }

  async sendEmail(data: EmailData): Promise<boolean> {
    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to: data.to,
        subject: data.subject,
        text: data.text,
        html: data.html,
      });
  
      logger.info('Email sent', { messageId: info.messageId });
      return true;
    } catch (error: any) {
      logger.error('Email sending failed:', error);
      return false;
    }
  }

  async sendVerificationEmail(data: { to: string; subject: string; code: string }): Promise<boolean> {
    try {
      const verifyUrl = `${process.env['FRONTEND_URL'] || 'http://localhost:5173'}/verify-email`;
      const html = `
        <p>Your email verification code is: <strong>${data.code}</strong></p>
        <p>Enter this 6-digit code on the <a href="${verifyUrl}">Verify Email</a> page to activate your account.</p>
        <p>If you did not create an account, you can ignore this email.</p>
      `;

      // In development, log the verification code to help testing
      if ((process.env['NODE_ENV'] || '').toLowerCase() !== 'production') {
        logger.info('DEV: Verification email preview', { to: data.to, code: data.code });
      }

      return await this.sendEmail({ ...data, html });
    } catch (error: any) {
      logger.error('Failed to send verification email:', error);
      return false;
    }
  }

  async sendPasswordResetEmail(data: { to: string; subject: string; token: string }): Promise<boolean> {
    try {
      const resetUrl = `${process.env['FRONTEND_URL'] || 'http://localhost:5173'}/reset-password?token=${data.token}`;
      const html = `
        <p>Click the link below to reset your password:</p>
        <p><a href="${resetUrl}">Reset Password</a></p>
        <p>This link will expire in 30 minutes.</p>
        <p>If you did not request a password reset, you can ignore this email.</p>
      `;

      // In development, log the reset token to help testing
      if ((process.env['NODE_ENV'] || '').toLowerCase() !== 'production') {
        logger.info('DEV: Password reset email preview', { to: data.to, token: data.token });
      }

      return await this.sendEmail({ ...data, html });
    } catch (error: any) {
      logger.error('Failed to send password reset email:', error);
      return false;
    }
  }

  getResetPasswordEmailHTML(data: EmailData & { token: string; resetLink: string }): string {
    return `
      <p>Hello ${data.to},</p>
      <p>Click the link below to reset your password:</p>
      <p><a href="${data.resetLink}">Reset Password</a></p>
      <p>This link will expire soon. If you did not request a password reset, please ignore this email.</p>
    `;
  }

  getResetPasswordEmailText(data: EmailData & { token: string; resetLink: string }): string {
    return `Hello ${data.to},\n\nClick this link to reset your password: ${data.resetLink}\nThis link will expire soon. If you did not request a password reset, please ignore this email.`;
  }
}

let _emailService: EmailService | null = null;

export function getEmailService(): EmailService {
  if (!_emailService) {
    _emailService = new EmailService();
  }
  return _emailService;
}