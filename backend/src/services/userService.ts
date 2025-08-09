import { getDatabase } from '../database/init.js';
import { User, UserProfile, VerificationCode, PublicUser } from '../types/user.js';
import { AuthUtils } from '../utils/auth.js';
import { logger } from '../utils/logger.js';
import { ConflictError, NotFoundError, BadRequestError } from '../middleware/errorHandler.js';

export class UserService {
  // User CRUD operations
  static async createUser(userData: {
    username: string;
    email: string;
    password: string;
  }): Promise<User> {
    const db = getDatabase();
    
    try {
      // Check if user already exists
      const existingUser = await db.get(
        'SELECT id FROM users WHERE username = ? OR email = ?',
        [userData.username, userData.email]
      );
      
      if (existingUser) {
        throw new ConflictError('Username or email already exists', 'USER_EXISTS');
      }

      // Hash password
      const passwordHash = await AuthUtils.hashPassword(userData.password);
      
      // Create user
      const result = await db.run(
        `INSERT INTO users (username, email, password_hash) 
         VALUES (?, ?, ?)`,
        [userData.username, userData.email, passwordHash]
      );

      if (!result.lastID) {
        throw new Error('Failed to create user');
      }

      // Create user profile
      await db.run(
        `INSERT INTO user_profiles (user_id) VALUES (?)`,
        [result.lastID]
      );

      // Get the created user
      const user = await this.getUserById(result.lastID);
      if (!user) {
        throw new Error('Failed to retrieve created user');
      }

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

  static async getUserById(id: number): Promise<User | null> {
    const db = getDatabase();
    
    try {
      const user = await db.get(
        'SELECT * FROM users WHERE id = ? AND is_active = 1',
        [id]
      );
      
      return user || null;
    } catch (error) {
      logger.error('Failed to get user by ID:', error);
      throw error;
    }
  }

  static async getUserByUsername(username: string): Promise<User | null> {
    const db = getDatabase();
    
    try {
      const user = await db.get(
        'SELECT * FROM users WHERE username = ? AND is_active = 1',
        [username]
      );
      
      return user || null;
    } catch (error) {
      logger.error('Failed to get user by username:', error);
      throw error;
    }
  }

  static async getUserByEmail(email: string): Promise<User | null> {
    const db = getDatabase();
    
    try {
      const user = await db.get(
        'SELECT * FROM users WHERE email = ? AND is_active = 1',
        [email]
      );
      
      return user || null;
    } catch (error) {
      logger.error('Failed to get user by email:', error);
      throw error;
    }
  }

  static async updateUser(id: number, updates: Partial<User>): Promise<User> {
    const db = getDatabase();
    
    try {
      const user = await this.getUserById(id);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      // Build update query dynamically
      const allowedFields = ['email', 'is_verified', 'is_active', 'last_login', 'failed_login_attempts', 'locked_until', 'quota'];
      const updateFields = Object.keys(updates).filter(key => allowedFields.includes(key));
      
      if (updateFields.length === 0) {
        return user;
      }

      const setClause = updateFields.map(field => `${field} = ?`).join(', ');
      const values = updateFields.map(field => updates[field as keyof User]);
      values.push(id);

      await db.run(
        `UPDATE users SET ${setClause}, updated_at = datetime('now','localtime') WHERE id = ?`,
        values
      );

      const updatedUser = await this.getUserById(id);
      if (!updatedUser) {
        throw new Error('Failed to retrieve updated user');
      }

      return updatedUser;
    } catch (error) {
      logger.error('Failed to update user:', error);
      throw error;
    }
  }

  static async updatePassword(id: number, newPassword: string): Promise<void> {
    const db = getDatabase();
    
    try {
      const passwordHash = await AuthUtils.hashPassword(newPassword);
      
      await db.run(
        'UPDATE users SET password_hash = ?, updated_at = datetime('now','localtime') WHERE id = ?',
        [passwordHash, id]
      );

      logger.info('Password updated successfully for user:', { userId: id });
    } catch (error) {
      logger.error('Failed to update password:', error);
      throw error;
    }
  }

  static async verifyPassword(id: number, password: string): Promise<boolean> {
    const db = getDatabase();
    
    try {
      const user = await db.get('SELECT password_hash FROM users WHERE id = ?', [id]);
      if (!user) {
        return false;
      }

      return await AuthUtils.comparePassword(password, user.password_hash);
    } catch (error) {
      logger.error('Failed to verify password:', error);
      throw error;
    }
  }

  static async incrementFailedLoginAttempts(id: number): Promise<void> {
    const db = getDatabase();
    
    try {
      await db.run(
        `UPDATE users 
         SET failed_login_attempts = failed_login_attempts + 1,
             locked_until = CASE 
               WHEN failed_login_attempts >= 4 THEN datetime('now', '+30 minutes')
               ELSE locked_until 
             END,
             updated_at = datetime('now','localtime')
         WHERE id = ?`,
        [id]
      );
    } catch (error) {
      logger.error('Failed to increment failed login attempts:', error);
      throw error;
    }
  }

  static async resetFailedLoginAttempts(id: number): Promise<void> {
    const db = getDatabase();
    
    try {
      await db.run(
        `UPDATE users 
         SET failed_login_attempts = 0, 
             locked_until = NULL,
             last_login = datetime('now','localtime'),
             updated_at = datetime('now','localtime')
         WHERE id = ?`,
        [id]
      );
    } catch (error) {
      logger.error('Failed to reset failed login attempts:', error);
      throw error;
    }
  }

  static async isUserLocked(id: number): Promise<boolean> {
    const db = getDatabase();
    
    try {
      const user = await db.get(
        'SELECT locked_until FROM users WHERE id = ?',
        [id]
      );
      
      if (!user || !user.locked_until) {
        return false;
      }

      const lockedUntil = new Date(user.locked_until);
      const now = new Date();
      
      return lockedUntil > now;
    } catch (error) {
      logger.error('Failed to check if user is locked:', error);
      throw error;
    }
  }

  // User Profile operations
  static async getUserProfile(userId: number): Promise<UserProfile | null> {
    const db = getDatabase();
    
    try {
      const profile = await db.get(
        'SELECT * FROM user_profiles WHERE user_id = ?',
        [userId]
      );
      
      return profile || null;
    } catch (error) {
      logger.error('Failed to get user profile:', error);
      throw error;
    }
  }

  static async updateUserProfile(userId: number, updates: Partial<UserProfile>): Promise<UserProfile> {
    const db = getDatabase();
    
    try {
      // Check if profile exists
      let profile = await this.getUserProfile(userId);
      if (!profile) {
        // Create profile if it doesn't exist
        await db.run('INSERT INTO user_profiles (user_id) VALUES (?)', [userId]);
        profile = await this.getUserProfile(userId);
        if (!profile) {
          throw new Error('Failed to create user profile');
        }
      }

      // Build update query dynamically
      const allowedFields = ['first_name', 'last_name', 'phone', 'avatar_url', 'timezone', 'language'];
      const updateFields = Object.keys(updates).filter(key => allowedFields.includes(key));
      
      if (updateFields.length === 0) {
        return profile;
      }

      const setClause = updateFields.map(field => `${field} = ?`).join(', ');
      const values = updateFields.map(field => updates[field as keyof UserProfile]);
      values.push(userId);

      await db.run(
        `UPDATE user_profiles SET ${setClause}, updated_at = datetime('now','localtime') WHERE user_id = ?`,
        values
      );

      const updatedProfile = await this.getUserProfile(userId);
      if (!updatedProfile) {
        throw new Error('Failed to retrieve updated profile');
      }

      return updatedProfile;
    } catch (error) {
      logger.error('Failed to update user profile:', error);
      throw error;
    }
  }

  // Verification code operations
  static async createVerificationCode(userId: number, type: 'email_verification' | 'password_reset'): Promise<string> {
    const db = getDatabase();
    
    try {
      const code = AuthUtils.generateVerificationCode();
      const expirationMinutes = parseInt(process.env.VERIFICATION_CODE_EXPIRES_MINUTES || '15');
      
      // Delete any existing codes of the same type for this user
      await db.run(
        'DELETE FROM verification_codes WHERE user_id = ? AND type = ?',
        [userId, type]
      );

      // Create new verification code
      await db.run(
        `INSERT INTO verification_codes (user_id, code, type, expires_at) 
         VALUES (?, ?, ?, datetime('now', '+${expirationMinutes} minutes'))`,
        [userId, code, type]
      );

      logger.info('Verification code created:', {
        userId,
        type,
        expirationMinutes
      });

      return code;
    } catch (error) {
      logger.error('Failed to create verification code:', error);
      throw error;
    }
  }

  static async verifyCode(code: string, type: 'email_verification' | 'password_reset'): Promise<User | null> {
    const db = getDatabase();
    
    try {
      // Get verification code with user info
      const verification = await db.get(
        `SELECT vc.*, u.* FROM verification_codes vc
         JOIN users u ON vc.user_id = u.id
         WHERE vc.code = ? AND vc.type = ? AND vc.used_at IS NULL 
         AND vc.expires_at > datetime('now')`,
        [code, type]
      );

      if (!verification) {
        return null;
      }

      // Mark code as used
      await db.run(
        'UPDATE verification_codes SET used_at = datetime('now','localtime') WHERE id = ?',
        [verification.id]
      );

      // If email verification, mark user as verified
      if (type === 'email_verification') {
        await this.updateUser(verification.user_id, { is_verified: true });
      }

      return {
        id: verification.user_id,
        username: verification.username,
        email: verification.email,
        password_hash: verification.password_hash,
        is_verified: verification.is_verified,
        is_active: verification.is_active,
        created_at: verification.created_at,
        updated_at: verification.updated_at,
        last_login: verification.last_login,
        failed_login_attempts: verification.failed_login_attempts,
        locked_until: verification.locked_until
      };
    } catch (error) {
      logger.error('Failed to verify code:', error);
      throw error;
    }
  }

  // Public user data (without sensitive information)
  static async getPublicUserData(userId: number): Promise<PublicUser | null> {
    const db = getDatabase();
    
    try {
      const user = await db.get(
        `SELECT u.id, u.username, u.email, u.is_verified, u.admin, u.telegram, u.quota, u.created_at, u.last_login,
                p.first_name, p.last_name, p.phone, p.avatar_url, p.timezone, p.language,
                p.created_at as profile_created_at, p.updated_at as profile_updated_at
         FROM users u
         LEFT JOIN user_profiles p ON u.id = p.user_id
         WHERE u.id = ? AND u.is_active = 1`,
        [userId]
      );

      if (!user) {
        return null;
      }

      const publicUser: PublicUser = {
        id: user.id,
        username: user.username,
        email: user.email,
        is_verified: user.is_verified,
        admin: user.admin,
        telegram: user.telegram,
        quota: user.quota,
        created_at: user.created_at,
        last_login: user.last_login
      };

      if (user.first_name || user.last_name || user.phone || user.avatar_url) {
        publicUser.profile = {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          phone: user.phone,
          avatar_url: user.avatar_url,
          timezone: user.timezone || 'UTC',
          language: user.language || 'en',
          created_at: user.profile_created_at,
          updated_at: user.profile_updated_at
        };
      }

      return publicUser;
    } catch (error) {
      logger.error('Failed to get public user data:', error);
      throw error;
    }
  }

  // Delete user (soft delete)
  static async deleteUser(id: number): Promise<void> {
    const db = getDatabase();
    
    try {
      await db.run(
        'UPDATE users SET is_active = 0, updated_at = datetime('now','localtime') WHERE id = ?',
        [id]
      );

      logger.info('User soft deleted:', { userId: id });
    } catch (error) {
      logger.error('Failed to delete user:', error);
      throw error;
    }
  }

  // Quota management methods
  static async getUserQuota(userId: number): Promise<number> {
    const db = getDatabase();
    
    try {
      const user = await db.get('SELECT quota FROM users WHERE id = ? AND is_active = 1', [userId]);
      return user ? user.quota : 0;
    } catch (error) {
      logger.error('Failed to get user quota:', error);
      throw error;
    }
  }

  static async updateUserQuota(userId: number, newQuota: number): Promise<void> {
    const db = getDatabase();
    
    try {
      await db.run(
        'UPDATE users SET quota = ?, updated_at = datetime('now','localtime') WHERE id = ?',
        [newQuota, userId]
      );

      logger.info('User quota updated:', { userId, newQuota });
    } catch (error) {
      logger.error('Failed to update user quota:', error);
      throw error;
    }
  }

  static async decrementUserQuota(userId: number, amount: number = 1): Promise<boolean> {
    const db = getDatabase();
    
    try {
      const currentQuota = await this.getUserQuota(userId);
      
      if (currentQuota < amount) {
        return false; // Not enough quota
      }

      const newQuota = currentQuota - amount;
      await this.updateUserQuota(userId, newQuota);
      
      return true;
    } catch (error) {
      logger.error('Failed to decrement user quota:', error);
      throw error;
    }
  }

  static async incrementUserQuota(userId: number, amount: number = 1): Promise<void> {
    const db = getDatabase();
    
    try {
      const currentQuota = await this.getUserQuota(userId);
      const newQuota = currentQuota + amount;
      await this.updateUserQuota(userId, newQuota);
    } catch (error) {
      logger.error('Failed to increment user quota:', error);
      throw error;
    }
  }

  static async checkQuotaForInstallation(userId: number): Promise<boolean> {
    try {
      const quota = await this.getUserQuota(userId);
      return quota > 0;
    } catch (error) {
      logger.error('Failed to check quota for installation:', error);
      throw error;
    }
  }
}
