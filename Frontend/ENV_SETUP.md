# Environment Variables Setup

Create a `.env` file in the `Frontend` directory with the following content:

```bash
# Google OAuth Configuration
VITE_GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
VITE_GOOGLE_SHEETS_API_KEY=your_google_sheets_api_key

# n8n Webhook Configuration
VITE_N8N_WEBHOOK_URL=https://godfather-22.app.n8n.cloud/webhook/196513a7-6d40-441e-a316-dffcd34c3e85
```

## How to get your credentials:

### Google OAuth Client ID:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to "Credentials" → "OAuth 2.0 Client IDs"
3. Copy your Client ID (ends with `.apps.googleusercontent.com`)

### Google Sheets API Key:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to "Credentials" → "API Keys"
3. Copy your API Key (starts with `AIza`)

### n8n Webhook URL:
The webhook URL is already configured based on your n8n workflow. The URL format is:
`https://godfather2002.app.n8n.cloud/webhook-test/trigger-video-processing`

## Important Notes:

1. **Remove quotes**: Don't wrap values in quotes in the .env file
2. **No spaces**: Don't add spaces around the `=` sign
3. **Restart dev server**: After creating/updating .env, restart your development server

## Example .env file:
```
VITE_GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
VITE_GOOGLE_SHEETS_API_KEY=AIzaSyABC123DEF456
VITE_N8N_WEBHOOK_URL=https://godfather2002.app.n8n.cloud/webhook-test/trigger-video-processing
```

After setting up the .env file, run:
```bash
npm run dev
``` 