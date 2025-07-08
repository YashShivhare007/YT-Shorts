# Backend Deployment Guide for Render

## Prerequisites

1. **Render Account**: Sign up at [render.com](https://render.com)
2. **API Keys**: You'll need:
   - **AssemblyAI API Key** (for Hindi transcription)
   - **Google Service Account JSON** (for Google Drive access)
   
   **Note**: OpenAI API is NOT needed - all AI processing happens in N8N workflow!

## Google Service Account Setup (CRITICAL!)

### Step 1: Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing one
3. Enable these APIs:
   - Google Drive API
   - Google Sheets API (if using sheets)

### Step 2: Create Service Account
1. Go to **IAM & Admin** > **Service Accounts**
2. Click **Create Service Account**
3. Enter name: `yt-shorts-service`
4. Click **Create and Continue**
5. Skip role assignment for now
6. Click **Done**

### Step 3: Generate JSON Key
1. Click on the service account email
2. Go to **Keys** tab
3. Click **Add Key** > **Create New Key**
4. Select **JSON** format
5. Click **Create** - this downloads the JSON file

### Step 4: Share Google Drive Folder (Important!)
For the service account to access Google Drive:
1. Create a folder in Google Drive for video storage
2. Right-click folder > **Share**
3. Add the service account email (from JSON file: `client_email`)
4. Give it **Editor** permissions
5. Click **Send**

## Deployment Steps

### 1. Connect Repository
1. Go to Render Dashboard
2. Click "New" → "Web Service"
3. Connect your GitHub repository
4. Select this repository and the `Backend` directory

### 2. Configure Service Settings
- **Name**: `yt-shorts-backend`
- **Environment**: `Python 3`
- **Build Command**: 
  ```bash
  apt-get update && apt-get install -y ffmpeg && pip install --upgrade pip && pip install -r requirements.txt
  ```
- **Start Command**: 
  ```bash
  gunicorn --bind 0.0.0.0:$PORT backed_api:app --workers 2 --timeout 300
  ```

### 3. Set Environment Variables
Add these environment variables in Render dashboard:

| Variable | Value | Description |
|----------|-------|-------------|
| `ASSEMBLYAI_API_KEY` | Your AssemblyAI API key | For Hindi transcription |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full JSON content | Service account credentials |
| `FLASK_ENV` | `production` | Flask environment |
| `FLASK_APP` | `backed_api.py` | Flask app entry point |
| `PYTHON_VERSION` | `3.11.0` | Python version |

**IMPORTANT**: For `GOOGLE_SERVICE_ACCOUNT_JSON`, copy the ENTIRE content of the downloaded JSON file. It should look like:
```json
{"type":"service_account","project_id":"your-project-123","private_key_id":"abc123...","private_key":"-----BEGIN PRIVATE KEY-----\nMIIE...","client_email":"yt-shorts-service@your-project-123.iam.gserviceaccount.com",...}
```

### 4. Configure Persistent Storage
1. Add a disk for video processing:
   - **Name**: `yt-shorts-disk`
   - **Mount Path**: `/opt/render/project/src/temp_videos`
   - **Size**: 10GB

### 5. Deploy
1. Click "Create Web Service"
2. Wait for deployment to complete
3. Test the health endpoint: `https://your-app.onrender.com/health`

## Post-Deployment Testing

### Test Endpoints
```bash
# Health check
curl https://your-app.onrender.com/health

# List endpoints
curl https://your-app.onrender.com/endpoints

# Test transcript generation (replace with actual Google Drive URL)
curl -X POST https://your-app.onrender.com/generate-transcript \
  -H "Content-Type: application/json" \
  -d '{"drive_url": "https://drive.google.com/file/d/YOUR_FILE_ID/view", "VideoId": "test_123"}'
```

### Monitor Logs
1. Go to Render Dashboard
2. Select your service
3. Click "Logs" tab to monitor application logs

## Troubleshooting

### Common Issues

1. **Google Drive Authentication Error**:
   - Verify service account JSON is correctly formatted
   - Ensure the service account email has access to Drive folders
   - Check that Google Drive API is enabled in Google Cloud Console

2. **AssemblyAI Errors**: 
   - Verify API key is correct
   - Check your AssemblyAI account has sufficient credits

3. **FFmpeg not found**: 
   - Ensure build command includes `apt-get install -y ffmpeg`

4. **Port binding error**: 
   - Render automatically sets the PORT environment variable

5. **File permissions**: 
   - Service account needs access to specific Google Drive folders

### Google Drive Permissions
If you get "File not found" errors:
1. Make sure files are shared with service account email
2. Or make files "Anyone with the link" can view
3. Service account needs access to both source and destination folders

## Security Notes

- Never commit service account JSON to repository
- Use Render's environment variables for all sensitive data
- Service account has limited permissions (only what you grant)
- Monitor Google Cloud Console for unexpected usage

## Required API Keys Summary

You need exactly TWO things:
1. **AssemblyAI API Key** - Get from [AssemblyAI Dashboard](https://www.assemblyai.com/)
2. **Google Service Account JSON** - Created in Google Cloud Console

**You do NOT need**:
- OpenAI API Key (AI processing happens in N8N)
- MongoDB credentials (optional, only if using external DB)

## Scaling Considerations

- **Workers**: Start with 2, increase based on load
- **Timeout**: 300 seconds for large video processing
- **Memory**: Upgrade plan if processing large files (>500MB)
- **Storage**: Monitor disk usage, 10GB should handle ~50 videos

## Next Steps

After successful deployment:
1. Update your N8N workflow with the new backend URL
2. Test the complete pipeline end-to-end
3. Monitor logs for any errors
4. Set up monitoring/alerting for production use 