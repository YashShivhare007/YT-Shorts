# Frontend Setup Guide

## 🔧 Environment Configuration

### 1. Create Environment File
Create a `.env` file in the Frontend directory with the following content:

```bash
# Google OAuth 2.0 Configuration
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com
VITE_GOOGLE_SHEETS_API_KEY=your_google_api_key_here
```

### 2. Setup Google Cloud Console

#### Step 1: Create/Select Project
1. **Go to Google Cloud Console**: https://console.cloud.google.com/
2. **Create or select a project**

#### Step 2: Enable APIs
1. **Go to "APIs & Services" > "Library"**
2. **Enable these APIs**:
   - Google Sheets API
   - Google Drive API (for file access)

#### Step 3: Create OAuth 2.0 Credentials
1. **Go to "APIs & Services" > "Credentials"**
2. **Click "Create Credentials" > "OAuth client ID"**
3. **Configure OAuth consent screen** (if prompted):
   - Choose "External" user type
   - Fill in app name: "AI Shorts Generator"
   - Add your email as developer contact
   - Add scopes: `../auth/spreadsheets` and `../auth/drive.file`
4. **Create OAuth client ID**:
   - Application type: "Web application"
   - Name: "AI Shorts Generator Frontend"
   - Authorized JavaScript origins: 
     - `http://localhost:5173` (for development)
     - Your production domain (when deploying)
5. **Copy the Client ID** (ends with `.apps.googleusercontent.com`)

#### Step 4: Create API Key
1. **Click "Create Credentials" > "API Key"**
2. **Restrict the API Key** (recommended):
   - Under "API restrictions", select "Restrict key"
   - Choose "Google Sheets API" and "Google Drive API"
   - Under "Website restrictions", add your domains

### 3. Configure Google Sheets Access

The sheet ID is already configured in the code:
- **Sheet ID**: `1W_mu1gQVLpOmYbZPWk0gJ7x412Abgl3UAh1xuwHJGbE`
- **Sheet Name**: `Sheet1`

Make sure your Google Sheet has the following columns (A-M):
- A: Video Link
- B: VideoId  
- C: Transcript
- D: Status
- E: Clip ID
- F: Start
- G: End
- H: Text
- I: Category
- J: Reason
- K: Editor Justification
- L: Drive Link
- M: Confidence

### 4. Sheet Access (OAuth vs Public)

**With OAuth (Recommended):**
- Users sign in with their Google account
- Can access their own private sheets
- More secure - no need to make sheets public

**Alternative (Public Sheet):**
- Make sheet "Anyone with the link can view"
- Less secure but simpler for testing

For OAuth setup, ensure the user who signs in has access to the target sheet.

## 🚀 Running the Application

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start development server**:
   ```bash
   npm run dev
   ```

3. **Open in browser**: http://localhost:5173

## 📋 Features

### Upload Page (`/upload`)
- Paste multiple YouTube or Google Drive URLs
- Real-time URL validation
- Bulk upload to Google Sheets
- Triggers n8n workflow automatically

### Dashboard (`/`)
- Real-time processing status
- Recent activity feed
- Completed clips preview
- Quick action buttons

### Review Page (`/review`)
- View all completed clips
- Direct links to Google Drive
- Clip metadata and confidence scores

### Analytics Page (`/analytics`)
- Processing statistics
- Performance metrics
- Trend analysis

## 🔄 Integration Flow

1. **User uploads URLs** → Frontend validates and sends to Google Sheets
2. **Google Sheets updated** → n8n "Watch New Links" trigger activates
3. **n8n processes videos** → Complete pipeline runs automatically
4. **Results updated** → Google Sheets populated with clips and drive links
5. **Frontend displays results** → Real-time updates every 30 seconds

## 🛠️ Troubleshooting

### API Key Issues
- Ensure the API key has Google Sheets API enabled
- Check if the key is properly restricted
- Verify the sheet is publicly accessible

### CORS Issues
- Google Sheets API should work from localhost
- For production, add your domain to API key restrictions

### Data Not Loading
- Check browser console for errors
- Verify sheet ID and structure
- Ensure sheet has proper column headers

## 📊 Google Sheets Structure

Your sheet should look like this:

| A (Video Link) | B (VideoId) | C (Transcript) | D (Status) | E (Clip ID) | F (Start) | G (End) | H (Text) | I (Category) | J (Reason) | K (Editor Justification) | L (Drive Link) | M (Confidence) |
|----------------|-------------|----------------|------------|-------------|-----------|---------|----------|--------------|------------|-------------------------|----------------|----------------|
| https://... | 46CaYBwEp_k | View Transcript | Analysis complete | 46CaYBwEp_k-0 | 00:03:44 | 00:04:21 | ... | Funny Story | ... | ... | https://drive.google.com/... | 0.98 |

The frontend will automatically read from this structure and display the data in a beautiful, modern interface. 