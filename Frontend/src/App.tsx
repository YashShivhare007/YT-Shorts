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
  }, []);

  // Global lock check
  useEffect(() => {
    const checkLock = async () => {
      if (isSignedIn && user) {
        try {
          const lockValue = await googleSheetsOAuthService.getLockValue();
          console.log('[App] Lock value (Sheet2!A2):', lockValue, 'Current user:', user.email);
          if (lockValue && lockValue !== user.email) {
            setLockEmail(lockValue);
            setLockModalOpen(true);
            console.log('[App] Lock held by another user:', lockValue);
          } else {
            setLockModalOpen(false);
            setLockEmail(null);
            console.log('[App] Lock is free or owned by current user');
          }
        } catch (err) {
          console.error('[App] Error checking lock:', err);
        }
      } else {
        setLockModalOpen(false);
        setLockEmail(null);
      }
    };
    checkLock();
  }, [isSignedIn, user]);

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
    setLoading(true);
    try {
      const currentUser = googleAuthService.getCurrentUser() as GoogleUser | null;
      const lockValue = await googleSheetsOAuthService.getLockValue();
      console.log('[App] Retry lock. Lock value:', lockValue, 'Current user:', currentUser?.email);
      if (!lockValue || (currentUser && lockValue === currentUser.email)) {
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
    } catch (err) {
      console.error('[App] Error retrying lock:', err);
    } finally {
      setLoading(false);
    }
  };

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
          <button onClick={handleRetryLock} disabled={loading} style={{ marginTop: 24, padding: '8px 24px', borderRadius: 4, background: '#2563eb', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
            {loading ? 'Checking...' : 'Retry'}
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
      <div className="min-h-screen bg-gray-50">
        {/* Pass handleGlobalSignOut to GoogleSignIn via Navbar */}
        <Navbar handleSignOut={handleGlobalSignOut} />
        <main className="container mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/upload" element={<VideoUpload />} />
            <Route path="/review" element={<ClipReview />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
