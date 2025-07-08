# Backend API Documentation

## Overview

The backend now supports **3 different video processing scenarios**:

1. **YouTube Link + Timestamps** → Download, create clips, upload to Drive
2. **Drive Link + Timestamps** → Download from Drive, create clips, upload to Drive  
3. **Drive Link Only** → Download from Drive, transcribe audio, return transcript

## API Endpoints

### 1. Process YouTube Video with Clips
**Endpoint:** `POST /process-youtube`

**Use Case:** You have a YouTube link and AI-generated timestamps for clips.

**Payload:**
```json
{
    "youtube_url": "https://www.youtube.com/watch?v=VideoId",
    "VideoId": "unique_VideoIdentifier",
    "clips": [
        {
            "final_start_time": 10.5,
            "final_end_time": 25.3,
            "category": "Funny Story",
            "confidence": 0.95
        },
        {
            "final_start_time": 45.2,
            "final_end_time": 67.8,
            "category": "Tips and Tricks", 
            "confidence": 0.88
        }
    ]
}
```

**Response:**
```json
{
    "status": "started",
    "VideoId": "unique_VideoIdentifier",
    "message": "YouTube processing started. Use /status/{VideoId} to check progress.",
    "progress_url": "/status/unique_VideoIdentifier"
}
```

### 2. Process Drive Video with Clips
**Endpoint:** `POST /process-drive-clips`

**Use Case:** You have a Google Drive link and AI-generated timestamps for clips.

**Payload:**
```json
{
    "drive_url": "https://drive.google.com/file/d/FILE_ID/view",
    "VideoId": "unique_VideoIdentifier",
    "clips": [
        {
            "final_start_time": 15.0,
            "final_end_time": 30.5,
            "category": "Sarcastic Line",
            "confidence": 0.92
        }
    ]
}
```

**Response:** Same format as YouTube processing.

### 3. Generate Transcript from Drive Video
**Endpoint:** `POST /generate-transcript`

**Use Case:** You have a Google Drive video link and want to generate a transcript with timestamps.

**Payload:**
```json
{
    "drive_url": "https://drive.google.com/file/d/FILE_ID/view",
    "VideoId": "unique_VideoIdentifier"
}
```

**Response:**
```json
{
    "status": "started",
    "VideoId": "unique_VideoIdentifier", 
    "message": "Transcript generation started. Use /status/{VideoId} to check progress.",
    "progress_url": "/status/unique_VideoIdentifier"
}
```

### 4. Check Processing Status
**Endpoint:** `GET /status/{VideoId}`

**Response (In Progress):**
```json
{
    "status": "downloading",
    "message": "Downloading video from YouTube...",
    "VideoId": "unique_VideoIdentifier",
    "timestamp": 1703123456.789
}
```

**Response (Completed - Clips):**
```json
{
    "VideoId": "unique_VideoIdentifier",
    "status": "completed",
    "clips_processed": 2,
    "successful_clips": 2,
    "failed_clips": 0,
    "results": [
        {
            "clip_number": 1,
            "category": "Funny Story",
            "confidence": 0.95,
            "start_time": 10.5,
            "end_time": 25.3,
            "drive_link": "https://drive.google.com/file/d/CLIP1_ID/view",
            "status": "success"
        }
    ]
}
```

**Response (Completed - Transcript):**
```json
{
    "VideoId": "unique_VideoIdentifier",
    "status": "completed",
    "transcript_segments": 145,
    "transcript": [
        {
            "start": 0.0,
            "end": 3.5,
            "text": "Welcome to today's physics lecture",
            "id": 0
        },
        {
            "start": 3.5,
            "end": 7.2,
            "text": "We'll be discussing quantum mechanics",
            "id": 1
        }
    ]
}
```

### 5. Health Check
**Endpoint:** `GET /health`

**Response:**
```json
{
    "status": "healthy",
    "timestamp": 1703123456.789
}
```

### 6. List All Endpoints
**Endpoint:** `GET /endpoints`

**Response:**
```json
{
    "endpoints": {
        "/process-youtube": "Process YouTube video with clips (POST)",
        "/process-drive-clips": "Process Drive video with clips (POST)",
        "/generate-transcript": "Generate transcript from Drive video (POST)",
        "/status/<VideoId>": "Get processing status (GET)",
        "/health": "Health check (GET)",
        "/endpoints": "List all endpoints (GET)"
    },
    "scenarios": {
        "1": "YouTube link + timestamps → Use /process-youtube",
        "2": "Drive link + timestamps → Use /process-drive-clips",
        "3": "Drive link only → Use /generate-transcript"
    }
}
```

## Status Values

The processing goes through these status phases:

1. **`started`** - Job initiated
2. **`downloading`** - Downloading video from source
3. **`setting_up`** - Setting up Google Drive
4. **`extracting_audio`** - Extracting audio (transcript only)
5. **`transcribing`** - Transcribing audio (transcript only)
6. **`processing`** - Creating clips
7. **`uploading`** - Uploading clips to Drive
8. **`cleaning_up`** - Cleaning temporary files
9. **`completed`** - All done successfully
10. **`failed`** - Error occurred

## Using in n8n

### Scenario 1: YouTube + Timestamps (Existing Workflow)
Use the existing workflow but update the HTTP Request node to use `/process-youtube` instead of `/process`.

### Scenario 2: Drive + Timestamps
**HTTP Request Node Configuration:**
- **Method:** POST
- **URL:** `http://your-backend-url:5000/process-drive-clips`
- **Headers:** `Content-Type: application/json`
- **Body (JSON):**
```json
{
    "drive_url": "{{ $json.driveLink }}",
    "VideoId": "{{ $json.VideoId }}", 
    "clips": "{{ $json.clips }}"
}
```

### Scenario 3: Drive Transcription Only
**HTTP Request Node Configuration:**
- **Method:** POST
- **URL:** `http://your-backend-url:5000/generate-transcript`
- **Headers:** `Content-Type: application/json`
- **Body (JSON):**
```json
{
    "drive_url": "{{ $json.driveLink }}",
    "VideoId": "{{ $json.VideoId }}"
}
```

**Follow-up Status Check:**
Add a Wait node (30 seconds) then HTTP Request to check status:
- **Method:** GET
- **URL:** `http://your-backend-url:5000/status/{{ $json.VideoId }}`

## Installation & Setup

### 1. Install Dependencies
```bash
cd Backend
pip install -r requirements.txt
```

### 2. Setup Google Drive Credentials
1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable Google Drive API
3. Create OAuth 2.0 credentials
4. Download `credentials.json` and place in Backend folder
5. Run the backend once to authenticate (creates `token.pickle`)

### 3. Install System Dependencies
```bash
# Install ffmpeg
sudo apt install ffmpeg  # Ubuntu/Debian
brew install ffmpeg      # macOS

# Install yt-dlp
pip install yt-dlp
```

### 4. Start Backend
```bash
cd Backend
python backed_api.py
```

The API will be available at `http://localhost:5000`

## Testing

Run the test script to verify all endpoints:
```bash
cd Backend
python test_endpoints.py
```

## Error Handling

All endpoints return proper HTTP status codes:
- **200** - Success
- **400** - Bad Request (missing fields)
- **404** - Video ID not found (status endpoint)
- **500** - Internal Server Error

Error responses include details:
```json
{
    "status": "error",
    "error": "Missing required fields: drive_url, VideoId"
}
```

## File Cleanup

The backend automatically cleans up temporary files after processing. Files are stored in `Backend/temp_videos/` during processing and removed afterward.

## Google Drive Integration

- All clips are uploaded to the authenticated Google Drive account
- Files are made publicly accessible with view permissions
- Shareable links are returned in the results
- Original video files are downloaded temporarily and then deleted 