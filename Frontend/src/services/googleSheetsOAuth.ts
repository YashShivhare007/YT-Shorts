import { config } from '../config/environment';
import googleAuthService from './googleAuth';

// Google Sheets API configuration with OAuth
const { sheetId: SHEET_ID, sheetName: SHEET_NAME } = config.googleSheets;

export interface VideoRow {
  videoLink: string;
  type?: string;           // NEW: Type column (YouTube/Drive)
  VideoId?: string;
  transcript?: string;
  status?: string;
  clipId?: string;
  start?: string;
  end?: string;
  text?: string;
  category?: string;
  reason?: string;
  editorJustification?: string;
  driveLink?: string;
  confidence?: number;
}

export interface ClipData {
  clipId: string;        // e.g., "mmiHYDqVROI-0"
  clipNumber: number;    // extracted from clipId (0, 1, 2...)
  start: string;
  end: string;
  text: string;
  category: string;
  reason: string;
  editorJustification: string;
  driveLink: string;
  confidence: number;
}

export interface VideoWithClips {
  // Video metadata (from video rows)
  videoLink: string;
  VideoId: string;
  transcript: string;
  status: string;
  
  // Attached clips (from clip rows)
  clips: ClipData[];
  
  // Computed properties
  totalClips: number;
  completedClips: number;
  hasClips: boolean;
}

export interface ProcessingStatus {
  total: number;
  processing: number;
  completed: number;
  failed: number;
}

class GoogleSheetsOAuthService {
  private gapi: any = null;

  // Initialize the service
  private async initialize(): Promise<void> {
    if (!googleAuthService.isSignedIn()) {
      throw new Error('User not signed in. Please sign in first.');
    }

    this.gapi = window.gapi;
    
    // Ensure the access token is set for gapi client
    const accessToken = googleAuthService.getAccessToken();
    if (accessToken) {
      this.gapi.client.setToken({
        access_token: accessToken
      });
    }
  }

  // Make authenticated API request using fetch with OAuth token
  private async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<any> {
    const accessToken = googleAuthService.getAccessToken();
    if (!accessToken) {
      throw new Error('No access token available. Please sign in again.');
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API request failed:', response.status, errorText);
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // Append multiple video links to the sheet
  async appendVideoLinks(urls: string[]): Promise<void> {
    await this.initialize();

    try {
      const values = urls.map(url => {
        const type = this.validateUrl(url).type;
        const videoId = this.extractVideoId(url);
        // [Link, Type, VideoId, Transcript, Status, ...]
        return [url, type, videoId || '', '', 'Waiting', '', '', '', '', '', '', '', '', ''];
      });
      
      const requestBody = {
        values: values,
        majorDimension: 'ROWS'
      };

      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${SHEET_NAME}!A:N:append?valueInputOption=RAW`;
      
      const response = await this.makeAuthenticatedRequest(url, {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });
      
      console.log('Video links appended successfully:', response);

      // Trigger n8n workflow immediately after successful upload
      await this.triggerN8nWorkflow(urls);
      
    } catch (error) {
      console.error('Error appending video links:', error);
      throw new Error('Failed to upload video links to Google Sheets');
    }
  }

  // Trigger n8n workflow via webhook
  private async triggerN8nWorkflow(urls: string[]): Promise<void> {
    try {
      // Get webhook URL from config
      const n8nWebhookUrl = config.n8n.webhookUrl;
      
      // Simple trigger payload - the workflow will use Google Sheets node to read actual data
      const payload = {
        action: 'process_videos',
        message: `Processing ${urls.length} new video(s)`,
        timestamp: new Date().toISOString(),
        videoCount: urls.length
      };

      console.log('Triggering n8n workflow with payload:', payload);

      const response = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        console.log('n8n workflow triggered successfully');
        const responseText = await response.text();
        console.log('n8n response:', responseText);
      } else {
        const errorText = await response.text();
        console.warn('Failed to trigger n8n workflow:', response.status, response.statusText, errorText);
        // Don't throw error here - the upload to sheets was successful
      }
    } catch (error) {
      console.warn('Error triggering n8n workflow:', error);
      // Don't throw error here - the upload to sheets was successful
    }
  }

  // Get all video data from the sheet
  async getAllVideos(): Promise<VideoRow[]> {
    await this.initialize();

    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${SHEET_NAME}!A:N`;
      const response = await this.makeAuthenticatedRequest(url);

      const rows = response.values || [];
      
      // Skip header row - CORRECTED: Added Type column (B)
      return rows.slice(1).map((row: string[]) => ({
        videoLink: row[0] || '',
        type: row[1] || '',              // NEW: Type column
        VideoId: row[2] || '',           // SHIFTED: was row[1]
        transcript: row[3] || '',        // SHIFTED: was row[2]
        status: row[4] || '',            // SHIFTED: was row[3]
        clipId: row[5] || '',            // SHIFTED: was row[4]
        start: row[6] || '',             // SHIFTED: was row[5]
        end: row[7] || '',               // SHIFTED: was row[6]
        text: row[8] || '',              // SHIFTED: was row[7]
        category: row[9] || '',          // SHIFTED: was row[8]
        reason: row[10] || '',           // SHIFTED: was row[9]
        editorJustification: row[11] || '', // SHIFTED: was row[10]
        driveLink: row[12] || '',        // SHIFTED: was row[11]
        confidence: row[13] ? parseFloat(row[13]) : undefined // SHIFTED: was row[12]
      }));
    } catch (error) {
      console.error('Error fetching video data:', error);
      throw new Error('Failed to fetch video data from Google Sheets');
    }
  }

  // Get videos with their mapped clips - Updated for n8n structure
  async getVideosWithClips(): Promise<VideoWithClips[]> {
    await this.initialize();

    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${SHEET_NAME}!A:N`;
      const response = await this.makeAuthenticatedRequest(url);

      const rows = response.values || [];
      
      // Skip header row
      const dataRows = rows.slice(1);
      
      // Based on your n8n structure: video metadata in first n rows, clips from row n+1 onwards
      const videoRows: any[] = [];
      const clipRows: any[] = [];
      
             dataRows.forEach((row: string[], index: number) => {
         const hasVideoLink = row[0] && row[0].trim() !== ''; // Column A - Video Link
         const hasClipId = row[5] && row[5].trim() !== '';     // Column F - Clip ID (CORRECTED!)
         
         if (hasVideoLink && !hasClipId) {
           // This is a video metadata row (has Video Link but no Clip ID)
           videoRows.push({
             videoLink: row[0] || '',
             type: row[1] || '',        // NEW: Type column
             VideoId: row[2] || '',     // CORRECTED: was row[1]
             transcript: row[3] || '',  // CORRECTED: was row[2]
             status: row[4] || ''       // CORRECTED: was row[3]
           });
         } else if (hasClipId && !hasVideoLink) {
           // This is a clip data row (has Clip ID but no Video Link)
           clipRows.push({
             clipId: row[5] || '',      // CORRECTED: was row[4]
             start: row[6] || '',       // CORRECTED: was row[5]
             end: row[7] || '',         // CORRECTED: was row[6]
             text: row[8] || '',        // CORRECTED: was row[7]
             category: row[9] || '',    // CORRECTED: was row[8]
             reason: row[10] || '',     // CORRECTED: was row[9]
             editorJustification: row[11] || '', // CORRECTED: was row[10]
             driveLink: row[12] || '',  // CORRECTED: was row[11]
             confidence: row[13] ? parseFloat(row[13]) : 0 // CORRECTED: was row[12]
           });
         }
       });

      // Group clips by VideoId (extracted from clipId)
      const clipsByVideoId = new Map<string, ClipData[]>();
      
      clipRows.forEach(clipRow => {
        const clipId = clipRow.clipId;
        if (clipId) {
          // Extract VideoId from clipId (e.g., "mmiHYDqVROI-0" -> "mmiHYDqVROI")
          // Handle Drive IDs with hyphens (e.g., "1uj3k-_Bb8zv_LYnujZM-r9PgsPmASynk-0")
          const parts = clipId.split('-');
          if (parts.length >= 2) {
            // Take all parts except the last one as the video ID
            // This handles both YouTube IDs and Drive IDs with hyphens
            const VideoId = parts.slice(0, -1).join('-');
            const clipNumber = parseInt(parts[parts.length - 1]) || 0;
            
            const clipData: ClipData = {
              clipId: clipId,
              clipNumber: clipNumber,
              start: clipRow.start,
              end: clipRow.end,
              text: clipRow.text,
              category: clipRow.category,
              reason: clipRow.reason,
              editorJustification: clipRow.editorJustification,
              driveLink: clipRow.driveLink,
              confidence: clipRow.confidence
            };
            
            if (!clipsByVideoId.has(VideoId)) {
              clipsByVideoId.set(VideoId, []);
            }
            clipsByVideoId.get(VideoId)!.push(clipData);
          }
        }
      });

      // Sort clips by clip number within each video
      clipsByVideoId.forEach(clips => {
        clips.sort((a, b) => a.clipNumber - b.clipNumber);
      });

      console.log('🔍 Debug - Video to Clip Mapping:');
      console.log(`📹 Found ${videoRows.length} video rows`);
      console.log(`🎬 Found ${clipRows.length} clip rows`);
      console.log(`🗂️ Mapped clips to ${clipsByVideoId.size} unique video IDs`);
      
      // Debug the mapping
      clipsByVideoId.forEach((clips, VideoId) => {
        console.log(`  📹 Video "${VideoId}": ${clips.length} clips`);
      });

      // Map videos with their clips
      const videosWithClips: VideoWithClips[] = videoRows
        .map(video => {
          // Use VideoId if it exists, otherwise this video won't have clips mapped yet
          const clips = video.VideoId ? clipsByVideoId.get(video.VideoId) || [] : [];
          const completedClips = clips.filter(clip => clip.driveLink && clip.driveLink !== '').length;
          
          // Use a temporary ID for the key if VideoId is not available yet
          const displayId = video.VideoId || video.videoLink.slice(-15);
          
          console.log(`🎯 Mapping video "${displayId}": found ${clips.length} clips (${completedClips} completed)`);
          
          return {
            videoLink: video.videoLink,
            VideoId: displayId,
            transcript: video.transcript || '',
            status: video.status || '',
            clips: clips,
            totalClips: clips.length,
            completedClips: completedClips,
            hasClips: clips.length > 0
          };
        });

      console.log('Debug - Videos with clips:', videosWithClips.map(v => ({
        VideoId: v.VideoId,
        status: v.status,
        totalClips: v.totalClips,
        completedClips: v.completedClips
      })));

      return videosWithClips;
    } catch (error) {
      console.error('Error fetching videos with clips:', error);
      throw new Error('Failed to fetch videos with clips from Google Sheets');
    }
  }

  // Get processing status summary - Updated for n8n structure
  async getProcessingStatus(): Promise<ProcessingStatus> {
    try {
      // Get raw data directly from Google Sheets
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${SHEET_NAME}!A:N`;
      const response = await this.makeAuthenticatedRequest(url);
      const rows = response.values || [];
      
      if (rows.length <= 1) {
        return { total: 0, processing: 0, completed: 0, failed: 0 };
      }
      
      // Skip header row
      const dataRows = rows.slice(1);
      
      // Based on your n8n structure: video metadata in first n rows, clips from row n+1 onwards
      // Video rows have Video Link but no Clip ID
      // Clip rows have Clip ID but no Video Link
      const videoMetadataRows: any[] = [];
      const clipRows: any[] = [];
      
             dataRows.forEach((row: string[], index: number) => {
         const hasVideoLink = row[0] && row[0].trim() !== ''; // Column A - Video Link
         const hasClipId = row[5] && row[5].trim() !== '';     // Column F - Clip ID (CORRECTED!)
         
         if (hasVideoLink && !hasClipId) {
           // This is a video metadata row
           videoMetadataRows.push({
             rowIndex: index + 2, // +2 because we skipped header and arrays are 0-indexed
             videoLink: row[0] || '',
             type: row[1] || '',        // NEW: Type column
             VideoId: row[2] || '',     // CORRECTED: was row[1]
             transcript: row[3] || '',  // CORRECTED: was row[2]
             status: row[4] || ''       // CORRECTED: was row[3]
           });
         } else if (hasClipId && !hasVideoLink) {
           // This is a clip row
           clipRows.push({
             rowIndex: index + 2,
             clipId: row[5] || '',      // CORRECTED: was row[4]
             start: row[6] || '',       // CORRECTED: was row[5]
             end: row[7] || '',         // CORRECTED: was row[6]
             driveLink: row[12] || ''   // CORRECTED: was row[11]
           });
         }
       });

      console.log('🔍 Debug - n8n Structure Analysis:');
      console.log(`📊 Total data rows: ${dataRows.length}`);
      console.log(`📹 Video metadata rows: ${videoMetadataRows.length}`);
      console.log(`🎬 Clip rows: ${clipRows.length}`);
      
      // Debug video metadata
      console.log('📹 Video metadata rows:');
      videoMetadataRows.forEach((video, index) => {
        console.log(`  Video ${index + 1} (Row ${video.rowIndex}):`, {
          VideoId: video.VideoId || 'No ID',
          status: `"${video.status}"`,
          hasVideoLink: !!video.videoLink,
          linkPreview: video.videoLink ? video.videoLink.substring(0, 50) + '...' : 'No link'
        });
      });
      
      // Status analysis based on video metadata rows only
      const total = videoMetadataRows.length;
      
      const completed = videoMetadataRows.filter(v => 
        v.status?.toLowerCase() === 'analysis complete'
      ).length;
      
      const failed = videoMetadataRows.filter(v => 
        v.status && v.status.toLowerCase().includes('failed')
      ).length;

      const processing = total - completed - failed;

      console.log('📈 Status counts:', { total, processing, completed, failed });
      
      // Debug: Show which videos are in each status
      console.log('📊 Status breakdown:');
      console.log('  ✅ Analysis complete:', videoMetadataRows.filter(v => v.status === 'Analysis complete').map(v => v.VideoId || 'No ID'));
      console.log('  ⏳ Processing:', videoMetadataRows.filter(v => v.status === 'Processing').map(v => v.VideoId || 'No ID'));
      console.log('  🔄 Analysing:', videoMetadataRows.filter(v => v.status === 'Analysing').map(v => v.VideoId || 'No ID'));
      console.log('  ❌ Failed:', videoMetadataRows.filter(v => v.status && v.status.includes('Failed')).map(v => v.VideoId || 'No ID'));
      
      return { total, processing, completed, failed };
    } catch (error) {
      console.error('Error getting processing status:', error);
      return { total: 0, processing: 0, completed: 0, failed: 0 };
    }
  }

  // Get completed clips with drive links
  async getCompletedClips(): Promise<ClipData[]> {
    try {
      const videosWithClips = await this.getVideosWithClips();
      const allClips: ClipData[] = [];
      
      videosWithClips.forEach(video => {
        const completedClips = video.clips.filter(clip => 
          clip.driveLink && clip.driveLink !== ''
        );
        allClips.push(...completedClips);
      });
      
      // Sort by video ID and then by clip number
      return allClips.sort((a, b) => {
        // Extract video ID properly (handle Drive IDs with hyphens)
        const aVideoId = a.clipId.split('-').slice(0, -1).join('-');
        const bVideoId = b.clipId.split('-').slice(0, -1).join('-');
        if (aVideoId !== bVideoId) {
          return aVideoId.localeCompare(bVideoId);
        }
        return a.clipNumber - b.clipNumber;
      });
    } catch (error) {
      console.error('Error fetching completed clips:', error);
      return [];
    }
  }

  // Get completed clips grouped by video
  async getCompletedClipsByVideo(): Promise<VideoWithClips[]> {
    try {
      const videosWithClips = await this.getVideosWithClips();
      return videosWithClips.filter(video => video.completedClips > 0);
    } catch (error) {
      console.error('Error fetching completed clips by video:', error);
      return [];
    }
  }

  // Get active videos (all videos that are not yet complete or failed)
  async getActiveVideos(): Promise<VideoWithClips[]> {
    try {
      const videosWithClips = await this.getVideosWithClips();
      
      return videosWithClips
        .filter(v => {
          const status = v.status?.toLowerCase() || '';
          return status !== 'analysis complete' && !status.includes('failed');
        })
        .sort((a, b) => (a.VideoId > b.VideoId ? 1 : -1)); // Keep a stable order
    } catch (error) {
      console.error('Error fetching active videos:', error);
      return [];
    }
  }

  // Helper: Get unique videos (remove duplicates from clips)
  private getUniqueVideos(videos: VideoRow[]): VideoRow[] {
    const videoMap = new Map<string, VideoRow>();
    
    videos.forEach(video => {
      if (video.videoLink && !videoMap.has(video.videoLink)) {
        videoMap.set(video.videoLink, video);
      }
    });
    
    return Array.from(videoMap.values());
  }

  // Validate YouTube and Google Drive URLs
  validateUrl(url: string): { isValid: boolean; type: 'youtube' | 'drive' | 'invalid' } {
    const youtubeRegex = /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const driveRegex = /(?:drive\.google\.com\/(?:file\/d\/|uc\?id=|open\?id=))([a-zA-Z0-9_-]{28,})/;
    
    if (youtubeRegex.test(url)) {
      return { isValid: true, type: 'youtube' };
    } else if (driveRegex.test(url)) {
      return { isValid: true, type: 'drive' };
    } else {
      return { isValid: false, type: 'invalid' };
    }
  }

  // Extract video ID from URL
  extractVideoId(url: string): string | null {
    const youtubeRegex = /(?:youtube\.com\/(?:watch\?v=|shorts\/|live\/|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const driveRegex = /(?:drive\.google\.com\/(?:file\/d\/|uc\?id=|open\?id=))([a-zA-Z0-9_-]{28,})/;
    
    const youtubeMatch = url.match(youtubeRegex);
    if (youtubeMatch) return youtubeMatch[1];
    
    const driveMatch = url.match(driveRegex);
    if (driveMatch) return driveMatch[1];
    
    return null;
  }

  // Create a new spreadsheet (bonus feature)
  async createNewSpreadsheet(title: string): Promise<string> {
    await this.initialize();

    try {
      const requestBody = {
        properties: {
          title: title
        },
        sheets: [{
          properties: {
            title: SHEET_NAME
          }
        }]
      };

      const url = 'https://sheets.googleapis.com/v4/spreadsheets';
      const response = await this.makeAuthenticatedRequest(url, {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      const spreadsheetId = response.spreadsheetId;

      // Add headers
      const headersUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${SHEET_NAME}!A1:M1?valueInputOption=RAW`;
      await this.makeAuthenticatedRequest(headersUrl, {
        method: 'PUT',
        body: JSON.stringify({
          values: [[
            'Video Link', 'VideoId', 'Transcript', 'Status', 'Clip ID',
            'Start', 'End', 'Text', 'Category', 'Reason',
            'Editor Justification', 'Drive Link', 'Confidence'
          ]]
        })
      });

      console.log('New spreadsheet created:', spreadsheetId);
      return spreadsheetId;
    } catch (error) {
      console.error('Error creating spreadsheet:', error);
      throw new Error('Failed to create new spreadsheet');
    }
  }
}

export const googleSheetsOAuthService = new GoogleSheetsOAuthService();
export default googleSheetsOAuthService; 