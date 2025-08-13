import nodemailer from 'nodemailer';
import { logger } from '../utils/logger.js';
import { DateUtils } from '../utils/dateUtils.js';

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

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private fromAddress: string;

  constructor() {
    this.fromAddress = process.env.EMAIL_FROM || 'XME Notifications <noreply@xmeprojects.com>';
    // Don't create transporter immediately - wait for first use
  }

  private ensureTransporter(): void {
    if (!this.transporter) {
      this.createTransporter();
    }
  }

  private createTransporter(): void {
    // Gmail SMTP configuration
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT || '465'),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, // Use App Password for Gmail
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    // Debug log SMTP configuration before testing
    logger.info('Testing SMTP connection...', {
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '465'),
      secure: process.env.EMAIL_SECURE,
      user: process.env.EMAIL_USER
    });
  }

  async testConnection(): Promise<boolean> {
    this.ensureTransporter();
    return new Promise((resolve) => {
      this.transporter!.verify((error, success) => {
        if (error) {
          logger.error('Email service configuration error:', {
            error: error.message,
            code: error.code,
            command: error.command,
            response: error.response
          });
          resolve(false);
        } else {
          logger.info('Email service is ready to send messages', {
            success: true,
            connectionVerified: success
          });
          resolve(true);
        }
      });
    });
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    this.ensureTransporter();
    try {
      const mailOptions = {
        from: this.fromAddress,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      };

      const info = await this.transporter!.sendMail(mailOptions);
      logger.info('Email sent successfully:', {
        messageId: info.messageId,
        to: options.to,
        subject: options.subject,
        sentAt: DateUtils.formatJakarta(DateUtils.now()) + ' WIB'
      });
    } catch (error) {
      logger.error('Failed to send email:', error);
      throw new Error('Failed to send email');
    }
  }

  async sendVerificationEmail(email: string, data: VerificationEmailData): Promise<void> {
    const subject = 'Verify Your XME Projects Account';
    
    const text = `
Hello ${data.username},

Welcome to XME Projects! Please verify your email address by using the following verification code:

Verification Code: ${data.code}

This code will expire in ${data.expirationMinutes} minutes.

If you didn't create an account with XME Projects, please ignore this email.

Best regards,
The XME Projects Team
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify Your Account</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .code-box { background: #fff; border: 2px dashed #667eea; padding: 20px; margin: 20px 0; text-align: center; border-radius: 8px; }
        .code { font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
        .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Welcome to XME Projects</h1>
            <p>Turn your VPS into Windows RDP seamlessly</p>
        </div>
        <div class="content">
            <h2>Hello ${data.username}!</h2>
            <p>Thank you for joining XME Projects. To complete your registration, please verify your email address using the verification code below:</p>
            
            <div class="code-box">
                <div class="code">${data.code}</div>
                <p><strong>Verification Code</strong></p>
            </div>
            
            <p>This code will expire in <strong>${data.expirationMinutes} minutes</strong>.</p>
            
            <div class="warning">
                <strong>⚠️ Security Notice:</strong> If you didn't create an account with XME Projects, please ignore this email and do not share this code with anyone.
            </div>
            
            <p>Once verified, you'll have access to our powerful VPS to Windows RDP conversion tools.</p>
        </div>
        <div class="footer">
            <p>© 2024 XME Projects. All rights reserved.</p>
            <p>This is an automated message, please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
    `;

    await this.sendEmail({
      to: email,
      subject,
      text,
      html
    });
  }

  async sendPasswordResetEmail(email: string, data: PasswordResetEmailData): Promise<void> {
    const subject = 'Reset Your XME Projects Password';
    
    const text = `
Hello ${data.username},

You have requested to reset your password for your XME Projects account.

Please click the following link to reset your password:
${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${data.code}

This link will expire in ${data.expirationMinutes} minutes.

If you didn't request a password reset, please ignore this email and your password will remain unchanged.

For security reasons, please do not share this link with anyone.

Best regards,
The XME Projects Team
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Password</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .code-box { background: #fff; border: 2px dashed #ff6b6b; padding: 20px; margin: 20px 0; text-align: center; border-radius: 8px; }
        .code { font-size: 32px; font-weight: bold; color: #ff6b6b; letter-spacing: 5px; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
        .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .security { background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 5px; margin: 20px 0; color: #721c24; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔒 Password Reset Request</h1>
            <p>XME Projects Security</p>
        </div>
        <div class="content">
            <h2>Hello ${data.username}!</h2>
            <p>You have requested to reset your password for your XME Projects account. Click the button below to reset your password:</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${data.code}" 
                   style="background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); 
                          color: white; 
                          padding: 15px 30px; 
                          text-decoration: none; 
                          border-radius: 8px; 
                          font-weight: bold; 
                          display: inline-block;">
                    Reset Your Password
                </a>
            </div>
            
            <p>If the button doesn't work, you can also copy and paste the following link into your browser:</p>
            <p style="word-break: break-all; background: #f5f5f5; padding: 10px; border-radius: 5px; font-family: monospace;">
                ${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${data.code}
            </p>
            
            <p>This link will expire in <strong>${data.expirationMinutes} minutes</strong>.</p>
            
            <div class="security">
                <strong>🔒 Security Notice:</strong> If you didn't request a password reset, please ignore this email and your password will remain unchanged. For security reasons, please do not share this link with anyone.
            </div>
            
            <p>If you continue to have problems, please contact our support team.</p>
        </div>
        <div class="footer">
            <p>© 2024 XME Projects. All rights reserved.</p>
            <p>This is an automated message, please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
    `;

    await this.sendEmail({
      to: email,
      subject,
      text,
      html
    });
  }

  async sendWelcomeEmail(email: string, username: string): Promise<void> {
    const subject = 'Welcome to XME Projects!';
    
    const text = `
Hello ${username},

Welcome to XME Projects! Your account has been successfully verified.

You can now access all features of our platform to turn your VPS into Windows RDP seamlessly.

Get started by logging into your dashboard and exploring our services.

If you have any questions, feel free to contact our support team.

Best regards,
The XME Projects Team
    `.trim();

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to XME Projects</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #2ecc71 0%, #27ae60 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
        .features { background: #fff; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .feature { margin: 10px 0; padding: 10px; border-left: 4px solid #2ecc71; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Welcome to XME Projects!</h1>
            <p>Your account is now active</p>
        </div>
        <div class="content">
            <h2>Hello ${username}!</h2>
            <p>Congratulations! Your XME Projects account has been successfully verified and is now ready to use.</p>
            
            <div class="features">
                <h3>🚀 What you can do now:</h3>
                <div class="feature">✅ Access your personal dashboard</div>
                <div class="feature">✅ Convert VPS to Windows RDP</div>
                <div class="feature">✅ Manage your server configurations</div>
                <div class="feature">✅ Get 24/7 technical support</div>
            </div>
            
            <p>Ready to get started? Log in to your dashboard and explore all the powerful features we have to offer.</p>
            
            <p>If you have any questions or need assistance, our support team is here to help!</p>
        </div>
        <div class="footer">
            <p>© 2024 XME Projects. All rights reserved.</p>
            <p>Thank you for choosing XME Projects!</p>
        </div>
    </div>
</body>
</html>
    `;

    await this.sendEmail({
      to: email,
      subject,
      text,
      html
    });
  }
}

export const emailService = new EmailService();