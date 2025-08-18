// Third-party packages
import express from 'express';
import { Request, Response } from 'express';

// Custom middleware
import {
  authenticateToken,
  requireUnverifiedUser,
  loginRateLimit,
  registerRateLimit,
  forgotPasswordRateLimit,
  verifyEmailRateLimit,
  resendVerificationRateLimit,
  validateRequest,
  asyncHandler
} from '../middleware/auth.js';
import { verifyRecaptcha } from '../middleware/recaptcha.js';
import { BadRequestError, UnauthorizedError } from '../middleware/errorHandler.js';

// Types and schemas
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  ApiResponse,
  verify2FASchema
} from '../types/user.js';

// Services and utilities
import { UserService } from '../services/userService.js';
import { emailService } from '../services/emailService.js';
import { SessionManager } from '../config/redis.js';
import { AuthUtils } from '../utils/auth.js';
import { logger } from '../utils/logger.js';
import { authenticator } from 'otplib';

const router = express.Router();

// Register new user
router.post('/register', 
  registerRateLimit,
  verifyRecaptcha,
  validateRequest(registerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { username, email, password } = req.body;

    // Create user
    const user = await UserService.createUser({
      username: AuthUtils.sanitizeInput(username),
      email: email.toLowerCase(),
      password
    });

    // Generate verification code
    const verificationCode = await UserService.createVerificationCode(user.id, 'email_verification');

    // Send verification email
    try {
      await emailService.sendVerificationEmail(user.email, {
        username: user.username,
        code: verificationCode,
        expirationMinutes: parseInt(process.env.VERIFICATION_CODE_EXPIRES_MINUTES || '15')
      });
    } catch (error) {
      logger.error('Failed to send verification email:', error);
      // Don't fail registration if email fails
    }

    // Generate tokens
    const tokenPayload = {
      userId: user.id,
      username: user.username,
      email: user.email,
      isVerified: user.is_verified
    };

    const accessToken = AuthUtils.generateAccessToken(tokenPayload);
    const refreshToken = AuthUtils.generateRefreshToken(tokenPayload);

    // Create session
    const sessionId = await SessionManager.createSession(user.id, {
      userId: user.id,
      username: user.username,
      email: user.email,
      isVerified: user.is_verified,
      createdAt: new Date().toISOString()
    });

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    logger.info('User registered successfully:', {
      userId: user.id,
      username: user.username,
      email: user.email
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please check your email for verification code.',
      data: {
        user: await UserService.getPublicUserData(user.id),
        accessToken,
        sessionId,
        requiresVerification: !user.is_verified
      }
    } as ApiResponse);
  })
);

// Login user
router.post('/login',
  loginRateLimit,
  verifyRecaptcha,
  validateRequest(loginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { username, password } = req.body;

    // Get user by username or email
    let user = await UserService.getUserByUsername(username);
    if (!user) {
      user = await UserService.getUserByEmail(username);
    }

    if (!user) {
      throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    // Check if user is locked
    const isLocked = await UserService.isUserLocked(user.id);
    if (isLocked) {
      throw new UnauthorizedError('Account is temporarily locked due to multiple failed login attempts', 'ACCOUNT_LOCKED');
    }

    // Verify password
    const isValidPassword = await UserService.verifyPassword(user.id, password);
    if (!isValidPassword) {
      await UserService.incrementFailedLoginAttempts(user.id);
      throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    // Reset failed login attempts on successful login
    await UserService.resetFailedLoginAttempts(user.id);

    // If admin with 2FA enabled, interrupt login and issue challenge
    const requiresTwoFA = Boolean(user.admin) && (user.two_factor_enabled === true || user.two_factor_enabled === 1) && !!user.totp_secret;
    if (requiresTwoFA) {
      const challengeId = await SessionManager.createTwoFAChallenge(user.id, 300); // 5 minutes
      logger.info('2FA challenge created for user:', { userId: user.id, challengeId });
      return res.json({
        success: true,
        message: 'Two-factor authentication required',
        data: {
          twoFactorRequired: true,
          challengeId
        }
      } as ApiResponse);
    }

    // Generate tokens
    const tokenPayload = {
      userId: user.id,
      username: user.username,
      email: user.email,
      isVerified: user.is_verified
    };

    const accessToken = AuthUtils.generateAccessToken(tokenPayload);
    const refreshToken = AuthUtils.generateRefreshToken(tokenPayload);

    // Create session
    const sessionId = await SessionManager.createSession(user.id, {
      userId: user.id,
      username: user.username,
      email: user.email,
      isVerified: user.is_verified,
      createdAt: new Date().toISOString()
    });

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    logger.info('User logged in successfully:', {
      userId: user.id,
      username: user.username
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: await UserService.getPublicUserData(user.id),
        accessToken,
        sessionId,
        requiresVerification: !user.is_verified
      }
    } as ApiResponse);
  })
);

// Logout user
router.post('/logout',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      // Blacklist the access token
      await AuthUtils.blacklistToken(token);
    }

    // Clear refresh token cookie
    res.clearCookie('refreshToken');

    // Delete all user sessions (optional - for logout from all devices)
    if (req.user) {
      await SessionManager.deleteAllUserSessions(req.user.id);
    }

    logger.info('User logged out successfully:', {
      userId: req.user?.id
    });

    res.json({
      success: true,
      message: 'Logout successful'
    } as ApiResponse);
  })
);

// Refresh access token
router.post('/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedError('Refresh token required', 'MISSING_REFRESH_TOKEN');
    }

    // Check if token is blacklisted
    const isBlacklisted = await AuthUtils.isTokenBlacklisted(refreshToken);
    if (isBlacklisted) {
      res.clearCookie('refreshToken');
      throw new UnauthorizedError('Refresh token has been revoked', 'TOKEN_REVOKED');
    }

    // Verify refresh token
    const decoded = AuthUtils.verifyToken(refreshToken);

    // Get user to ensure they still exist and are active
    const user = await UserService.getUserById(decoded.userId);
    if (!user || !user.is_active) {
      res.clearCookie('refreshToken');
      throw new UnauthorizedError('User not found or inactive', 'USER_INACTIVE');
    }

    // Generate new access token
    const tokenPayload = {
      userId: user.id,
      username: user.username,
      email: user.email,
      isVerified: user.is_verified
    };

    const newAccessToken = AuthUtils.generateAccessToken(tokenPayload);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken: newAccessToken,
        user: await UserService.getPublicUserData(user.id)
      }
    } as ApiResponse);
  })
);

// Verify email
router.post('/verify-email',
  authenticateToken,
  requireUnverifiedUser,
  verifyEmailRateLimit,
  validateRequest(verifyEmailSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { code } = req.body;

    const user = await UserService.verifyCode(code, 'email_verification');
    if (!user) {
      throw new BadRequestError('Invalid or expired verification code', 'INVALID_CODE');
    }

    // Send welcome email
    try {
      await emailService.sendWelcomeEmail(user.email, user.username);
    } catch (error) {
      logger.error('Failed to send welcome email:', error);
      // Don't fail verification if email fails
    }

    logger.info('Email verified successfully:', {
      userId: user.id,
      email: user.email
    });

    res.json({
      success: true,
      message: 'Email verified successfully',
      data: {
        user: await UserService.getPublicUserData(user.id)
      }
    } as ApiResponse);
  })
);

// Resend verification email
router.post('/resend-verification',
  authenticateToken,
  requireUnverifiedUser,
  resendVerificationRateLimit,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    // Generate new verification code
    const verificationCode = await UserService.createVerificationCode(req.user.id, 'email_verification');

    // Send verification email
    await emailService.sendVerificationEmail(req.user.email, {
      username: req.user.username,
      code: verificationCode,
      expirationMinutes: parseInt(process.env.VERIFICATION_CODE_EXPIRES_MINUTES || '15')
    });

    logger.info('Verification email resent:', {
      userId: req.user.id,
      email: req.user.email
    });

    res.json({
      success: true,
      message: 'Verification email sent successfully'
    } as ApiResponse);
  })
);

// Forgot password
router.post('/forgot-password',
  forgotPasswordRateLimit,
  verifyRecaptcha,
  validateRequest(forgotPasswordSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;

    const user = await UserService.getUserByEmail(email.toLowerCase());
    if (!user) {
      // Return error if email is not found in database
      throw new BadRequestError('Email address not found. Please check your email or register for a new account.', 'EMAIL_NOT_FOUND');
    }

    // Generate password reset token instead of code
    const resetToken = AuthUtils.generatePasswordResetToken(user.id, user.email);

    // Send password reset email
    try {
      await emailService.sendPasswordResetEmail(user.email, {
        username: user.username,
        code: resetToken, // Using token as code for email template
        expirationMinutes: parseInt(process.env.VERIFICATION_CODE_EXPIRES_MINUTES || '15')
      });
    } catch (error) {
      logger.error('Failed to send password reset email:', error);
      throw new Error('Failed to send password reset email');
    }

    logger.info('Password reset email sent:', {
      userId: user.id,
      email: user.email
    });

    res.json({
      success: true,
      message: 'If an account with that email exists, a password reset code has been sent.'
    } as ApiResponse);
  })
);

// Validate reset token
router.get('/validate-reset-token/:token',
  asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.params;

    const decoded = AuthUtils.verifyPasswordResetToken(token);
    if (!decoded) {
      throw new BadRequestError('Invalid or expired reset token', 'INVALID_TOKEN');
    }

    // Verify user still exists
    const user = await UserService.getUserById(decoded.userId);
    if (!user) {
      throw new BadRequestError('User not found', 'USER_NOT_FOUND');
    }

    res.json({
      success: true,
      message: 'Reset token is valid',
      data: {
        email: decoded.email,
        username: user.username
      }
    } as ApiResponse);
  })
);

// Reset password
router.post('/reset-password',
  validateRequest(resetPasswordSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { token, newPassword } = req.body;

    // Verify the reset token
    const decoded = AuthUtils.verifyPasswordResetToken(token);
    if (!decoded) {
      throw new BadRequestError('Invalid or expired reset token', 'INVALID_TOKEN');
    }

    // Verify user still exists
    const user = await UserService.getUserById(decoded.userId);
    if (!user) {
      throw new BadRequestError('User not found', 'USER_NOT_FOUND');
    }

    // Update password
    await UserService.updatePassword(user.id, newPassword);

    // Invalidate all existing sessions for this user
    await SessionManager.deleteAllUserSessions(user.id);

    logger.info('Password reset successfully:', {
      userId: user.id,
      email: user.email
    });

    res.json({
      success: true,
      message: 'Password reset successfully. Please log in with your new password.'
    } as ApiResponse);
  })
);

// 2FA verify endpoint
router.post('/2fa/verify',
  validateRequest(verify2FASchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { challengeId, code } = req.body;

    const challenge = await SessionManager.getTwoFAChallenge(challengeId);
    if (!challenge) {
      throw new UnauthorizedError('Invalid or expired 2FA challenge', 'INVALID_CHALLENGE');
    }

    const user = await UserService.getUserById(challenge.userId);
    if (!user) {
      await SessionManager.deleteTwoFAChallenge(challengeId);
      throw new UnauthorizedError('User not found', 'USER_NOT_FOUND');
    }

    if (!user.totp_secret) {
      await SessionManager.deleteTwoFAChallenge(challengeId);
      throw new UnauthorizedError('2FA not configured for this user', 'TWOFA_NOT_CONFIGURED');
    }

    const isValid = authenticator.verify({ token: code, secret: user.totp_secret });
    if (!isValid) {
      throw new UnauthorizedError('Invalid 2FA code', 'INVALID_CODE');
    }

    // Valid - complete login
    await SessionManager.deleteTwoFAChallenge(challengeId);

    const tokenPayload = {
      userId: user.id,
      username: user.username,
      email: user.email,
      isVerified: user.is_verified
    };

    const accessToken = AuthUtils.generateAccessToken(tokenPayload);
    const refreshToken = AuthUtils.generateRefreshToken(tokenPayload);

    const sessionId = await SessionManager.createSession(user.id, {
      userId: user.id,
      username: user.username,
      email: user.email,
      isVerified: user.is_verified,
      createdAt: new Date().toISOString()
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    logger.info('2FA verified and login completed:', { userId: user.id });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: await UserService.getPublicUserData(user.id),
        accessToken,
        sessionId,
        requiresVerification: !user.is_verified
      }
    } as ApiResponse);
  })
);

export { router as authRoutes };