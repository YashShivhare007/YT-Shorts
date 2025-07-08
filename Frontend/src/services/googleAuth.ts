import { config } from '../config/environment';

// Google OAuth 2.0 Configuration
const GOOGLE_CLIENT_ID = config.google.clientId;
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets', // Read/write spreadsheets
  'https://www.googleapis.com/auth/drive.file',    // Access drive files we create
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
      
      // Notify all callbacks about sign-out
      this.signInChangeCallbacks.forEach(callback => callback(false));
    } catch (error) {
      console.error('Sign out failed:', error);
      throw new Error('Sign out failed');
    }
  }

  // Check if user is signed in
  isSignedIn(): boolean {
    return this.accessToken !== null && this.currentUser !== null;
  }

  // Get current user
  getCurrentUser(): GoogleUser | null {
    return this.currentUser;
  }

  // Get access token for API calls
  getAccessToken(): string | null {
    return this.accessToken;
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