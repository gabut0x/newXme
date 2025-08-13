import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { logger } from '../utils/logger.js';
import { seedProducts, seedDefaultAdmin } from '../services/seedService.js';
import { DateUtils } from '../utils/dateUtils.js';

sqlite3.verbose();

export interface Database {
  run: (sql: string, params?: any[]) => Promise<sqlite3.RunResult>;
  get: (sql: string, params?: any[]) => Promise<any>;
  all: (sql: string, params?: any[]) => Promise<any[]>;
  close: () => Promise<void>;
}

let db: Database | null = null;

export async function initializeDatabase(): Promise<Database> {
  try {
    const dbPath = process.env['DATABASE_PATH'] || './data/xme_projects.db';
    const dbDir = path.dirname(dbPath);
    
    // Ensure data directory exists
    await fs.mkdir(dbDir, { recursive: true });
    
    const sqlite = new sqlite3.Database(dbPath);
    
    // Custom promisified run method that preserves the result object
    const run = (sql: string, params?: any[]): Promise<sqlite3.RunResult> => {
      return new Promise((resolve, reject) => {
        sqlite.run(sql, params || [], function(this: sqlite3.RunResult, err: Error | null) {
          if (err) {
            reject(err);
          } else {
            resolve(this);
          }
        });
      });
    };
    
    const get = promisify(sqlite.get.bind(sqlite));
    const all = promisify(sqlite.all.bind(sqlite)) as (sql: string, params?: any[]) => Promise<any[]>;
    const close = promisify(sqlite.close.bind(sqlite));
    
    db = { run, get, all, close };
    
    // Enable foreign keys
    await db.run('PRAGMA foreign_keys = ON');
    
    // Create tables
    await createTables();
    
    // Test timezone setting with Jakarta time
    const jakartaTime = DateUtils.nowSQLite();
    logger.info('Database initialized with Jakarta timezone:', {
      jakartaTime,
      utcTime: new Date().toISOString(),
      formattedJakarta: DateUtils.formatJakarta(new Date())
    });
    
    // Seed initial data
    await seedProducts();
    await seedDefaultAdmin();
    
    logger.info(`Database initialized at ${dbPath} with Asia/Jakarta timezone`);
    return db;
  } catch (error) {
    logger.error('Database initialization failed:', error);
    throw error;
  }
}

async function createTables(): Promise<void> {
  if (!db) throw new Error('Database not initialized');
  
  try {
    const jakartaTime = DateUtils.nowSQLite();
    
    // Users table - using Jakarta time for defaults
    await db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        is_verified BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        admin INTEGER DEFAULT 0,
        telegram VARCHAR(255),
        telegram_user_id INTEGER,
        telegram_display_name VARCHAR(255),
        quota INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT '${jakartaTime}',
        updated_at DATETIME DEFAULT '${jakartaTime}',
        last_login DATETIME,
        failed_login_attempts INTEGER DEFAULT 0,
        locked_until DATETIME
      )
    `);

    // Check if quota column exists, if not add it (for existing databases)
    try {
      await db.get('SELECT quota FROM users LIMIT 1');
    } catch (error) {
      // Column doesn't exist, add it
      logger.info('Adding quota column to users table');
      await db.run('ALTER TABLE users ADD COLUMN quota INTEGER DEFAULT 0');
    }

    // Check if telegram_notifications column exists, if not add it
    try {
      await db.get('SELECT telegram_notifications FROM users LIMIT 1');
    } catch (error) {
      // Column doesn't exist, add it
      logger.info('Adding telegram_notifications column to users table');
      await db.run('ALTER TABLE users ADD COLUMN telegram_notifications BOOLEAN DEFAULT 0');
    }

    // Check if telegram_user_id column exists, if not add it
    try {
      await db.get('SELECT telegram_user_id FROM users LIMIT 1');
    } catch (error) {
      // Column doesn't exist, add it
      logger.info('Adding telegram_user_id column to users table');
      await db.run('ALTER TABLE users ADD COLUMN telegram_user_id INTEGER');
    }

    // Check if telegram_display_name column exists, if not add it
    try {
      await db.get('SELECT telegram_display_name FROM users LIMIT 1');
    } catch (error) {
      // Column doesn't exist, add it
      logger.info('Adding telegram_display_name column to users table');
      await db.run('ALTER TABLE users ADD COLUMN telegram_display_name VARCHAR(255)');
    }
    
    // Email verification codes table
    await db.run(`
      CREATE TABLE IF NOT EXISTS verification_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        code VARCHAR(6) NOT NULL,
        type VARCHAR(20) NOT NULL, -- 'email_verification' or 'password_reset'
        expires_at DATETIME NOT NULL,
        used_at DATETIME,
        created_at DATETIME DEFAULT '${jakartaTime}',
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);
    
    // User sessions table (for additional session tracking)
    await db.run(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        session_token VARCHAR(255) NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at DATETIME DEFAULT '${jakartaTime}',
        expires_at DATETIME NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);
    
    // User profiles table (for additional user information)
    await db.run(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        phone VARCHAR(20),
        avatar_url TEXT,
        timezone VARCHAR(50) DEFAULT 'Asia/Jakarta',
        language VARCHAR(10) DEFAULT 'id',
        created_at DATETIME DEFAULT '${jakartaTime}',
        updated_at DATETIME DEFAULT '${jakartaTime}',
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);
    
    // Audit log table
    await db.run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action VARCHAR(100) NOT NULL,
        resource VARCHAR(100),
        resource_id VARCHAR(100),
        ip_address VARCHAR(45),
        user_agent TEXT,
        details TEXT,
        created_at DATETIME DEFAULT '${jakartaTime}',
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
      )
    `);

    // Windows Versions table
    await db.run(`
      CREATE TABLE IF NOT EXISTS windows_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        created_at DATETIME DEFAULT '${jakartaTime}',
        updated_at DATETIME DEFAULT '${jakartaTime}'
      )
    `);

    // Products table
    await db.run(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        image_url TEXT,
        created_at DATETIME DEFAULT '${jakartaTime}',
        updated_at DATETIME DEFAULT '${jakartaTime}'
      )
    `);

    // InstallData table
    await db.run(`
      CREATE TABLE IF NOT EXISTS install_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        start_time DATETIME DEFAULT '${jakartaTime}',
        ip VARCHAR(45) NOT NULL,
        ssh_port INTEGER DEFAULT 22,
        auth_type VARCHAR(20) DEFAULT 'password',
        passwd_vps VARCHAR(255),
        ssh_key TEXT,
        win_ver VARCHAR(10) NOT NULL,
        passwd_rdp VARCHAR(255),
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        created_at DATETIME DEFAULT '${jakartaTime}',
        updated_at DATETIME DEFAULT '${jakartaTime}',
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // Check if ssh_port column exists, if not add it (for existing databases)
    try {
      await db.get('SELECT ssh_port FROM install_data LIMIT 1');
    } catch (error) {
      // Column doesn't exist, add it
      logger.info('Adding ssh_port column to install_data table');
      await db.run('ALTER TABLE install_data ADD COLUMN ssh_port INTEGER DEFAULT 22');
    }

    // Check if auth_type column exists, if not add it
    try {
      await db.get('SELECT auth_type FROM install_data LIMIT 1');
    } catch (error) {
      // Column doesn't exist, add it
      logger.info('Adding auth_type column to install_data table');
      await db.run('ALTER TABLE install_data ADD COLUMN auth_type VARCHAR(20) DEFAULT "password"');
    }

    // Check if ssh_key column exists, if not add it
    try {
      await db.get('SELECT ssh_key FROM install_data LIMIT 1');
    } catch (error) {
      // Column doesn't exist, add it
      logger.info('Adding ssh_key column to install_data table');
      await db.run('ALTER TABLE install_data ADD COLUMN ssh_key TEXT');
    }
    
    // Create basic indexes first
    await db.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_users_username ON users (username)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_verification_codes_user_id ON verification_codes (user_id)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_verification_codes_code ON verification_codes (code)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions (user_id)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions (session_token)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_windows_versions_slug ON windows_versions (slug)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_install_data_user_id ON install_data (user_id)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_install_data_status ON install_data (status)');
    
    // Handle topup_transactions table separately with better error handling
    await createTopupTransactionsTable();
    
    // Payment Methods Settings Table
    await db.run(`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        type VARCHAR(50) NOT NULL,
        icon_url TEXT,
        fee_flat INTEGER DEFAULT 0,
        fee_percent DECIMAL(5,2) DEFAULT 0,
        minimum_fee INTEGER DEFAULT 0,
        maximum_fee INTEGER DEFAULT 0,
        is_enabled BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT '${jakartaTime}',
        updated_at DATETIME DEFAULT '${jakartaTime}'
      )
    `);
    
    // Create index for payment methods
    await db.run('CREATE INDEX IF NOT EXISTS idx_payment_methods_code ON payment_methods (code)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_payment_methods_enabled ON payment_methods (is_enabled)');
    
    // Orders table for quota purchases
    await db.run(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid INTEGER NOT NULL,
        no_ref VARCHAR(255),
        merchant_ref VARCHAR(255) UNIQUE NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'processing',
        amount DECIMAL(10,2) NOT NULL,
        quantity INTEGER NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        payment_method VARCHAR(50),
        created_at DATETIME DEFAULT '${jakartaTime}',
        updated_at DATETIME DEFAULT '${jakartaTime}',
        paid_at DATETIME,
        FOREIGN KEY (uid) REFERENCES users (id) ON DELETE CASCADE
      )
    `);
    
    // Create indexes for orders
    await db.run('CREATE INDEX IF NOT EXISTS idx_orders_uid ON orders (uid)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_orders_no_ref ON orders (no_ref)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_orders_merchant_ref ON orders (merchant_ref)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status)');

    // Telegram connection tokens table
    await db.run(`
      CREATE TABLE IF NOT EXISTS telegram_connection_tokens (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        telegram_user_id INTEGER,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT '${jakartaTime}',
        used_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // Create indexes for telegram_connection_tokens
    await db.run('CREATE INDEX IF NOT EXISTS idx_telegram_tokens_user_id ON telegram_connection_tokens (user_id)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_telegram_tokens_token ON telegram_connection_tokens (token)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_telegram_tokens_expires ON telegram_connection_tokens (expires_at)');
    
    logger.info('Database tables created successfully with Asia/Jakarta timezone');
  } catch (error) {
    logger.error('Error creating database tables:', error);
    throw error;
  }
}

async function createTopupTransactionsTable(): Promise<void> {
  if (!db) throw new Error('Database not initialized');
  
  try {
    const jakartaTime = DateUtils.nowSQLite();
    
    // First, check if the table exists and what its schema looks like
    const tableInfo = await db.all("PRAGMA table_info(topup_transactions)");
    const referenceColumn = tableInfo.find(col => col.name === 'reference');
    
    if (tableInfo.length === 0) {
      // Table doesn't exist, create it with correct schema
      logger.info('Creating topup_transactions table with nullable reference field and Jakarta timezone');
      await db.run(`
        CREATE TABLE topup_transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          reference VARCHAR(255),
          merchant_ref VARCHAR(255) UNIQUE NOT NULL,
          amount INTEGER NOT NULL,
          quantity INTEGER NOT NULL,
          total_amount DECIMAL(10,2) NOT NULL,
          discount_percentage DECIMAL(5,2) DEFAULT 0,
          discount_amount DECIMAL(10,2) DEFAULT 0,
          final_amount DECIMAL(10,2) NOT NULL,
          payment_method VARCHAR(50),
          payment_url TEXT,
          checkout_url TEXT,
          pay_code VARCHAR(255),
          status VARCHAR(50) NOT NULL DEFAULT 'UNPAID',
          expired_time INTEGER,
          created_at DATETIME DEFAULT '${jakartaTime}',
          updated_at DATETIME DEFAULT '${jakartaTime}',
          paid_at DATETIME,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
      `);
    } else if (referenceColumn && referenceColumn.notnull === 1) {
      // Table exists but reference field is NOT NULL, need to migrate
      logger.info('Migrating topup_transactions table to allow nullable reference field with Jakarta timezone');
      
      // Disable foreign key constraints temporarily
      await db.run('PRAGMA foreign_keys = OFF');
      
      try {
        // Create new table with correct schema
        await db.run(`
          CREATE TABLE topup_transactions_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            reference VARCHAR(255),
            merchant_ref VARCHAR(255) UNIQUE NOT NULL,
            amount INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            total_amount DECIMAL(10,2) NOT NULL,
            discount_percentage DECIMAL(5,2) DEFAULT 0,
            discount_amount DECIMAL(10,2) DEFAULT 0,
            final_amount DECIMAL(10,2) NOT NULL,
            payment_method VARCHAR(50),
            payment_url TEXT,
            checkout_url TEXT,
            pay_code VARCHAR(255),
            status VARCHAR(50) NOT NULL DEFAULT 'UNPAID',
            expired_time INTEGER,
            created_at DATETIME DEFAULT '${jakartaTime}',
            updated_at DATETIME DEFAULT '${jakartaTime}',
            paid_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
          )
        `);
        
        // Copy existing data, handling potential NULL reference values
        const existingData = await db.all('SELECT * FROM topup_transactions');
        for (const row of existingData) {
          // Convert existing timestamps to Jakarta time if they exist
          const createdAt = row.created_at ? DateUtils.toJakartaSQLite(new Date(row.created_at)) : jakartaTime;
          const updatedAt = row.updated_at ? DateUtils.toJakartaSQLite(new Date(row.updated_at)) : jakartaTime;
          const paidAt = row.paid_at ? DateUtils.toJakartaSQLite(new Date(row.paid_at)) : null;
          
          await db.run(`
            INSERT INTO topup_transactions_new (
              id, user_id, reference, merchant_ref, amount, quantity, total_amount,
              discount_percentage, discount_amount, final_amount, payment_method,
              payment_url, checkout_url, pay_code, status, expired_time,
              created_at, updated_at, paid_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            row.id, row.user_id, row.reference, row.merchant_ref, row.amount,
            row.quantity, row.total_amount, row.discount_percentage, row.discount_amount,
            row.final_amount, row.payment_method, row.payment_url, row.checkout_url,
            row.pay_code, row.status, row.expired_time, createdAt, updatedAt, paidAt
          ]);
        }
        
        // Drop old table and rename new one
        await db.run('DROP TABLE topup_transactions');
        await db.run('ALTER TABLE topup_transactions_new RENAME TO topup_transactions');
        
        logger.info('Successfully migrated topup_transactions table with Jakarta timezone');
      } finally {
        // Always re-enable foreign key constraints
        await db.run('PRAGMA foreign_keys = ON');
      }
    } else {
      logger.info('topup_transactions table already has correct schema');
    }
    
    // Create indexes for topup_transactions
    await db.run('CREATE INDEX IF NOT EXISTS idx_topup_transactions_user_id ON topup_transactions (user_id)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_topup_transactions_reference ON topup_transactions (reference)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_topup_transactions_merchant_ref ON topup_transactions (merchant_ref)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_topup_transactions_status ON topup_transactions (status)');
    
  } catch (error: any) {
    logger.error('Failed to create/migrate topup_transactions table:', error);
    
    // Fallback: If migration fails, try to drop and recreate the table
    if (error.code === 'SQLITE_CONSTRAINT') {
      logger.warn('Migration failed with constraint error, attempting to recreate table');
      try {
        // Re-enable foreign keys first
        await db.run('PRAGMA foreign_keys = ON');
        
        // Drop the problematic table (this will lose data!)
        await db.run('DROP TABLE IF EXISTS topup_transactions');
        
        // Create the table with correct schema and Jakarta timezone
        const jakartaTime = DateUtils.nowSQLite();
        await db.run(`
          CREATE TABLE topup_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            reference VARCHAR(255),
            merchant_ref VARCHAR(255) UNIQUE NOT NULL,
            amount INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            total_amount DECIMAL(10,2) NOT NULL,
            discount_percentage DECIMAL(5,2) DEFAULT 0,
            discount_amount DECIMAL(10,2) DEFAULT 0,
            final_amount DECIMAL(10,2) NOT NULL,
            payment_method VARCHAR(50),
            payment_url TEXT,
            checkout_url TEXT,
            pay_code VARCHAR(255),
            status VARCHAR(50) NOT NULL DEFAULT 'UNPAID',
            expired_time INTEGER,
            created_at DATETIME DEFAULT '${jakartaTime}',
            updated_at DATETIME DEFAULT '${jakartaTime}',
            paid_at DATETIME,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
          )
        `);
        
        logger.warn('Successfully recreated topup_transactions table with Jakarta timezone (existing data was lost)');
      } catch (fallbackError) {
        logger.error('Fallback table creation also failed:', fallbackError);
        throw fallbackError;
      }
    } else {
      throw error;
    }
  }
}


export function getDatabase(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}