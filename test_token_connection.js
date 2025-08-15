// Test script to generate valid connection token using backend services
const path = require('path');
const { fileURLToPath } = require('url');

async function testTokenConnection() {
  try {
    // Change to backend directory to use its modules
    const backendPath = path.join(__dirname, 'backend');
    process.chdir(backendPath);
    
    console.log('Loading backend modules...');
    
    // Import backend modules
    const { getDatabase } = await import('./src/database/init.js');
    const { TelegramService } = await import('./src/services/telegramService.js');
    
    console.log('Modules loaded successfully');
    
    const db = getDatabase();
    
    // Check if we have any users
    const users = await db.all('SELECT id, username, email FROM users LIMIT 5');
    console.log('Available users:', users);
    
    if (users.length === 0) {
      console.log('No users found in database');
      return;
    }
    
    // Use the first user for testing
    const testUser = users[0];
    console.log('Using test user:', testUser);
    
    // Generate a fresh connection token using TelegramService
    const connectionData = await TelegramService.generateConnectionToken(testUser.id);
    
    console.log('✅ Token generated successfully:', {
      token: connectionData.token,
      link: connectionData.link
    });
    
    // Extract token from the link
    const tokenMatch = connectionData.link.match(/start=([^&]+)/);
    if (tokenMatch) {
      const token = tokenMatch[1];
      
      console.log('\n🔗 Test this token with webhook:');
      console.log(`/start ${token}`);
      console.log('\n📋 Webhook test command:');
      console.log(`Invoke-WebRequest -Uri "http://localhost:3001/api/telegram/webhook" -Method POST -ContentType "application/json" -Body '{"update_id": 999999999, "message": {"message_id": 999, "from": {"id": 123456789, "is_bot": false, "first_name": "TestUser", "username": "testuser"}, "chat": {"id": 123456789, "first_name": "TestUser", "username": "testuser", "type": "private"}, "date": 1640995500, "text": "/start ${token}"}}'`);
      
      // Verify the token exists in database
      const { DateUtils } = await import('./src/utils/dateUtils.js');
      const storedToken = await db.get(
        'SELECT * FROM telegram_connection_tokens WHERE token = ? AND expires_at > ? AND used_at IS NULL',
        [token, DateUtils.nowSQLite()]
      );
      
      if (storedToken) {
        console.log('\n✅ Token validation successful in database:', {
          id: storedToken.id,
          user_id: storedToken.user_id,
          expires_at: storedToken.expires_at,
          created_at: storedToken.created_at
        });
      } else {
        console.log('\n❌ Token validation failed in database');
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testTokenConnection().catch(console.error);