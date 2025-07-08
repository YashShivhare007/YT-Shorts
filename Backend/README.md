# AI YouTube Shorts Generator - Complete Pipeline Documentation

## 🎯 Overview
This is a sophisticated AI-powered system that automatically processes YouTube and Google Drive videos to generate viral-ready short clips for educational content creators. The system uses n8n workflow automation, advanced AI models, and AssemblyAI transcription to create a complete end-to-end pipeline.

## 🏗️ System Architecture

### Core Components
1. **n8n Workflow Engine** - Orchestrates the entire pipeline
2. **Python Backend** - Handles video processing and transcription
3. **AssemblyAI** - High-quality Hindi transcription service
4. **Azure OpenAI GPT-4.1** - AI analysis and content generation
5. **Google Sheets** - Input source and output tracking
6. **MongoDB** - Transcript storage and retrieval
7. **Google Drive** - File storage and sharing

---

## 📋 Complete Pipeline Flow

The system operates through a sophisticated multi-stage pipeline that processes videos from initial URL input to final clip generation with drive links.

### 🚀 Stage 1: Input Detection & Initialization

#### 1.1 Google Sheets Trigger (`Watch New Links`)
```
Purpose: Monitors Google Sheets for new video URLs
Configuration:
  - Document ID: 1W_mu1gQVLpOmYbZPWk0gJ7x412Abgl3UAh1xuwHJGbE
  - Sheet: Sheet1 (gid=0)
  - Trigger: Poll every minute
  - Watch Column: "Video Link"
```

#### 1.2 Batch Processing (`Loop Over Items`)
```
Purpose: Processes multiple URLs in batches to avoid overwhelming the system
Type: Split in Batches node
Behavior: Processes items one by one sequentially
```

#### 1.3 URL Analysis & ID Extraction (`Extract ID`)
```javascript
// Extracts video IDs from YouTube and Google Drive URLs
function extractYouTubeID(url) {
  const regex = /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  return match ? match[1] : null;
}

function extractDriveID(url) {
  const regex = /(?:drive\.google\.com\/(?:file\/d\/|uc\?id=|open\?id=))([a-zA-Z0-9_-]{28,})/;
  return match ? match[1] : null;
}

Output Format:
{
  VideoId: "extracted_id",
  type: "youtube" | "drive" | "other",
  VideoLink: "original_url"
}
```

#### 1.4 Processing Status Management (`Is it not Processed?`)
```
Conditions:
  - Video Link is not empty
  - Transcript field is empty (not processed before)
Logic: Only process new, unprocessed videos
```

---

### 🔄 Stage 2: Video ID Validation & Status Updates

#### 2.1 Video ID Validation (`Is VideoId Invalid?`)
```
Condition: Check if VideoId is empty or null
True Path: Mark as "Failed(Invalid URL)" → Exit
False Path: Continue to processing
```

#### 2.2 Status Updates
- **`Status to Processing`**: Updates Google Sheets status to "Processing"
- **`Update VideoID`**: Stores extracted VideoId in Google Sheets
- **`Set URL as Invalid`**: Marks invalid URLs with failure status

---

### 🎬 Stage 3: Transcript Generation (Dual Path)

The system intelligently routes videos based on their source type:

#### 3.1 Path Selection (`If YT-1`)
```
Condition: if (type === "youtube")
True Path: YouTube Transcript API
False Path: Google Drive Processing
```

#### Path A: YouTube Processing
##### 3.1A YouTube Transcript API (`Get Transcript (YT)`)
```http
POST https://www.youtube-transcript.io/api/transcripts
Authorization: Basic 6847ada93ab3ca952ebc07cd
Content-Type: application/json
Body: {"ids": ["VideoId"]}

Response Format:
{
  "id": "VideoId",
  "tracks": [{
    "transcript": [
      {
        "start": 0.08,
        "dur": 7.52,
        "text": "Hindi transcript text"
      }
    ]
  }]
}
```

##### 3.1B Transcript Parsing (`Parse Transcript`)
```javascript
// Converts YouTube API response to standardized format
const transcriptSegments = transcriptBlocks.map(block => ({
  start: parseFloat(block.start),
  dur: parseFloat(block.dur),
  text: block.text || ""
}));

const transcriptText = transcriptSegments
  .map(seg => `[${seg.start.toFixed(2)}] ${seg.text}`)
  .join("\n");

Output:
{
  VideoId: "extracted_id",
  transcriptText: "[0.08] text\n[7.60] more text...",
  transcriptSegments: [...],
  createdAt: "2025-01-01T00:00:00.000Z"
}
```

#### Path B: Google Drive Processing
##### 3.1B Google Drive Transcript Generation (`Get Transcript(GDrive)`)
```http
POST https://ngrok-url/generate-transcript
Headers: ngrok-skip-browser-warning: true
Body:
  VideoId: "drive_file_id"
  drive_url: "google_drive_url"

Backend Process:
1. Download video from Google Drive
2. Extract audio using FFmpeg
3. Transcribe using AssemblyAI
4. Generate JSON, SRT, TXT formats
5. Upload to Google Drive
6. Return structured response
```

##### 3.1C Status Polling System
```
Wait 30 Seconds → Check Status → Is Completed?
├─ Yes: Continue to next stage
└─ No: Wait 30 Seconds (loop)

Status Check:
GET https://ngrok-url/status/{VideoId}
Response: {"status": "completed|processing|failed"}
```

##### 3.1D Drive Response Processing (`DB Payload-2`)
```javascript
// Converts backend response to MongoDB format
const resultData = items[0].json;
const VideoId = resultData.VideoId;
const segments = resultData.transcript || [];

// Transform segments to MongoDB format
segments.forEach(segment => {
  const startTime = parseFloat(segment.start).toFixed(2);
  transcriptText += `[${startTime}] ${segment.text}\n`;
  
  transformedSegments.push({
    start: parseFloat(segment.start),
    dur: parseFloat(segment.end) - parseFloat(segment.start),
    text: segment.text
  });
});
```

---

### 💾 Stage 4: Database Storage & Sheet Updates

#### 4.1 MongoDB Storage (`Store in MongoDB`)
```
Collection: transcripts
Document Structure:
{
  "_id": ObjectId,
  "VideoId": "VideoIdentifier",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "transcriptText": "[0.08] text\n[7.60] more text...",
  "transcriptSegments": [
    {
      "start": 0.08,
      "dur": 7.52,
      "text": "Hindi transcript text"
    }
  ]
}
```

#### 4.2 Clickable Link Generation (`Build Sheet Link`)
```javascript
const mongoId = $json["_id"];
const n8nDomain = "https://godfather2002.app.n8n.cloud";
const link = `${n8nDomain}/webhook/getTranscript?id=${mongoId}`;
const sheetFormula = `=HYPERLINK("${link}", "View Transcript")`;

// Creates clickable link in Google Sheets
```

#### 4.3 Sheet Status Update (`Google Sheets`)
```
Updates Google Sheets with:
- Transcript: Clickable hyperlink
- Status: "Analysing"
```

---

### 🧠 Stage 5: AI Analysis Pipeline

This is the most sophisticated part of the system, involving multiple AI agents working in sequence.

#### 5.1 Parallel Trend Analysis & Transcript Processing

##### 5.1A Trend Analysis (`Trend Analyser`)
```
AI Model: Azure OpenAI GPT-4.1
Purpose: Analyze current viral trends in Indian EdTech content

Prompt Analysis:
"You are an experienced content strategist specializing in viral short-form video content for the Indian EdTech market (especially JEE/NEET exam prep). Analyze the latest YouTube Shorts and Instagram Reels from EdTech creators and related student communities."

Output Structure:
{
  "trendingTopics": ["sarcastic comebacks", "topper stories"],
  "popularKeywords": ["#JEE2024", "#NEETPrep"],
  "contentIdeas": [
    {
      "title": "Shorts-style video title",
      "theme": "Sarcastic Line",
      "reason": "hooks student emotion"
    }
  ],
  "engagementPatterns": {
    "storytelling": true,
    "callToChat": true,
    "lyrical/musicalEdits": true,
    "emotionalAppeal": true
  },
  "channelObservations": {
    "PW_Alpha": "emotional stories are popular",
    "PW_NEET_Squad": "pattern observed"
  }
}
```

##### 5.1B Transcript Retrieval & Processing
```
MongoDB Query → Find From MongoDB → preprocessing transcript

Process:
1. Query MongoDB using VideoId
2. Extract transcriptText and VideoId
3. Convert to start-end-text format
4. Prepare for AI analysis

Format Conversion:
"[0.08] text" → "0.08 - 7.60: text"
```

#### 5.2 Data Merging & Preparation (`Merge` → `Code`)
```javascript
// Combines trend analysis with transcript data
const trendAnalysis = item.json.output;
const transcript = item.json.TransText;

// Structures data for AI consumption
const transcriptLines = transcript.split('\n');
const structuredTranscript = transcriptLines.map(line => {
  const match = line.match(/^(\d+\.\d+)\s*-\s*(\d+\.\d+):\s*(.+)$/);
  return {
    start: parseFloat(match[1]),
    end: parseFloat(match[2]),
    text: match[3].trim()
  };
});

Output:
{
  formattedTranscript: JSON.stringify(structuredTranscript),
  formattedTrends: JSON.stringify(trendAnalysis),
  structuredTranscript: structuredTranscript,
  trendAnalysis: trendAnalysis
}
```

---

### 🎯 Stage 6: AI Content Selection

#### 6.1 Initial Clip Selection (`Timestamps`)
```
AI Model: Azure OpenAI GPT-4.1
Purpose: Select up to 10 viral-potential segments

Detailed Prompt Analysis:
- Analyze Hindi lecture transcript
- Use trend analysis (15% weightage)
- Focus on humor, relatability, Shayari, emotional resonance
- Assign categories: "Sarcastic Line", "Shayari", "Funny Joke", etc.
- Provide confidence scores

Input Format:
- formattedTranscript: JSON array of segments
- formattedTrends: Trend analysis object

Output Format:
[
  {
    "start": 12.34,
    "end": 48.68,
    "text": "यह एक मजेदार कहानी है",
    "category": "Funny Story",
    "reason": "engagement justification",
    "confidence": 0.95
  }
]
```

#### 6.2 Timestamp Conversion (`1st Screening`)
```javascript
// Converts seconds to MM:SS format for better readability
function secondsToMinutes(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Updates timestamps in AI output
output = output.replace(/"start":\s*(\d+(?:\.\d+)?)/g, (match, seconds) => {
  const timeString = secondsToMinutes(parseFloat(seconds));
  return `"start": "${timeString}"`;
});
```

---

### 🎬 Stage 7: Context Expansion & Clip Refinement

#### 7.1 Context Expansion (`Expand Context`)
```javascript
// Configuration
const PRE_CONTEXT_SEGMENTS = 4;  // Lines before clip
const POST_CONTEXT_SEGMENTS = 4; // Lines after clip

// Process each AI-selected clip
for (const clip of aiClips) {
  const clipStartSeconds = timeToSeconds(clip.start);
  
  // Find segment indices
  const startIndex = fullTranscript.findIndex(seg => seg.start >= clipStartSeconds);
  const endIndex = fullTranscript.findIndex(seg => seg.start >= clipEndSeconds);
  
  // Expand boundaries
  const expandedStartIndex = Math.max(0, startIndex - PRE_CONTEXT_SEGMENTS);
  const expandedEndIndex = Math.min(fullTranscript.length - 1, endIndex + POST_CONTEXT_SEGMENTS);
  
  // Create expanded segments for AI editor
  const expandedSegments = fullTranscript.slice(expandedStartIndex, expandedEndIndex + 1);
}

Output Structure:
{
  VideoId: "VideoId",
  clips_for_ai_editor: [
    {
      original_reason: "clip selection reason",
      original_category: "Funny Story",
      confidence: 0.95,
      segments_for_editing: [...],
      expanded_transcript_text: "[timestamp] text\n..."
    }
  ]
}
```

#### 7.2 Initial Clip Row Creation (`Prepare Initial Clip Rows`)
```javascript
// Creates initial Google Sheets rows for tracking
for (let i = 0; i < clips.length; i++) {
  const clip = clips[i];
  newRows.push({
    json: {
      "Clip ID": `${VideoId}-${i}`,
      "Category": clip.original_category,
      "Reason": clip.original_reason,
      "Confidence": clip.confidence
    }
  });
}
```

---

### ✨ Stage 8: AI-Powered Clip Refinement

#### 8.1 Professional Clip Editing (`Polished Timestamps`)
```
AI Model: Azure OpenAI GPT-4.1
Role: Elite video editor for viral educational content

Detailed Prompt Analysis:
"You are an elite video editor for a top YouTube creator specializing in viral educational content. Your talent is taking good moments and making them *perfect*."

Critical Instructions:
1. Guide by original_reason (creative brief)
2. Find natural story arc
3. Duration: 15-59 seconds mandatory
4. Timestamp precision paramount
5. No transcript alteration

Technical Requirements:
- final_start_time: Exact start value from segments
- final_end_time: Exact start value of last segment
- final_text: Direct concatenation of selected segments
- editor_justification: One-sentence editing rationale

Output Format:
[
  {
    "VideoId": "46CaYBwEp_k",
    "final_start_time": 224.28,
    "final_end_time": 291.44,
    "final_text": "complete refined text...",
    "category": "Funny Story",
    "confidence": 0.98,
    "editor_justification": "Trimmed for complete narrative arc."
  }
]
```

#### 8.2 Data Preparation & Sheet Updates

##### 8.2A Polished Data Preparation (`Prepare Polished Data`)
```javascript
// Helper: Convert seconds to HH:MM:SS
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Create updated rows with refined data
for (let i = 0; i < clips.length; i++) {
  const clip = clips[i];
  updatedRows.push({
    json: {
      "Clip ID": `${VideoId}-${i}`,
      "Start": formatTime(clip.final_start_time),
      "End": formatTime(clip.final_end_time),
      "Text": clip.final_text,
      "Editor Justification": clip.editor_justification
    }
  });
}
```

##### 8.2B Google Sheets Updates
- **`Append Initial Clip Rows`**: Adds initial clip metadata
- **`Update with Polished Data`**: Updates with refined timestamps and text

---

### 🎥 Stage 9: Video Processing & Clip Generation

#### 9.1 Processing Path Selection (`If YT-2`)
```
Condition: if (type === "youtube")
True Path: YouTube Processing
False Path: Google Drive Processing
```

#### 9.2 Payload Preparation (`Setting up Payload`)
```javascript
// Combines clips data with video information
const clipsItem = items.find(item => Array.isArray(item.json.output));
const videoIdItem = items.find(item => item.json.IDDDDD);

const clips = clipsItem?.json?.output || [];
const VideoId = videoIdItem?.json?.IDDDDD || "unknown";

return [{
  json: {
    output: clips,
    VideoId: VideoId
  }
}];
```

#### 9.3 Backend Processing Calls

##### YouTube Processing (`Start Processing(YT)`)
```http
POST https://ngrok-url/process-youtube
Body:
  VideoId: "youtube_VideoId"
  youtube_url: "youtube_url"
  clips: [array_of_clips]

Backend Process:
1. Download YouTube video using yt-dlp
2. Extract audio segments for each clip
3. Generate video clips with timestamps
4. Upload clips to Google Drive
5. Return drive links for each clip
```

##### Google Drive Processing (`Start Processing(GDrive)`)
```http
POST https://ngrok-url/process-drive-clips
Body:
  VideoId: "drive_file_id"
  drive_url: "google_drive_url"
  clips: [array_of_clips]

Backend Process:
1. Reuse previously downloaded video (optimization)
2. Extract audio segments for each clip
3. Generate video clips with timestamps
4. Upload clips to Google Drive
5. Return drive links for each clip
```

---

### 📊 Stage 10: Final Status Updates & Completion

#### 10.1 Status Monitoring System
```
Wait 30 Seconds → Check Status → Is Completed?
├─ Yes: Process final results
└─ No: Continue waiting (loop)

Status Endpoint:
GET https://ngrok-url/status/{VideoId}
```

#### 10.2 Final Drive Links Update (`Prepare Final Drive Links`)
```javascript
// Processes successful backend response
const resultData = items[0].json;
const VideoId = resultData.VideoId;
const clips = resultData.results;

for (const clip of clips) {
  const clipIndex = clip.clip_number - 1;
  finalRows.push({
    json: {
      "Clip ID": `${VideoId}-${clipIndex}`,
      "Drive Link": clip.drive_link
    }
  });
}
```

#### 10.3 Completion Status Updates
- **`Drive Links`**: Updates Google Sheets with final drive links
- **`Analysis Complete`**: Marks video as "Analysis complete"
- **`Wait1`**: Final wait before loop completion

---

## 🔧 Technical Configuration

### Required Credentials
```yaml
Google Sheets:
  - OAuth2 API credentials
  - Document access permissions

MongoDB:
  - Connection string
  - Database: transcripts collection

Azure OpenAI:
  - API key and endpoint
  - GPT-4.1 model access

AssemblyAI:
  - API key for transcription

ngrok:
  - Tunnel for backend access
```

### Environment Variables
```bash
# Backend (.env file)
ASSEMBLYAI_API_KEY=your_assemblyai_key
OPENAI_API_KEY=your_openai_key
GOOGLE_DRIVE_CREDENTIALS=path_to_credentials.json
MONGODB_URI=your_mongodb_connection_string
```

### Google Sheets Structure
```
Columns:
- Video Link: Input URLs
- VideoId: Extracted video identifier
- Transcript: Clickable MongoDB link
- Status: Processing status
- Clip ID: Unique clip identifier
- Start: Clip start time (HH:MM:SS)
- End: Clip end time (HH:MM:SS)
- Text: Clip transcript text
- Category: Content category
- Reason: Selection reason
- Editor Justification: Editing rationale
- Drive Link: Final clip download link
- Confidence: AI confidence score
```

---

## 🚀 Deployment Requirements

### Backend Server Requirements
```
- Python 3.8+
- FFmpeg installed
- 4GB+ RAM
- 10GB+ storage
- Stable internet connection
```

### n8n Workflow Requirements
```
- n8n Cloud or self-hosted instance
- Webhook access
- AI model integrations
- Database connections
```

---

## 📈 Performance Optimizations

### Video Reuse Strategy
```
1. Generate transcript: Download and keep video
2. Process clips: Reuse existing video file
3. Delete after clip processing complete
```

### Batch Processing
```
- Sequential processing to avoid API limits
- Status polling with exponential backoff
- Error handling and retry mechanisms
```

### AI Model Optimization
```
- Structured output parsers for consistent responses
- Context-aware prompting for better results
- Multi-stage refinement for higher quality
```

---

## 🛠️ Error Handling

### Validation Layers
1. **URL Validation**: Invalid URLs marked and skipped
2. **ID Extraction**: Failed extractions logged and reported
3. **Transcript Generation**: Retry mechanisms for API failures
4. **AI Processing**: Fallback prompts for edge cases
5. **Video Processing**: Comprehensive error logging

### Recovery Mechanisms
- **Status Polling**: Continuous monitoring until completion
- **Retry Logic**: Automatic retries for transient failures
- **Graceful Degradation**: Partial results when possible
- **User Notification**: Clear status updates in Google Sheets

---

## 📋 Success Metrics

### Quality Indicators
- **Transcript Accuracy**: AssemblyAI confidence scores
- **Clip Relevance**: AI confidence ratings
- **Processing Speed**: End-to-end completion time
- **Error Rate**: Failed vs successful processing ratio

### Output Quality
- **Clip Duration**: 15-59 seconds (enforced)
- **Content Coherence**: Complete narrative arcs
- **Timestamp Precision**: Exact segment boundaries
- **Drive Link Accessibility**: 100% working links

---

This pipeline represents a sophisticated AI-powered content creation system that transforms long-form educational videos into viral-ready short clips through intelligent analysis, professional editing, and automated distribution. 