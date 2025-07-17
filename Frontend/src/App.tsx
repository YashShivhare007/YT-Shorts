import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import GoogleSignIn from './components/GoogleSignIn';
import Dashboard from './pages/Dashboard';
import VideoUpload from './pages/VideoUpload';
import ClipReview from './pages/ClipReview';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import { googleAuthService } from './services/googleAuth';
import googleSheetsOAuthService from './services/googleSheetsOAuth';
import { useSessionMonitoring } from './hooks/useSessionMonitoring';
import SessionStatus from './components/SessionStatus';

// Add GoogleUser interface for type safety
interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture: string;
}

function App() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [lockModalOpen, setLockModalOpen] = useState(false);
  const [lockEmail, setLockEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [retryLoading, setRetryLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('pw-shorts-dark-mode') === 'true';
  });
  const [showAdminWarning, setShowAdminWarning] = useState(false);
  const [lockCheckInterval, setLockCheckInterval] = useState<NodeJS.Timeout | null>(null);

  // Initialize session monitoring
  useSessionMonitoring();

  // Admin check function
  const isAdmin = (email: string | null): boolean => {
    return email === 'yash.shivhare@pw.live';
  };

  // Auth state check
  useEffect(() => {
    const checkAuth = async () => {
      await googleAuthService.restoreSessionIfPossible();
      const signedIn = googleAuthService.isSignedIn();
      setIsSignedIn(signedIn);
      if (signedIn) {
        const currentUser = googleAuthService.getCurrentUser();
        setUser(currentUser);
        console.log('[App] User signed in:', currentUser?.email);
      } else {
        setUser(null);
        console.log('[App] No user signed in');
      }
    };
    checkAuth();
    googleAuthService.onSignInChange((signedIn) => {
      setIsSignedIn(signedIn);
      if (signedIn) {
        const currentUser = googleAuthService.getCurrentUser();
        setUser(currentUser);
        console.log('[App] User signed in (event):', currentUser?.email);
      } else {
        setUser(null);
        console.log('[App] User signed out (event)');
      }
    });
  }, []);

  // Sync logout across tabs
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'yt-shorts-logout') {
        // Force sign out in this tab
        googleAuthService.signOut();
        setUser(null);
        setIsSignedIn(false);
        setLockModalOpen(false);
        setLockEmail(null);
        console.log('[App] Synced logout from another tab');
      }
      

    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [user]);

  // Global lock check
  useEffect(() => {
    const checkLock = async () => {
      if (isSignedIn && user) {
        try {
          const lockValue = await googleSheetsOAuthService.getLockValue();
          console.log('[App] Lock value (Sheet2!A2):', lockValue, 'Current user:', user.email);
          
          // Admin logic
          if (isAdmin(user.email)) {
            if (lockValue && lockValue !== user.email) {
              // Someone else is using - admin can still use but lock stays with other user
              setShowAdminWarning(true);
              setLockEmail(lockValue);
              setLockModalOpen(false); // Admin can still use the app
              console.log('[App] Admin - sheet in use by:', lockValue, 'but admin can still use');
            } else {
              // No one is using or admin owns lock - treat admin normally
              setShowAdminWarning(false);
              setLockEmail(null);
              setLockModalOpen(false);
              console.log('[App] Admin - no lock or admin owns lock');
            }
          } else {
            // Regular user logic
            if (lockValue && lockValue !== user.email) {
              setLockEmail(lockValue);
              setLockModalOpen(true);
              setShowAdminWarning(false);
              console.log('[App] Lock held by another user:', lockValue);
            } else {
              setLockModalOpen(false);
              setLockEmail(null);
              setShowAdminWarning(false);
              console.log('[App] Lock is free or owned by current user');
            }
          }
        } catch (err) {
          console.error('[App] Error checking lock:', err);
        }
      } else {
        setLockModalOpen(false);
        setLockEmail(null);
        setShowAdminWarning(false);
      }
    };
    checkLock();
  }, [isSignedIn, user]);

  // Simple 15-second sheet monitoring for regular users only (NOT admin)
  useEffect(() => {
    if (isSignedIn && user && !isAdmin(user.email)) {
      // Start monitoring lock changes every 15 seconds for regular users only
      const startSheetMonitoring = () => {
        const interval = setInterval(async () => {
          try {
            const lockValue = await googleSheetsOAuthService.getLockValue();
            console.log('[SheetMonitor] Checking lock - Current user:', user.email, 'Lock holder:', lockValue);
            
            // If current user ID doesn't match lock ID, show admin termination
            if (lockValue && lockValue !== user.email) {
              console.log('[SheetMonitor] User lost lock to:', lockValue);
              
              // Clear any existing interval
              if (lockCheckInterval) {
                clearInterval(lockCheckInterval);
              }
              
              // Show admin termination notification
              showAdminTerminationNotification();
              
              // Sign out the user
              await handleGlobalSignOut();
            }
          } catch (error) {
            console.error('[SheetMonitor] Error checking lock:', error);
          }
        }, 15000); // Check every 15 seconds
        
        setLockCheckInterval(interval);
        console.log('[SheetMonitor] Started sheet monitoring for regular user:', user.email);
      };
      
      // Start monitoring immediately
      startSheetMonitoring();
      
      // Cleanup on unmount or when user changes
      return () => {
        if (lockCheckInterval) {
          clearInterval(lockCheckInterval);
          console.log('[SheetMonitor] Stopped sheet monitoring');
        }
      };
    } else {
      // Stop monitoring if user is admin or not signed in
      if (lockCheckInterval) {
        clearInterval(lockCheckInterval);
        setLockCheckInterval(null);
        console.log('[SheetMonitor] Stopped sheet monitoring (admin or not signed in)');
      }
    }
  }, [isSignedIn, user]);

  // Admin auto sign-in when no lock exists
  useEffect(() => {
    if (isSignedIn && user && isAdmin(user.email)) {
      // Check if admin should auto sign-in when no lock exists
      const checkAdminAutoSignIn = async () => {
        try {
          const lockValue = await googleSheetsOAuthService.getLockValue();
          console.log('[AdminAutoSignIn] Checking lock - Admin:', user.email, 'Lock holder:', lockValue);
          
          // If no lock exists, auto sign admin in
          if (!lockValue) {
            console.log('[AdminAutoSignIn] No lock found, auto-signing admin in');
            await googleSheetsOAuthService.setLockValue(user.email);
            setShowAdminWarning(false);
            setLockEmail(null);
          } else if (lockValue !== user.email) {
            // Someone else is using - show admin warning
            setShowAdminWarning(true);
            setLockEmail(lockValue);
          } else {
            // Admin owns lock
            setShowAdminWarning(false);
            setLockEmail(null);
          }
        } catch (error) {
          console.error('[AdminAutoSignIn] Error checking lock:', error);
        }
      };
      
      // Check immediately and then every 30 seconds
      checkAdminAutoSignIn();
      const interval = setInterval(checkAdminAutoSignIn, 30000);
      
      // Cleanup on unmount or when user changes
      return () => {
        clearInterval(interval);
        console.log('[AdminAutoSignIn] Stopped admin auto sign-in monitoring');
      };
    }
  }, [isSignedIn, user]);

  // Show notification when lock is lost
  const showLockLostNotification = () => {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #ef4444;
      color: white;
      padding: 16px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      max-width: 300px;
      animation: slideIn 0.3s ease-out;
    `;
    
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
        <div>
          <div style="font-weight: 600; margin-bottom: 4px;">Session Terminated</div>
          <div style="font-size: 12px; opacity: 0.9;">Admin has signed you out. You have been logged out.</div>
        </div>
      </div>
    `;
    
    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    
    // Add to page
    document.body.appendChild(notification);
    
    // Remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);
  };

  // Show immediate admin sign-out notification
  const showAdminSignOutNotification = (action: 'force-stop' | 'take-control') => {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #dc2626;
      color: white;
      padding: 16px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      max-width: 350px;
      animation: slideIn 0.3s ease-out;
    `;
    
    const actionText = action === 'force-stop' 
      ? 'Admin has terminated your session and cleared all data.'
      : 'Admin has taken control of the session. Your session has been terminated.';
    
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
        <div>
          <div style="font-weight: 600; margin-bottom: 4px;">Session Terminated by Admin</div>
          <div style="font-size: 12px; opacity: 0.9;">${actionText}</div>
        </div>
      </div>
    `;
    
    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    
    // Add to page
    document.body.appendChild(notification);
    
    // Remove after 8 seconds (longer for admin actions)
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 8000);
  };

  // Show admin termination notification (simple version)
  const showAdminTerminationNotification = () => {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #dc2626;
      color: white;
      padding: 16px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      max-width: 350px;
      animation: slideIn 0.3s ease-out;
    `;
    
    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
        <div>
          <div style="font-weight: 600; margin-bottom: 4px;">Session Terminated by Admin</div>
          <div style="font-size: 12px; opacity: 0.9;">Admin has taken control of the session. You have been signed out.</div>
        </div>
      </div>
    `;
    
    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    
    // Add to page
    document.body.appendChild(notification);
    
    // Remove after 8 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 8000);
  };

  // Global sign-out handler
  const handleGlobalSignOut = async () => {
    setLoading(true);
    try {
      const currentUser = googleAuthService.getCurrentUser();
      const lockValue = await googleSheetsOAuthService.getLockValue();
      const executionId = await googleSheetsOAuthService.getExecutionId();
      console.log('[SignOut] About to call backend terminate endpoint with executionId:', executionId || 'none');
      const backendResp = await googleSheetsOAuthService.testTerminateExecution(executionId || 'none');
      console.log('[SignOut] Backend terminate response:', backendResp);
      if (currentUser && lockValue === currentUser.email) {
        await googleSheetsOAuthService.setLockValue('');
        await googleSheetsOAuthService.clearAllRowsExceptHeader();
        await googleSheetsOAuthService.clearSheet2();
        console.log('[App] Cleared lock and Sheet1/Sheet2 data on logout');
      }
      localStorage.setItem('yt-shorts-logout', Date.now().toString());
      await googleAuthService.signOut();
      setUser(null);
      setIsSignedIn(false);
      setLockModalOpen(false);
      setLockEmail(null);
      console.log('[App] User signed out globally');
    } catch (err) {
      console.error('[SignOut] Error during global sign out:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRetryLock = async () => {
    setRetryLoading(true);
    try {
      const currentUser = googleAuthService.getCurrentUser() as GoogleUser | null;
      const lockValue = await googleSheetsOAuthService.getLockValue();
      console.log('[App] Retry lock. Lock value:', lockValue, 'Current user:', currentUser?.email);
      
      if (!currentUser) {
        console.log('[App] No current user found');
        return;
      }
      
      const isAdminUser = isAdmin(currentUser.email);
      
      if (isAdminUser) {
        // Admin can always retry and get access
        if (!lockValue) {
          await googleSheetsOAuthService.setLockValue(currentUser.email);
          console.log('[App] Admin acquired lock');
        }
        setLockModalOpen(false);
        setLockEmail(null);
        setShowAdminWarning(false);
      } else {
        // Regular user logic
        if (!lockValue || lockValue === currentUser.email) {
          if (!lockValue && currentUser) {
            await googleSheetsOAuthService.setLockValue(currentUser.email);
            console.log('[App] Lock acquired by current user');
          }
          setLockModalOpen(false);
          setLockEmail(null);
        } else {
          setLockEmail(lockValue);
          setLockModalOpen(true);
          console.log('[App] Lock still held by:', lockValue);
        }
      }
    } catch (err) {
      console.error('[App] Error retrying lock:', err);
    } finally {
      setRetryLoading(false);
    }
  };

  // Admin force sign-out function
  const handleAdminForceSignOut = async () => {
    setAdminLoading(true);
    try {
      const currentUser = googleAuthService.getCurrentUser();
      const lockValue = await googleSheetsOAuthService.getLockValue();
      const executionId = await googleSheetsOAuthService.getExecutionId();
      
      console.log('[Admin] Force sign-out initiated by admin');
      console.log('[Admin] Current lock holder:', lockValue);
      console.log('[Admin] About to call backend terminate endpoint with executionId:', executionId || 'none');
      
      // Always terminate backend workflows first
      if (executionId) {
        const backendResp = await googleSheetsOAuthService.testTerminateExecution(executionId);
        console.log('[Admin] Backend terminate response:', backendResp);
      }
      
      // Clear all sheet data (Force Stop behavior)
      await googleSheetsOAuthService.clearAllRowsExceptHeader();
      await googleSheetsOAuthService.clearSheet2();
      console.log('[Admin] Cleared Sheet1/Sheet2 data');
      
      // Clear the lock to trigger other users' monitoring
      await googleSheetsOAuthService.setLockValue('');
      console.log('[Admin] Cleared lock - this should trigger other users to sign out');
      
      // Wait a moment for other users to detect the lock change
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Then set lock to admin
      if (currentUser) {
        await googleSheetsOAuthService.setLockValue(currentUser.email);
        console.log('[Admin] Lock set to admin:', currentUser.email);
      }
      
      // Update UI state
      setShowAdminWarning(false);
      setLockEmail(null);
      setLockModalOpen(false);
      console.log('[Admin] Force sign-out completed successfully');
    } catch (err) {
      console.error('[Admin] Error during force sign-out:', err);
      // Even if there's an error, try to set admin lock
      try {
        const currentUser = googleAuthService.getCurrentUser();
        if (currentUser) {
          await googleSheetsOAuthService.setLockValue(currentUser.email);
          console.log('[Admin] Set admin lock after error');
        }
      } catch (lockError) {
        console.error('[Admin] Error setting admin lock:', lockError);
      }
    } finally {
      setAdminLoading(false);
    }
  };

  // Admin take control function (keep data but assign lock to admin)
  const handleAdminTakeControl = async () => {
    setAdminLoading(true);
    try {
      const currentUser = googleAuthService.getCurrentUser();
      const lockValue = await googleSheetsOAuthService.getLockValue();
      
      console.log('[Admin] Take control initiated by admin');
      console.log('[Admin] Current lock holder:', lockValue);
      
      // DO NOT terminate backend workflows (keep everything running)
      console.log('[Admin] Keeping backend workflows running');
      
      // DO NOT clear sheet data (Take Control behavior - keep data)
      console.log('[Admin] Keeping Sheet1/Sheet2 data intact');
      
      // Simply swap the lock from current user to admin
      if (currentUser) {
        await googleSheetsOAuthService.setLockValue(currentUser.email);
        console.log('[Admin] Lock swapped to admin:', currentUser.email);
      }
      
      // Update UI state
      setShowAdminWarning(false);
      setLockEmail(null);
      setLockModalOpen(false);
      console.log('[Admin] Take control completed successfully');
    } catch (err) {
      console.error('[Admin] Error during take control:', err);
      // Even if there's an error, try to set admin lock
      try {
        const currentUser = googleAuthService.getCurrentUser();
        if (currentUser) {
          await googleSheetsOAuthService.setLockValue(currentUser.email);
          console.log('[Admin] Set admin lock after error');
        }
      } catch (lockError) {
        console.error('[Admin] Error setting admin lock:', lockError);
      }
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
    localStorage.setItem('pw-shorts-dark-mode', darkMode.toString());
  }, [darkMode]);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (lockCheckInterval) {
        clearInterval(lockCheckInterval);
        console.log('[App] Cleanup: Stopped lock monitoring on unmount');
      }
    };
  }, [lockCheckInterval]);

  if (lockModalOpen) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0,0,0,0.5)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{ background: '#fff', borderRadius: 8, padding: 32, minWidth: 320, textAlign: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.2)' }}>
          <h2 style={{ marginBottom: 16 }}>Sheet In Use</h2>
          <p>Sheet is currently in use by: <b>{lockEmail}</b></p>
          <button onClick={handleRetryLock} disabled={retryLoading} style={{ marginTop: 24, padding: '8px 24px', borderRadius: 4, background: '#2563eb', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
            {retryLoading ? 'Checking...' : 'Retry'}
          </button>
          {isSignedIn && (
            <button onClick={handleGlobalSignOut} disabled={loading} style={{ marginTop: 16, marginLeft: 16, padding: '8px 24px', borderRadius: 4, background: '#ef4444', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
              {loading ? 'Signing out...' : 'Sign Out'}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className={`min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-300`}>
        {/* Pass handleGlobalSignOut to GoogleSignIn via Navbar */}
        <Navbar handleSignOut={handleGlobalSignOut} />
        
        {/* Admin Warning Banner */}
        {showAdminWarning && isSignedIn && user && isAdmin(user.email) && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800 mt-16">
            <div className="container mx-auto px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                      <span className="font-bold">ADMIN MODE:</span> Sheet is currently in use by <span className="font-semibold">{lockEmail}</span>
                    </p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                      You can continue using the app, but consider signing out the current user if needed.
                    </p>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={handleAdminForceSignOut}
                    disabled={adminLoading}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium rounded-md transition-colors duration-200 flex items-center space-x-2"
                  >
                    {adminLoading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Signing out...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                        <span>Force Stop</span>
                      </>
                    )}
                  </button>
                  
                  {/* Emergency Take Control Button */}
                  <button
                    onClick={handleAdminTakeControl}
                    disabled={adminLoading}
                    className="px-3 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white text-xs font-medium rounded-md transition-colors duration-200"
                  >
                    Take Control
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <main className="container mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/upload" element={<VideoUpload />} />
            <Route path="/review" element={<ClipReview />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
        {/* Session status indicator */}
        <SessionStatus />
        
        {/* Lock monitoring indicator for regular users */}
        {isSignedIn && user && !isAdmin(user.email) && lockCheckInterval && (
          <div className="fixed bottom-20 right-6 z-50 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-2 shadow-lg">
            <div className="flex items-center space-x-2 text-xs text-blue-700 dark:text-blue-300">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span>Lock monitoring active</span>
            </div>
          </div>
        )}
        

        
        {/* Dark mode toggle button (bottom right) */}
        <button
          onClick={() => setDarkMode((d) => !d)}
          className="fixed bottom-6 right-6 z-50 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 shadow-lg rounded-full p-3 flex items-center justify-center transition-colors duration-200 focus:outline-none"
          aria-label="Toggle dark mode"
        >
          {darkMode ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m8.66-8.66l-.71.71M4.05 19.07l-.71-.71M21 12h-1M4 12H3m16.95 7.07l-.71-.71M6.34 6.34l-.71-.71" /></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" /></svg>
          )}
        </button>
      </div>
    </Router>
  );
}

export default App;
