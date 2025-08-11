import React, { createContext, useContext, useReducer, useEffect, useCallback, ReactNode } from 'react';
import { apiService, User } from '../services/api';

// Notification interface
export interface DashboardNotification {
  type: string;
  installId?: number;
  status?: string;
  message: string;
  timestamp: string;
  ip?: string;
  winVersion?: string;
}

// Auth state interface
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  notifications: DashboardNotification[];
}

// Auth actions
type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: User }
  | { type: 'AUTH_FAILURE'; payload: string }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'UPDATE_USER'; payload: User }
  | { type: 'CLEAR_ERROR' }
  | { type: 'ADD_NOTIFICATION'; payload: DashboardNotification }
  | { type: 'CLEAR_NOTIFICATIONS' };

// Auth context interface
interface AuthContextType {
  state: AuthState;
  notifications: DashboardNotification[];
  login: (username: string, password: string, recaptchaToken: string) => Promise<void>;
  register: (username: string, email: string, password: string, confirmPassword: string, recaptchaToken: string) => Promise<void>;
  logout: () => Promise<void>;
  verifyEmail: (code: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  forgotPassword: (email: string, recaptchaToken: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string, confirmPassword: string) => Promise<void>;
  updateProfile: (data: any) => Promise<void>;
  clearError: () => void;
  checkAuth: () => Promise<void>;
  addNotification: (notification: DashboardNotification) => void;
  clearNotifications: () => void;
}

// Initial state
const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  notifications: [],
};

// Auth reducer
function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'AUTH_START':
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    case 'AUTH_SUCCESS':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };
    case 'AUTH_FAILURE':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: action.payload,
      };
    case 'AUTH_LOGOUT':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      };
    case 'UPDATE_USER':
      return {
        ...state,
        user: action.payload,
      };
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };
    case 'ADD_NOTIFICATION':
      return {
        ...state,
        notifications: [action.payload, ...state.notifications.slice(0, 9)], // Keep last 10 notifications
      };
    case 'CLEAR_NOTIFICATIONS':
      return {
        ...state,
        notifications: [],
      };
    default:
      return state;
  }
}

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth provider component
interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check authentication status on app load
  const checkAuth = useCallback(async () => {
    try {
      dispatch({ type: 'AUTH_START' });
      
      if (!apiService.isAuthenticated()) {
        // Don't set error for normal unauthenticated state
        dispatch({ type: 'AUTH_LOGOUT' });
        return;
      }

      const response = await apiService.getProfile();
      if (response.data.data?.user) {
        dispatch({ type: 'AUTH_SUCCESS', payload: response.data.data.user });
      } else {
        dispatch({ type: 'AUTH_LOGOUT' });
      }
    } catch (error: any) {
      console.error('Auth check failed:', error);
      apiService.clearAuthToken();
      // Only set error for actual authentication failures, not normal unauthenticated state
      dispatch({ type: 'AUTH_LOGOUT' });
    }
  }, []);

  // Login function
  const login = useCallback(async (username: string, password: string, recaptchaToken: string) => {
    try {
      dispatch({ type: 'AUTH_START' });
      
      const response = await apiService.login({ username, password, recaptchaToken });
      if (response.data.data?.user && response.data.data?.accessToken) {
        const { user, accessToken } = response.data.data;
        apiService.setAuthToken(accessToken);
        dispatch({ type: 'AUTH_SUCCESS', payload: user });
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error: any) {
      const message = error.response?.data?.message || 'Login failed';
      dispatch({ type: 'AUTH_FAILURE', payload: message });
      throw new Error(message);
    }
  }, []);

  // Register function
  const register = useCallback(async (username: string, email: string, password: string, confirmPassword: string, recaptchaToken: string) => {
    try {
      dispatch({ type: 'AUTH_START' });
      
      const response = await apiService.register({ username, email, password, confirmPassword, recaptchaToken });
      if (response.data.data?.user && response.data.data?.accessToken) {
        const { user, accessToken } = response.data.data;
        apiService.setAuthToken(accessToken);
        dispatch({ type: 'AUTH_SUCCESS', payload: user });
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error: any) {
      const message = error.response?.data?.message || 'Registration failed';
      dispatch({ type: 'AUTH_FAILURE', payload: message });
      throw new Error(message);
    }
  }, []);

  // Logout function
  const logout = useCallback(async () => {
    try {
      await apiService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      apiService.clearAuthToken();
      dispatch({ type: 'AUTH_LOGOUT' });
    }
  }, []);

  // Verify email function
  const verifyEmail = useCallback(async (code: string) => {
    try {
      dispatch({ type: 'AUTH_START' });
      
      const response = await apiService.verifyEmail({ code });
      if (response.data.data?.user) {
        dispatch({ type: 'AUTH_SUCCESS', payload: response.data.data.user });
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error: any) {
      const message = error.response?.data?.message || 'Email verification failed';
      dispatch({ type: 'AUTH_FAILURE', payload: message });
      throw new Error(message);
    }
  }, []);

  // Resend verification function
  const resendVerification = useCallback(async () => {
    try {
      await apiService.resendVerification();
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to resend verification email';
      throw new Error(message);
    }
  }, []);

  // Forgot password function
  const forgotPassword = useCallback(async (email: string, recaptchaToken: string) => {
    try {
      await apiService.forgotPassword({ email, recaptchaToken });
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to send reset email';
      throw new Error(message);
    }
  }, []);

  // Reset password function
  const resetPassword = useCallback(async (token: string, newPassword: string, confirmPassword: string) => {
    try {
      await apiService.resetPassword({ token, newPassword, confirmPassword });
    } catch (error: any) {
      const message = error.response?.data?.message || 'Password reset failed';
      throw new Error(message);
    }
  }, []);

  // Update profile function
  const updateProfile = useCallback(async (data: any) => {
    try {
      const response = await apiService.updateProfile(data);
      if (response.data.data?.user) {
        dispatch({ type: 'UPDATE_USER', payload: response.data.data.user });
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error: any) {
      const message = error.response?.data?.message || 'Profile update failed';
      throw new Error(message);
    }
  }, []);

  // Clear error function
  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  // Add notification function
  const addNotification = useCallback((notification: DashboardNotification) => {
    dispatch({ type: 'ADD_NOTIFICATION', payload: notification });
  }, []);

  // Clear notifications function
  const clearNotifications = useCallback(() => {
    dispatch({ type: 'CLEAR_NOTIFICATIONS' });
  }, []);

  // Notification stream is now handled by useNotifications hook - removed duplicate logic

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const value: AuthContextType = {
    state,
    notifications: state.notifications,
    login,
    register,
    logout,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
    updateProfile,
    clearError,
    checkAuth,
    addNotification,
    clearNotifications,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;