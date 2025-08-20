import express from 'express';
import { z } from 'zod';
import { getDatabase } from '../database/init.js';
import { DateUtils } from '../utils/dateUtils.js';
import bcrypt from 'bcryptjs';
// import jwt from 'jsonwebtoken'; // removed: using AuthUtils instead
import { validateRequest, asyncHandler, authenticateToken } from '../middleware/auth.js';
import { Request, Response } from 'express';
import { AuthUtils } from '../utils/auth.js';

const router = express.Router();

router.post('/register', validateRequest(z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().min(3)
})), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const db = getDatabase();
  const { email, password, username } = req.body;

  const hashedPassword = await bcrypt.hash(password, 10);
  const now = DateUtils.nowSQLite();

  const result = await db.run(
    'INSERT INTO users (email, username, password_hash, created_at, updated_at, is_verified, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [email, username, hashedPassword, now, now, false, true]
  );

  // Create verification code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expirationMinutes = parseInt(process.env['VERIFICATION_CODE_EXPIRES_MINUTES'] || '15');
  const expiresAt = DateUtils.addMinutesJakarta(expirationMinutes);

  await db.run(
    'INSERT INTO verification_codes (user_id, code, type, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
    [result.lastID, code, 'email_verification', expiresAt, now]
  );

  // Send verification email
  const { getEmailService } = await import('../services/emailService.js');
  const emailService = getEmailService();
  await emailService.sendVerificationEmail({
    to: email,
    subject: 'Email Verification - XME Projects',
    code
  });

  res.json({ success: true, message: 'User registered successfully. Verification email sent.', data: { requiresVerification: true } });
}));

// Updated login to support username OR email
router.post('/login', validateRequest(z.object({
  username: z.string().min(1, 'Username or email is required').optional(),
  email: z.string().email('Invalid email format').optional(),
  password: z.string().min(1, 'Password is required'),
  recaptchaToken: z.string().optional()
}).refine((data) => !!data.username || !!data.email, {
  message: 'Username or email is required',
  path: ['username']
})), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const db = getDatabase();
  const { username, email, password } = req.body as { username?: string; email?: string; password: string };

  // Treat provided `username` or `email` as identifier
  const identifier = (username ?? email ?? '').trim();
  if (!identifier) {
    res.status(400).json({ success: false, message: 'Username or email is required' });
    return;
  }

  const user = await db.get('SELECT * FROM users WHERE email = ? OR username = ?', [identifier, identifier]);
  if (!user) {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
    return;
  }

  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
    return;
  }

  const accessToken = AuthUtils.generateAccessToken({
    userId: user.id,
    username: user.username,
    email: user.email,
    isVerified: !!user.is_verified,
  });

  const sessionId = AuthUtils.generateSessionToken();

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        is_verified: user.is_verified,
        admin: user.admin,
        created_at: user.created_at,
        last_login: user.last_login
      },
      accessToken,
      sessionId,
      requiresVerification: false,
      twoFactorRequired: false
    }
  });
}));

router.post('/verification-code', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const db = getDatabase();
  const { email } = req.body;

  // Find user by email
  const user = await db.get('SELECT id FROM users WHERE email = ?', [email]);
  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expirationMinutes = parseInt(process.env['VERIFICATION_CODE_EXPIRES_MINUTES'] || '15');
  const expiresAt = DateUtils.addMinutesJakarta(expirationMinutes);

  await db.run(
    'INSERT INTO verification_codes (user_id, code, type, expires_at) VALUES (?, ?, ?, ?)',
    [user.id, code, 'email_verification', expiresAt]
  );

  res.json({ success: true, message: 'Verification code sent' });
}));

router.post('/verify-email', validateRequest(z.object({
  code: z.string().length(6, 'Verification code must be 6 digits')
})), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { code } = req.body;
  const db = getDatabase();

  // Find valid verification code
  const verification = await db.get(`
    SELECT vc.*, u.* FROM verification_codes vc
    JOIN users u ON vc.user_id = u.id
    WHERE vc.code = ? AND vc.type = 'email_verification' AND vc.used_at IS NULL
  `, [code]);

  if (!verification) {
    res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
    return;
  }

  // Check if code has expired
  if (DateUtils.isPast(verification.expires_at)) {
    res.status(400).json({ success: false, message: 'Verification code has expired' });
    return;
  }

  // Mark code as used
  await db.run('UPDATE verification_codes SET used_at = ? WHERE id = ?', [
    DateUtils.nowSQLite(),
    verification.id
  ]);

  // Mark user as verified
  await db.run('UPDATE users SET is_verified = ?, updated_at = ? WHERE id = ?', [
    true,
    DateUtils.nowSQLite(),
    verification.user_id
  ]);

  // Get updated user
  const user = await db.get('SELECT * FROM users WHERE id = ?', [verification.user_id]);

  // Generate access token for immediate authentication after verification
  const accessToken = AuthUtils.generateAccessToken({
    userId: user.id,
    username: user.username,
    email: user.email,
    isVerified: !!user.is_verified,
  });
  
  res.json({ 
    success: true, 
    message: 'Email verified successfully',
    data: { 
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        is_verified: user.is_verified,
        admin: user.admin,
        created_at: user.created_at
      },
      accessToken
    }
  });
}));

router.post('/resend-verification', validateRequest(z.object({
  email: z.string().email().optional()
})), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const db = getDatabase();
  let { email } = req.body;

  // If no email provided and user is authenticated, use their email
  if (!email && (req as any).user) {
    email = (req as any).user.email;
  }

  if (!email) {
    res.status(400).json({ success: false, message: 'Email is required' });
    return;
  }

  // Find user by email
  const user = await db.get('SELECT id, username FROM users WHERE email = ?', [email]);
  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }

  // Delete any existing codes for this user
  await db.run('DELETE FROM verification_codes WHERE user_id = ? AND type = ?', [user.id, 'email_verification']);

  // Generate new code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expirationMinutes = parseInt(process.env['VERIFICATION_CODE_EXPIRES_MINUTES'] || '15');
  const expiresAt = DateUtils.addMinutesJakarta(expirationMinutes);

  await db.run(`
    INSERT INTO verification_codes (user_id, code, type, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `, [user.id, code, 'email_verification', expiresAt, DateUtils.nowSQLite()]);

  // Send verification email
  const { getEmailService } = await import('../services/emailService.js');
  const emailService = getEmailService();
  
  await emailService.sendVerificationEmail({
    to: email,
    subject: 'Email Verification - XME Projects',
    code: code
  });

  res.json({ success: true, message: 'Verification email sent' });
}));

// New: Logout endpoint to blacklist the current access token
router.post('/logout', authenticateToken, asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    await AuthUtils.blacklistToken(token);
  }

  res.json({ success: true, message: 'Logged out successfully' });
}));

router.post('/forgot-password', validateRequest(z.object({
  email: z.string().email()
})), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const db = getDatabase();
  const { email } = req.body;

  // Find user by email
  const user = await db.get('SELECT id, username FROM users WHERE email = ?', [email]);
  if (!user) {
    // Don't reveal if email exists or not for security
    res.json({ success: true, message: 'If the email exists, a password reset link has been sent.' });
    return;
  }

  // Delete any existing password reset codes for this user
  await db.run('DELETE FROM verification_codes WHERE user_id = ? AND type = ?', [user.id, 'password_reset']);

  // Generate reset token (JWT)
  const resetToken = AuthUtils.generatePasswordResetToken(user.id, email);
  const expirationMinutes = parseInt(process.env['PASSWORD_RESET_EXPIRES_MINUTES'] || '30');
  const expiresAt = DateUtils.addMinutesJakarta(expirationMinutes);
  const now = DateUtils.nowSQLite();

  // Store token in database for additional validation
  await db.run(
    'INSERT INTO verification_codes (user_id, code, type, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
    [user.id, resetToken, 'password_reset', expiresAt, now]
  );

  // Send password reset email
  const { getEmailService } = await import('../services/emailService.js');
  const emailService = getEmailService();
  await emailService.sendPasswordResetEmail({
    to: email,
    subject: 'Password Reset - XME Projects',
    token: resetToken
  });

  res.json({ success: true, message: 'If the email exists, a password reset link has been sent.' });
}));

router.post('/reset-password', validateRequest(z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters')
})), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { token, newPassword } = req.body;
  const db = getDatabase();

  // Verify JWT token
  const tokenData = AuthUtils.verifyPasswordResetToken(token);
  if (!tokenData) {
    res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    return;
  }

  // Find valid reset token in database
  const verification = await db.get(`
    SELECT vc.*, u.* FROM verification_codes vc
    JOIN users u ON vc.user_id = u.id
    WHERE vc.code = ? AND vc.type = 'password_reset' AND vc.used_at IS NULL AND vc.user_id = ?
  `, [token, tokenData.userId]);

  if (!verification) {
    res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    return;
  }

  // Check if token has expired in database
  if (DateUtils.isPast(verification.expires_at)) {
    res.status(400).json({ success: false, message: 'Reset token has expired' });
    return;
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  const now = DateUtils.nowSQLite();

  // Update user password
  await db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [
    hashedPassword,
    now,
    verification.user_id
  ]);

  // Mark token as used
  await db.run('UPDATE verification_codes SET used_at = ? WHERE id = ?', [
    now,
    verification.id
  ]);

  // Blacklist all existing tokens for this user for security
  await AuthUtils.blacklistAllUserTokens(verification.user_id);

  res.json({ success: true, message: 'Password reset successfully' });
}));

// Validate reset token endpoint
router.get('/validate-reset-token/:token', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params;
  const db = getDatabase();

  // Verify JWT token
  const tokenData = AuthUtils.verifyPasswordResetToken(token);
  if (!tokenData) {
    res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    return;
  }

  // Find valid reset token in database
  const verification = await db.get(`
    SELECT vc.*, u.email, u.username FROM verification_codes vc
    JOIN users u ON vc.user_id = u.id
    WHERE vc.code = ? AND vc.type = 'password_reset' AND vc.used_at IS NULL AND vc.user_id = ?
  `, [token, tokenData.userId]);

  if (!verification) {
    res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    return;
  }

  // Check if token has expired in database
  if (DateUtils.isPast(verification.expires_at)) {
    res.status(400).json({ success: false, message: 'Reset token has expired' });
    return;
  }

  res.json({ 
    success: true, 
    data: { 
      email: verification.email, 
      username: verification.username 
    } 
  });
}));

router.get('/session', asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const secureCookie = process.env['NODE_ENV'] === 'production';
  res.json({ success: true, secure: secureCookie });
}));

export default router;