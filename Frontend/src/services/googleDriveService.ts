import { config } from '../config/environment';
import googleAuthService from './googleAuth';

interface DriveFile {
  id: string;
  name: string;
  webViewLink: string;
  size: number;
  mimeType: string;
}

interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

class GoogleDriveService {
  private gapi: any = null;

  // Initialize the service
  private async initialize(): Promise<void> {
    console.log('🔧 [GoogleDriveService] Starting initialization...');
    
    // Check environment variables
    console.log('📋 [GoogleDriveService] Checking environment variables...');
    console.log('  - VITE_GOOGLE_DRIVE_FOLDER_ID:', config.googleDrive.folderId);
    console.log('  - VITE_GOOGLE_CLIENT_ID:', config.google.clientId ? '✅ Set' : '❌ Missing');
    console.log('  - VITE_GOOGLE_SHEETS_API_KEY:', config.google.apiKey ? '✅ Set' : '❌ Missing');
    
    if (!googleAuthService.isSignedIn()) {
      console.error('❌ [GoogleDriveService] User not signed in');
      throw new Error('User not signed in. Please sign in first.');
    }
    console.log('✅ [GoogleDriveService] User is signed in');

    // Check Drive permissions
    console.log('🔐 [GoogleDriveService] Checking Drive permissions...');
    const hasDriveAccess = await googleAuthService.checkDrivePermissions();
    console.log('  - Drive permissions:', hasDriveAccess ? '✅ Granted' : '❌ Not granted');
    
    if (!hasDriveAccess) {
      console.warn('⚠️ [GoogleDriveService] Drive permissions not detected. Attempting to re-authenticate...');
      try {
        await googleAuthService.reAuthenticateWithDrive();
        console.log('✅ [GoogleDriveService] Re-authentication successful');
      } catch (error) {
        console.error('❌ [GoogleDriveService] Re-authentication failed:', error);
        throw new Error('Drive access not granted. Please sign in again and ensure you grant Drive permissions.');
      }
    }

    this.gapi = window.gapi;
    console.log('✅ [GoogleDriveService] GAPI initialized');
    
    // Ensure the access token is set for gapi client
    const accessToken = googleAuthService.getAccessToken();
    if (accessToken) {
      console.log('✅ [GoogleDriveService] Access token available');
      this.gapi.client.setToken({
        access_token: accessToken
      });
    } else {
      console.error('❌ [GoogleDriveService] No access token available');
      throw new Error('No access token available');
    }
    
    console.log('✅ [GoogleDriveService] Initialization complete');
  }

  // Make authenticated API request using fetch with OAuth token
  private async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<any> {
    console.log('🌐 [GoogleDriveService] Making authenticated request to:', url);
    
    const accessToken = googleAuthService.getAccessToken();
    if (!accessToken) {
      console.error('❌ [GoogleDriveService] No access token available for request');
      throw new Error('No access token available. Please sign in again.');
    }
    console.log('✅ [GoogleDriveService] Access token available for request');

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        ...options.headers,
      },
    });

    console.log('📡 [GoogleDriveService] Response status:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [GoogleDriveService] API request failed:', response.status, errorText);
      throw new Error(`Drive API request failed: ${response.status} ${response.statusText}`);
    }

    console.log('✅ [GoogleDriveService] API request successful');
    return response.json();
  }

  // Upload a single file to Google Drive
  async uploadFile(file: File, onProgress?: (progress: UploadProgress) => void): Promise<DriveFile> {
    console.log('🚀 [GoogleDriveService] Starting file upload process...');
    console.log('  - File name:', file.name);
    console.log('  - File size:', file.size, 'bytes');
    console.log('  - File type:', file.type);
    
    await this.initialize();

    try {
      // Get the folder ID from config
      const folderId = config.googleDrive.folderId;
      console.log('📁 [GoogleDriveService] Target folder ID:', folderId);
      
      if (!folderId) {
        console.error('❌ [GoogleDriveService] Folder ID not set in environment variables');
        throw new Error('VITE_GOOGLE_DRIVE_FOLDER_ID environment variable not set');
      }

      // Step 1: Create file metadata
      console.log('📝 [GoogleDriveService] Creating file metadata...');
      const metadata = {
        name: file.name,
        mimeType: file.type,
        parents: [folderId] // Upload to specified shared drive folder
      };
      console.log('  - Metadata:', metadata);

      console.log('🔄 [GoogleDriveService] Starting resumable upload process...');

      // Step 2: Create the file with resumable upload
      console.log('📤 [GoogleDriveService] Step 1: Creating resumable upload session...');
      
      // Add supportsAllDrives parameter for Shared Drive support
      const createUrl = new URL('https://www.googleapis.com/upload/drive/v3/files');
      createUrl.searchParams.set('uploadType', 'resumable');
      createUrl.searchParams.set('supportsAllDrives', 'true');
      
      const createResponse = await fetch(createUrl.toString(), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${googleAuthService.getAccessToken()}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': file.type,
          'X-Upload-Content-Length': file.size.toString()
        },
        body: JSON.stringify(metadata)
      });

      console.log('📡 [GoogleDriveService] Create response status:', createResponse.status, createResponse.statusText);

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error('❌ [GoogleDriveService] Failed to create file:', createResponse.status, errorText);
        throw new Error(`Failed to create file: ${createResponse.status} ${createResponse.statusText}`);
      }

      const uploadUrl = createResponse.headers.get('Location');
      console.log('📍 [GoogleDriveService] Upload URL received:', uploadUrl ? '✅ Yes' : '❌ No');
      
      if (!uploadUrl) {
        console.error('❌ [GoogleDriveService] No upload URL received from Google Drive');
        throw new Error('No upload URL received from Google Drive');
      }

      console.log('📤 [GoogleDriveService] Step 2: Uploading file content...');
      console.log('  - Upload URL:', uploadUrl);
      console.log('  - File size:', file.size, 'bytes');

      // Step 3: Upload the file content
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
          'Content-Length': file.size.toString()
        },
        body: file
      });

      console.log('📡 [GoogleDriveService] Upload response status:', uploadResponse.status, uploadResponse.statusText);

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error('❌ [GoogleDriveService] Failed to upload file content:', uploadResponse.status, errorText);
        throw new Error(`Failed to upload file content: ${uploadResponse.status} ${uploadResponse.statusText}`);
      }

      const fileData = await uploadResponse.json();
      console.log('✅ [GoogleDriveService] File uploaded successfully!');
      console.log('  - File ID:', fileData.id);
      console.log('  - File name:', fileData.name);
      console.log('  - Raw webViewLink from API:', fileData.webViewLink);
      console.log('  - File size:', fileData.size, 'bytes');
      console.log('  - Full file data:', fileData);

      // Step 4: Set sharing permissions to "anyone with link can access"
      console.log('🔗 [GoogleDriveService] Setting sharing permissions...');
      await this.setFileSharing(fileData.id);

      // Construct the sharing URL for Google Drive
      const webViewLink = `https://drive.google.com/file/d/${fileData.id}/view`;
      
      const result = {
        id: fileData.id,
        name: fileData.name,
        webViewLink: webViewLink,
        size: parseInt(fileData.size || '0'),
        mimeType: fileData.mimeType
      };
      
      console.log('🎉 [GoogleDriveService] Upload process completed successfully!');
      console.log('  - Final result:', result);
      
      return result;

    } catch (error) {
      console.error('❌ [GoogleDriveService] Error uploading file to Drive:', error);
      throw new Error(`Failed to upload file to Google Drive: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Set file sharing permissions to "anyone with link can access"
  private async setFileSharing(fileId: string): Promise<void> {
    console.log('🔗 [GoogleDriveService] Setting sharing permissions for file:', fileId);
    
    try {
      // Create a permission for "anyone" with "reader" role
      const permission = {
        type: 'anyone',
        role: 'reader'
      };
      console.log('  - Permission settings:', permission);

      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${googleAuthService.getAccessToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(permission)
      });

      console.log('📡 [GoogleDriveService] Sharing response status:', response.status, response.statusText);

      if (response.ok) {
        console.log('✅ [GoogleDriveService] Sharing permissions set successfully for file:', fileId);
      } else {
        const errorText = await response.text();
        console.warn('⚠️ [GoogleDriveService] Failed to set sharing permissions:', response.status, errorText);
      }
    } catch (error) {
      console.error('❌ [GoogleDriveService] Error setting file sharing permissions:', error);
      // Don't throw error here as the file was uploaded successfully
      // Just log the warning
    }
  }

  // Upload multiple files to Google Drive
  async uploadFiles(files: File[], onProgress?: (progress: UploadProgress) => void): Promise<DriveFile[]> {
    console.log('📦 [GoogleDriveService] Starting multiple file upload...');
    console.log('  - Number of files:', files.length);
    console.log('  - Files:', files.map(f => `${f.name} (${f.size} bytes)`));
    
    const results: DriveFile[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(`📤 [GoogleDriveService] Uploading file ${i + 1}/${files.length}: ${file.name}`);
      
      try {
        const result = await this.uploadFile(file, onProgress);
        results.push(result);
        console.log(`✅ [GoogleDriveService] File ${i + 1} uploaded successfully: ${file.name}`);
        
        // Update progress for multiple files
        if (onProgress) {
          onProgress({
            loaded: i + 1,
            total: files.length,
            percentage: ((i + 1) / files.length) * 100
          });
        }
      } catch (error) {
        console.error(`❌ [GoogleDriveService] Failed to upload file ${file.name}:`, error);
        throw error;
      }
    }
    
    console.log('🎉 [GoogleDriveService] All files uploaded successfully!');
    console.log('  - Total files uploaded:', results.length);
    console.log('  - Results:', results);
    
    return results;
  }

  // Get file info by ID
  async getFileInfo(fileId: string): Promise<DriveFile> {
    console.log('📋 [GoogleDriveService] Getting file info for ID:', fileId);
    
    await this.initialize();

    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,webViewLink,size,mimeType&supportsAllDrives=true`, {
        headers: {
          'Authorization': `Bearer ${googleAuthService.getAccessToken()}`
        }
      });

      console.log('📡 [GoogleDriveService] File info response status:', response.status, response.statusText);

      if (!response.ok) {
        console.error('❌ [GoogleDriveService] Failed to get file info:', response.status, response.statusText);
        throw new Error(`Failed to get file info: ${response.status} ${response.statusText}`);
      }

      const fileData = await response.json();
      console.log('✅ [GoogleDriveService] File info retrieved successfully:', fileData);
      
      return {
        id: fileData.id,
        name: fileData.name,
        webViewLink: fileData.webViewLink,
        size: parseInt(fileData.size || '0'),
        mimeType: fileData.mimeType
      };
    } catch (error) {
      console.error('❌ [GoogleDriveService] Error getting file info:', error);
      throw new Error(`Failed to get file info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Delete a file from Google Drive
  async deleteFile(fileId: string): Promise<void> {
    console.log('🗑️ [GoogleDriveService] Deleting file with ID:', fileId);
    
    await this.initialize();

    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${googleAuthService.getAccessToken()}`
        }
      });

      console.log('📡 [GoogleDriveService] Delete response status:', response.status, response.statusText);

      if (!response.ok) {
        console.error('❌ [GoogleDriveService] Failed to delete file:', response.status, response.statusText);
        throw new Error(`Failed to delete file: ${response.status} ${response.statusText}`);
      }

      console.log('✅ [GoogleDriveService] File deleted successfully:', fileId);
    } catch (error) {
      console.error('❌ [GoogleDriveService] Error deleting file:', error);
      throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export default new GoogleDriveService(); 