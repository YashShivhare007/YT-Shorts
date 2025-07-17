import { useEffect, useCallback } from 'react';
import googleAuthService from '../services/googleAuth';

export const useSessionMonitoring = () => {
  // Update activity on any user interaction
  const updateActivity = useCallback(() => {
    googleAuthService.updateActivity();
  }, []);

  useEffect(() => {
    // Add activity listeners
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    activityEvents.forEach(event => {
      document.addEventListener(event, updateActivity, true);
    });

    // Cleanup
    return () => {
      activityEvents.forEach(event => {
        document.removeEventListener(event, updateActivity, true);
      });
    };
  }, [updateActivity]);

  // Get session status
  const getSessionStatus = useCallback(() => {
    return googleAuthService.getSessionStatus();
  }, []);

  return {
    getSessionStatus,
    updateActivity
  };
}; 