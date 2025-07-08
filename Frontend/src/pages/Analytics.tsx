import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Play, 
  Clock,
  BarChart3,
  PieChart,
  Activity
} from 'lucide-react';

const Analytics = () => {
  const metrics = [
    {
      title: 'Total Views',
      value: '2.4M',
      change: '+12.5%',
      trend: 'up',
      icon: Users,
      color: 'bg-blue-500',
    },
    {
      title: 'Clip Views',
      value: '856K',
      change: '+8.2%',
      trend: 'up',
      icon: Play,
      color: 'bg-green-500',
    },
    {
      title: 'Avg Watch Time',
      value: '2.3 min',
      change: '-3.1%',
      trend: 'down',
      icon: Clock,
      color: 'bg-purple-500',
    },
    {
      title: 'Engagement Rate',
      value: '6.8%',
      change: '+15.2%',
      trend: 'up',
      icon: Activity,
      color: 'bg-orange-500',
    },
  ];

  const topClips = [
    {
      id: 1,
      title: 'Physics: Newton\'s Laws',
      views: 125000,
      likes: 8900,
      comments: 450,
      thumbnail: 'https://via.placeholder.com/80x45/3B82F6/FFFFFF?text=Physics',
    },
    {
      id: 2,
      title: 'Chemistry: Atomic Structure',
      views: 98000,
      likes: 7200,
      comments: 380,
      thumbnail: 'https://via.placeholder.com/80x45/10B981/FFFFFF?text=Chemistry',
    },
    {
      id: 3,
      title: 'Math: Quadratic Equations',
      views: 87000,
      likes: 6500,
      comments: 320,
      thumbnail: 'https://via.placeholder.com/80x45/8B5CF6/FFFFFF?text=Math',
    },
    {
      id: 4,
      title: 'Biology: Cell Division',
      views: 76000,
      likes: 5800,
      comments: 290,
      thumbnail: 'https://via.placeholder.com/80x45/EF4444/FFFFFF?text=Biology',
    },
  ];

  const categoryData = [
    { name: 'Physics', value: 35, color: '#3B82F6' },
    { name: 'Chemistry', value: 28, color: '#10B981' },
    { name: 'Mathematics', value: 22, color: '#8B5CF6' },
    { name: 'Biology', value: 15, color: '#EF4444' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Analytics</h1>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {metrics.map((metric, index) => {
            const Icon = metric.icon;
            return (
              <motion.div
                key={metric.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="card hover:shadow-md transition-shadow duration-200"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">{metric.title}</p>
                    <p className="text-2xl font-bold text-gray-900">{metric.value}</p>
                    <div className="flex items-center mt-1">
                      {metric.trend === 'up' ? (
                        <TrendingUp className="w-4 h-4 text-green-600" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-red-600" />
                      )}
                      <span className={`text-sm font-medium ml-1 ${
                        metric.trend === 'up' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {metric.change}
                      </span>
                    </div>
                  </div>
                  <div className={`p-3 rounded-lg ${metric.color}`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Charts and Data */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Top Performing Clips */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="card"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Top Performing Clips</h2>
              <BarChart3 className="w-5 h-5 text-gray-400" />
            </div>
            
            <div className="space-y-4">
              {topClips.map((clip, index) => (
                <div key={clip.id} className="flex items-center space-x-3">
                  <span className="text-sm font-medium text-gray-500 w-6">#{index + 1}</span>
                  <img
                    src={clip.thumbnail}
                    alt={clip.title}
                    className="w-16 h-9 object-cover rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {clip.title}
                    </p>
                    <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
                      <span>{clip.views.toLocaleString()} views</span>
                      <span>{clip.likes.toLocaleString()} likes</span>
                      <span>{clip.comments} comments</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Category Distribution */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="card"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Category Distribution</h2>
              <PieChart className="w-5 h-5 text-gray-400" />
            </div>
            
            <div className="space-y-4">
              {categoryData.map((category) => (
                <div key={category.name} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="text-sm font-medium text-gray-900">
                      {category.name}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">
                    {category.value}%
                  </span>
                </div>
              ))}
            </div>
            
            {/* Simple Pie Chart Visualization */}
            <div className="mt-6 flex justify-center">
              <div className="relative w-32 h-32">
                <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 32 32">
                  <circle
                    cx="16"
                    cy="16"
                    r="16"
                    fill="none"
                    stroke="#E5E7EB"
                    strokeWidth="8"
                  />
                  {categoryData.map((category, index) => {
                    const previousValues = categoryData
                      .slice(0, index)
                      .reduce((sum, item) => sum + item.value, 0);
                    const startAngle = (previousValues / 100) * 360;
                    const endAngle = ((previousValues + category.value) / 100) * 360;
                    
                    const x1 = 16 + 16 * Math.cos((startAngle * Math.PI) / 180);
                    const y1 = 16 + 16 * Math.sin((startAngle * Math.PI) / 180);
                    const x2 = 16 + 16 * Math.cos((endAngle * Math.PI) / 180);
                    const y2 = 16 + 16 * Math.sin((endAngle * Math.PI) / 180);
                    
                    const largeArcFlag = category.value > 50 ? 1 : 0;
                    
                    return (
                      <path
                        key={category.name}
                        d={`M 16 16 L ${x1} ${y1} A 16 16 0 ${largeArcFlag} 1 ${x2} ${y2} Z`}
                        fill={category.color}
                      />
                    );
                  })}
                </svg>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Additional Analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="card"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Trends</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Weekly Growth</span>
                <span className="text-sm font-medium text-green-600">+8.5%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Monthly Growth</span>
                <span className="text-sm font-medium text-green-600">+12.3%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Quarterly Growth</span>
                <span className="text-sm font-medium text-green-600">+18.7%</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="card"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Audience Insights</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Age 18-24</span>
                <span className="text-sm font-medium text-gray-900">45%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Age 25-34</span>
                <span className="text-sm font-medium text-gray-900">32%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Age 35+</span>
                <span className="text-sm font-medium text-gray-900">23%</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="card"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Engagement Metrics</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Like Rate</span>
                <span className="text-sm font-medium text-gray-900">6.8%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Comment Rate</span>
                <span className="text-sm font-medium text-gray-900">2.1%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Share Rate</span>
                <span className="text-sm font-medium text-gray-900">1.4%</span>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default Analytics; 