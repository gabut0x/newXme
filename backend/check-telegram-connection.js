import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Open database
const dbPath = path.join(__dirname, 'data', 'xme_projects.db');
const db = new Database(dbPath);

try {
  console.log('=== Checking Telegram Connection Status ===\n');
  
  // Get all users with their Telegram connection status
  const users = db.prepare(`
    SELECT 
      id,
      email,
      telegram_user_id,
      telegram_display_name,
      created_at,
      updated_at
    FROM users 
    ORDER BY id
  `).all();

  if (users.length === 0) {
    console.log('❌ No users found in database');
  } else {
    users.forEach(user => {
      console.log(`👤 User ID: ${user.id}`);
      console.log(`📧 Email: ${user.email}`);
      
      if (user.telegram_user_id) {
        console.log(`✅ Telegram Connected!`);
        console.log(`📱 Telegram User ID: ${user.telegram_user_id}`);
        console.log(`👤 Telegram Display Name: ${user.telegram_display_name}`);
      } else {
        console.log(`❌ Telegram NOT connected`);
      }
      
      console.log(`📅 Created: ${user.created_at}`);
      console.log(`📅 Updated: ${user.updated_at}`);
      console.log('─'.repeat(50));
    });
  }
  
  // Also check for any connection tokens in the database
  const tokens = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='telegram_connection_tokens'
  `).all();
  
  if (tokens.length > 0) {
    console.log('\n🔑 Active Connection Tokens:');
    const activeTokens = db.prepare(`
      SELECT * FROM telegram_connection_tokens 
      WHERE expires_at > datetime('now')
      ORDER BY created_at DESC
    `).all();
    
    if (activeTokens.length === 0) {
      console.log('   No active tokens (all expired)');
    } else {
      activeTokens.forEach(token => {
        console.log(`   Token: ${token.token.substring(0, 10)}...`);
        console.log(`   User ID: ${token.user_id}`);
        console.log(`   Expires: ${token.expires_at}`);
      });
    }
  }
  
} catch (error) {
  console.error('❌ Error checking database:', error.message);
} finally {
  db.close();
}