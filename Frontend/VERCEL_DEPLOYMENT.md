# Frontend Deployment Guide for Vercel

## 🚀 **Deploy React Frontend on Vercel**

### **Step 1: Connect to Vercel**
1. Go to [vercel.com](https://vercel.com)
2. Sign up with GitHub account
3. Click **"New Project"**
4. Import **YashShivhare007/YT-Shorts** repository
5. Select **Frontend** as root directory
6. Choose **Vite** framework (auto-detected)

### **Step 2: Configure Build Settings**
Vercel should auto-detect:
- **Framework Preset**: Vite
- **Root Directory**: Frontend
- **Build Command**: `npm run build`
- **Output Directory**: dist
- **Install Command**: `npm install`

### **Step 3: Add Environment Variables**
In Vercel dashboard → **Settings** → **Environment Variables**, add:

| Variable | Value | Description |
|----------|-------|-------------|
| `VITE_GOOGLE_SHEETS_API_KEY` | Your Google Sheets API key | For Google Sheets integration |
| `VITE_GOOGLE_CLIENT_ID` | Your Google OAuth Client ID | For Google authentication |
| `VITE_BACKEND_URL` | `https://yt-shorts-production-0c9a.up.railway.app` | Railway backend URL |
| `VITE_N8N_WEBHOOK_URL` | Your N8N webhook URL | For workflow integration |

### **Step 4: Get Google API Credentials**

#### **Google Sheets API Key:**
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Enable **Google Sheets API**
3. Create **API Key** in Credentials
4. Restrict to Google Sheets API

#### **Google OAuth Client ID:**
1. In Google Cloud Console → **Credentials**
2. Create **OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Authorized origins: Add your Vercel domain
5. Copy the Client ID

### **Step 5: Deploy**
1. Click **"Deploy"**
2. Vercel will build and deploy automatically
3. Get your live URL: `https://your-app.vercel.app`

## 🔧 **Configuration Files**

### **vercel.json**
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

### **Environment Variables in Code**
```typescript
// Frontend/src/config/environment.ts
export const config = {
  backend: {
    baseUrl: 'https://yt-shorts-production-0c9a.up.railway.app'
  },
  google: {
    clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    apiKey: import.meta.env.VITE_GOOGLE_SHEETS_API_KEY
  }
};
```

## 🎯 **Features Available**

Once deployed, your frontend will have:
- ✅ **Dashboard** for video management
- ✅ **Video Upload** interface
- ✅ **Google Sheets** integration
- ✅ **Analytics** dashboard
- ✅ **Settings** configuration
- ✅ **Clip Review** interface
- ✅ **Real-time status** tracking

## 🔗 **Backend Integration**

The frontend will connect to:
- **Backend API**: `https://yt-shorts-production-0c9a.up.railway.app`
- **N8N Workflow**: Your existing N8N webhook
- **Google Sheets**: For data storage
- **Google Drive**: For file management

## 🚨 **Important Notes**

1. **Environment Variables**: Must be set in Vercel dashboard
2. **Google APIs**: Need to be enabled and configured
3. **CORS**: Backend already configured for frontend access
4. **Domain**: Add Vercel domain to Google OAuth settings

## 🎉 **Ready to Deploy!**

Your React frontend is now ready for Vercel deployment! 