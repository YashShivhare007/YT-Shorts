import axios from 'axios';
import { config } from '../config/environment';

// Google Sheets API configuration
const { apiKey: API_KEY, sheetId: SHEET_ID, sheetName: SHEET_NAME } = config.googleSheets;

export interface VideoRow {
  videoLink: string;
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

export interface ProcessingStatus {
  total: number;
  processing: number;
  completed: number;
  failed: number;
}

class GoogleSheetsService {
  private baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;

  // Append multiple video links to the sheet
  async appendVideoLinks(urls: string[]): Promise<void> {
    try {
      const values = urls.map(url => [url, '', '', 'Pending', '', '', '', '', '', '', '', '', '']);
      
      const response = await axios.post(
        `${this.baseUrl}/values/${SHEET_NAME}:append?valueInputOption=RAW&key=${API_KEY}`,
        {
          values: values
        }
      );
      
      console.log('Video links appended successfully:', response.data);
    } catch (error) {
      console.error('Error appending video links:', error);
      throw new Error('Failed to upload video links to Google Sheets');
    }
  }

  // Get all video data from the sheet
  async getAllVideos(): Promise<VideoRow[]> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/values/${SHEET_NAME}?key=${API_KEY}`
      );

      const rows = response.data.values || [];
      
      // Skip header row
      return rows.slice(1).map((row: string[]) => ({
        videoLink: row[0] || '',
        VideoId: row[1] || '',
        transcript: row[2] || '',
        status: row[3] || '',
        clipId: row[4] || '',
        start: row[5] || '',
        end: row[6] || '',
        text: row[7] || '',
        category: row[8] || '',
        reason: row[9] || '',
        editorJustification: row[10] || '',
        driveLink: row[11] || '',
        confidence: row[12] ? parseFloat(row[12]) : undefined
      }));
    } catch (error) {
      console.error('Error fetching video data:', error);
      throw new Error('Failed to fetch video data from Google Sheets');
    }
  }

  // Get processing status summary
  async getProcessingStatus(): Promise<ProcessingStatus> {
    try {
      const videos = await this.getAllVideos();
      const uniqueVideos = this.getUniqueVideos(videos);
      
      const total = uniqueVideos.length;
      const processing = uniqueVideos.filter(v => 
        v.status === 'Processing' || v.status === 'Analysing'
      ).length;
      const completed = uniqueVideos.filter(v => 
        v.status === 'Analysis complete'
      ).length;
      const failed = uniqueVideos.filter(v => 
        v.status?.includes('Failed')
      ).length;

      return { total, processing, completed, failed };
    } catch (error) {
      console.error('Error getting processing status:', error);
      return { total: 0, processing: 0, completed: 0, failed: 0 };
    }
  }

  // Get completed clips with drive links
  async getCompletedClips(): Promise<VideoRow[]> {
    try {
      const videos = await this.getAllVideos();
      return videos.filter(video => 
        video.driveLink && 
        video.driveLink !== '' && 
        video.clipId &&
        video.clipId !== ''
      );
    } catch (error) {
      console.error('Error fetching completed clips:', error);
      return [];
    }
  }

  // Get recent activity (last 10 processed videos)
  async getRecentActivity(): Promise<VideoRow[]> {
    try {
      const videos = await this.getAllVideos();
      const uniqueVideos = this.getUniqueVideos(videos);
      
      return uniqueVideos
        .filter(v => v.status && v.status !== 'Pending')
        .slice(-10)
        .reverse();
    } catch (error) {
      console.error('Error fetching recent activity:', error);
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
}

export const googleSheetsService = new GoogleSheetsService();
export default googleSheetsService; 