import { getDatabase } from '../database/init.js';
import { AuthUtils } from '../utils/auth.js';
import { User, PublicUser, VerificationCode } from '../types/user.js';
import { logger } from '../utils/logger.js';
import { DateUtils } from '../utils/dateUtils.js';
import { BadRequestError, ConflictError, NotFoundError } from '../middleware/errorHandler.js';

export class UserService {
  /**
   * Create a new user
   */
  static async createUser(userData: {
    username: string;
    email: string;
    password: string;
  }): Promise<User> {
    const db = getDatabase();
    
    try {
      // Check if username already exists
      const existingUsername = await db.get('SELECT id FROM users WHERE username = ?', [userData.username]);
      if (existingUsername) {
        throw new ConflictError('Username already exists', 'USERNAME_EXISTS');
      }

      // Check if email already exists
      const existingEmail = await db.get('SELECT id FROM users WHERE email = ?', [userData.email]);
      if (existingEmail) {
        throw new ConflictError('Email already exists', 'EMAIL_EXISTS');
      }

      // Hash password
      const passwordHash = await AuthUtils.hashPassword(userData.password);

      // Create user
      const result = await db.run(`
        INSERT INTO users (username, email, password_hash, is_verified, is_active, admin, quota, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        userData.username,
        userData.email,
        passwordHash,
        false,
        true,
        0,
        0,
        DateUtils.nowSQLite(),
        DateUtils.nowSQLite()
      ]);

      const user = await db.get('SELECT * FROM users WHERE id = ?', [result.lastID]);
      
      logger.info('User created successfully:', {
        userId: user.id,
        username: user.username,
        email: user.email
      });

      return user;
    } catch (error) {
      logger.error('Failed to create user:', error);
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  static async getUserById(id: number): Promise<User | null> {
    const db = getDatabase();
    
    try {
      const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
      return user || null;
    } catch (error) {
      logger.error('Failed to get user by ID:', error);
      return null;
    }
  }

  /**
   * Get user by username
   */
  static async getUserByUsername(username: string): Promise<User | null> {
    const db = getDatabase();
    
    try {
      const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
      return user || null;
    } catch (error) {
      logger.error('Failed to get user by username:', error);
      return null;
    }
  }

  /**
   * Get user by email
   */
  static async getUserByEmail(email: string): Promise<User | null> {
    const db = getDatabase();
    
    try {
      const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
      return user || null;
    } catch (error) {
      logger.error('Failed to get user by email:', error);
      return null;
    }
  }

  /**
   * Verify user password
   */
  static async verifyPassword(userId: number, password: string): Promise<boolean> {
    const db = getDatabase();
    
    try {
      const user = await db.get('SELECT password_hash FROM users WHERE id = ?', [userId]);
      if (!user) {
        return false;
      }

      return await AuthUtils.comparePassword(password, user.password_hash);
    } catch (error) {
      logger.error('Failed to verify password:', error);
      return false;
    }
  }

  /**
   * Update user password
   */
  static async updatePassword(userId: number, newPassword: string): Promise<void> {
    const db = getDatabase();
    
    try {
      const passwordHash = await AuthUtils.hashPassword(newPassword);
      
      await db.run(`
        UPDATE users 
        SET password_hash = ?, updated_at = ?, failed_login_attempts = 0, locked_until = NULL
        WHERE id = ?
      `, [passwordHash, DateUtils.nowSQLite(), userId]);

      logger.info('Password updated successfully:', { userId });
    } catch (error) {
      logger.error('Failed to update password:', error);
      throw error;
    }
  }

  /**
   * Create verification code
   */
  static async createVerificationCode(userId: number, type: 'email_verification' | 'password_reset'): Promise<string> {
    const db = getDatabase();
    
    try {
      // Delete any existing codes for this user and type
      await db.run('DELETE FROM verification_codes WHERE user_id = ? AND type = ?', [userId, type]);

      // Generate new code
      const code = AuthUtils.generateVerificationCode();
      const expiresAt = DateUtils.addMinutesJakarta(parseInt(process.env.VERIFICATION_CODE_EXPIRES_MINUTES || '15'));

      await db.run(`
        INSERT INTO verification_codes (user_id, code, type, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `, [userId, code, type, expiresAt, DateUtils.nowSQLite()]);

      logger.info('Verification code created:', {
        userId,
        type,
        expiresAt
      });

      return code;
    } catch (error) {
      logger.error('Failed to create verification code:', error);
      throw error;
    }
  }

  /**
   * Verify code and mark user as verified
   */
  static async verifyCode(code: string, type: 'email_verification' | 'password_reset'): Promise<User | null> {
    const db = getDatabase();
    
    try {
      // Find valid verification code
      const verificationCode = await db.get(`
        SELECT vc.*, u.* FROM verification_codes vc
        JOIN users u ON vc.user_id = u.id
        WHERE vc.code = ? AND vc.type = ? AND vc.used_at IS NULL
      `, [code, type]);

      if (!verificationCode) {
        return null;
      }

      // Check if code has expired
      if (DateUtils.isPast(verificationCode.expires_at)) {
        return null;
      }

      // Mark code as used
      await db.run('UPDATE verification_codes SET used_at = ? WHERE id = ?', [
        DateUtils.nowSQLite(),
        verificationCode.id
      ]);

      // If email verification, mark user as verified
      if (type === 'email_verification') {
        await db.run('UPDATE users SET is_verified = ?, updated_at = ? WHERE id = ?', [
          true,
          DateUtils.nowSQLite(),
          verificationCode.user_id
        ]);
      }

      // Get updated user
      const user = await db.get('SELECT * FROM users WHERE id = ?', [verificationCode.user_id]);
      
      logger.info('Code verified successfully:', {
        userId: verificationCode.user_id,
        type,
        code
      });

      return user;
    } catch (error) {
      logger.error('Failed to verify code:', error);
      throw error;
    }
  }

  /**
   * Get public user data (without sensitive information)
   */
  static async getPublicUserData(userId: number): Promise<PublicUser | null> {
    const db = getDatabase();
    
    try {
      const user = await db.get(`
        SELECT u.id, u.username, u.email, u.is_verified, u.admin, u.telegram, u.quota, u.created_at, u.last_login,
               p.first_name, p.last_name, p.phone, p.avatar_url, p.timezone, p.language, p.created_at as profile_created_at
        FROM users u
        LEFT JOIN user_profiles p ON u.id = p.user_id
        WHERE u.id = ?
      `, [userId]);

      if (!user) {
        return null;
      }

      const profile = user.first_name ? {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        avatar_url: user.avatar_url,
        timezone: user.timezone,
        language: user.language,
        created_at: user.profile_created_at
      } : undefined;

      return {
        id: user.id,
        username: user.username,
        email: user.email,
        is_verified: user.is_verified,
        admin: user.admin,
        telegram: user.telegram,
        quota: user.quota,
        created_at: user.created_at,
        last_login: user.last_login,
        profile
      };
    } catch (error) {
      logger.error('Failed to get public user data:', error);
      return null;
    }
  }

  /**
   * Check if user is locked due to failed login attempts
   */
  static async isUserLocked(userId: number): Promise<boolean> {
    const db = getDatabase();
    
    try {
      const user = await db.get('SELECT locked_until FROM users WHERE id = ?', [userId]);
      if (!user || !user.locked_until) {
        return false;
      }

      return !DateUtils.isPast(user.locked_until);
    } catch (error) {
      logger.error('Failed to check user lock status:', error);
      return false;
    }
  }

  /**
   * Increment failed login attempts
   */
  static async incrementFailedLoginAttempts(userId: number): Promise<void> {
    const db = getDatabase();
    
    try {
      const user = await db.get('SELECT failed_login_attempts FROM users WHERE id = ?', [userId]);
      if (!user) return;

      const newAttempts = user.failed_login_attempts + 1;
      let lockedUntil = null;

      // Lock user after 5 failed attempts for 15 minutes
      if (newAttempts >= 5) {
        lockedUntil = DateUtils.addMinutesJakarta(15);
      }

      await db.run(`
        UPDATE users 
        SET failed_login_attempts = ?, locked_until = ?, updated_at = ?
        WHERE id = ?
      `, [newAttempts, lockedUntil, DateUtils.nowSQLite(), userId]);

      logger.info('Failed login attempt recorded:', {
        userId,
        attempts: newAttempts,
        lockedUntil
      });
    } catch (error) {
      logger.error('Failed to increment login attempts:', error);
    }
  }

  /**
   * Reset failed login attempts
   */
  static async resetFailedLoginAttempts(userId: number): Promise<void> {
    const db = getDatabase();
    
    try {
      await db.run(`
        UPDATE users 
        SET failed_login_attempts = 0, locked_until = NULL, last_login = ?, updated_at = ?
        WHERE id = ?
      `, [DateUtils.nowSQLite(), DateUtils.nowSQLite(), userId]);

      logger.info('Failed login attempts reset:', { userId });
    } catch (error) {
      logger.error('Failed to reset login attempts:', error);
    }
  }

  /**
   * Get user quota
   */
  static async getUserQuota(userId: number): Promise<number> {
    const db = getDatabase();
    
    try {
      const user = await db.get('SELECT quota FROM users WHERE id = ?', [userId]);
      return user?.quota || 0;
    } catch (error) {
      logger.error('Failed to get user quota:', error);
      return 0;
    }
  }

  /**
   * Check if user has sufficient quota for installation
   */
  static async checkQuotaForInstallation(userId: number): Promise<boolean> {
    const quota = await this.getUserQuota(userId);
    return quota >= 1;
  }

  /**
   * Decrement user quota
   */
  static async decrementUserQuota(userId: number, amount: number = 1): Promise<boolean> {
    const db = getDatabase();
    
    try {
      const user = await db.get('SELECT quota FROM users WHERE id = ?', [userId]);
      if (!user || user.quota < amount) {
        return false;
      }

      const newQuota = user.quota - amount;
      await db.run(`
        UPDATE users 
        SET quota = ?, updated_at = ?
        WHERE id = ?
      `, [newQuota, DateUtils.nowSQLite(), userId]);

      logger.info('User quota decremented:', {
        userId,
        oldQuota: user.quota,
        newQuota,
        amount
      });

      return true;
    } catch (error) {
      logger.error('Failed to decrement user quota:', error);
      return false;
    }
  }

  /**
   * Increment user quota
   */
  static async incrementUserQuota(userId: number, amount: number = 1): Promise<void> {
    const db = getDatabase();
    
    try {
      const user = await db.get('SELECT quota FROM users WHERE id = ?', [userId]);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      const newQuota = user.quota + amount;
      await db.run(`
        UPDATE users 
        SET quota = ?, updated_at = ?
        WHERE id = ?
      `, [newQuota, DateUtils.nowSQLite(), userId]);

      logger.info('User quota incremented:', {
        userId,
        oldQuota: user.quota,
        newQuota,
        amount
      });
    } catch (error) {
      logger.error('Failed to increment user quota:', error);
      throw error;
    }
  }

  /**
   * Update user's last login time
   */
  static async updateLastLogin(userId: number): Promise<void> {
    const db = getDatabase();
    
    try {
      await db.run(`
        UPDATE users 
        SET last_login = ?, updated_at = ?
        WHERE id = ?
      `, [DateUtils.nowSQLite(), DateUtils.nowSQLite(), userId]);
    } catch (error) {
      logger.error('Failed to update last login:', error);
    }
  }

  /**
   * Deactivate user account
   */
  static async deactivateUser(userId: number): Promise<void> {
    const db = getDatabase();
    
    try {
      await db.run(`
        UPDATE users 
        SET is_active = ?, updated_at = ?
        WHERE id = ?
      `, [false, DateUtils.nowSQLite(), userId]);

      logger.info('User deactivated:', { userId });
    } catch (error) {
      logger.error('Failed to deactivate user:', error);
      throw error;
    }
  }

  /**
   * Activate user account
   */
  static async activateUser(userId: number): Promise<void> {
    const db = getDatabase();
    
    try {
      await db.run(`
        UPDATE users 
        SET is_active = ?, updated_at = ?
        WHERE id = ?
      `, [true, DateUtils.nowSQLite(), userId]);

      logger.info('User activated:', { userId });
    } catch (error) {
      logger.error('Failed to activate user:', error);
      throw error;
    }
  }

  /**
   * Delete expired verification codes
   */
  static async cleanupExpiredCodes(): Promise<void> {
    const db = getDatabase();
    
    try {
      const result = await db.run(`
        DELETE FROM verification_codes 
        WHERE expires_at < ?
      `, [DateUtils.nowSQLite()]);

      if (result.changes && result.changes > 0) {
        logger.info('Cleaned up expired verification codes:', {
          deletedCount: result.changes
        });
      }
    } catch (error) {
      logger.error('Failed to cleanup expired codes:', error);
    }
  }

  /**
   * Get user statistics
   */
  static async getUserStats(userId: number): Promise<{
    totalInstalls: number;
    activeInstalls: number;
    completedInstalls: number;
    failedInstalls: number;
  }> {
    const db = getDatabase();
    
    try {
      const [total, active, completed, failed] = await Promise.all([
        db.get('SELECT COUNT(*) as count FROM install_data WHERE user_id = ?', [userId]),
        db.get('SELECT COUNT(*) as count FROM install_data WHERE user_id = ? AND status IN (?, ?)', [userId, 'pending', 'running']),
        db.get('SELECT COUNT(*) as count FROM install_data WHERE user_id = ? AND status = ?', [userId, 'completed']),
        db.get('SELECT COUNT(*) as count FROM install_data WHERE user_id = ? AND status = ?', [userId, 'failed'])
      ]);

      return {
        totalInstalls: total.count,
        activeInstalls: active.count,
        completedInstalls: completed.count,
        failedInstalls: failed.count
      };
    } catch (error) {
      logger.error('Failed to get user stats:', error);
      return {
        totalInstalls: 0,
        activeInstalls: 0,
        completedInstalls: 0,
        failedInstalls: 0
      };
    }
  }

  /**
   * Check if user exists and is active
   */
  static async isUserActiveById(userId: number): Promise<boolean> {
    const db = getDatabase();
    
    try {
      const user = await db.get('SELECT is_active FROM users WHERE id = ?', [userId]);
      return user?.is_active === true;
    } catch (error) {
      logger.error('Failed to check user active status:', error);
      return false;
    }
  }

  /**
   * Update user profile
   */
  static async updateUserProfile(userId: number, profileData: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    timezone?: string;
    language?: string;
  }): Promise<void> {
    const db = getDatabase();
    
    try {
      // Check if profile exists
      const existingProfile = await db.get('SELECT id FROM user_profiles WHERE user_id = ?', [userId]);

      if (existingProfile) {
        // Update existing profile
        await db.run(`
          UPDATE user_profiles 
          SET first_name = ?, last_name = ?, phone = ?, timezone = ?, language = ?, updated_at = ?
          WHERE user_id = ?
        `, [
          profileData.firstName || null,
          profileData.lastName || null,
          profileData.phone || null,
          profileData.timezone || 'Asia/Jakarta',
          profileData.language || 'id',
          DateUtils.nowSQLite(),
          userId
        ]);
      } else {
        // Create new profile
        await db.run(`
          INSERT INTO user_profiles (user_id, first_name, last_name, phone, timezone, language, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          userId,
          profileData.firstName || null,
          profileData.lastName || null,
          profileData.phone || null,
          profileData.timezone || 'Asia/Jakarta',
          profileData.language || 'id',
          DateUtils.nowSQLite(),
          DateUtils.nowSQLite()
        ]);
      }

      logger.info('User profile updated:', {
        userId,
        updatedFields: Object.keys(profileData)
      });
    } catch (error) {
      logger.error('Failed to update user profile:', error);
      throw error;
    }
  }
}