# Telegram Bot Documentation

## Overview

XME Projects Telegram Bot adalah bot yang memungkinkan pengguna untuk melakukan topup saldo dan install Windows melalui Telegram. Bot ini menggunakan polling mechanism dan dilengkapi dengan sistem keamanan, rate limiting, dan monitoring yang komprehensif.

## Features

### Core Features
- **Topup Saldo**: Pengguna dapat melakukan topup saldo melalui berbagai metode pembayaran
- **Install Windows**: Pengguna dapat menginstall berbagai versi Windows
- **Status Monitoring**: Melihat status akun dan riwayat transaksi
- **Multi-language Support**: Mendukung bahasa Indonesia dan Inggris

### Security Features
- **Rate Limiting**: Pembatasan jumlah request per user dan global
- **Command Validation**: Validasi command yang diizinkan
- **User Authentication**: Verifikasi user yang terdaftar
- **Suspicious Activity Detection**: Deteksi aktivitas mencurigakan
- **Audit Logging**: Pencatatan semua aktivitas bot

### Admin Features
- **Bot Management**: Start, stop, restart bot
- **Real-time Monitoring**: Status bot, metrics, dan performance
- **Security Management**: Block/unblock users, reset rate limits
- **Configuration**: Pengaturan rate limits dan security policies

## Setup & Configuration

### Environment Variables

```bash
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_POLLING_INTERVAL=2000
TELEGRAM_BOT_AUTO_START=true
TELEGRAM_USE_POLLING=false

# Database Configuration
DATABASE_URL=your_database_url

# API Configuration
API_BASE_URL=http://localhost:3000
API_SECRET_KEY=your_api_secret
```

### Bot Mode Configuration

Bot dapat beroperasi dalam dua mode:

#### 1. Webhook Mode (Production)
- **Konfigurasi**: `TELEGRAM_USE_POLLING=false`
- **Keuntungan**: Lebih efisien untuk production, real-time updates
- **Kebutuhan**: Server dengan HTTPS dan domain yang dapat diakses publik
- **Penggunaan**: Direkomendasikan untuk production environment

#### 2. Polling Mode (Development)
- **Konfigurasi**: `TELEGRAM_USE_POLLING=true`
- **Keuntungan**: Mudah untuk development, tidak perlu HTTPS
- **Kebutuhan**: Hanya memerlukan koneksi internet
- **Penggunaan**: Direkomendasikan untuk development dan testing
- **Interval**: Dapat dikonfigurasi melalui `TELEGRAM_POLLING_INTERVAL` (default: 2000ms)

#### Switching Between Modes

**Via Environment Variable:**
```bash
# Enable polling mode
TELEGRAM_USE_POLLING=true

# Enable webhook mode
TELEGRAM_USE_POLLING=false
```

**Via Admin Dashboard:**
- Akses Admin Dashboard → Telegram Bot
- Gunakan tombol "Start Bot (Polling)" untuk mode polling
- Gunakan "Webhook Management" untuk konfigurasi webhook
- Gunakan "Stop Bot" untuk menghentikan bot

### Bot Token Setup

1. Buat bot baru melalui [@BotFather](https://t.me/BotFather)
2. Gunakan command `/newbot` dan ikuti instruksi
3. Simpan token yang diberikan ke environment variable `TELEGRAM_BOT_TOKEN`
4. Set bot commands menggunakan `/setcommands`:

```
start - Mulai menggunakan bot
menu - Tampilkan menu utama
topup - Topup saldo akun
install - Install Windows
status - Cek status akun
help - Bantuan penggunaan
cancel - Batalkan operasi saat ini
```

### Database Schema

Bot memerlukan tabel berikut dalam database:

```sql
-- Users table (existing)
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  telegram_user_id INTEGER UNIQUE,
  is_active BOOLEAN DEFAULT 1,
  role TEXT DEFAULT 'user',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bot command logs (optional, for audit)
CREATE TABLE bot_command_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  telegram_user_id INTEGER,
  command TEXT,
  args TEXT,
  result TEXT, -- 'success' or 'failed'
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

## API Integration

### Required Services

Bot terintegrasi dengan service berikut:

1. **User Service**: Autentikasi dan manajemen user
2. **Topup Service**: Proses topup saldo
3. **Install Service**: Proses install Windows
4. **Payment Service**: Integrasi dengan payment gateway

### API Endpoints Used

```typescript
// User Management
GET /api/users/:telegramUserId
POST /api/users/link-telegram

// Topup
POST /api/topup
GET /api/topup/history/:userId

// Install
POST /api/install
GET /api/install/history/:userId
GET /api/windows-versions

// Payment
GET /api/payment-methods
POST /api/payment/create
```

## Usage Guide

### User Commands

#### `/start`
Memulai interaksi dengan bot. Jika user belum terdaftar, bot akan memberikan instruksi untuk menghubungkan akun Telegram dengan akun XME Projects.

#### `/menu`
Menampilkan menu utama dengan pilihan:
- 💰 Topup Saldo
- 🖥️ Install Windows
- 📊 Status Akun
- 📋 Riwayat Transaksi
- ❓ Bantuan

#### `/topup`
Memulai proses topup saldo:
1. Pilih nominal topup (10k, 25k, 50k, 100k, atau custom)
2. Pilih metode pembayaran
3. Ikuti instruksi pembayaran
4. Konfirmasi pembayaran

#### `/install`
Memulai proses install Windows:
1. Pilih versi Windows yang tersedia
2. Konfirmasi install
3. Tunggu proses install selesai

#### `/status`
Menampilkan informasi akun:
- Saldo saat ini
- Status akun
- Informasi kontak
- Statistik penggunaan

#### `/help`
Menampilkan bantuan penggunaan bot dan daftar command yang tersedia.

#### `/cancel`
Membatalkan operasi yang sedang berlangsung dan kembali ke menu utama.

### Admin Commands

Admin dapat mengelola bot melalui web dashboard di `/admin`:

- **Bot Control**: Start/Stop/Restart bot
- **Monitoring**: Real-time status dan metrics
- **Security**: Block/unblock users, manage rate limits
- **Configuration**: Update bot settings

## Security & Rate Limiting

### Rate Limits

```typescript
// Per-user limits
BOT_COMMANDS: {
  windowMs: 60 * 1000,     // 1 minute
  maxRequests: 10,         // 10 commands per minute
  blockDurationMs: 5 * 60 * 1000  // Block for 5 minutes
}

TOPUP_COMMANDS: {
  windowMs: 60 * 1000,     // 1 minute
  maxRequests: 3,          // 3 topup attempts per minute
  blockDurationMs: 10 * 60 * 1000 // Block for 10 minutes
}

INSTALL_COMMANDS: {
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 2,          // 2 install attempts per 5 minutes
  blockDurationMs: 30 * 60 * 1000 // Block for 30 minutes
}

// Global limits
GLOBAL_COMMANDS: {
  windowMs: 60 * 1000,     // 1 minute
  maxRequests: 100,        // 100 total commands per minute
  blockDurationMs: 2 * 60 * 1000  // Block for 2 minutes
}
```

### Security Checks

1. **Command Validation**: Hanya command yang diizinkan yang dapat dieksekusi
2. **User Registration**: Command tertentu memerlukan user terdaftar
3. **Rate Limiting**: Pembatasan request per user dan global
4. **Suspicious Activity**: Deteksi pola penggunaan yang mencurigakan
5. **Error Handling**: Penanganan error yang aman tanpa expose sensitive data

### Blocked Users Management

Admin dapat memblokir user melalui API:

```bash
# Block user temporarily
POST /api/admin/telegram-bot/security/block-user
{
  "userId": 123,
  "reason": "Suspicious activity",
  "durationMs": 3600000  // 1 hour
}

# Block user permanently
POST /api/admin/telegram-bot/security/block-user
{
  "userId": 123,
  "reason": "Terms violation"
}

# Unblock user
POST /api/admin/telegram-bot/security/unblock-user
{
  "userId": 123
}
```

## Monitoring & Logging

### Metrics Tracked

- **Message Count**: Total pesan yang diterima
- **Command Count**: Total command yang dieksekusi
- **Error Count**: Total error yang terjadi
- **User Count**: Jumlah unique users
- **Command Statistics**: Statistik per command
- **Daily Statistics**: Statistik harian
- **Performance Metrics**: Response time, memory usage

### Log Levels

- **INFO**: Aktivitas normal (command execution, user interactions)
- **WARN**: Peringatan (rate limit exceeded, suspicious activity)
- **ERROR**: Error (command failures, API errors)
- **DEBUG**: Debug information (detailed execution flow)

### Monitoring Endpoints

```bash
# Bot status
GET /api/admin/telegram-bot/status

# Bot metrics
GET /api/admin/telegram-bot/metrics

# Performance metrics
GET /api/admin/telegram-bot/performance

# Security stats
GET /api/admin/telegram-bot/security/stats

# Rate limiter stats
GET /api/admin/telegram-bot/rate-limiter/stats
```

## Error Handling

### Common Errors

1. **User Not Found**: User belum terdaftar atau belum link Telegram
2. **Insufficient Balance**: Saldo tidak mencukupi untuk install
3. **Rate Limit Exceeded**: User melebihi batas request
4. **Invalid Command**: Command tidak dikenali
5. **API Error**: Error dari backend API
6. **Payment Error**: Error dalam proses pembayaran

### Error Messages

Semua error message user-friendly dan tidak expose technical details:

```typescript
// Good
"🚫 Anda telah melebihi batas penggunaan. Silakan coba lagi dalam 5 menit."

// Bad
"RateLimitError: User 123 exceeded 10 requests per minute"
```

## Testing

### Unit Tests

```bash
# Run all tests
npm test

# Run bot-specific tests
npm test -- --grep "TelegramBot"

# Run security tests
npm test -- --grep "BotSecurity"

# Run rate limiter tests
npm test -- --grep "RateLimiter"
```

### Integration Tests

```bash
# Test bot commands
npm run test:integration -- --grep "bot-commands"

# Test security features
npm run test:integration -- --grep "bot-security"

# Test API integration
npm run test:integration -- --grep "bot-api"
```

### Manual Testing

1. **Basic Commands**: Test semua command dasar (/start, /menu, /help)
2. **Topup Flow**: Test complete topup flow dengan berbagai metode
3. **Install Flow**: Test install Windows dengan berbagai versi
4. **Error Scenarios**: Test error handling dan edge cases
5. **Rate Limiting**: Test rate limiting dengan multiple requests
6. **Security**: Test blocked users dan suspicious activity detection

## Deployment

### Production Checklist

- [ ] Set production bot token
- [ ] Configure production database
- [ ] Set appropriate rate limits
- [ ] Enable monitoring and alerting
- [ ] Test all critical flows
- [ ] Verify security configurations
- [ ] Set up log aggregation
- [ ] Configure backup and recovery

### Environment-specific Configuration

```bash
# Development
TELEGRAM_BOT_TOKEN=dev_bot_token
TELEGRAM_POLLING_INTERVAL=2000
LOG_LEVEL=debug

# Production
TELEGRAM_BOT_TOKEN=prod_bot_token
TELEGRAM_POLLING_INTERVAL=1000
LOG_LEVEL=info
```

## Troubleshooting

### Common Issues

1. **Bot Not Responding**
   - Check bot token validity
   - Verify network connectivity
   - Check bot status in admin panel

2. **Commands Not Working**
   - Verify user registration
   - Check rate limiting status
   - Review error logs

3. **Payment Issues**
   - Verify payment gateway configuration
   - Check API connectivity
   - Review payment logs

4. **High Error Rate**
   - Check API service status
   - Review database connectivity
   - Monitor resource usage

### Debug Commands

```bash
# Check bot status
curl -X GET http://localhost:3000/api/admin/telegram-bot/status

# Check rate limiter stats
curl -X GET http://localhost:3000/api/admin/telegram-bot/rate-limiter/stats

# Reset rate limit for user
curl -X POST http://localhost:3000/api/admin/telegram-bot/rate-limiter/reset \
  -H "Content-Type: application/json" \
  -d '{"identifier": "user:123"}'
```

## Support

Untuk bantuan teknis atau pertanyaan:

- **Documentation**: Lihat file README.md dan kode sumber
- **Logs**: Check application logs untuk error details
- **Monitoring**: Gunakan admin dashboard untuk monitoring real-time
- **API**: Test API endpoints menggunakan tools seperti Postman

## Changelog

### v1.0.0 (Current)
- Initial release dengan core features
- Polling mechanism implementation
- Security dan rate limiting
- Admin management interface
- Comprehensive monitoring dan logging

### Future Enhancements
- Webhook support sebagai alternative polling
- Multi-language support yang lebih lengkap
- Advanced analytics dan reporting
- Integration dengan notification services
- Automated testing dan CI/CD pipeline