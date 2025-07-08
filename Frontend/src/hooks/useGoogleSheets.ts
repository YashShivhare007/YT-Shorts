import { useState, useEffect, useCallback } from 'react';
import googleSheetsService from '../services/googleSheetsService';
import type { VideoRow, ProcessingStatus } from '../services/googleSheetsService';

export const useGoogleSheets = () => {
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>({
    total: 0,
    processing: 0,
    completed: 0,
    failed: 0
  });
  const [completedClips, setCompletedClips] = useState<VideoRow[]>([]);
  const [recentActivity, setRecentActivity] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all data
  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [
        videosData,
        statusData,
        clipsData,
        activityData
      ] = await Promise.all([
        googleSheetsService.getAllVideos(),
        googleSheetsService.getProcessingStatus(),
        googleSheetsService.getCompletedClips(),
        googleSheetsService.getRecentActivity()
      ]);

      setVideos(videosData);
      setProcessingStatus(statusData);
      setCompletedClips(clipsData);
      setRecentActivity(activityData);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Upload video links
  const uploadVideoLinks = useCallback(async (urls: string[]) => {
    setLoading(true);
    setError(null);
    
    try {
      await googleSheetsService.appendVideoLinks(urls);
      // Refresh data after upload
      await fetchAllData();
      return true;
    } catch (err) {
      console.error('Error uploading videos:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload videos');
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchAllData]);

  // Get unique videos (filter out clip duplicates)
  const getUniqueVideos = useCallback((videoList: VideoRow[] = videos) => {
    const videoMap = new Map<string, VideoRow>();
    
    videoList.forEach(video => {
      if (video.videoLink && !videoMap.has(video.videoLink)) {
        videoMap.set(video.videoLink, video);
      }
    });
    
    return Array.from(videoMap.values());
  }, [videos]);

  // Get clips for a specific video
  const getClipsForVideo = useCallback((VideoId: string) => {
    return videos.filter(video => 
      video.VideoId === VideoId && 
      video.clipId && 
      video.clipId !== ''
    );
  }, [videos]);

  // Get processing statistics
  const getStats = useCallback(() => {
    const uniqueVideos = getUniqueVideos();
    const totalClips = completedClips.length;
    const avgProcessingTime = '2.3 min'; // This could be calculated from actual data
    const successRate = uniqueVideos.length > 0 
      ? Math.round((processingStatus.completed / uniqueVideos.length) * 100) 
      : 0;

    return {
      totalVideos: uniqueVideos.length,
      clipsGenerated: totalClips,
      avgProcessingTime,
      successRate: `${successRate}%`
    };
  }, [getUniqueVideos, completedClips, processingStatus]);

  // Auto-refresh data every 30 seconds
  useEffect(() => {
    fetchAllData();
    
    const interval = setInterval(fetchAllData, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(interval);
  }, [fetchAllData]);

  return {
    // Data
    videos,
    processingStatus,
    completedClips,
    recentActivity,
    
    // Loading states
    loading,
    error,
    
    // Actions
    fetchAllData,
    uploadVideoLinks,
    
    // Computed data
    getUniqueVideos,
    getClipsForVideo,
    getStats,
    
    // Utils
    validateUrl: googleSheetsService.validateUrl.bind(googleSheetsService),
    extractVideoId: googleSheetsService.extractVideoId.bind(googleSheetsService)
  };
};

export default useGoogleSheets; 