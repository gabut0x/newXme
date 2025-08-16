import axios, { AxiosInstance, AxiosResponse } from 'axios';

// API Response interfaces
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  is_verified: boolean;
  admin?: number;
  telegram?: string;
  telegram_user_id?: number;
  telegram_display_name?: string;
  telegram_notifications?: boolean;
  quota?: number;
  created_at: string;
  last_login?: string;
  profile?: UserProfile;
}

export interface UserProfile {
  id: number;
  first_name?: string;
  last_name?: string;
  phone?: string;
  avatar_url?: string;
  timezone: string;
  language: string;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  sessionId: string;
  requiresVerification: boolean;
}

export interface DashboardData {
  user: User;
  stats: {
    totalVPS: number;
    activeConnections: number;
    completedInstalls: number;
    failedInstalls: number;
    successRate: string;
    quota: number;
  };
  recentActivity: any[];
}

export interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

// Request interfaces
export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  recaptchaToken: string;
}

export interface LoginRequest {
  username: string;
  password: string;
  recaptchaToken: string;
}

export interface ForgotPasswordRequest {
  email: string;
  recaptchaToken: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

export interface UpdatePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ConnectTelegramResponse {
  telegramBotUrl: string;
  instructions: string;
}

export interface UpdateTelegramNotificationsRequest {
  enabled: boolean;
}

export interface VerifyEmailRequest {
  code: string;
}

export interface UpdateProfileRequest {
  firstName?: string;
  lastName?: string;
  phone?: string;
  timezone?: string;
  language?: string;
}

// New interfaces for admin functionality
export interface WindowsVersion {
  id: number;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: number;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  created_at: string;
  updated_at: string;
}

export interface InstallData {
  id: number;
  user_id: number;
  start_time: string;
  ip: string;
  passwd_vps?: string;
  win_ver: string;
  passwd_rdp?: string;
  status: string;
  created_at: string;
  updated_at: string;
  username?: string;
  email?: string;
}

export interface CreateWindowsVersionRequest {
  name: string;
  slug: string;
}

export interface CreateProductRequest {
  name: string;
  description?: string;
  price: number;
  image_url?: string;
}

export interface CreateInstallRequest {
  ip: string;
  passwd_vps?: string;
  win_ver: string;
  passwd_rdp?: string;
}
export interface TopupCalculationRequest {
  quantity: number;
}

export interface TopupCalculationResponse {
  product: {
    id: number;
    name: string;
    description: string;
    price: number;
  };
  quantity: number;
  total_amount: number;
  discount_percentage: number;
  discount_amount: number;
  final_amount: number;
}

export interface TopupRequest {
  quantity: number;
  payment_method: string;
}

export interface TopupResponse {
  transaction_id: number;
  reference: string;
  merchant_ref: string;
  quantity: number;
  total_amount: number;
  discount_percentage: number;
  discount_amount: number;
  final_amount: number;
  checkout_url: string;
  qr_url: string | null;
  pay_code: string;
  payment_method: string;
  payment_name: string;
  status: string;
  expired_time: number;
}

export interface TopupTransaction {
  id: number;
  user_id: number;
  reference: string;
  merchant_ref: string;
  amount: number;
  quantity: number;
  total_amount: number;
  discount_percentage: number;
  discount_amount: number;
  final_amount: number;
  payment_method: string;
  payment_url: string | null;
  checkout_url: string;
  pay_code: string;
  status: string;
  expired_time: number;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
}

export interface PaymentMethod {
  id?: number;
  code: string;
  name: string;
  type: string;
  icon_url?: string;
  fee_flat: number;
  fee_percent: number;
  minimum_fee: number;
  maximum_fee: number;
  is_enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PaymentMethodUpdateRequest {
  is_enabled: boolean;
}

class ApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: import.meta.env.VITE_API_URL || '/api',
      timeout: 10000,
      withCredentials: true, // For cookies
    });

    // Request interceptor to add auth token
    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('accessToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor to handle token refresh
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const response = await this.refreshToken();
            if (response.data.data?.accessToken) {
              const { accessToken } = response.data.data;
              localStorage.setItem('accessToken', accessToken);
              originalRequest.headers.Authorization = `Bearer ${accessToken}`;
              return this.api(originalRequest);
            } else {
              throw new Error('Invalid refresh response');
            }
          } catch (refreshError) {
            // Refresh failed, redirect to login
            this.logout();
            window.location.href = '/login';
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  // Auth endpoints
  async register(data: RegisterRequest): Promise<AxiosResponse<ApiResponse<AuthResponse>>> {
    return this.api.post('/auth/register', data);
  }

  async login(data: LoginRequest): Promise<AxiosResponse<ApiResponse<AuthResponse>>> {
    return this.api.post('/auth/login', data);
  }

  async logout(): Promise<AxiosResponse<ApiResponse>> {
    try {
      const response = await this.api.post('/auth/logout', {}, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      localStorage.removeItem('accessToken');
      return response;
    } catch (error) {
      localStorage.removeItem('accessToken');
      throw error;
    }
  }

  async refreshToken(): Promise<AxiosResponse<ApiResponse<{ accessToken: string; user: User }>>> {
    return this.api.post('/auth/refresh');
  }

  async verifyEmail(data: VerifyEmailRequest): Promise<AxiosResponse<ApiResponse<{ user: User }>>> {
    return this.api.post('/auth/verify-email', data);
  }

  async resendVerification(): Promise<AxiosResponse<ApiResponse>> {
    return this.api.post('/auth/resend-verification');
  }

  async forgotPassword(data: ForgotPasswordRequest): Promise<AxiosResponse<ApiResponse>> {
    return this.api.post('/auth/forgot-password', data);
  }

  async validateResetToken(token: string): Promise<AxiosResponse<ApiResponse<{ email: string; username: string }>>> {
    return this.api.get(`/auth/validate-reset-token/${token}`);
  }

  async resetPassword(data: ResetPasswordRequest): Promise<AxiosResponse<ApiResponse>> {
    return this.api.post('/auth/reset-password', data);
  }

  // User endpoints
  async getProfile(): Promise<AxiosResponse<ApiResponse<{ user: User }>>> {
    return this.api.get('/user/profile');
  }

  async updateProfile(data: UpdateProfileRequest): Promise<AxiosResponse<ApiResponse<{ user: User }>>> {
    return this.api.put('/user/profile', data);
  }

  async getDashboard(): Promise<AxiosResponse<ApiResponse<DashboardData>>> {
    return this.api.get('/user/dashboard');
  }

  async deleteAccount(): Promise<AxiosResponse<ApiResponse>> {
    return this.api.delete('/user/account');
  }

  async updatePassword(data: UpdatePasswordRequest): Promise<AxiosResponse<ApiResponse>> {
    return this.api.post('/user/update-password', data, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async connectTelegram(): Promise<AxiosResponse<ApiResponse<ConnectTelegramResponse>>> {
    return this.api.post('/user/connect-telegram', {}, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async updateTelegramNotifications(data: UpdateTelegramNotificationsRequest): Promise<AxiosResponse<ApiResponse>> {
    return this.api.post('/user/telegram-notifications', data, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async disconnectTelegram(): Promise<AxiosResponse<ApiResponse>> {
    return this.api.post('/user/disconnect-telegram', {}, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  // User install endpoints
  async getWindowsVersions(): Promise<AxiosResponse<ApiResponse<WindowsVersion[]>>> {
    return this.api.get('/user/windows-versions');
  }

  async createInstall(data: CreateInstallRequest): Promise<AxiosResponse<ApiResponse<InstallData>>> {
    return this.api.post('/user/install', data);
  }

  async getInstallHistory(): Promise<AxiosResponse<ApiResponse<InstallData[]>>> {
    return this.api.get('/user/install-history');
  }
  // Topup endpoints
  async calculateTopup(data: TopupCalculationRequest): Promise<AxiosResponse<ApiResponse<TopupCalculationResponse>>> {
    return this.api.post('/user/topup/calculate', data);
  }

  async createTopup(data: TopupRequest): Promise<AxiosResponse<ApiResponse<TopupResponse>>> {
    return this.api.post('/user/topup', data);
  }

  async getTopupHistory(): Promise<AxiosResponse<ApiResponse<TopupTransaction[]>>> {
    return this.api.get('/user/topup/history');
  }

  // Payment methods endpoints
  async getEnabledPaymentMethods(): Promise<AxiosResponse<ApiResponse<PaymentMethod[]>>> {
    return this.api.get('/user/payment-methods/enabled');
  }

  // Real-time notifications
  createNotificationStream(userId: number, onNotification: (notification: any) => void): EventSource {
    const token = this.getAuthToken();
    if (!token) {
      throw new Error('No authentication token available');
    }
    
    // Use relative URL to leverage Vite proxy for development
    // In production, VITE_API_URL should be set to full backend URL
    const baseURL = import.meta.env.VITE_API_URL || '/api';
    const streamURL = `${baseURL}/user/notifications/stream?token=${encodeURIComponent(token)}`;
    
    console.log('🚀 Creating notification stream:', streamURL);
    
    const eventSource = new EventSource(streamURL);
    
    // Add debugging for all EventSource states
    console.log('📡 EventSource initial readyState:', eventSource.readyState);

    eventSource.onmessage = (event) => {
      try {
        console.log('🔔 Raw EventSource message received:', {
          data: event.data,
          lastEventId: event.lastEventId,
          type: event.type,
          origin: event.origin
        });
        
        const notification = JSON.parse(event.data);
        console.log('📩 Parsed notification:', notification);
        console.log('🎯 About to call onNotification callback...');
        
        onNotification(notification);
        
        console.log('✅ Notification callback executed successfully');
      } catch (error) {
        console.error('❌ Failed to parse notification:', error, 'Raw data:', event.data);
      }
    };

    eventSource.onopen = (event) => {
      console.log('✅ Notification stream connected successfully', {
        readyState: eventSource.readyState,
        url: eventSource.url,
        event: event
      });
    };
    
    eventSource.onerror = (error) => {
      console.error('❌ Notification stream error:', error);
      console.log('💔 EventSource error details:', {
        readyState: eventSource.readyState,
        url: eventSource.url,
        error: error
      });
      
      // Additional debugging
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log('🚫 EventSource connection was closed');
      } else if (eventSource.readyState === EventSource.CONNECTING) {
        console.log('🔄 EventSource is still trying to connect');
      }
    };
    
    // Add additional event listener for debugging
    eventSource.addEventListener('message', (event) => {
      console.log('👂 Alternative message listener triggered:', event.data);
    });

    return eventSource;
  }

  // Admin endpoints
  async getAdminWindowsVersions(): Promise<AxiosResponse<ApiResponse<WindowsVersion[]>>> {
    return this.api.get('/admin/windows-versions');
  }

  async createWindowsVersion(data: CreateWindowsVersionRequest): Promise<AxiosResponse<ApiResponse<WindowsVersion>>> {
    return this.api.post('/admin/windows-versions', data);
  }

  async updateWindowsVersion(id: number, data: CreateWindowsVersionRequest): Promise<AxiosResponse<ApiResponse<WindowsVersion>>> {
    return this.api.put(`/admin/windows-versions/${id}`, data);
  }

  async deleteWindowsVersion(id: number): Promise<AxiosResponse<ApiResponse>> {
    return this.api.delete(`/admin/windows-versions/${id}`);
  }

  async getAdminProducts(): Promise<AxiosResponse<ApiResponse<Product[]>>> {
    return this.api.get('/admin/products');
  }

  async createProduct(data: CreateProductRequest): Promise<AxiosResponse<ApiResponse<Product>>> {
    return this.api.post('/admin/products', data);
  }

  async updateProduct(id: number, data: CreateProductRequest): Promise<AxiosResponse<ApiResponse<Product>>> {
    return this.api.put(`/admin/products/${id}`, data);
  }

  async deleteProduct(id: number): Promise<AxiosResponse<ApiResponse>> {
    return this.api.delete(`/admin/products/${id}`);
  }

  async getAdminUsers(): Promise<AxiosResponse<ApiResponse<User[]>>> {
    return this.api.get('/admin/users');
  }

  async updateUser(id: number, data: { is_active?: boolean; admin?: number; telegram?: string }): Promise<AxiosResponse<ApiResponse<User>>> {
    return this.api.put(`/admin/users/${id}`, data);
  }

  async getAdminInstallData(): Promise<AxiosResponse<ApiResponse<InstallData[]>>> {
    return this.api.get('/admin/install-data');
  }

  async updateInstallData(id: number, data: { status: string }): Promise<AxiosResponse<ApiResponse<InstallData>>> {
    return this.api.put(`/admin/install-data/${id}`, data);
  }

  async deleteInstallData(id: number): Promise<AxiosResponse<ApiResponse>> {
    return this.api.delete(`/admin/install-data/${id}`);
  }

  async deleteUser(id: number): Promise<AxiosResponse<ApiResponse>> {
    return this.api.delete(`/admin/users/${id}`);
  }

  async updateUserQuota(id: number, data: { amount: number; operation: 'add' | 'set' }): Promise<AxiosResponse<ApiResponse<{ userId: number; oldQuota: number; newQuota: number; operation: string; amount: number }>>> {
    return this.api.post(`/admin/users/${id}/quota`, data);
  }

  // Admin payment methods endpoints
  async getAdminPaymentMethods(): Promise<AxiosResponse<ApiResponse<PaymentMethod[]>>> {
    return this.api.get('/admin/payment-methods');
  }

  async updatePaymentMethod(code: string, data: PaymentMethodUpdateRequest): Promise<AxiosResponse<ApiResponse<{ code: string; is_enabled: boolean }>>> {
    return this.api.patch(`/admin/payment-methods/${code}`, data);
  }

  async syncPaymentMethods(): Promise<AxiosResponse<ApiResponse<{ totalFromTripay: number; syncedCount: number; newCount: number }>>> {
    return this.api.post(
      '/admin/payment-methods/sync',
      {}, // body kosong
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Utility methods
  setAuthToken(token: string): void {
    localStorage.setItem('accessToken', token);
  }

  getAuthToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  clearAuthToken(): void {
    localStorage.removeItem('accessToken');
  }

  isAuthenticated(): boolean {
    return !!this.getAuthToken();
  }
}

export const apiService = new ApiService();
export default apiService;