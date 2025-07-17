import { config } from '../config/environment';

// Google OAuth 2.0 Configuration
const GOOGLE_CLIENT_ID = config.google.clientId;
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets', // Read/write spreadsheets
  'https://www.googleapis.com/auth/drive',        // Full access to Drive (for shared drive uploads)
  'https://www.googleapis.com/auth/drive.file',   // Access drive files we create
  'https://www.googleapis.com/auth/userinfo.email', // Access user email
  'https://www.googleapis.com/auth/userinfo.profile' // Access user profile
];

interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture: string;
}

class GoogleAuthService {
  private gapi: any = null;
  private tokenClient: any = null;
  private isInitialized = false;
  private accessToken: string | null = null;
  private currentUser: GoogleUser | null = null;
  private signInChangeCallbacks: ((isSignedIn: boolean) => void)[] = [];
  
  // Session monitoring
  private sessionCheckInterval: NodeJS.Timeout | null = null;
  private lastActivityTime: number = Date.now();
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  private readonly ACTIVITY_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

  // Initialize Google API
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load Google API and Identity Services scripts
      await Promise.all([
        this.loadGoogleAPI(),
        this.loadGoogleIdentityServices()
      ]);
      
      // Initialize gapi client
      await new Promise((resolve) => {
        window.gapi.load('client', resolve);
      });

      // Initialize the gapi client
      await window.gapi.client.init({
        apiKey: config.google.apiKey,
        discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4']
      });

      // Initialize the OAuth token client
      this.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPES.join(' '),
        callback: (tokenResponse: any) => {
          this.accessToken = tokenResponse.access_token;
          this.handleTokenResponse(tokenResponse);
        },
      });

      this.gapi = window.gapi;
      this.isInitialized = true;
      
      console.log('Google Auth initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Google Auth:', error);
      throw new Error('Failed to initialize Google authentication');
    }
  }

  // Load Google API script dynamically
  private loadGoogleAPI(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (window.gapi) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        console.log('Google API script loaded successfully');
        resolve();
      };
      script.onerror = (error) => {
        console.error('Failed to load Google API script:', error);
        reject(new Error('Failed to load Google API'));
      };
      document.head.appendChild(script);
    });
  }

  // Load Google Identity Services script
  private loadGoogleIdentityServices(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (window.google?.accounts) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        console.log('Google Identity Services script loaded successfully');
        resolve();
      };
      script.onerror = (error) => {
        console.error('Failed to load Google Identity Services script:', error);
        reject(new Error('Failed to load Google Identity Services'));
      };
      document.head.appendChild(script);
    });
  }

  // Handle token response and get user info
  private async handleTokenResponse(tokenResponse: any): Promise<void> {
    try {
      // Set the access token for gapi client
      window.gapi.client.setToken({
        access_token: tokenResponse.access_token
      });

      // Use Google People API v1 instead of deprecated userinfo v2
      const response = await fetch(`https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses,photos`, {
        headers: {
          'Authorization': `Bearer ${tokenResponse.access_token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch user info: ${response.status} ${response.statusText}`);
      }

      const userInfo = await response.json();
      console.log('Raw user info from People API:', userInfo);

      // Extract user information from People API response
      const name = userInfo.names?.[0]?.displayName || '';
      const email = userInfo.emailAddresses?.[0]?.value || '';
      const photo = userInfo.photos?.[0]?.url || '';
      const id = userInfo.resourceName?.replace('people/', '') || '';

      this.currentUser = {
        id,
        email,
        name,
        picture: photo
      };

      console.log('User signed in:', this.currentUser);
      
      // Start session monitoring
      this.startSessionMonitoring();
      
      // Notify all callbacks about sign-in state change
      this.signInChangeCallbacks.forEach(callback => callback(true));
    } catch (error) {
      console.error('Failed to get user info:', error);
      // Even if user info fails, we still have a valid token
      this.currentUser = {
        id: 'unknown',
        email: 'unknown@example.com',
        name: 'Unknown User',
        picture: ''
      };
      
      // Still notify about successful sign-in
      this.signInChangeCallbacks.forEach(callback => callback(true));
    }
  }

  // Sign in user
  async signIn(): Promise<GoogleUser> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      if (!this.tokenClient) {
        reject(new Error('Token client not initialized'));
        return;
      }

      // Set up callback for this specific sign-in request
      this.tokenClient.callback = async (tokenResponse: any) => {
        try {
          this.accessToken = tokenResponse.access_token;
          await this.handleTokenResponse(tokenResponse);
          
          if (this.currentUser) {
            resolve(this.currentUser);
          } else {
            reject(new Error('Failed to get user information'));
          }
        } catch (error) {
          reject(error);
        }
      };

      // Request access token
      this.tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  }

  // Sign out user
  async signOut(): Promise<void> {
    try {
      if (this.accessToken) {
        // Revoke the access token
        window.google.accounts.oauth2.revoke(this.accessToken);
      }
      
      this.accessToken = null;
      this.currentUser = null;
      
      // Clear gapi client token
      if (window.gapi?.client) {
        window.gapi.client.setToken(null);
      }
      
      console.log('User signed out');
      
      // Stop session monitoring
      this.stopSessionMonitoring();
      
      // Notify all callbacks about sign-out
      this.signInChangeCallbacks.forEach(callback => callback(false));
    } catch (error) {
      console.error('Sign out failed:', error);
      throw new Error('Sign out failed');
    }
  }

  // Restore session if possible (call on app load)
  async restoreSessionIfPossible(): Promise<void> {
    await this.initialize();
    // Try to restore from gapi if available
    if (window.gapi?.auth2) {
      const auth2 = window.gapi.auth2.getAuthInstance?.();
      if (auth2 && auth2.isSignedIn.get()) {
        const googleUser = auth2.currentUser.get();
        const profile = googleUser.getBasicProfile();
        const authResponse = googleUser.getAuthResponse();
        this.accessToken = authResponse.access_token;
        this.currentUser = {
          id: profile.getId(),
          email: profile.getEmail(),
          name: profile.getName(),
          picture: profile.getImageUrl(),
        };
        console.log('[GoogleAuth] Restored session from gapi.auth2:', this.currentUser);
        this.startSessionMonitoring();
        this.signInChangeCallbacks.forEach(cb => cb(true));
        return;
      } else {
        console.log('[GoogleAuth] No gapi.auth2 session found.');
      }
    }
    // Try to restore from Google Identity Services (GIS) silently
    if (this.tokenClient) {
      let silentRestored = false;
      try {
        await new Promise<void>((resolve, reject) => {
          this.tokenClient.callback = async (tokenResponse: any) => {
            if (tokenResponse && tokenResponse.access_token) {
              this.accessToken = tokenResponse.access_token;
              await this.handleTokenResponse(tokenResponse);
              console.log('[GoogleAuth] Restored session from GIS silent token:', this.currentUser);
              this.startSessionMonitoring();
              this.signInChangeCallbacks.forEach(cb => cb(true));
              silentRestored = true;
              resolve();
            } else {
              console.log('[GoogleAuth] GIS silent token request did not return access_token.');
              resolve();
            }
          };
          // Silent request: prompt: '', auto_select: true
          this.tokenClient.requestAccessToken({ prompt: '', auto_select: true });
        });
      } catch (err) {
        console.error('[GoogleAuth] Error during GIS silent token request:', err);
      }
      if (silentRestored) return;
    } else {
      console.log('[GoogleAuth] No GIS tokenClient available for silent restore.');
    }
    // No session found
    this.accessToken = null;
    this.currentUser = null;
    this.signInChangeCallbacks.forEach(cb => cb(false));
    console.log('[GoogleAuth] No session found in gapi or GIS. User is signed out.');
    // Note: Google session is NOT stored in localStorage. All session is managed by Google cookies/tokens.
    // You can check localStorage in DevTools > Application > Local Storage, but Google does not use it for auth.
  }

  // Update isSignedIn to check for Google session if not in memory
  isSignedIn(): boolean {
    if (this.accessToken && this.currentUser) return true;
    // Try to check gapi.auth2 session
    if (window.gapi?.auth2) {
      const auth2 = window.gapi.auth2.getAuthInstance?.();
      if (auth2 && auth2.isSignedIn.get()) {
        return true;
      }
    }
    // GIS: no direct session check, so fallback to false
    return false;
  }

  // Get current user
  getCurrentUser(): GoogleUser | null {
    return this.currentUser;
  }

  // Get access token
  getAccessToken(): string | null {
    return this.accessToken;
  }

  // Check if user has Drive permissions
  async checkDrivePermissions(): Promise<boolean> {
    console.log('🔐 [GoogleAuth] Checking Drive permissions...');
    
    try {
      const accessToken = this.getAccessToken();
      if (!accessToken) {
        console.log('❌ [GoogleAuth] No access token available for Drive permission check');
        return false;
      }
      console.log('✅ [GoogleAuth] Access token available for Drive permission check');

      // Test Drive API access
      console.log('🌐 [GoogleAuth] Testing Drive API access...');
      const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      console.log('📡 [GoogleAuth] Drive API test response:', response.status, response.statusText);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ [GoogleAuth] Drive permissions confirmed:', data);
        return true;
      } else {
        const errorText = await response.text();
        console.error('❌ [GoogleAuth] Drive API test failed:', response.status, errorText);
        return false;
      }
    } catch (error) {
      console.error('❌ [GoogleAuth] Error checking Drive permissions:', error);
      return false;
    }
  }

  // Force re-authentication with Drive permissions
  async reAuthenticateWithDrive(): Promise<void> {
    console.log('🔄 [GoogleAuth] Starting re-authentication with Drive permissions...');
    
    try {
      // Clear current token
      console.log('🗑️ [GoogleAuth] Clearing current access token...');
      this.accessToken = null;
      
      // Request new token with explicit consent
      console.log('🔑 [GoogleAuth] Requesting new token with explicit consent...');
      await this.signIn();
      
      // Verify Drive access
      console.log('🔍 [GoogleAuth] Verifying Drive access after re-authentication...');
      const hasDriveAccess = await this.checkDrivePermissions();
      if (!hasDriveAccess) {
        console.error('❌ [GoogleAuth] Drive permissions still not granted after re-authentication');
        throw new Error('Drive permissions not granted. Please sign in again and grant Drive access.');
      }
      
      console.log('✅ [GoogleAuth] Re-authentication successful with Drive permissions');
    } catch (error) {
      console.error('❌ [GoogleAuth] Error re-authenticating with Drive:', error);
      throw error;
    }
  }

  // Start session monitoring
  startSessionMonitoring(): void {
    console.log('🔍 [GoogleAuth] Starting session monitoring...');
    
    // Clear any existing interval
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval);
    }
    
    // Set up activity tracking
    this.setupActivityTracking();
    
    // Start periodic session checks
    this.sessionCheckInterval = setInterval(() => {
      this.checkSessionValidity();
    }, this.ACTIVITY_CHECK_INTERVAL);
    
    console.log('✅ [GoogleAuth] Session monitoring started');
  }

  // Stop session monitoring
  stopSessionMonitoring(): void {
    console.log('🛑 [GoogleAuth] Stopping session monitoring...');
    
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval);
      this.sessionCheckInterval = null;
    }
    
    // Remove activity listeners
    this.removeActivityTracking();
    
    console.log('✅ [GoogleAuth] Session monitoring stopped');
  }

  // Setup activity tracking
  private setupActivityTracking(): void {
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    const updateActivity = () => {
      this.lastActivityTime = Date.now();
      console.log('📱 [GoogleAuth] User activity detected, session extended');
    };
    
    activityEvents.forEach(event => {
      document.addEventListener(event, updateActivity, true);
    });
    
    // Store the update function for cleanup
    (this as any)._updateActivity = updateActivity;
  }

  // Remove activity tracking
  private removeActivityTracking(): void {
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    if ((this as any)._updateActivity) {
      activityEvents.forEach(event => {
        document.removeEventListener(event, (this as any)._updateActivity, true);
      });
      delete (this as any)._updateActivity;
    }
  }

  // Check if session is still valid
  private async checkSessionValidity(): Promise<void> {
    const timeSinceLastActivity = Date.now() - this.lastActivityTime;
    
    console.log(`⏰ [GoogleAuth] Session check - Time since last activity: ${Math.round(timeSinceLastActivity / 1000)}s`);
    
    // Check for inactivity timeout
    if (timeSinceLastActivity > this.SESSION_TIMEOUT) {
      console.log('⏰ [GoogleAuth] Session timeout reached, auto-signing out...');
      await this.autoSignOut('Session expired due to inactivity');
      return;
    }
    
    // Check if Google token is still valid
    if (this.accessToken) {
      try {
        const response = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + this.accessToken);
        
        if (!response.ok) {
          console.log('❌ [GoogleAuth] Google token invalid, auto-signing out...');
          await this.autoSignOut('Google session expired');
          return;
        }
        
        console.log('✅ [GoogleAuth] Session is valid');
      } catch (error) {
        console.error('❌ [GoogleAuth] Error checking token validity:', error);
        await this.autoSignOut('Error validating session');
      }
    }
  }

  // Auto sign out with reason
  private async autoSignOut(reason: string): Promise<void> {
    console.log(`🚪 [GoogleAuth] Auto sign-out: ${reason}`);
    
    try {
      // Stop session monitoring
      this.stopSessionMonitoring();
      
      // Clear session data
      this.accessToken = null;
      this.currentUser = null;
      
      // Clear gapi client token
      if (window.gapi?.client) {
        window.gapi.client.setToken(null);
      }
      
      // Notify callbacks about sign-out
      this.signInChangeCallbacks.forEach(callback => callback(false));
      
      // Show notification to user
      this.showAutoSignOutNotification(reason);
      
      console.log('✅ [GoogleAuth] Auto sign-out completed');
    } catch (error) {
      console.error('❌ [GoogleAuth] Error during auto sign-out:', error);
    }
  }

  // Show auto sign-out notification
  private showAutoSignOutNotification(reason: string): void {
    // Create notification element
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
          <div style="font-weight: 600; margin-bottom: 4px;">Session Expired</div>
          <div style="font-size: 12px; opacity: 0.9;">${reason}</div>
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
  }

  // Update activity time (can be called manually)
  updateActivity(): void {
    this.lastActivityTime = Date.now();
  }

  // Get session status
  getSessionStatus(): {
    isActive: boolean;
    timeSinceLastActivity: number;
    sessionTimeout: number;
    isSignedIn: boolean;
  } {
    return {
      isActive: this.isSignedIn(),
      timeSinceLastActivity: Date.now() - this.lastActivityTime,
      sessionTimeout: this.SESSION_TIMEOUT,
      isSignedIn: this.isSignedIn()
    };
  }

  // Listen for sign-in state changes
  onSignInChange(callback: (isSignedIn: boolean) => void): void {
    this.signInChangeCallbacks.push(callback);
    
    // Immediately call with current state
    callback(this.isSignedIn());
  }
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

export const googleAuthService = new GoogleAuthService();
export default googleAuthService; 