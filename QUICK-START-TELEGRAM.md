# 🚀 Quick Start - Test Telegram Connection

## ✅ Masalah yang Sudah Diperbaiki:
- ✅ Dashboard refresh otomatis sudah diperbaiki
- ✅ Webhook setup untuk production sudah diimplementasi

## 🔧 Testing Telegram Connection (Admin Only)

### Step 1: Admin Dashboard Setup
**⚠️ KEAMANAN:** Setup webhook sekarang hanya bisa dilakukan oleh **Admin di Dashboard**

1. **Login sebagai Admin**
2. **Go to Admin Dashboard**
3. **Navigate ke "Telegram Bot" tab**
4. **Klik "Auto Setup Webhook"** untuk setup otomatis
5. **Atau "Set Custom URL"** jika pakai ngrok:
   ```
   https://your-ngrok-url.ngrok.io/api/telegram/webhook
   ```

**Benefits:**
- ✅ **Secure:** Hanya admin yang bisa setup
- ✅ **User-friendly:** GUI interface
- ✅ **Real-time status:** Lihat bot & webhook status

### Step 2: Test Connection
1. **Login ke aplikasi** sebagai user (bukan admin)
2. **Go to Settings** → Telegram Connection
3. **Klik "Connect Telegram"** → Akan buka tab baru dengan bot link
4. **Klik /start di Telegram** → Bot akan langsung respond
5. **Kembali ke dashboard** → Should show "Telegram Connected"

### Step 3: Verify Connection
Check backend logs:
```bash
tail -f backend/logs/app.log | grep -i telegram
```

Should see:
```
Received Telegram webhook update: updateId=X
Processing Telegram message: telegramUserId=Y
Telegram account connected successfully
```

## 🤖 Bot Commands untuk Testing:
- `/start` - Connect account
- `/help` - Show commands
- `/status` - Check connection status

## 🔍 Admin Dashboard Features:

### Bot Status Monitor:
- ✅ **Real-time bot info** (ID, username, name)
- ✅ **Connection status** (active/inactive)
- ✅ **Bot capabilities** (group permissions)

### Webhook Management:
- ✅ **Auto Setup** (uses APP_URL env)
- ✅ **Custom URL** (for ngrok/development)
- ✅ **Remove webhook** (troubleshooting)
- ✅ **Status monitoring** (pending updates, errors)

### Security Features:
- ✅ **Admin-only access** (requires authentication)
- ✅ **Secure API endpoints** (JWT token required)
- ✅ **Audit logging** (admin actions logged)

## 📋 Troubleshooting:

### Problem: Cannot access Telegram tab
**Solution:** Login sebagai admin:
- User dengan `admin = 1` di database
- Login dan go to Admin Dashboard
- Telegram Bot tab akan muncul di sidebar

### Problem: Webhook tidak accessible
**Solution:** Setup via Admin Dashboard:
1. **Install ngrok:** `ngrok http 3001`
2. **Copy ngrok URL:** `https://abc123.ngrok.io`
3. **Admin Dashboard → Telegram Bot**
4. **Click "Set Custom URL"**
5. **Input:** `https://abc123.ngrok.io/api/telegram/webhook`

### Problem: Bot tidak respond
**Check:**
1. Backend server running di port 3001
2. Webhook URL accessible dari internet
3. Bot token correct di `.env`

**Debug Steps:**
```bash
# 1. Check bot info
curl http://localhost:3001/api/telegram/bot-info

# 2. Check webhook status
curl http://localhost:3001/api/telegram/webhook-info

# 3. Watch logs for webhook requests
tail -f backend/logs/app.log | grep -i "telegram\|webhook"
```

**Expected Logs when user sends /start:**
```
Received Telegram webhook update: updateId=X
Processing Telegram message: telegramUserId=Y, text=/start...
Telegram account connected successfully
```

### Problem: Connection tidak tersimpan
**Check database:**
```bash
sqlite3 backend/data/xme_projects.db "SELECT * FROM telegram_connection_tokens;"
sqlite3 backend/data/xme_projects.db "SELECT username, telegram, telegram_user_id FROM users;"
```

## ✅ Success Indicators:

1. **Backend logs show:** `Received Telegram webhook update`
2. **Bot responds:** Welcome message saat /start
3. **Dashboard shows:** "Telegram Connected" dengan name & ID
4. **Database updated:** User record has telegram fields filled

## 🎯 Next Steps After Connection:

1. **Toggle notifications** di Settings
2. **Test installation notification** (jika ada install)
3. **Use `/status` command** di bot untuk check connection

---

**Bot Link:** https://t.me/winvpsautoTest_bot

**Admin Mode:** ✅ Secure Dashboard Interface (Admin Login Required)
**Production Mode:** ✅ Webhook Active (HTTPS Required)

---

## 🔒 Security Improvements:

**Before:** Anyone could call webhook setup endpoints
```bash
# ❌ Anyone could do this (INSECURE)
curl -X POST http://localhost:3001/api/telegram/setup
```

**Now:** Only authenticated admins via dashboard
```bash
# ✅ Requires admin login + JWT token (SECURE)
# Setup via Admin Dashboard → Telegram Bot tab
```

**Protected Endpoints:**
- `/api/telegram/setup` - ✅ Admin only
- `/api/telegram/set-webhook` - ✅ Admin only
- `/api/telegram/bot-info` - ✅ Admin only
- `/api/telegram/webhook-info` - ✅ Admin only
- `/api/telegram/webhook` - ✅ Public (untuk Telegram API)

**Benefits:**
- 🛡️ **Security:** Hanya admin yang bisa manage bot
- 🎯 **User-friendly:** GUI interface di dashboard
- 📊 **Monitoring:** Real-time status & error tracking
- 📝 **Audit:** Admin actions logged untuk security