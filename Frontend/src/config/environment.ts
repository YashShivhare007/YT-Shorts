// Environment configuration
export const config = {
  googleSheets: {
    apiKey: import.meta.env.VITE_GOOGLE_SHEETS_API_KEY,
    sheetId: '16QpFaWxYfBPDNephKhUDKlAw-t7PWW3s7cwec054BBs',
    sheetName: 'Sheet1'
  },
  google: {
    clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    apiKey: import.meta.env.VITE_GOOGLE_SHEETS_API_KEY
  },
  backend: {
    baseUrl: import.meta.env.VITE_BACKEND_URL || 'https://yt-shorts-production-0c9a.up.railway.app'
  },
  n8n: {
    webhookUrl: import.meta.env.VITE_N8N_WEBHOOK_URL || 'https://godfather-22.app.n8n.cloud/webhook/196513a7-6d40-441e-a316-dffcd34c3e85'
  },
  googleDrive: {
    serviceAccountJson: import.meta.env.VITE_SERVICE_ACCOUNT_JSON,
    folderId: import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID || '0ADbTlDmolBN6Uk9PVA'
  }
};

// Validate required environment variables
export const validateEnvironment = () => {
  const required = [
    'VITE_GOOGLE_SHEETS_API_KEY',
    'VITE_GOOGLE_CLIENT_ID'
  ];

  const missing = required.filter(key => !import.meta.env[key]);
  
  if (missing.length > 0) {
    console.warn('Missing environment variables:', missing);
    console.warn('Please add them to your .env file');
  }

  // Optional: warn about optional variables
  if (!import.meta.env.VITE_N8N_WEBHOOK_URL) {
    console.warn('VITE_N8N_WEBHOOK_URL not set, using default URL');
  }
  
  if (!import.meta.env.VITE_BACKEND_URL) {
    console.warn('VITE_BACKEND_URL not set, using default Railway URL');
  }

  // Check for Google Drive service account variables
  if (!import.meta.env.VITE_SERVICE_ACCOUNT_JSON) {
    console.warn('VITE_SERVICE_ACCOUNT_JSON not set - Google Drive uploads will not work');
  }
  
  if (!import.meta.env.VITE_GOOGLE_DRIVE_FOLDER_ID) {
    console.warn('VITE_GOOGLE_DRIVE_FOLDER_ID not set, using default folder ID');
  }
  
  return missing.length === 0;
}; 