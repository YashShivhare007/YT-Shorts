import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Upload, Link, CheckCircle, AlertCircle, X, Youtube, HardDrive, FileVideo, Trash2 } from 'lucide-react';
import googleSheetsOAuthService from '../services/googleSheetsOAuth';
import googleAuthService from '../services/googleAuth';
import googleDriveService from '../services/googleDriveService';
import { config } from '../config/environment';

const VideoUpload = () => {
  const [videoUrls, setVideoUrls] = useState('');
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const [validatedUrls, setValidatedUrls] = useState<Array<{ url: string; type: string; isValid: boolean }>>([]);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [showUploadWarning, setShowUploadWarning] = useState(false);
  const [pendingUploadUrls, setPendingUploadUrls] = useState<string[]>([]);
  
  // New state for file uploads
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileUploadStatus, setFileUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [fileUploadMessage, setFileUploadMessage] = useState('');
  const [uploadProgress, setUploadProgress] = useState<{ loaded: number; total: number; percentage: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    // Check if Sheet1 has data
    try {
      const existingVideos = await googleSheetsOAuthService.getAllVideos();
      if (existingVideos.length > 0) {
        setPendingUploadUrls(validUrls.map(url => url.trim()));
        setShowUploadWarning(true);
        return;
      }
    } catch (err) {
      console.error('Error checking existing videos:', err);
      setUploadMessage('Failed to check existing videos. Please try again.');
      setUploadStatus('error');
      return;
    }
    // If empty, proceed as normal
    await doUpload(validUrls.map(url => url.trim()));
  };

  // Upload logic separated for reuse
  const doUpload = async (urls: string[]) => {
    setUploadStatus('uploading');
    setUploadMessage(`Uploading ${urls.length} video${urls.length > 1 ? 's' : ''}...`);
    try {
      await googleSheetsOAuthService.appendVideoLinks(urls);
      setUploadStatus('success');
      setUploadMessage(`Successfully uploaded ${urls.length} video${urls.length > 1 ? 's' : ''} to Google Sheets and triggered n8n workflow! Check the Dashboard to monitor processing status.`);
      setVideoUrls('');
      setValidatedUrls([]);
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus('error');
      setUploadMessage('Failed to upload videos. Please check your Google Sheets access or try signing in again.');
    }
  };

  // Handler for Proceed in modal (updated to handle both URLs and Drive links)
  const handleProceedUpload = async () => {
    setShowUploadWarning(false);
    setUploadStatus('uploading');
    setUploadMessage('Clearing previous videos...');
    try {
      const executionId = await googleSheetsOAuthService.getExecutionId();
      if (executionId) {
        const backendResp = await googleSheetsOAuthService.testTerminateExecution(executionId);
        console.log('[VideoUpload] Backend terminate response:', backendResp);
      }
      await googleSheetsOAuthService.clearAllRowsExceptHeader();
      await googleSheetsOAuthService.clearSheet2();
      // Set the lock value to the current user's email
      const currentUser = googleAuthService.getCurrentUser();
      if (currentUser?.email) {
        await googleSheetsOAuthService.setLockValue(currentUser.email);
        console.log('[VideoUpload] Lock set to:', currentUser.email);
      }
      await doUpload(pendingUploadUrls);
    } catch (err) {
      setUploadStatus('error');
      setUploadMessage('Failed to clear previous videos. Please try again.');
    } finally {
      setPendingUploadUrls([]);
    }
  };

  // Handler for Wait/Cancel in modal
  const handleWaitUpload = () => {
    setShowUploadWarning(false);
    setPendingUploadUrls([]);
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

  // File handling functions
  const validateFile = (file: File): { isValid: boolean; error?: string } => {
    // Check file type
    const validTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm'];
    if (!validTypes.includes(file.type)) {
      return { isValid: false, error: 'Invalid file type. Only video files are allowed.' };
    }

    // Check file size (500MB = 500 * 1024 * 1024 bytes)
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      return { isValid: false, error: 'File size exceeds 500MB limit.' };
    }

    return { isValid: true };
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const newFiles: File[] = [];
    const errors: string[] = [];

    Array.from(files).forEach(file => {
      const validation = validateFile(file);
      if (validation.isValid) {
        newFiles.push(file);
      } else {
        errors.push(`${file.name}: ${validation.error}`);
      }
    });

    if (errors.length > 0) {
      setFileUploadMessage(`Some files were rejected:\n${errors.join('\n')}`);
      setFileUploadStatus('error');
    }

    if (newFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...newFiles]);
      setFileUploadStatus('idle');
      setFileUploadMessage('');
      setUploadProgress(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const clearFiles = () => {
    setSelectedFiles([]);
    setFileUploadStatus('idle');
    setFileUploadMessage('');
    setUploadProgress(null);
  };

  const handleFileUpload = async () => {
    console.log('🚀 [VideoUpload] Starting file upload process...');
    console.log('  - Number of selected files:', selectedFiles.length);
    console.log('  - Files:', selectedFiles.map(f => `${f.name} (${f.size} bytes)`));
    
    if (selectedFiles.length === 0) {
      console.error('❌ [VideoUpload] No files selected for upload');
      setFileUploadMessage('Please select at least one video file');
      setFileUploadStatus('error');
      return;
    }

    console.log('📤 [VideoUpload] Setting upload status to uploading...');
    setFileUploadStatus('uploading');
    setFileUploadMessage(`Uploading ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} to Google Drive...`);
    setUploadProgress({ loaded: 0, total: selectedFiles.length, percentage: 0 });

    try {
      console.log('🔄 [VideoUpload] Starting Google Drive upload...');
      
      // Upload files to Google Drive
      const driveFiles = await googleDriveService.uploadFiles(selectedFiles, (progress) => {
        console.log('📊 [VideoUpload] Upload progress:', progress);
        setUploadProgress(progress);
        setFileUploadMessage(`Uploading ${progress.loaded}/${progress.total} files to Google Drive... (${Math.round(progress.percentage)}%)`);
      });

      console.log('✅ [VideoUpload] Google Drive upload completed successfully');
      console.log('  - Uploaded files:', driveFiles);

      // Extract Drive links
      const driveLinks = driveFiles.map(file => file.webViewLink);
      console.log('🔗 [VideoUpload] Extracted Drive links:', driveLinks);

      // Populate the URL input area with the generated Drive links
      const existingUrls = videoUrls.trim() ? videoUrls.split('\n').filter(url => url.trim()) : [];
      const newUrls = [...existingUrls, ...driveLinks];
      const combinedUrls = newUrls.join('\n');
      
      console.log('📝 [VideoUpload] Populating URL input area with Drive links...');
      console.log('  - Existing URLs:', existingUrls.length);
      console.log('  - New Drive links:', driveLinks.length);
      console.log('  - Combined URLs:', combinedUrls);
      
      // Update the videoUrls state to populate the textarea
      handleUrlsChange(combinedUrls);

      console.log('🎉 [VideoUpload] Upload process completed successfully!');
      setFileUploadStatus('success');
      setFileUploadMessage(`Successfully uploaded ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} to Google Drive!\n\nFiles uploaded:\n${driveFiles.map(f => `- ${f.name} (${(f.size / 1024 / 1024).toFixed(2)} MB)`).join('\n')}\n\nDrive links have been added to the URL input area. Review and click "Upload Videos" when ready.`);
      setSelectedFiles([]);
      setUploadProgress(null);

    } catch (error) {
      console.error('❌ [VideoUpload] File upload error:', error);
      setFileUploadStatus('error');
      setFileUploadMessage(`Failed to upload files: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setUploadProgress(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

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
      {/* Upload warning modal */}
      {showUploadWarning && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.5)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 32, minWidth: 320, textAlign: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.2)' }}>
            <h2 style={{ marginBottom: 16 }}>Replace Existing Videos?</h2>
            <p style={{ marginBottom: 24 }}>
              Uploading new videos will <b>remove all current videos and clips from the dashboard</b>.<br />
              Please save any clips you want before proceeding.
            </p>
            <button onClick={handleWaitUpload} disabled={uploadStatus === 'uploading'} style={{ marginRight: 16, padding: '8px 24px', borderRadius: 4, background: '#6b7280', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
              Wait / Cancel
            </button>
            <button onClick={handleProceedUpload} disabled={uploadStatus === 'uploading'} style={{ padding: '8px 24px', borderRadius: 4, background: '#2563eb', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
              Proceed / Continue
            </button>
          </div>
        </div>
      )}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Upload Videos</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* File Upload Area */}
          <div className="card dark:bg-gray-800 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Upload Local Video Files</h2>
            
            {/* Drag and Drop Area */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragOver 
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' 
                  : 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <FileVideo className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                Drop video files here or click to browse
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Supports MP4, AVI, MOV, WMV, FLV, WEBM (Max 500MB per file)
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-primary"
              >
                Select Files
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="video/*"
                onChange={(e) => handleFileSelect(e.target.files)}
                className="hidden"
              />
            </div>

            {/* Selected Files List */}
            {selectedFiles.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Selected Files ({selectedFiles.length})
                  </h3>
                                      <button
                      type="button"
                      onClick={clearFiles}
                      className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Clear All
                    </button>
                </div>
                
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <FileVideo className="w-4 h-4 text-blue-500" />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {formatFileSize(file.size)}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Upload Progress Bar */}
                {uploadProgress && fileUploadStatus === 'uploading' && (
                  <div className="mt-4">
                    <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
                      <span>Uploading to Google Drive...</span>
                      <span>{Math.round(uploadProgress.percentage)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress.percentage}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleFileUpload}
                  disabled={fileUploadStatus === 'uploading'}
                  className="w-full mt-4 btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  <Upload className="w-4 h-4" />
                  <span>
                    {fileUploadStatus === 'uploading' ? 'Uploading...' : `Upload ${selectedFiles.length} File${selectedFiles.length !== 1 ? 's' : ''} to Drive`}
                  </span>
                </button>
              </div>
            )}

            {/* File Upload Status Messages */}
            {fileUploadMessage && (
              <div className={`mt-4 p-4 rounded-lg ${
                fileUploadStatus === 'success' ? 'bg-green-50 text-green-800' :
                fileUploadStatus === 'error' ? 'bg-red-50 text-red-800' :
                'bg-blue-50 text-blue-800'
              }`}>
                <div className="flex items-center space-x-2">
                  {fileUploadStatus === 'success' && <CheckCircle className="w-5 h-5" />}
                  {fileUploadStatus === 'error' && <AlertCircle className="w-5 h-5" />}
                  {fileUploadStatus === 'uploading' && <Upload className="w-5 h-5 animate-spin" />}
                  <span className="font-medium whitespace-pre-line">{fileUploadMessage}</span>
                </div>
              </div>
            )}
          </div>
          
          {/* URL Input Area */}
          <div className="card dark:bg-gray-800 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Add Video URLs</h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="video-urls" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Video URLs (one per line)
                </label>
                <textarea
                  id="video-urls"
                  value={videoUrls}
                  onChange={(e) => handleUrlsChange(e.target.value)}
                  className="input-field dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder-gray-400"
                  rows={8}
                  placeholder={`Enter Google Drive URLs, one per line:

https://drive.google.com/file/d/FILE_ID/view`}
                />
              </div>

              {/* URL Validation Summary */}
              {validatedUrls.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      URL Validation Summary
                    </span>
                    <button
                      type="button"
                      onClick={clearUrls}
                      className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                    >
                      Clear All
                    </button>
                  </div>
                  
                  <div className="flex items-center space-x-4 text-sm">
                    <span className="flex items-center space-x-1 text-green-600 dark:text-green-400">
                      <CheckCircle className="w-4 h-4" />
                      <span>{validCount} Valid</span>
                    </span>
                    {invalidCount > 0 && (
                      <span className="flex items-center space-x-1 text-red-600 dark:text-red-400">
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
        </div>

        {/* YouTube Download Guide - Horizontal Layout */}
        <div className="card bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 dark:from-blue-900/20 dark:to-indigo-900/20 dark:border-blue-700 mb-8">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                  <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd"/>
                </svg>
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">📥 Want to use YouTube videos?</h3>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                Since we currently support Google Drive links, you can download YouTube videos locally and then upload them here.
              </p>
              
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-blue-200 dark:border-blue-700">
                <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">🎯 Recommended Download Sites:</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    <a href="https://ssyoutube.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium">SaveFrom.net (ssyoutube.com)</a>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    <a href="https://y2mate.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium">Y2mate.com</a>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    <a href="https://ytmp4.cc" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium">YTMP4.cc</a>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    <a href="https://y2mate.is" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium">Y2mate.is</a>
                  </div>
                </div>
                
                <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-700">
                  <div className="flex items-start space-x-2">
                    <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1">Important Notes:</p>
                      <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1">
                        <li>• Choose <strong>MP4 format</strong> for best compatibility</li>
                        <li>• Ensure video size is <strong>under 500MB</strong> for upload</li>
                        <li>• Download in <strong>720p or 1080p</strong> for good quality</li>
                        <li>• Use the upload area on the left to add downloaded files</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

          {/* URL Preview */}
        <div className="card mb-8">
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

        {/* Instructions */}
        <div className="mt-8 card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">How it works</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                <span className="text-blue-600 font-bold">1</span>
              </div>
              <h4 className="font-medium text-gray-900 mb-2">Add Videos</h4>
              <p className="text-sm text-gray-600">
                Upload local video files or paste Google Drive URLs
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