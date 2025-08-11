import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { apiService } from '@/services/api';

export function useNotifications() {
  const { state, addNotification } = useAuth();
  const { toast } = useToast();
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!state.isAuthenticated || !state.user || !state.user.is_verified) {
      // Close existing connection if user is not authenticated
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    // Create notification stream
    const token = apiService.getAuthToken();
    if (!token) {
      console.warn('No auth token available for notification stream');
      return;
    }
    
    // Use the apiService to create the notification stream
    const eventSource = apiService.createNotificationStream(state.user.id, (notification) => {
      // Handle different notification types
      switch (notification.type) {
        case 'connection':
          console.log('Connected to notification stream');
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
    

    eventSourceRef.current = eventSource;

    // Cleanup on unmount or dependency change
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [state.isAuthenticated, state.user?.is_verified, addNotification, toast]);

  return {
    notifications: state.notifications,
    isConnected: eventSourceRef.current?.readyState === EventSource.OPEN
  };
}