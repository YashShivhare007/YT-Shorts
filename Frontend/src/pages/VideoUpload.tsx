import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Upload, Link, CheckCircle, AlertCircle, X, Youtube, HardDrive } from 'lucide-react';
import googleSheetsOAuthService from '../services/googleSheetsOAuth';
import googleAuthService from '../services/googleAuth';

const VideoUpload = () => {
  const [videoUrls, setVideoUrls] = useState('');
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const [validatedUrls, setValidatedUrls] = useState<Array<{ url: string; type: string; isValid: boolean }>>([]);
  const [isSignedIn, setIsSignedIn] = useState(false);

  // Check authentication status and listen for changes
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        await googleAuthService.initialize();
        const signedIn = googleAuthService.isSignedIn();
        setIsSignedIn(signedIn);

        // Listen for auth state changes
        googleAuthService.onSignInChange((signedIn) => {
          console.log('VideoUpload: Auth state changed:', signedIn);
          setIsSignedIn(signedIn);
        });
      } catch (error) {
        console.error('Failed to initialize auth in VideoUpload:', error);
        setIsSignedIn(false);
      }
    };

    checkAuthStatus();
  }, []);

  const handleUrlsChange = (value: string) => {
    setVideoUrls(value);
    
    // Real-time validation
    const urls = value.split('\n').filter(url => url.trim() !== '');
    const validated = urls.map(url => {
      const validation = googleSheetsOAuthService.validateUrl(url.trim());
      return {
        url: url.trim(),
        type: validation.type,
        isValid: validation.isValid
      };
    });
    
    setValidatedUrls(validated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if user is signed in
    if (!isSignedIn) {
      setUploadMessage('Please sign in with Google to upload videos');
      setUploadStatus('error');
      return;
    }
    
    const urls = videoUrls.split('\n').filter(url => url.trim() !== '');
    
    if (urls.length === 0) {
      setUploadMessage('Please enter at least one video URL');
      setUploadStatus('error');
      return;
    }

    const validUrls = urls.filter(url => 
      googleSheetsOAuthService.validateUrl(url.trim()).isValid
    );

    if (validUrls.length === 0) {
      setUploadMessage('Please enter valid YouTube or Google Drive URLs');
      setUploadStatus('error');
      return;
    }

    setUploadStatus('uploading');
    setUploadMessage(`Uploading ${validUrls.length} video${validUrls.length > 1 ? 's' : ''}...`);

    try {
      await googleSheetsOAuthService.appendVideoLinks(validUrls.map(url => url.trim()));
      
      setUploadStatus('success');
      setUploadMessage(`Successfully uploaded ${validUrls.length} video${validUrls.length > 1 ? 's' : ''} to Google Sheets and triggered n8n workflow! Check the Dashboard to monitor processing status.`);
      setVideoUrls('');
      setValidatedUrls([]);
      
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus('error');
      setUploadMessage('Failed to upload videos. Please check your Google Sheets access or try signing in again.');
    }
  };

  const clearUrls = () => {
    setVideoUrls('');
    setValidatedUrls([]);
    setUploadStatus('idle');
    setUploadMessage('');
  };

  const getUrlIcon = (type: string) => {
    switch (type) {
      case 'youtube':
        return <Youtube className="w-4 h-4 text-red-500" />;
      case 'drive':
        return <HardDrive className="w-4 h-4 text-blue-500" />;
      default:
        return <X className="w-4 h-4 text-red-500" />;
    }
  };

  const validCount = validatedUrls.filter(url => url.isValid).length;
  const invalidCount = validatedUrls.filter(url => !url.isValid).length;

  // Show sign-in prompt if not signed in
  if (!isSignedIn) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Upload className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Sign In Required</h2>
          <p className="text-gray-600 mb-4">Please sign in with Google to upload video links</p>
          <p className="text-sm text-gray-500">Click "Sign in with Google" in the top navigation bar</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Upload Video Links</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* URL Input Area */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Add Video URLs</h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="video-urls" className="block text-sm font-medium text-gray-700 mb-2">
                  Video URLs (one per line)
                </label>
                <textarea
                  id="video-urls"
                  value={videoUrls}
                  onChange={(e) => handleUrlsChange(e.target.value)}
                  className="input-field"
                  rows={8}
                  placeholder={`Enter YouTube or Google Drive URLs, one per line:

https://www.youtube.com/watch?v=VideoId
https://youtu.be/VideoId
https://drive.google.com/file/d/FILE_ID/view`}
                />
              </div>

              {/* URL Validation Summary */}
              {validatedUrls.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      URL Validation Summary
                    </span>
                    <button
                      type="button"
                      onClick={clearUrls}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Clear All
                    </button>
                  </div>
                  
                  <div className="flex items-center space-x-4 text-sm">
                    <span className="flex items-center space-x-1 text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      <span>{validCount} Valid</span>
                    </span>
                    {invalidCount > 0 && (
                      <span className="flex items-center space-x-1 text-red-600">
                        <X className="w-4 h-4" />
                        <span>{invalidCount} Invalid</span>
                      </span>
                    )}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={uploadStatus === 'uploading' || validCount === 0}
                className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                <Upload className="w-4 h-4" />
                <span>
                  {uploadStatus === 'uploading' ? 'Uploading...' : `Upload ${validCount} Video${validCount !== 1 ? 's' : ''}`}
                </span>
              </button>
            </form>

            {/* Status Messages */}
            {uploadMessage && (
              <div className={`mt-4 p-4 rounded-lg ${
                uploadStatus === 'success' ? 'bg-green-50 text-green-800' :
                uploadStatus === 'error' ? 'bg-red-50 text-red-800' :
                'bg-blue-50 text-blue-800'
              }`}>
                <div className="flex items-center space-x-2">
                  {uploadStatus === 'success' && <CheckCircle className="w-5 h-5" />}
                  {uploadStatus === 'error' && <AlertCircle className="w-5 h-5" />}
                  {uploadStatus === 'uploading' && <Upload className="w-5 h-5 animate-spin" />}
                  <span className="font-medium">{uploadMessage}</span>
                </div>
              </div>
            )}
          </div>

          {/* URL Preview */}
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">URL Preview</h2>
            
            {validatedUrls.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <Link className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>Enter video URLs to see preview</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {validatedUrls.map((urlData, index) => (
                  <div
                    key={index}
                    className={`flex items-center space-x-3 p-3 rounded-lg border ${
                      urlData.isValid 
                        ? 'border-green-200 bg-green-50' 
                        : 'border-red-200 bg-red-50'
                    }`}
                  >
                    {getUrlIcon(urlData.type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {urlData.url}
                      </p>
                      <p className={`text-xs ${
                        urlData.isValid ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {urlData.isValid 
                          ? `${urlData.type === 'youtube' ? 'YouTube' : 'Google Drive'} - Valid`
                          : 'Invalid URL format'
                        }
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">How it works</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                <span className="text-blue-600 font-bold">1</span>
              </div>
              <h4 className="font-medium text-gray-900 mb-2">Add URLs</h4>
              <p className="text-sm text-gray-600">
                Paste YouTube or Google Drive video URLs, one per line
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                <span className="text-green-600 font-bold">2</span>
              </div>
              <h4 className="font-medium text-gray-900 mb-2">Auto Processing</h4>
              <p className="text-sm text-gray-600">
                n8n workflow automatically processes videos and generates clips
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                <span className="text-purple-600 font-bold">3</span>
              </div>
              <h4 className="font-medium text-gray-900 mb-2">Get Results</h4>
              <p className="text-sm text-gray-600">
                View generated clips in the Review section with Google Drive links
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default VideoUpload; 