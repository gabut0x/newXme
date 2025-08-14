import { getDatabase } from '../database/init.js';
import { logger } from '../utils/logger.js';
import { DateUtils } from '../utils/dateUtils.js';

export async function seedProducts() {
  try {
    const db = getDatabase();
    
    // Check if product with id=1 already exists
    const existingProduct = await db.get('SELECT * FROM products WHERE id = 1');
    
    if (!existingProduct) {
      // Get APP_URL from environment variable
      const appUrl = process.env['APP_URL'] || 'http://localhost:3001';
      const imageUrl = `${appUrl}/uploads/products/xme.png`;
      
      // Create the default quota install product
      await db.run(`
        INSERT INTO products (id, name, description, price, image_url)
        VALUES (1, ?, ?, ?, ?)
      `, [
        'Quota Install',
        'Quota Install for Windows Installation service - allows one Windows installation per quota',
        5000.00,
        imageUrl
      ]);
      
      logger.info('Default product seeded successfully');
    } else {
      logger.info('Default product already exists');
    }
  } catch (error) {
    logger.error('Error seeding products:', error);
    throw error;
  }
}

export async function seedDefaultAdmin(): Promise<void> {
  try {
    const db = getDatabase();
    
    // Check if admin user already exists
    const existingAdmin = await db.get('SELECT id FROM users WHERE username = ? OR email = ?', ['kang3s', 'payment.adsku@gmail.com']);
    
    if (!existingAdmin) {
      logger.info('Creating default administrator user');
      
      // Import AuthUtils for password hashing
      const { AuthUtils } = await import('../utils/auth.js');
      
      // Hash the default password
      const passwordHash = await AuthUtils.hashPassword('AU13579t@');
      const jakartaTime = DateUtils.nowSQLite();
      
      // Insert default admin user
      await db.run(`
        INSERT INTO users (
          username, email, password_hash, is_verified, is_active, admin, quota,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        'kang3s',
        'payment.adsku@gmail.com',
        passwordHash,
        1, // is_verified = true
        1, // is_active = true
        1, // admin = 1 (administrator)
        100, // Default quota for admin
        jakartaTime,
        jakartaTime
      ]);
      
      logger.info('Default administrator user created successfully:', {
        username: 'kang3s',
        email: 'payment.adsku@gmail.com',
        admin: 1,
        quota: 100
      });
    } else {
      logger.info('Default administrator user already exists, skipping creation');
    }
  } catch (error) {
    logger.error('Error creating default administrator user:', error);
    throw error;
  }
}