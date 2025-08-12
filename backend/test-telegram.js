#!/usr/bin/env node

// Simple test script for Telegram bot
import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME;

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN not found in environment variables');
  process.exit(1);
}

console.log('🤖 Testing Telegram Bot Configuration...\n');
console.log(`Bot Token: ${BOT_TOKEN.substring(0, 10)}...`);
console.log(`Bot Username: @${BOT_USERNAME || 'Not set'}\n`);

async function testBot() {
  try {
    // Test 1: Get bot info
    console.log('📋 Test 1: Getting bot information...');
    const botResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getMe`);
    const botData = await botResponse.json();
    
    if (botData.ok) {
      console.log('✅ Bot is working!');
      console.log(`   Bot ID: ${botData.result.id}`);
      console.log(`   Bot Name: ${botData.result.first_name}`);
      console.log(`   Bot Username: @${botData.result.username}`);
      console.log(`   Can Read Messages: ${botData.result.can_read_all_group_messages}`);
    } else {
      console.log('❌ Bot test failed:', botData.description);
      return;
    }

    // Test 2: Get webhook info
    console.log('\n📋 Test 2: Checking webhook status...');
    const webhookResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    const webhookData = await webhookResponse.json();
    
    if (webhookData.ok) {
      const info = webhookData.result;
      console.log('📡 Webhook Info:');
      console.log(`   URL: ${info.url || 'Not set'}`);
      console.log(`   Has Custom Certificate: ${info.has_custom_certificate}`);
      console.log(`   Pending Updates: ${info.pending_update_count}`);
      console.log(`   Last Error: ${info.last_error_message || 'None'}`);
      console.log(`   Max Connections: ${info.max_connections}`);
    }

    // Test 3: Set webhook (if not set)
    if (!webhookData.result.url) {
      console.log('\n📋 Test 3: Setting webhook...');
      const webhookUrl = 'http://localhost:3001/api/telegram/webhook';
      const setWebhookResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl })
      });
      
      const setWebhookData = await setWebhookResponse.json();
      if (setWebhookData.ok) {
        console.log('✅ Webhook set successfully!');
        console.log(`   Webhook URL: ${webhookUrl}`);
      } else {
        console.log('❌ Failed to set webhook:', setWebhookData.description);
      }
    }

    console.log('\n🔗 Bot Link for Testing:');
    console.log(`https://t.me/${botData.result.username}`);
    console.log('\n📝 Next Steps:');
    console.log('1. Start your backend server: npm run dev');
    console.log('2. Login as admin and go to dashboard');
    console.log('3. Set up webhook via: POST /api/telegram/setup');
    console.log('4. Try connecting Telegram in user settings');
    console.log('5. Check backend logs for connection attempts');

  } catch (error) {
    console.error('❌ Error testing bot:', error.message);
  }
}

testBot();