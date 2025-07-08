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
  n8n: {
    webhookUrl: import.meta.env.VITE_N8N_WEBHOOK_URL || 'https://godfather-22.app.n8n.cloud/webhook/196513a7-6d40-441e-a316-dffcd34c3e85'
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

  // Optional: warn about n8n webhook URL
  if (!import.meta.env.VITE_N8N_WEBHOOK_URL) {
    console.warn('VITE_N8N_WEBHOOK_URL not set, using default URL');
  }
  
  return missing.length === 0;
}; 