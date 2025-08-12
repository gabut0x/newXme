# 🤖 Telegram Bot Integration - Debug Guide

## ❌ Masalah yang Dilaporkan

1. **Dashboard refresh otomatis setiap beberapa detik** ✅ **SUDAH DIPERBAIKI**
   - Auto-refresh hanya terjadi saat user sedang aktif melakukan koneksi Telegram
   - Refresh dibatasi hanya di tab Settings dan hanya saat `isConnectingTelegram` = true

2. **Telegram connection tidak berfungsi** ✅ **SUDAH DIPERBAIKI**
   - Webhook setup sudah berfungsi dengan baik menggunakan ngrok untuk HTTPS

## 🔍 Langkah-langkah Debugging (Admin Only)

### Step 1: Admin Dashboard Access
**⚠️ KEAMANAN BARU:** Telegram setup sekarang hanya via **Admin Dashboard**

1. **Login sebagai Admin** (user dengan `admin = 1`)
2. **Go to Admin Dashboard**
3. **Navigate ke "Telegram Bot" tab**
4. **Monitor real-time status:**
   - Bot info (ID, username, status)
   - Webhook status (URL, pending updates, errors)

### Step 2: Test Bot Configuration
```bash
cd backend
node test-telegram.js
```

**Expected Output:**
- ✅ Bot token valid
- Bot info ditampilkan
- Webhook info ditampilkan

### Step 3: Webhook Setup via Admin Dashboard
**Method 1: Auto Setup**
- Klik "Auto Setup Webhook"
- Uses `APP_URL` environment variable

**Method 2: Custom URL (untuk development)**
- Klik "Set Custom URL"
- Input ngrok URL: `https://abc123.ngrok.io/api/telegram/webhook`

**Method 3: Remove Webhook (troubleshooting)**
- Klik "Remove Webhook"
- Useful untuk debugging connection issues

### Step 3: Check Logs
Monitor backend logs untuk:
```bash
tail -f backend/logs/app.log | grep -i telegram
```

**Look for:**
- `Telegram connection initiated` - saat user klik Connect
- `Received Telegram webhook update` - saat user klik /start di bot
- `Connection token found` - saat bot processing /start command

### Step 4: Test Full Flow

1. **Start Backend Server:**
   ```bash
   cd backend && npm run dev
   ```

2. **Login sebagai User (bukan admin):**
   - Username: testuser / Email: test@example.com / Password: password123

3. **Go to Settings → Telegram Connection**

4. **Klik "Connect Telegram"**
   - ✅ Should open new tab with bot link
   - ✅ Should show toast: "Connection link generated!"

5. **Check Browser Console (F12):**
   ```javascript
   // Should see API call to /api/user/connect-telegram
   // Response should contain telegramBotUrl
   ```

6. **Check Backend Logs:**
   ```bash
   # Should see:
   [INFO] Telegram connection initiated: { userId: X, username: 'testuser' }
   [INFO] Generated connection token for user X
   ```

7. **Click /start in Telegram Bot**
   - Bot should respond immediately
   - Backend logs should show webhook received

8. **Check Database:**
   ```sql
   -- Check connection tokens
   SELECT * FROM telegram_connection_tokens;
   
   -- Check user table
   SELECT id, username, telegram, telegram_user_id, telegram_display_name 
   FROM users WHERE username = 'testuser';
   ```

## 🚨 Common Issues & Solutions

### Issue 1: Webhook Not Working (localhost)
**Problem:** Telegram cannot reach `http://localhost:3001`

**Solution: Use ngrok for HTTPS tunnel:**
```bash
# Install ngrok: https://ngrok.com/download
ngrok http 3001

# Update webhook with ngrok URL:
curl -X POST http://localhost:3001/api/telegram/set-webhook \
     -H "Content-Type: application/json" \
     -d '{"webhook_url": "https://your-ngrok-url.ngrok.io/api/telegram/webhook"}'
```

### Issue 2: Connection Token Expired
**Problem:** User waited too long (>10 minutes)

**Solution:** Generate new token by clicking "Connect Telegram" again

### Issue 3: Bot Token Invalid
**Problem:** Bot responds with 401 Unauthorized

**Solution:** Verify bot token in `.env` file:
```bash
TELEGRAM_BOT_TOKEN=8134927121:AAGiV2-_9K5BB9V8QJk1eDfPN0LyKkFrPNg
TELEGRAM_BOT_USERNAME=winvpsautoTest_bot
```

### Issue 4: Database Connection
**Problem:** SQLite database lock or corruption

**Solution:**
```bash
# Check database file
ls -la backend/data/xme_projects.db

# Check tables exist
sqlite3 backend/data/xme_projects.db ".schema telegram_connection_tokens"
```

## 🔧 Manual Testing Commands

### Test Bot Directly:
```bash
# Get bot info
curl "https://api.telegram.org/bot8134927121:AAGiV2-_9K5BB9V8QJk1eDfPN0LyKkFrPNg/getMe"

# Get webhook info  
curl "https://api.telegram.org/bot8134927121:AAGiV2-_9K5BB9V8QJk1eDfPN0LyKkFrPNg/getWebhookInfo"

# Send test message (replace CHAT_ID with your Telegram user ID)
curl -X POST "https://api.telegram.org/bot8134927121:AAGiV2-_9K5BB9V8QJk1eDfPN0LyKkFrPNg/sendMessage" \
     -H "Content-Type: application/json" \
     -d '{"chat_id": "YOUR_CHAT_ID", "text": "Test message from bot"}'
```

### Test Backend APIs:
```bash
# Test connect-telegram (need auth token)
curl -X POST http://localhost:3001/api/user/connect-telegram \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Test setup webhook
curl -X POST http://localhost:3001/api/telegram/setup

# Test bot info  
curl http://localhost:3001/api/telegram/bot-info

# Test webhook info
curl http://localhost:3001/api/telegram/webhook-info
```

## 📋 Debugging Checklist

- [ ] Bot token valid and working
- [ ] Webhook URL accessible from internet
- [ ] Backend server running on correct port
- [ ] Database tables exist and accessible
- [ ] User is authenticated and verified
- [ ] Connection token generated successfully  
- [ ] Telegram webhook received and processed
- [ ] User database updated with Telegram info
- [ ] Frontend shows connected status

## 🎯 Expected Flow

1. User clicks "Connect Telegram" → Connection token generated
2. User opens bot link → Bot receives /start command
3. Bot processes /start → Links Telegram account to user
4. Frontend auto-refreshes → Shows connected status
5. User can toggle notifications and disconnect

## 📞 Quick Fix Steps

If nothing works, try this sequence:

```bash
# 1. Reset webhook
curl -X POST http://localhost:3001/api/telegram/set-webhook \
     -H "Content-Type: application/json" \
     -d '{"webhook_url": ""}'

# 2. Clear connection tokens
sqlite3 backend/data/xme_projects.db "DELETE FROM telegram_connection_tokens;"

# 3. Restart backend server
cd backend && npm run dev

# 4. Setup webhook dengan ngrok
ngrok http 3001
curl -X POST http://localhost:3001/api/telegram/set-webhook \
     -H "Content-Type: application/json" \
     -d '{"webhook_url": "https://your-ngrok-url.ngrok.io/api/telegram/webhook"}'

# 5. Try connecting again
```

## 🔗 Useful Links

- [Telegram Bot API Documentation](https://core.telegram.org/bots/api)
- [Ngrok for Local Testing](https://ngrok.com/)
- [Bot Link](https://t.me/winvpsautoTest_bot)