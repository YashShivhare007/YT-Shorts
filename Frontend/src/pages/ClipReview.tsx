import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Play, 
  Pause, 
  Download, 
  Share2, 
  Clock,
  Calendar,
  BarChart3
} from 'lucide-react';
import { useVideosWithClips } from '../hooks/useVideosWithClips';
import type { ClipData, VideoWithClips } from '../services/googleSheetsOAuth';

const ClipReview = () => {
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [expandedVideos, setExpandedVideos] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
  
  const { videosWithClips, loading, error, refetch } = useVideosWithClips();

  // Filter videos based on availability of clips (ANY clips, not just completed ones)
  const filteredVideos = videosWithClips.filter(video => {
    return video.clips.length > 0; // Show videos that have any clips at all
  });

  // For stats, separate completed vs total clips
  const allClips = filteredVideos.flatMap(video => video.clips);
  const completedClips = allClips.filter(clip => clip.driveLink && clip.driveLink !== '');

  // Flatten all clips with video context (for flat view) - show ALL clips
  const allClipsWithContext = filteredVideos.flatMap(video => 
    video.clips.map(clip => ({
      ...clip,
      videoLink: video.videoLink,
      VideoId: video.VideoId,
      videoStatus: video.status
    }))
  );

  // For the flat view, optionally filter to only show completed clips
  const completedClipsWithContext = allClipsWithContext.filter(clip => 
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
    setExpandedVideos(new Set(filteredVideos.map(v => v.VideoId)));
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
    window.open(driveLink, '_blank');
  };

  const formatDuration = (start: string, end: string) => {
    try {
      const startNum = parseFloat(start);
      const endNum = parseFloat(end);
      const durationSeconds = endNum - startNum;
      
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
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className={`card cursor-pointer transition-all duration-200 ${
        selectedClip === clip.clipId ? 'ring-2 ring-primary-500' : 'hover:shadow-md'
      }`}
      onClick={() => setSelectedClip(clip.clipId)}
    >
      <div className="flex space-x-4">
        <div className="relative">
          <div className="w-32 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Play className="w-8 h-8 text-white" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            {clip.driveLink && clip.driveLink !== '' ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload(clip.driveLink);
                }}
                className="p-2 bg-black bg-opacity-50 rounded-full text-white hover:bg-opacity-70"
              >
                <Share2 className="w-4 h-4" />
              </button>
            ) : (
              <div className="p-2 bg-gray-600 bg-opacity-50 rounded-full text-gray-300">
                <Clock className="w-4 h-4" />
              </div>
            )}
          </div>
          <div className="absolute bottom-1 right-1 bg-black bg-opacity-75 text-white text-xs px-1 rounded">
            {formatDuration(clip.start, clip.end)}
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 truncate">
            {showVideoInfo 
              ? `${getVideoTitle(clip.videoLink || '', clip.VideoId)} - Clip ${clip.clipNumber + 1}`
              : `Clip ${clip.clipNumber + 1}`
            }
          </h3>
          <p className="text-sm text-gray-600 mb-2">
            {clip.start}s - {clip.end}s
          </p>
          <p className="text-sm text-gray-700 line-clamp-2">
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
            
            <span className={`text-xs px-2 py-1 rounded-full ${
              clip.driveLink && clip.driveLink !== '' 
                ? 'text-green-600 bg-green-100' 
                : 'text-yellow-600 bg-yellow-100'
            }`}>
              {clip.driveLink && clip.driveLink !== '' ? 'Available' : 'Processing'}
            </span>
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
            className="space-y-4 ml-8"
          >
            {allVideoClips.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
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
                      <div className="w-full h-48 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                        <Play className="w-12 h-12 text-white" />
                      </div>
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
                          <button
                            onClick={() => handleDownload(clip.driveLink)}
                            className="flex-1 btn-primary flex items-center justify-center space-x-2"
                          >
                            <Share2 className="w-4 h-4" />
                            <span>Open in Drive</span>
                          </button>
                          <button
                            onClick={() => handleDownload(clip.driveLink)}
                            className="flex-1 btn-secondary flex items-center justify-center space-x-2"
                          >
                            <Download className="w-4 h-4" />
                            <span>Download</span>
                          </button>
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