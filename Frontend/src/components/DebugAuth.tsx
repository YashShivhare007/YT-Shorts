import { useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import googleAuthService from '../services/googleAuth';
import googleSheetsOAuthService from '../services/googleSheetsOAuth';
import { config } from '../config/environment';

const DebugAuth = () => {
  const [loading, setLoading] = useState(false);
  const [testResults, setTestResults] = useState<any>(null);

  const runTests = async () => {
    setLoading(true);
    const results: any = {
      authStatus: null,
      userInfo: null,
      accessToken: null,
      sheetAccess: null,
      error: null
    };

    try {
      // Test 1: Check authentication status
      const isSignedIn = googleAuthService.isSignedIn();
      results.authStatus = isSignedIn;

      if (isSignedIn) {
        // Test 2: Get user info
        results.userInfo = googleAuthService.getCurrentUser();
        
        // Test 3: Get access token
        const accessToken = googleAuthService.getAccessToken();
        results.accessToken = accessToken ? 'Present' : 'Missing';

        // Test 4: Try to access the Google Sheet
        try {
          const videos = await googleSheetsOAuthService.getAllVideos();
          results.sheetAccess = {
            success: true,
            rowCount: videos.length,
            sampleData: videos.slice(0, 3)
          };
        } catch (sheetError: any) {
          results.sheetAccess = {
            success: false,
            error: sheetError.message
          };
        }
      }
    } catch (error: any) {
      results.error = error.message;
    }

    setTestResults(results);
    setLoading(false);
  };

  const getStatusIcon = (status: boolean | null) => {
    if (status === null) return <AlertCircle className="w-4 h-4 text-gray-400" />;
    return status ? 
      <CheckCircle className="w-4 h-4 text-green-500" /> : 
      <XCircle className="w-4 h-4 text-red-500" />;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-lg shadow-sm border p-6 max-w-2xl mx-auto"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Authentication Debug</h3>
        <button
          onClick={runTests}
          disabled={loading}
          className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Run Tests</span>
        </button>
      </div>

      <div className="space-y-4">
        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="font-medium text-gray-900 mb-2">Configuration</h4>
          <div className="text-sm space-y-1">
            <div>Sheet ID: <code className="bg-gray-200 px-1 rounded">{config.googleSheets.sheetId}</code></div>
            <div>Sheet Name: <code className="bg-gray-200 px-1 rounded">{config.googleSheets.sheetName}</code></div>
            <div>Client ID: <code className="bg-gray-200 px-1 rounded">{config.google.clientId?.substring(0, 20)}...</code></div>
          </div>
        </div>

        {testResults && (
          <div className="space-y-3">
            <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
              {getStatusIcon(testResults.authStatus)}
              <span className="font-medium">Authentication Status</span>
              <span className="text-sm text-gray-600">
                {testResults.authStatus ? 'Signed In' : 'Not Signed In'}
              </span>
            </div>

            {testResults.userInfo && (
              <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                {getStatusIcon(true)}
                <span className="font-medium">User Info</span>
                <div className="text-sm text-gray-600">
                  {testResults.userInfo.name} ({testResults.userInfo.email})
                </div>
              </div>
            )}

            <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
              {getStatusIcon(testResults.accessToken === 'Present')}
              <span className="font-medium">Access Token</span>
              <span className="text-sm text-gray-600">{testResults.accessToken}</span>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-3 mb-2">
                {getStatusIcon(testResults.sheetAccess?.success)}
                <span className="font-medium">Google Sheets Access</span>
              </div>
              {testResults.sheetAccess?.success ? (
                <div className="text-sm text-gray-600 ml-7">
                  <div>Successfully accessed sheet with {testResults.sheetAccess.rowCount} rows</div>
                  {testResults.sheetAccess.sampleData?.length > 0 && (
                    <div className="mt-2">
                      <div className="font-medium">Sample data:</div>
                      <pre className="bg-white p-2 rounded text-xs overflow-x-auto">
                        {JSON.stringify(testResults.sheetAccess.sampleData, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ) : testResults.sheetAccess?.error ? (
                <div className="text-sm text-red-600 ml-7">
                  Error: {testResults.sheetAccess.error}
                </div>
              ) : null}
            </div>

            {testResults.error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="text-red-800 font-medium">Error</div>
                <div className="text-red-600 text-sm">{testResults.error}</div>
              </div>
            )}
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2">Troubleshooting Tips</h4>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>Make sure you've shared your Google Sheet with your authenticated Google account</li>
            <li>Verify that the Sheet ID in your config is correct</li>
            <li>Check that the Google Sheets API is enabled in Google Cloud Console</li>
            <li>Ensure your OAuth client has the correct authorized domains</li>
          </ul>
        </div>
      </div>
    </motion.div>
  );
};

export default DebugAuth; 