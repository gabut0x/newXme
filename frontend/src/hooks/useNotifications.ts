import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export function useNotifications() {
  const { state, addNotification } = useAuth();
  const { toast } = useToast();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const createConnection = () => {
    if (!state.isAuthenticated || !state.user || !state.user.is_verified) {
      return;
    }

    try {
      const { apiService } = require('@/services/api');
      
      // Create notification stream
      const eventSource = apiService.createNotificationStream(state.user.id, (notification) => {
        // Handle different notification types
        switch (notification.type) {
          case 'connection':
            console.log('Connected to notification stream');
            reconnectAttempts.current = 0; // Reset reconnect attempts on successful connection
            break;
            
          case 'heartbeat':
            // Silent heartbeat
            break;
            
          case 'install_status_update':
            // Add to notifications list
            addNotification(notification);
            
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
            }
            break;
            
          default:
            console.log('Unknown notification type:', notification.type);
            break;
        }
      });

      eventSource.onerror = () => {
        console.error('Notification stream connection lost');
        
        // Attempt to reconnect with exponential backoff
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000); // Max 30 seconds
          reconnectAttempts.current++;
          
          console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts.current})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (eventSourceRef.current) {
              eventSourceRef.current.close();
            }
            createConnection();
          }, delay);
        } else {
          console.error('Max reconnection attempts reached');
          toast({
            variant: 'destructive',
            title: 'Connection Lost',
            description: 'Real-time notifications are temporarily unavailable. Please refresh the page.',
          });
        }
      };

      eventSourceRef.current = eventSource;
    } catch (error) {
      console.error('Failed to create notification stream:', error);
    }
  };

  useEffect(() => {
    if (!state.isAuthenticated || !state.user || !state.user.is_verified) {
      // Close existing connection if user is not authenticated
      if (eventSourceRef.current) {
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
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [state.isAuthenticated, state.user?.is_verified, addNotification, toast]);

  return {
    notifications: state.notifications,
    isConnected: eventSourceRef.current?.readyState === EventSource.OPEN
  };
}