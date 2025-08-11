import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { apiService } from '@/services/api'; // Change this line

export function useNotifications() {
  const { state, addNotification } = useAuth();
  const { toast } = useToast();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const createConnection = useCallback(() => {
    if (!state.isAuthenticated || !state.user || !state.user.is_verified) {
      console.log('🚫 Cannot create connection: not authenticated or verified');
      return;
    }

    // Close existing connection first
    if (eventSourceRef.current) {
      console.log('🔄 Closing existing EventSource connection');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Clear any existing timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    try {
      console.log('🚀 Creating new notification stream connection for user:', state.user.id);
      
      // Create notification stream
      const eventSource = apiService.createNotificationStream(state.user.id, (notification) => {
        console.log('🔔 Raw notification received:', notification);
        
        // Handle different notification types
        switch (notification.type) {
          case 'connection':
            console.log('✅ Connected to notification stream');
            reconnectAttempts.current = 0; // Reset reconnect attempts on successful connection
            break;
            
          case 'heartbeat':
            // Silent heartbeat
            console.log('💓 Heartbeat received');
            break;
            
          case 'install_status_update':
            console.log('📩 Install status notification received:', notification);
            
            // Add to notifications list - IMPORTANT: This adds to AuthContext
            addNotification(notification);
            console.log('✅ Notification added to context');
            
            // Show toast for important status changes
            if (notification.status === 'completed') {
              toast({
                title: 'Installation Completed!',
                description: `Windows installation on ${notification.ip} has been completed successfully.`,
                variant: 'default',
              });
            } else if (notification.status === 'failed') {
              toast({
                title: 'Installation Failed',
                description: `Installation on ${notification.ip} has failed. Please check your configuration.`,
                variant: 'destructive',
              });
            } else if (notification.status === 'running') {
              toast({
                title: 'Installation Started',
                description: `Windows installation on ${notification.ip} is now running.`,
                variant: 'default',
              });
            } else if (notification.status === 'pending') {
              toast({
                title: 'Installation Pending',
                description: `Windows installation on ${notification.ip} is pending.`,
                variant: 'default',
              });
            }
            break;
            
          default:
            console.log('❓ Unknown notification type:', notification.type, notification);
            // Still add unknown notifications to the list
            addNotification(notification);
            break;
        }
      });

      eventSource.onerror = (error) => {
        console.error('❌ Notification stream connection lost:', error);
        
        // Attempt to reconnect with exponential backoff
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000); // Max 30 seconds
          reconnectAttempts.current++;
          
          console.log(`🔄 Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts.current})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            createConnection();
          }, delay);
        } else {
          console.error('❌ Max reconnection attempts reached');
          toast({
            variant: 'destructive',
            title: 'Connection Lost',
            description: 'Real-time notifications are temporarily unavailable. Please refresh the page.',
          });
        }
      };

      eventSourceRef.current = eventSource;
      console.log('✅ EventSource connection established');
      
    } catch (error) {
      console.error('❌ Failed to create notification stream:', error);
    }
  }, [state.isAuthenticated, state.user?.is_verified, state.user?.id, addNotification, toast]);

  useEffect(() => {
    if (!state.isAuthenticated || !state.user || !state.user.is_verified) {
      // Close existing connection if user is not authenticated
      if (eventSourceRef.current) {
        console.log('Closing existing connection - user not authenticated or verified');
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      
      // Clear reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      return;
    }

    // Create initial connection
    createConnection();

    // Cleanup on unmount or dependency change
    return () => {
      console.log('Cleaning up notification connection');
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [createConnection]);

  return {
    notifications: state.notifications,
    isConnected: eventSourceRef.current?.readyState === EventSource.OPEN
  };
}