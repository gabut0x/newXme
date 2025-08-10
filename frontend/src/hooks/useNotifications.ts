import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

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
    const token = localStorage.getItem('accessToken');
    if (!token) {
      console.warn('No auth token available for notification stream');
      return;
    }
    
    const baseURL = import.meta.env.VITE_API_URL || '/api';
    const url = `${baseURL}/user/notifications/stream`;
    
    // Create EventSource with manual auth handling
    const eventSource = new EventSource(url);
    
    // Send auth token via a custom event after connection opens
    eventSource.addEventListener('open', () => {
      console.log('Notification stream connected');
      // The backend will handle auth via the Authorization header from the initial request
    });

    eventSource.onopen = () => {
      console.log('Notification stream connected');
    };

    eventSource.onmessage = (event) => {
      try {
        const notification = JSON.parse(event.data);
        
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
      } catch (error) {
        console.error('Failed to parse notification:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('Notification stream error:', error);
      
      // Attempt to reconnect after 5 seconds
      setTimeout(() => {
        if (state.isAuthenticated && state.user && state.user.is_verified) {
          console.log('Attempting to reconnect notification stream...');
          eventSource.close();
          // The useEffect will create a new connection
        }
      }, 5000);
    };

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