import crypto from 'crypto';
import axios from 'axios';
import { logger } from '../utils/logger.js';
import { DateUtils } from '../utils/dateUtils.js';

export interface TripayTransactionRequest {
  method: string;
  merchant_ref: string;
  amount: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  order_items: TripayOrderItem[];
  return_url: string;
  expired_time: number;
}

export interface TripayOrderItem {
  sku: string;
  name: string;
  price: number;
  quantity: number;
  product_url?: string;
  image_url?: string;
}

export interface TripayTransactionResponse {
  success: boolean;
  message: string;
  data: {
    reference: string;
    merchant_ref: string;
    payment_selection_type: string;
    payment_method: string;
    payment_name: string;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    callback_url: string;
    return_url: string;
    amount: number;
    fee_merchant: number;
    fee_customer: number;
    total_fee: number;
    amount_received: number;
    pay_code: string;
    pay_url: string | null;
    checkout_url: string;
    status: string;
    expired_time: number;
    order_items: TripayOrderItem[];
    instructions: any[];
    qr_string: string | null;
    qr_url: string | null;
  };
}

export interface PaymentChannel {
  code: string;
  name: string;
  type: string;
  fee_merchant: {
    flat: number;
    percent: number;
  };
  fee_customer: {
    flat: number;
    percent: number;
  };
  total_fee: {
    flat: number;
    percent: number;
  };
  minimum_fee: number;
  maximum_fee: number;
  icon_url: string;
  active: boolean;
}

class TripayService {
  private apiKey: string;
  private privateKey: string;
  private merchantCode: string;
  private baseUrl: string;
  private isProduction: boolean;
  private initialized: boolean = false;

  constructor() {
    // Don't initialize immediately, wait for first call
    this.apiKey = '';
    this.privateKey = '';
    this.merchantCode = '';
    this.baseUrl = '';
    this.isProduction = false;
  }

  private ensureInitialized() {
    if (this.initialized) return;
    
    this.apiKey = process.env.TRIPAY_API_KEY || '';
    this.privateKey = process.env.TRIPAY_PRIVATE_KEY || '';
    this.merchantCode = process.env.TRIPAY_MERCHANT_CODE || '';
    this.isProduction = process.env.NODE_ENV === 'production';
    
    // Log configuration for debugging (without exposing sensitive data)
    logger.info('Tripay service initialized:', {
      hasApiKey: !!this.apiKey,
      apiKeyLength: this.apiKey.length,
      hasMerchantCode: !!this.merchantCode,
      isProduction: this.isProduction,
      environment: process.env.NODE_ENV
    });
    
    // Use appropriate URL based on environment
    if (this.isProduction) {
      this.baseUrl = process.env.TRIPAY_BASE_URL || 'https://tripay.co.id/api';
    } else {
      this.baseUrl = process.env.TRIPAY_BASE_URL || 'https://tripay.co.id/api-sandbox';
    }

    this.initialized = true;
  }

  generateSignature(merchantCode: string, merchantRef: string, amount: number): string {
    this.ensureInitialized();
    const data = merchantCode + merchantRef + amount;
    return crypto.createHmac('sha256', this.privateKey)
      .update(data)
      .digest('hex');
  }

  generateMerchantRef(userId: number, quantity: number): string {
    const timestamp = DateUtils.getJakartaUnixTimestamp();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `INV${timestamp}${random}_U${userId}_Q${quantity}`;
  }

  async createTransaction(request: TripayTransactionRequest): Promise<TripayTransactionResponse> {
    this.ensureInitialized();
    
    try {
      const signature = this.generateSignature(
        this.merchantCode,
        request.merchant_ref,
        request.amount
      );

      const payload = {
        ...request,
        signature
      };

      logger.info('Creating Tripay transaction:', {
        merchant_ref: request.merchant_ref,
        amount: request.amount,
        method: request.method,
        environment: this.isProduction ? 'production' : 'sandbox',
        jakartaTime: DateUtils.formatJakarta(DateUtils.now()) + ' WIB'
      });

      // Use environment-appropriate endpoint
      const endpoint = this.isProduction 
        ? `${this.baseUrl}/transaction/create`
        : `${this.baseUrl}/transaction/create`;

      const response = await axios.post(endpoint, payload, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        validateStatus: function (status) {
          return status < 999; // Accept all HTTP status codes
        }
      });

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to create transaction');
      }

      logger.info('Tripay transaction created successfully:', {
        reference: response.data.data.reference,
        checkout_url: response.data.data.checkout_url,
        jakartaTime: DateUtils.formatJakarta(DateUtils.now()) + ' WIB'
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to create Tripay transaction:', error);
      throw new Error(`Payment gateway error: ${error.message}`);
    }
  }

  async getPaymentChannels(): Promise<PaymentChannel[]> {
    this.ensureInitialized();
    
    try {
      logger.info('Fetching payment channels from Tripay:', {
        baseUrl: this.baseUrl,
        environment: this.isProduction ? 'production' : 'sandbox',
        hasApiKey: !!this.apiKey,
        apiKeyPrefix: this.apiKey.substring(0, 8) + '...'
      });

      const response = await axios.get(`${this.baseUrl}/merchant/payment-channel`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`          
        },
        validateStatus: function (status) {
          return status < 999; // Accept all HTTP status codes
        }
      });

      logger.info('Tripay API response:', {
        status: response.status,
        success: response.data?.success,
        dataLength: response.data?.data?.length || 0,
        message: response.data?.message
      });

      if (!response.data.success) {
        logger.warn('Failed to fetch payment channels:', {
          status: response.status,
          message: response.data.message,
          data: response.data
        });
        return [];
      }

      logger.info(`Fetched ${response.data.data?.length || 0} payment channels from Tripay`);
      return response.data.data || [];
    } catch (error: any) {
      logger.error('Failed to get payment channels:', {
        error: error.message,
        stack: error.stack,
        config: {
          baseUrl: this.baseUrl,
          environment: this.isProduction ? 'production' : 'sandbox'
        }
      });
      return [];
    }
  }

  validateCallback(signature: string, data: any): boolean {
    this.ensureInitialized();
    
    try {
      const callbackData = JSON.stringify(data);
      const expectedSignature = crypto.createHmac('sha256', this.privateKey)
        .update(callbackData)
        .digest('hex');
      
      return signature === expectedSignature;
    } catch (error) {
      logger.error('Failed to validate callback signature:', error);
      return false;
    }
  }
}

export const tripayService = new TripayService();
export default tripayService;