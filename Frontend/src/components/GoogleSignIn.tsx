import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { LogIn, LogOut, Shield } from 'lucide-react';
import { googleAuthService } from '../services/googleAuth';
import googleSheetsOAuthService from '../services/googleSheetsOAuth';
// REMOVE: import Modal from './Modal';

interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture: string;
}

export interface GoogleSignInProps {
  onSignInChange?: (signedIn: boolean, user?: GoogleUser) => void;
  handleSignOut: () => void;
}

const GoogleSignIn = ({ onSignInChange, handleSignOut }: GoogleSignInProps) => {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [lockModalOpen, setLockModalOpen] = useState(false);
  const [lockEmail, setLockEmail] = useState<string | null>(null);
  useEffect(() => {
    // Check the lock whenever the user or sign-in state changes
    const checkLock = async () => {
      if (isSignedIn && user) {
        try {
          const lockValue = await googleSheetsOAuthService.getLockValue();
          if (lockValue && lockValue !== user.email) {
            setLockEmail(lockValue);
            setLockModalOpen(true);
          } else {
            setLockModalOpen(false);
            setLockEmail(null);
          }
        } catch (err) {
          // Optionally handle error
        }
      } else {
        setLockModalOpen(false);
        setLockEmail(null);
      }
    };
    checkLock();
  }, [isSignedIn, user]);
  useEffect(() => {
    // Initialize Google Auth and check sign-in status
    const initializeAuth = async () => {
      try {
        await googleAuthService.initialize();
        setAuthInitialized(true);
        
        const signedIn = googleAuthService.isSignedIn();
        setIsSignedIn(signedIn);
        
        if (signedIn) {
          const currentUser = googleAuthService.getCurrentUser();
          setUser(currentUser);
          onSignInChange?.(signedIn, currentUser || undefined);
        }

        // Listen for sign-in state changes
        googleAuthService.onSignInChange((signedIn) => {
          console.log('GoogleSignIn: Auth state changed:', signedIn);
          setIsSignedIn(signedIn);
          const currentUser = signedIn ? googleAuthService.getCurrentUser() : null;
          setUser(currentUser);
          onSignInChange?.(signedIn, currentUser || undefined);
        });
      } catch (err) {
        console.error('Failed to initialize Google Auth:', err);
        setError('Failed to initialize Google authentication');
      }
    };

    initializeAuth();
  }, [onSignInChange]);

  // Enhanced sign-in: Google OAuth first, then lock check
  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const signedInUser = await googleAuthService.signIn();
      setUser(signedInUser);
      setIsSignedIn(true);
      onSignInChange?.(true, signedInUser);
      // Now check the lock
      const lockValue = await googleSheetsOAuthService.getLockValue();
      if (lockValue && lockValue !== signedInUser.email) {
        setLockEmail(lockValue);
        setLockModalOpen(true);
      } else {
        // Always set/renew the lock for the current user
        await googleSheetsOAuthService.setLockValue(signedInUser.email);
        setLockModalOpen(false);
        setLockEmail(null);
      }
    } catch (err) {
      console.error('Sign in failed:', err);
      setError('Failed to sign in. Please try again.');
      setIsSignedIn(false);
      setUser(null);
      onSignInChange?.(false, undefined);
    } finally {
      setLoading(false);
    }
  };

  // Retry button for lock modal
  const handleRetryLock = async () => {
    setLoading(true);
    try {
      const signedInUser = googleAuthService.getCurrentUser();
      const lockValue = await googleSheetsOAuthService.getLockValue();
      if (!lockValue || (signedInUser && lockValue === signedInUser.email)) {
        // Lock is now free or owned by this user
        if (!lockValue && signedInUser) {
          await googleSheetsOAuthService.setLockValue(signedInUser.email);
        }
        setLockModalOpen(false);
        setLockEmail(null);
      } else {
        setLockEmail(lockValue);
        setLockModalOpen(true);
      }
    } catch (err) {
      setError('Failed to check lock. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Show loading state while initializing
  if (!authInitialized) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center space-x-2 px-4 py-2"
      >
        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-600">Initializing...</span>
      </motion.div>
    );
  }

  // Always show sign-in button, even with errors
  if (error && !isSignedIn) {
    return (
      <motion.button
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={handleSignIn}
        disabled={loading}
        className="flex items-center space-x-2 px-4 py-2 bg-red-50 border border-red-300 rounded-lg shadow-sm hover:bg-red-100 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        title={error}
      >
        {loading ? (
          <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
        ) : (
          <Shield className="w-4 h-4 text-red-600" />
        )}
        <span className="text-sm font-medium text-red-700">
          {loading ? 'Retrying...' : 'Retry Sign In'}
        </span>
      </motion.button>
    );
  }

  if (isSignedIn && user) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center space-x-3"
      >
        <div className="flex items-center space-x-2">
          {user.picture && (
            <img
              src={user.picture}
              alt={user.name}
              className="w-8 h-8 rounded-full"
            />
          )}
          <div className="hidden md:block">
            <p className="text-sm font-medium text-gray-900">{user.name}</p>
            <p className="text-xs text-gray-500">{user.email}</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          disabled={loading}
          className="flex items-center space-x-1 px-3 py-1 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-200 disabled:opacity-50"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      </motion.div>
    );
  }
  
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
        </div>
      </div>
    );
  }

  return (
    <>
      <motion.button
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={handleSignIn}
        disabled={loading}
        className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        ) : (
          <LogIn className="w-4 h-4 text-gray-600" />
        )}
        <span className="text-sm font-medium text-gray-700">
          {loading ? 'Signing in...' : 'Sign in with Google'}
        </span>
      </motion.button>
    </>
  );
};

export default GoogleSignIn; 