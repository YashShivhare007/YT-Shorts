import React, { useState, useEffect } from 'react';
import { Clock, Shield } from 'lucide-react';
import { googleAuthService } from '../services/googleAuth';

const SessionStatus: React.FC = () => {
  const [sessionStatus, setSessionStatus] = useState(() => googleAuthService.getSessionStatus());
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  useEffect(() => {
    const updateStatus = () => {
      const status = googleAuthService.getSessionStatus();
      setSessionStatus(status);
      
      if (status.isSignedIn) {
        const remaining = Math.max(0, status.sessionTimeout - status.timeSinceLastActivity);
        setTimeRemaining(remaining);
      }
    };

    // Update every second
    const interval = setInterval(updateStatus, 1000);
    
    return () => clearInterval(interval);
  }, []);

  if (!sessionStatus.isSignedIn) {
    return null;
  }

  const formatTime = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (remaining: number): string => {
    if (remaining > 10 * 60 * 1000) return 'text-green-600'; // > 10 minutes
    if (remaining > 5 * 60 * 1000) return 'text-yellow-600'; // > 5 minutes
    return 'text-red-600'; // < 5 minutes
  };

  return (
    <div className="fixed bottom-4 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-3 z-50">
      <div className="flex items-center space-x-2 text-sm">
        <Shield className="w-4 h-4 text-blue-500" />
        <span className="text-gray-600 dark:text-gray-300">Session:</span>
        <div className="flex items-center space-x-1">
          <Clock className={`w-4 h-4 ${getStatusColor(timeRemaining)}`} />
          <span className={`font-mono ${getStatusColor(timeRemaining)}`}>
            {formatTime(timeRemaining)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default SessionStatus; 