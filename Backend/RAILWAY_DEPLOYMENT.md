# Railway.app Deployment Guide

## 🚂 **Why Railway.app is Perfect for Your Backend**

✅ **$5 FREE credit** (1+ months of free usage)  
✅ **True system package support** (FFmpeg, yt-dlp)  
✅ **Better reliability** than Fly.io  
✅ **Simpler deployment process**  
✅ **Only $5/month** after free credit  
✅ **Persistent storage** included  
✅ **No cold start issues**  

---

## 📋 **Prerequisites**

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **GitHub Repository**: Your code should be pushed to GitHub
3. **API Keys**: 
   - AssemblyAI API Key
   - Google Service Account JSON

---

## 🚀 **Step-by-Step Deployment**

### **Step 1: Sign Up & Connect GitHub**
1. Go to [railway.app](https://railway.app)
2. Click **"Start a New Project"**
3. Connect your GitHub account
4. Select your **YT-Shorts** repository
5. Choose the **V1** branch

### **Step 2: Configure Project**
1. **Root Directory**: Set to `Backend`
2. **Environment**: Railway auto-detects Python
3. **Build Command**: Auto-configured via `nixpacks.toml`
4. **Start Command**: Auto-configured via `railway.toml`

### **Step 3: Add Environment Variables**
In Railway dashboard, go to **Variables** tab and add:

| Variable | Value | Description |
|----------|-------|-------------|
| `ASSEMBLYAI_API_KEY` | `your_assemblyai_key` | For Hindi transcription |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | `{full_json_content}` | Service account JSON |
| `FLASK_ENV` | `production` | Flask environment |
| `FLASK_APP` | `backed_api.py` | Flask app entry point |

### **Step 4: Deploy**
1. Click **"Deploy"**
2. Railway will automatically:
   - Install system packages (FFmpeg, yt-dlp)
   - Install Python dependencies
   - Create temp_videos directory
   - Start your Flask app

### **Step 5: Get Your URL**
- Once deployed, Railway provides a public URL
- Format: `https://your-app-name.railway.app`

---

## 🔧 **System Dependencies Included**

Railway automatically installs:
- ✅ **Python 3.11**
- ✅ **FFmpeg** (for video processing)
- ✅ **yt-dlp** (for YouTube downloads)
- ✅ **gcc & pkg-config** (for Python packages)
- ✅ **gunicorn** (production WSGI server)

---

## 💰 **Cost Breakdown**

### **Free Tier:**
- **$5 credit** for new users
- **No time limit** on credit usage
- **Pay only for what you use**

### **After Free Credit:**
- **~$5/month** for typical usage
- **$0.000231/GB-hour** for memory
- **$0.000463/vCPU-hour** for compute
- **$0.25/GB/month** for storage

### **Example Monthly Cost:**
- **512MB RAM, 0.5 vCPU**: ~$3-5/month
- **1GB storage**: $0.25/month
- **Total**: ~$5/month

---

## 🛠️ **Configuration Files Explained**

### **railway.toml**
```toml
[build]
builder = "nixpacks"  # Uses Nixpacks for builds

[deploy]
startCommand = "gunicorn --bind 0.0.0.0:$PORT backed_api:app --workers 2 --timeout 300"
healthcheckPath = "/health"  # Health check endpoint
restartPolicyType = "always"  # Auto-restart on failure
```

### **nixpacks.toml**
```toml
[phases.setup]
nixPkgs = ["python311", "ffmpeg", "yt-dlp", "gcc", "pkg-config"]

[phases.install]
cmds = ["pip install --upgrade pip", "pip install -r requirements.txt"]

[phases.build]
cmds = ["mkdir -p temp_videos"]  # Create video processing directory
```

---

## 🔍 **Monitoring & Logs**

### **View Logs:**
1. Go to Railway dashboard
2. Click your service
3. Go to **"Logs"** tab
4. Real-time log streaming

### **Health Monitoring:**
- Railway automatically monitors `/health` endpoint
- Auto-restarts on failures
- Uptime monitoring included

---

## 🚨 **Troubleshooting**

### **Common Issues:**

#### **1. Build Failures**
- Check `nixpacks.toml` syntax
- Verify `requirements.txt` dependencies
- Check build logs in Railway dashboard

#### **2. App Won't Start**
- Verify `backed_api.py` exists
- Check Flask app initialization
- Ensure gunicorn is in requirements.txt

#### **3. FFmpeg Not Found**
- Verify `nixpacks.toml` includes `ffmpeg`
- Check build logs for package installation
- Restart deployment if needed

#### **4. Environment Variables**
- Double-check variable names (case-sensitive)
- Verify JSON formatting for Google credentials
- Restart after adding new variables

---

## 🔄 **Continuous Deployment**

Railway automatically:
- ✅ **Watches your GitHub repo**
- ✅ **Auto-deploys on push to V1 branch**
- ✅ **Runs health checks**
- ✅ **Provides deployment status**

---

## 📊 **Performance Optimization**

### **Recommended Settings:**
- **Memory**: 512MB (sufficient for most workloads)
- **CPU**: 0.5 vCPU (good for video processing)
- **Workers**: 2 (configured in gunicorn)
- **Timeout**: 300 seconds (for long video processing)

### **Scaling Options:**
- **Vertical scaling**: Increase memory/CPU
- **Horizontal scaling**: Add more instances
- **Auto-scaling**: Based on CPU/memory usage

---

## 🎯 **Next Steps After Deployment**

1. **Test all endpoints** using the Railway URL
2. **Monitor logs** for any errors
3. **Set up custom domain** (optional)
4. **Configure scaling** if needed
5. **Set up monitoring alerts**

---

## 💡 **Pro Tips**

1. **Use Railway CLI** for easier management
2. **Set up staging environment** with different branch
3. **Monitor resource usage** to optimize costs
4. **Use Railway's built-in metrics** for performance tracking
5. **Set up backup strategy** for persistent data

---

## 🆘 **Support**

- **Railway Discord**: Active community support
- **Documentation**: [docs.railway.app](https://docs.railway.app)
- **GitHub Issues**: For bug reports
- **Email Support**: Available for paid plans

---

**🎉 Ready to deploy? Follow the steps above and your backend will be live in minutes!** 