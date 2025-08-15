const path = require('path');
const fs = require('fs');

// Simple SQLite reader without external dependencies
const dbPath = path.join(__dirname, 'backend', 'database.db');

if (!fs.existsSync(dbPath)) {
  console.log('Database file not found at:', dbPath);
  process.exit(1);
}

console.log('Database file found at:', dbPath);
console.log('File size:', fs.statSync(dbPath).size, 'bytes');

// Let's create a test user with telegram_user_id for testing
console.log('\nFor testing purposes, we can use a test telegram_user_id: 123456789');
console.log('This will simulate a webhook message from this user ID.');