import crypto from 'crypto';
import { tripayService } from '../services/tripayService.js';
import { logger } from '../utils/logger.js';

export async function debugTripayConfig() {
  console.log('=== TRIPAY DEBUG ===');
  console.log('Environment Variables:');
  console.log('TRIPAY_API_KEY:', process.env.TRIPAY_API_KEY ? `${process.env.TRIPAY_API_KEY.substring(0, 10)}...` : 'NOT SET');
  console.log('TRIPAY_PRIVATE_KEY:', process.env.TRIPAY_PRIVATE_KEY ? 'SET' : 'NOT SET');
  console.log('TRIPAY_MERCHANT_CODE:', process.env.TRIPAY_MERCHANT_CODE || 'NOT SET');
  console.log('TRIPAY_BASE_URL:', process.env.TRIPAY_BASE_URL || 'NOT SET');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  
  console.log('\nTesting Payment Channels API:');
  try {
    const channels = await tripayService.getPaymentChannels();
    console.log('Payment channels response:', {
      success: true,
      channelCount: channels.length,
      firstChannel: channels.length > 0 ? channels[0].name : 'No channels'
    });
  } catch (error: any) {
    console.log('Payment channels error:', error.message);
  }
  
  console.log('=== END TRIPAY DEBUG ===');
}

export function debugCallbackSignature() {
  console.log('=== CALLBACK SIGNATURE DEBUG ===');
  
  // Sample callback data
  const callbackData = {
    reference: 'T123456789',
    merchant_ref: `${process.env.TRIPAY_MERCHANT_CODE}-1-5-${Date.now()}`,
    payment_method: 'BRIVA',
    payment_method_code: 'BRIVA',
    total_amount: 25000,
    fee_merchant: 2500,
    fee_customer: 0,
    total_fee: 2500,
    amount_received: 22500,
    is_closed_payment: 1,
    status: 'PAID',
    paid_at: Math.floor(Date.now() / 1000)
  };
  
  const jsonBody = JSON.stringify(callbackData);
  const privateKey = process.env.TRIPAY_PRIVATE_KEY || '';
  
  // Generate signature like Tripay does
  const signature = crypto.createHmac('sha256', jsonBody, privateKey).digest('hex');
  
  console.log('Sample callback data:', callbackData);
  console.log('JSON body:', jsonBody);
  console.log('Generated signature:', signature);
  console.log('Private key used:', privateKey ? 'SET' : 'NOT SET');
  
  // Test validation
  const isValid = tripayService.validateCallback(signature, jsonBody);
  console.log('Signature validation result:', isValid);
  
  console.log('=== END CALLBACK SIGNATURE DEBUG ===');
}