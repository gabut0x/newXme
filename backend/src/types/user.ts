import { z } from 'zod';
import { validateUsername } from '../services/badwordFilter.js';

// User validation schemas
export const registerSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(50, 'Username must be less than 50 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, hyphens, and underscores')
    .refine((username) => {
      const validation = validateUsername(username);
      return validation.isValid;
    }, {
      message: 'Username contains inappropriate content'
    }),
  email: z.string()
    .email('Invalid email address')
    .max(255, 'Email must be less than 255 characters'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be less than 128 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
           'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be less than 128 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
           'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  confirmPassword: z.string()
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const verifyEmailSchema = z.object({
  code: z.string().length(6, 'Verification code must be 6 digits'),
});

export const updateProfileSchema = z.object({
  firstName: z.string().max(100, 'First name must be less than 100 characters').optional(),
  lastName: z.string().max(100, 'Last name must be less than 100 characters').optional(),
  phone: z.string().max(20, 'Phone number must be less than 20 characters').optional(),
  timezone: z.string().max(50, 'Timezone must be less than 50 characters').optional(),
  language: z.string().max(10, 'Language code must be less than 10 characters').optional(),
});

// 2FA validation schemas
export const verify2FASchema = z.object({
  challengeId: z.string().min(1, 'Challenge ID is required'),
  code: z.string().length(6, 'Code must be 6 digits').regex(/^\d{6}$/, 'Code must contain only numbers'),
});

export const enable2FASchema = z.object({
  code: z.string().length(6, 'Code must be 6 digits').regex(/^\d{6}$/, 'Code must contain only numbers'),
  secret: z.string()
    .min(16, 'Secret is required')
    .max(128, 'Secret is too long')
    .regex(/^[A-Z2-7]+=*$/i, 'Invalid secret format'),
});

export const disable2FASchema = z.object({
  code: z.string().length(6, 'Code must be 6 digits').regex(/^\d{6}$/, 'Code must contain only numbers'),
});

// Windows Version validation schemas
export const windowsVersionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name must be less than 255 characters'),
  slug: z.string().min(1, 'Slug is required').max(100, 'Slug must be less than 100 characters')
    .regex(/^[a-z0-9-_]+$/, 'Slug can only contain lowercase letters, numbers, hyphens, and underscores'),
});

// Product validation schemas
export const productSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name must be less than 255 characters'),
  description: z.string().max(1000, 'Description must be less than 1000 characters').optional(),
  price: z.number().min(0, 'Price must be non-negative'),
  image_url: z.string().max(255, 'Image path must be less than 255 characters').optional(),
});

// InstallData validation schemas
export const installDataSchema = z.object({
  ip: z.string()
    .min(1, 'IP address is required')
    .max(45, 'IP address must be less than 45 characters')
    .regex(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/, 'Invalid IPv4 address format'),
  passwd_vps: z.string()
    .min(1, 'VPS password is required')
    .max(255, 'VPS password must be less than 255 characters'),
  win_ver: z.string()
    .min(1, 'Windows version is required')
    .max(10, 'Windows version must be less than 10 characters')
    .regex(/^[a-z0-9-_]+$/, 'Windows version can only contain lowercase letters, numbers, hyphens, and underscores'),
  passwd_rdp: z.string()
    .min(4, 'RDP password must be at least 4 characters')
    .max(255, 'RDP password must be less than 255 characters')
    .refine((password) => !password.startsWith('#'), {
      message: 'RDP password cannot start with "#" character'
    }),
});

// User interfaces
export interface User {
  id: number
  username: string
  email: string
  password_hash: string
  is_admin: boolean
  is_active: boolean
  quota: number | null
  telegram_notifications: boolean | null
  telegram_user_id: string | null
  telegram_display_name: string | null
  created_at: string
  updated_at: string
  // 2FA fields
  two_factor_enabled: boolean | 0 | 1 | null
  totp_secret: string | null
}

export interface UserProfile {
  id: number;
  user_id: number;
  first_name?: string;
  last_name?: string;
  phone?: string;
  avatar_url?: string;
  timezone: string;
  language: string;
  created_at: string;
  updated_at: string;
}

export interface VerificationCode {
  id: number;
  user_id: number;
  code: string;
  type: 'email_verification' | 'password_reset';
  expires_at: string;
  used_at?: string;
  created_at: string;
}

export interface UserSession {
  id: number;
  user_id: number;
  session_token: string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
  expires_at: string;
  is_active: boolean;
}

export interface AuditLog {
  id: number;
  user_id?: number;
  action: string;
  resource?: string;
  resource_id?: string;
  ip_address?: string;
  user_agent?: string;
  details?: string;
  created_at: string;
}

// Public user interface (without sensitive data)
export interface PublicUser {
  id: number
  username: string
  email: string
  is_admin: boolean
  is_active: boolean
  quota: number | null
  telegram_notifications: boolean | null
  telegram_user_id: string | null
  telegram_display_name: string | null
  // 2FA safe exposure
  two_factor_enabled?: boolean | 0 | 1 | null
}

// Windows Version interface
export interface WindowsVersion {
  id: number;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

// Product interface
export interface Product {
  id: number;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  created_at: string;
  updated_at: string;
}

// InstallData interface
export interface InstallData {
  id: number;
  user_id: number;
  start_time: string;
  ip: string;
  passwd_vps?: string;
  win_ver: string;
  passwd_rdp?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

// JWT payload interface
export interface JWTPayload {
  userId: number;
  username: string;
  email: string;
  isVerified: boolean;
  iat?: number;
  exp?: number;
}

// API Response interfaces
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  message: string;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type TwoFASetupResponse = {
  secret: string
  otpauth: string
  qrSvg: string
  qrBase64?: string
}