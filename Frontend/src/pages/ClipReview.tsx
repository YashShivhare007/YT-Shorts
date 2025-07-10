import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Play, 
  Pause, 
  Download, 
  Share2, 
  Clock,
  Calendar,
  BarChart3,
  ExternalLink
} from 'lucide-react';
import { useVideosWithClips } from '../hooks/useVideosWithClips';
import type { ClipData, VideoWithClips } from '../services/googleSheetsOAuth';
import { getDriveEmbedUrl, getDriveDownloadUrl } from '../utils/drive';

const ClipReview = () => {
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [expandedVideos, setExpandedVideos] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
  
  const { videosWithClips, loading, error, refetch } = useVideosWithClips();

  // Filter videos based on availability of clips (ANY clips, not just completed ones)
  const filteredVideos = videosWithClips.filter((video: VideoWithClips) => {
    return video.clips.length > 0; // Show videos that have any clips at all
  });

  // For stats, separate completed vs total clips
  const allClips = filteredVideos.flatMap((video: VideoWithClips) => video.clips);
  const completedClips = allClips.filter((clip: ClipData) => clip.driveLink && clip.driveLink !== '');

  // Flatten all clips with video context (for flat view) - show ALL clips
  const allClipsWithContext = filteredVideos.flatMap((video: VideoWithClips) => 
    video.clips.map((clip: ClipData) => ({
      ...clip,
      videoLink: video.videoLink,
      VideoId: video.VideoId,
      videoStatus: video.status
    }))
  );

  // For the flat view, optionally filter to only show completed clips
  const completedClipsWithContext = allClipsWithContext.filter((clip: ClipData) => 
    clip.driveLink && clip.driveLink !== ''
  );

  const toggleVideoExpansion = (VideoId: string) => {
    const newExpanded = new Set(expandedVideos);
    if (newExpanded.has(VideoId)) {
      newExpanded.delete(VideoId);
    } else {
      newExpanded.add(VideoId);
    }
    setExpandedVideos(newExpanded);
  };

  const expandAllVideos = () => {
    setExpandedVideos(new Set(filteredVideos.map((v: VideoWithClips) => v.VideoId)));
  };

  const collapseAllVideos = () => {
    setExpandedVideos(new Set());
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'text-green-600 bg-green-100';
      case 'rejected':
        return 'text-red-600 bg-red-100';
      case 'pending':
        return 'text-yellow-600 bg-yellow-100';
      default:
        return 'text-green-600 bg-green-100';
    }
  };

  const handleDownload = (driveLink: string) => {
    const downloadUrl = getDriveDownloadUrl(driveLink);
    if (downloadUrl) {
      window.open(downloadUrl, '_blank');
    } else {
      // Fallback for old/unexpected formats
      window.open(driveLink, '_blank');
    }
  };

  const timeStringToSeconds = (timeStr: string): number => {
    if (!timeStr || typeof timeStr !== 'string') return 0;

    // Check if it's already a plain number (in seconds)
    if (!isNaN(parseFloat(timeStr)) && isFinite(Number(timeStr))) {
      return parseFloat(timeStr);
    }

    // Check for HH:MM:SS format
    const parts = timeStr.split(':').map(Number);
    if (parts.length === 3 && parts.every(p => !isNaN(p))) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2 && parts.every(p => !isNaN(p))) {
      return parts[0] * 60 + parts[1];
    }

    return 0; // Fallback for unknown formats
  };

  const formatDuration = (start: string, end: string) => {
    try {
      const startNum = timeStringToSeconds(start);
      const endNum = timeStringToSeconds(end);
      const durationSeconds = endNum - startNum;
      
      if (isNaN(durationSeconds) || durationSeconds < 0) return 'N/A';

      const minutes = Math.floor(durationSeconds / 60);
      const seconds = Math.floor(durationSeconds % 60);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    } catch {
      return 'N/A';
    }
  };

  const getVideoTitle = (videoLink: string, VideoId?: string) => {
    if (videoLink.includes('youtube.com') || videoLink.includes('youtu.be')) {
      return `YouTube Video ${VideoId ? `(${VideoId})` : ''}`;
    } else if (videoLink.includes('drive.google.com')) {
      return `Google Drive Video ${VideoId ? `(${VideoId})` : ''}`;
    }
    return `Video ${VideoId ? `(${VideoId})` : ''}`;
  };

  const getVideoTypeIcon = (videoLink: string) => {
    if (videoLink.includes('youtube.com') || videoLink.includes('youtu.be')) {
      return '📺';
    } else if (videoLink.includes('drive.google.com')) {
      return '💾';
    }
    return '🎬';
  };

  const renderClipCard = (clip: ClipData & { videoLink?: string; VideoId?: string; videoStatus?: string }, showVideoInfo = false) => (
    <motion.div
      key={clip.clipId}
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`card flex flex-col space-y-3 cursor-pointer transition-all duration-200 ${
        selectedClip === clip.clipId ? 'ring-2 ring-primary-500' : 'hover:shadow-lg'
      }`}
      onClick={() => setSelectedClip(clip.clipId)}
    >
      {/* Video Preview */}
      <div className="w-full aspect-video bg-black rounded-lg overflow-hidden">
        {clip.driveLink ? (
          <iframe
            src={getDriveEmbedUrl(clip.driveLink) || ''}
            className="w-full h-full"
            allow="autoplay; encrypted-media"
            title="Clip Preview"
          ></iframe>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-100">
            <Clock className="w-8 h-8 text-gray-400" />
          </div>
        )}
      </div>

      {/* Clip Info */}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 truncate">
              {showVideoInfo 
                ? `${getVideoTitle(clip.videoLink || '', clip.VideoId)} - Clip ${clip.clipNumber + 1}`
                : `Clip ${clip.clipNumber + 1}`
              }
            </h3>
            <p className="text-sm text-gray-600">
              {formatDuration(clip.start, clip.end)} ({clip.start}s - {clip.end}s)
            </p>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full ${
            clip.driveLink && clip.driveLink !== '' 
              ? 'text-green-600 bg-green-100' 
              : 'text-yellow-600 bg-yellow-100'
          }`}>
            {clip.driveLink && clip.driveLink !== '' ? 'Available' : 'Processing'}
          </span>
        </div>
        
        <p className="text-sm text-gray-700 line-clamp-2 mt-2">
          {clip.text || 'No transcript available'}
        </p>
        
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center space-x-4 text-sm text-gray-500">
            <span className="flex items-center space-x-1">
              <span className="font-medium">Category:</span>
              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                {clip.category || 'N/A'}
              </span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="font-medium">Confidence:</span>
              <span className={`px-2 py-1 rounded-full text-xs ${
                clip.confidence >= 0.8 ? 'bg-green-100 text-green-700' :
                clip.confidence >= 0.6 ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-700'
              }`}>
                {(clip.confidence * 100).toFixed(0)}%
              </span>
            </span>
          </div>
          
          <div className="flex items-center space-x-1">
            {clip.driveLink && (
              <>
                <a
                  href={getDriveDownloadUrl(clip.driveLink) || '#'}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-gray-400 hover:text-gray-600"
                  title="Download Clip"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download className="w-4 h-4" />
                </a>
                <a
                  href={clip.driveLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-gray-400 hover:text-gray-600"
                  title="Open in Google Drive"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );

  const renderVideoSection = (video: VideoWithClips) => {
    const completedClips = video.clips.filter(clip => clip.driveLink && clip.driveLink !== '');
    const allVideoClips = video.clips; // Show ALL clips for this video
    const isExpanded = expandedVideos.has(video.VideoId);
    
    return (
      <motion.div
        key={video.VideoId}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        {/* Video Header */}
        <div 
          className="card cursor-pointer hover:shadow-md transition-shadow duration-200 mb-4"
          onClick={() => toggleVideoExpansion(video.VideoId)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-2xl">{getVideoTypeIcon(video.videoLink)}</div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {getVideoTitle(video.videoLink, video.VideoId)}
                </h2>
                <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                  <span className="flex items-center space-x-1">
                    <Play className="w-4 h-4" />
                    <span>Status: {video.status}</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <BarChart3 className="w-4 h-4" />
                    <span>{completedClips.length}/{allVideoClips.length} clips completed</span>
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">
                {isExpanded ? 'Collapse' : 'Expand'}
              </span>
              {isExpanded ? (
                <Pause className="w-5 h-5 text-gray-400" />
              ) : (
                <Play className="w-5 h-5 text-gray-400" />
              )}
            </div>
          </div>
        </div>

        {/* Clips Grid (when expanded) */}
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6 ml-8"
          >
            {allVideoClips.length === 0 ? (
              <div className="text-center py-8 text-gray-500 md:col-span-2">
                <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No clips available for this video</p>
              </div>
            ) : (
              allVideoClips.map(clip => renderClipCard(clip, false))
            )}
          </motion.div>
        )}
      </motion.div>
    );
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center h-64">
          <Clock className="w-8 h-8 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Loading clips...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <div className="text-red-600 mb-4">{error}</div>
          <button onClick={refetch} className="btn-primary">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Clip Review</h1>
          <div className="flex items-center space-x-4">
            <button
              onClick={refetch}
              className="btn-secondary flex items-center space-x-2"
            >
              <Clock className="w-4 h-4" />
              <span>Refresh</span>
            </button>
            
            {/* View Mode Toggle */}
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">View:</span>
              <select 
                className="input-field w-auto"
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value as 'grouped' | 'flat')}
              >
                <option value="grouped">Grouped by Video</option>
                <option value="flat">All Clips</option>
              </select>
            </div>

            {/* Expand/Collapse Controls (only for grouped view) */}
            {viewMode === 'grouped' && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={expandAllVideos}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  Expand All
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={collapseAllVideos}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  Collapse All
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="card text-center">
            <div className="text-2xl font-bold text-blue-600">{filteredVideos.length}</div>
            <div className="text-sm text-gray-600">Videos with Clips</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-green-600">
              {completedClips.length}
              <span className="text-sm text-gray-500">/{allClips.length}</span>
            </div>
            <div className="text-sm text-gray-600">Completed/Total Clips</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-purple-600">
              {allClips.length > 0 ? Math.round(allClips.reduce((sum, clip) => sum + clip.confidence, 0) / allClips.length * 100) : 0}%
            </div>
            <div className="text-sm text-gray-600">Avg Confidence</div>
          </div>
          <div className="card text-center">
            <div className="text-2xl font-bold text-orange-600">
              {[...new Set(allClips.map(clip => clip.category))].length}
            </div>
            <div className="text-sm text-gray-600">Categories</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {filteredVideos.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No clips available</h3>
                <p className="text-gray-600">
                  Upload some videos and wait for processing to complete
                </p>
              </div>
            ) : viewMode === 'grouped' ? (
              // Grouped View
              <div className="space-y-6">
                {filteredVideos.map(video => renderVideoSection(video))}
              </div>
            ) : (
              // Flat View
              <div className="space-y-4">
                {allClipsWithContext.map(clip => renderClipCard(clip, true))}
              </div>
            )}
          </div>

          {/* Clip Details Sidebar */}
          <div className="lg:col-span-1">
            <div className="card sticky top-24">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Clip Details</h2>
              
              {selectedClip ? (() => {
                const clip = allClipsWithContext.find(c => c.clipId === selectedClip);
                return clip ? (
                  <div className="space-y-4">
                    <div>
                      {clip.driveLink ? (
                        <div className="w-full aspect-video bg-black rounded-lg overflow-hidden">
                          <iframe
                            src={getDriveEmbedUrl(clip.driveLink) || ''}
                            className="w-full h-full"
                            allow="autoplay; encrypted-media"
                            allowFullScreen
                            title="Selected Clip Preview"
                          ></iframe>
                        </div>
                      ) : (
                        <div className="w-full h-48 bg-gray-200 rounded-lg flex items-center justify-center">
                          <Clock className="w-12 h-12 text-gray-400" />
                          <p className="ml-2 text-gray-500">Processing...</p>
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {getVideoTitle(clip.videoLink || '', clip.VideoId)} - Clip {clip.clipNumber + 1}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Duration: {formatDuration(clip.start, clip.end)}
                      </p>
                      <p className="text-sm text-gray-600">
                        Time: {clip.start}s - {clip.end}s
                      </p>
                    </div>
                    
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Transcript</h4>
                      <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg max-h-32 overflow-y-auto">
                        {clip.text || 'No transcript available'}
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Details</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Category:</span>
                          <span className="font-medium">{clip.category || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Confidence:</span>
                          <span className="font-medium">{(clip.confidence * 100).toFixed(0)}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Reason:</span>
                          <span className="font-medium text-xs">{clip.reason || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex space-x-2">
                      {clip.driveLink && clip.driveLink !== '' ? (
                        <>
                          <a
                            href={getDriveDownloadUrl(clip.driveLink) || '#'}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 btn-primary flex items-center justify-center space-x-2"
                          >
                            <Download className="w-4 h-4" />
                            <span>Download</span>
                          </a>
                          <a
                            href={clip.driveLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 btn-secondary flex items-center justify-center space-x-2"
                          >
                            <ExternalLink className="w-4 h-4" />
                            <span>Open in Drive</span>
                          </a>
                        </>
                      ) : (
                        <div className="flex-1 bg-gray-100 text-gray-500 py-2 px-4 rounded-lg text-center">
                          <Clock className="w-4 h-4 inline mr-2" />
                          <span>Processing...</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null;
              })() : (
                <div className="text-center text-gray-500 py-8">
                  <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>Select a clip to view details</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ClipReview; 