import { useState, useEffect } from 'react';
import googleSheetsOAuthService from '../services/googleSheetsOAuth';
import type { VideoWithClips, ClipData } from '../services/googleSheetsOAuth';

export const useVideosWithClips = (refreshInterval = 30000) => {
  const [videosWithClips, setVideosWithClips] = useState<VideoWithClips[]>([]);
  const [completedClips, setCompletedClips] = useState<ClipData[]>([]);
  const [completedClipsByVideo, setCompletedClipsByVideo] = useState<VideoWithClips[]>([]);
  const [recentActivity, setRecentActivity] = useState<VideoWithClips[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setError(null);
      
      const [
        videosData,
        clipsData,
        clipsByVideoData,
        activityData
      ] = await Promise.all([
        googleSheetsOAuthService.getVideosWithClips(),
        googleSheetsOAuthService.getCompletedClips(),
        googleSheetsOAuthService.getCompletedClipsByVideo(),
        googleSheetsOAuthService.getRecentActivity()
      ]);

      setVideosWithClips(videosData);
      setCompletedClips(clipsData);
      setCompletedClipsByVideo(clipsByVideoData);
      setRecentActivity(activityData);
    } catch (err) {
      console.error('Error fetching videos with clips:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Set up auto-refresh
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  return {
    videosWithClips,
    completedClips,
    completedClipsByVideo,
    recentActivity,
    loading,
    error,
    refetch: fetchData
  };
}; 