import { motion } from 'framer-motion';
import { 
  Play, 
  Clock, 
  TrendingUp, 
  CheckCircle, 
  AlertCircle,
  ArrowUpRight,
  Video,
  Upload,
  Eye,
  BarChart3,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { useGoogleSheetsOAuth } from '../hooks/useGoogleSheetsOAuth';
import { Link } from 'react-router-dom';
import DebugAuth from '../components/DebugAuth';

const Dashboard = () => {
  const { 
    processingStatus, 
    recentActivity, 
    completedClips,
    loading, 
    error, 
    fetchAllData,
    getStats,
    isSignedIn
  } = useGoogleSheetsOAuth();

  const stats = getStats();

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'analysis complete':
        return 'text-green-600 bg-green-100';
      case 'processing':
      case 'analysing':
        return 'text-blue-600 bg-blue-100';
      case 'pending':
        return 'text-yellow-600 bg-yellow-100';
      default:
        if (status?.includes('Failed')) {
          return 'text-red-600 bg-red-100';
        }
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getActivityIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'analysis complete':
        return CheckCircle;
      case 'processing':
      case 'analysing':
        return Video;
      default:
        if (status?.includes('Failed')) {
          return AlertCircle;
        }
        return Clock;
    }
  };

  const formatTimeAgo = (status: string) => {
    // Since we don't have timestamps, we'll use status for now
    // In a real implementation, you'd calculate time difference
    if (status === 'Processing') return 'Processing now';
    if (status === 'Analysing') return 'Analysing now';
    return 'Recently processed';
  };

  const dashboardStats = [
    {
      title: 'Total Videos',
      value: stats.totalVideos.toString(),
      change: '+12%',
      icon: Video,
      color: 'bg-blue-500',
    },
    {
      title: 'Clips Generated',
      value: stats.clipsGenerated.toString(),
      change: '+8%',
      icon: Play,
      color: 'bg-green-500',
    },
    {
      title: 'Processing Time',
      value: stats.avgProcessingTime,
      change: '-15%',
      icon: Clock,
      color: 'bg-purple-500',
    },
    {
      title: 'Success Rate',
      value: stats.successRate,
      change: '+2%',
      icon: TrendingUp,
      color: 'bg-orange-500',
    },
  ];

  // Show sign-in prompt if not signed in
  if (!isSignedIn) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <RefreshCw className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Sign In Required</h2>
          <p className="text-gray-600 mb-4">Please sign in with Google to access your AI Shorts Generator dashboard</p>
          <p className="text-sm text-gray-500">Click "Sign in with Google" in the top navigation bar</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Data</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <button 
              onClick={fetchAllData}
              className="btn-primary flex items-center space-x-2 mx-auto"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry</span>
            </button>
          </div>
          
          {/* Debug component to help troubleshoot */}
          <DebugAuth />
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
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <button
            onClick={fetchAllData}
            disabled={loading}
            className="btn-secondary flex items-center space-x-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {dashboardStats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="card hover:shadow-md transition-shadow duration-200"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {loading ? '...' : stat.value}
                    </p>
                    <div className="flex items-center mt-1">
                      <span className="text-sm text-green-600 font-medium">{stat.change}</span>
                      <ArrowUpRight className="w-4 h-4 text-green-600 ml-1" />
                    </div>
                  </div>
                  <div className={`p-3 rounded-lg ${stat.color}`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Processing Status */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="card"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Processing Status</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total</span>
                <span className="font-semibold">{processingStatus.total}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-blue-600">Processing</span>
                <span className="font-semibold text-blue-600">{processingStatus.processing}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-green-600">Completed</span>
                <span className="font-semibold text-green-600">{processingStatus.completed}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-red-600">Failed</span>
                <span className="font-semibold text-red-600">{processingStatus.failed}</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="lg:col-span-3 card"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link to="/upload" className="btn-primary flex items-center justify-center space-x-2">
                <Upload className="w-4 h-4" />
                <span>Upload New Videos</span>
              </Link>
              <Link to="/review" className="btn-secondary flex items-center justify-center space-x-2">
                <Eye className="w-4 h-4" />
                <span>Review Clips ({completedClips.length})</span>
              </Link>
              <Link to="/analytics" className="btn-secondary flex items-center justify-center space-x-2">
                <BarChart3 className="w-4 h-4" />
                <span>View Analytics</span>
              </Link>
            </div>
          </motion.div>
        </div>

        {/* Recent Activity and Completed Clips */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="card"
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Activity</h2>
            {loading ? (
              <div className="animate-pulse space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-gray-200 rounded-lg"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : recentActivity.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <Video className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No recent activity</p>
                <Link to="/upload" className="text-primary-600 hover:text-primary-700 text-sm">
                  Upload some videos to get started
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {recentActivity.slice(0, 5).map((activity, index) => {
                  const Icon = getActivityIcon(activity.status || '');
                  return (
                    <div key={index} className="flex items-start space-x-3">
                      <div className={`p-2 rounded-lg ${getStatusColor(activity.status || '')}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          Video: {activity.VideoId || 'Processing...'}
                        </p>
                        <p className="text-xs text-gray-500">{formatTimeAgo(activity.status || '')}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(activity.status || '')}`}>
                        {activity.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="card"
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Latest Completed Clips</h2>
            {loading ? (
              <div className="animate-pulse space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center space-x-3">
                    <div className="w-16 h-9 bg-gray-200 rounded"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : completedClips.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <Play className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>No completed clips yet</p>
                <p className="text-sm">Clips will appear here once processing is complete</p>
              </div>
            ) : (
              <div className="space-y-4">
                {completedClips.slice(0, 5).map((clip, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <div className="w-16 h-9 bg-gradient-to-r from-blue-500 to-purple-600 rounded flex items-center justify-center">
                      <Play className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {clip.category || 'Clip'} - {clip.clipId}
                      </p>
                      <p className="text-xs text-gray-500">
                        {clip.start} - {clip.end} • {clip.confidence && `${Math.round(clip.confidence * 100)}% confidence`}
                      </p>
                    </div>
                    {clip.driveLink && (
                      <a
                        href={clip.driveLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-gray-400 hover:text-gray-600"
                        title="Open in Google Drive"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                ))}
                {completedClips.length > 5 && (
                  <Link 
                    to="/review" 
                    className="block text-center text-primary-600 hover:text-primary-700 text-sm py-2"
                  >
                    View all {completedClips.length} clips →
                  </Link>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default Dashboard; 