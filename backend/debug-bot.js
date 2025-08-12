#!/usr/bin/env node

// Simple direct test of Telegram bot token
import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

console.log('🔍 Direct Telegram Bot API Test\n');
console.log(`Bot Token: ${BOT_TOKEN ? BOT_TOKEN.substring(0, 15) + '...' : 'NOT SET'}\n`);

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN not found in environment variables');
  process.exit(1);
}

async function testDirectAPI() {
  try {
    // Test 1: Direct getMe call
    console.log('📋 Test 1: Direct getMe API call...');
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/getMe`;
    console.log(`URL: ${url.replace(BOT_TOKEN, 'HIDDEN_TOKEN')}`);
    
    const response = await fetch(url);
    const data = await response.json();
    
    console.log(`Response Status: ${response.status}`);
    console.log(`Response OK: ${response.ok}`);
    console.log('Response Body:', JSON.stringify(data, null, 2));
    
    if (data.ok) {
      console.log('\n✅ Bot Token Valid!');
      console.log(`Bot ID: ${data.result.id}`);
      console.log(`Bot Name: ${data.result.first_name}`);
      console.log(`Bot Username: @${data.result.username}`);
      console.log(`Can Read Messages: ${data.result.can_read_all_group_messages}`);
    } else {
      console.log('\n❌ Bot Token Invalid or API Error');
      console.log(`Error Code: ${data.error_code}`);
      console.log(`Description: ${data.description}`);
      return;
    }
    
    // Test 2: Get webhook info
    console.log('\n📋 Test 2: Get webhook info...');
    const webhookResponse = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
    const webhookData = await webhookResponse.json();
    
    console.log('Webhook Response:', JSON.stringify(webhookData, null, 2));
    
    if (webhookData.ok) {
      console.log(`\n✅ Webhook API working`);
      const info = webhookData.result;
      console.log(`Webhook URL: ${info.url || 'Not set'}`);
      console.log(`Pending Updates: ${info.pending_update_count}`);
      console.log(`Last Error: ${info.last_error_message || 'None'}`);
      if (info.last_error_date) {
        console.log(`Last Error Date: ${new Date(info.last_error_date * 1000).toISOString()}`);
      }
    } else {
      console.log('\n❌ Webhook API Error');
      console.log(`Error Code: ${webhookData.error_code}`);
      console.log(`Description: ${webhookData.description}`);
    }
    
  } catch (error) {
    console.error('\n❌ Network/Fetch Error:', error.message);
    console.error('Full Error:', error);
  }
}

testDirectAPI();