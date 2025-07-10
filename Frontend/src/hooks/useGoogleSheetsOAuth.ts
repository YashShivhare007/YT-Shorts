import { useState, useEffect, useCallback } from 'react';
import googleSheetsOAuthService from '../services/googleSheetsOAuth';
import googleAuthService from '../services/googleAuth';
import type { VideoRow, ProcessingStatus, VideoWithClips, ClipData } from '../services/googleSheetsOAuth';

export const useGoogleSheetsOAuth = () => {
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>({
    total: 0,
    processing: 0,
    completed: 0,
    failed: 0
  });
  const [completedClips, setCompletedClips] = useState<ClipData[]>([]);
  const [activeVideos, setActiveVideos] = useState<VideoWithClips[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [authInitialized, setAuthInitialized] = useState(false);

  // Check sign-in status
  const checkSignInStatus = useCallback(async () => {
    try {
      if (!authInitialized) {
        await googleAuthService.initialize();
        setAuthInitialized(true);
      }
      const signedIn = googleAuthService.isSignedIn();
      setIsSignedIn(signedIn);
      return signedIn;
    } catch (err) {
      console.error('Failed to check sign-in status:', err);
      setError('Failed to initialize Google authentication');
      return false;
    }
  }, [authInitialized]);

  // Fetch all data (only if signed in) - Updated for n8n structure
  const fetchAllData = useCallback(async () => {
    const signedIn = await checkSignInStatus();
    if (!signedIn) {
      setError('Please sign in to access Google Sheets');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      console.log('🔄 Fetching data with updated n8n structure...');
      
      const [
        videosData,
        statusData,
        clipsData,
        activityData
      ] = await Promise.all([
        googleSheetsOAuthService.getAllVideos(),
        googleSheetsOAuthService.getProcessingStatus(),
        googleSheetsOAuthService.getCompletedClips(),
        googleSheetsOAuthService.getActiveVideos()
      ]);

      console.log('�� Fetched data:', {
        videos: videosData.length,
        status: statusData,
        clips: clipsData.length,
        activity: activityData.length
      });

      setVideos(videosData);
      setProcessingStatus(statusData);
      setCompletedClips(clipsData);
      setActiveVideos(activityData);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [checkSignInStatus]);

  // Upload video links (only if signed in)
  const uploadVideoLinks = useCallback(async (urls: string[]) => {
    const signedIn = await checkSignInStatus();
    if (!signedIn) {
      setError('Please sign in to upload video links');
      return false;
    }

    setLoading(true);
    setError(null);
    
    try {
      await googleSheetsOAuthService.appendVideoLinks(urls);
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
  }, [checkSignInStatus, fetchAllData]);

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

  // Get processing statistics - Updated for n8n structure
  const getStats = useCallback(() => {
    // Use processing status directly (already calculated from video metadata rows)
    const totalClips = completedClips.length;
    const avgProcessingTime = '2.3 min'; // This could be calculated from actual data
    const successRate = processingStatus.total > 0 
      ? Math.round((processingStatus.completed / processingStatus.total) * 100) 
      : 0;

    return {
      totalVideos: processingStatus.total,
      clipsGenerated: totalClips,
      avgProcessingTime,
      successRate: `${successRate}%`
    };
  }, [completedClips, processingStatus]);

  // Listen for sign-in changes
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        await googleAuthService.initialize();
        setAuthInitialized(true);
        
        const signedIn = googleAuthService.isSignedIn();
        setIsSignedIn(signedIn);
        
        if (signedIn) {
          fetchAllData();
        }

        // Listen for sign-in state changes
        googleAuthService.onSignInChange((signedIn) => {
          console.log('Auth state changed:', signedIn);
          setIsSignedIn(signedIn);
          if (signedIn) {
            fetchAllData();
          } else {
            // Clear data when signed out
            setVideos([]);
            setProcessingStatus({ total: 0, processing: 0, completed: 0, failed: 0 });
            setCompletedClips([]);
            setActiveVideos([]);
            setError(null);
          }
        });
      } catch (err) {
        console.error('Failed to initialize auth:', err);
        setError('Failed to initialize Google authentication');
      }
    };

    initializeAuth();
  }, [fetchAllData]);

  // Auto-refresh data every 2 minutes (only if signed in)
  useEffect(() => {
    if (!isSignedIn) return;
    
    const interval = setInterval(() => {
      if (isSignedIn) {
        fetchAllData();
      }
    }, 120000); // Refresh every 2 minutes (120,000 ms)
    
    return () => clearInterval(interval);
  }, [fetchAllData, isSignedIn]);

  return {
    // Data
    videos,
    processingStatus,
    completedClips,
    activeVideos,
    
    // Auth state
    isSignedIn,
    authInitialized,
    
    // Loading states
    loading,
    error,
    
    // Actions
    fetchAllData,
    uploadVideoLinks,
    checkSignInStatus,
    
    // Computed data
    getUniqueVideos,
    getClipsForVideo,
    getStats,
    
    // Utils
    validateUrl: googleSheetsOAuthService.validateUrl.bind(googleSheetsOAuthService),
    extractVideoId: googleSheetsOAuthService.extractVideoId.bind(googleSheetsOAuthService)
  };
};

export default useGoogleSheetsOAuth; 