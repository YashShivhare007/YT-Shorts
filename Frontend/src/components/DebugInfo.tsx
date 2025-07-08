import { useEffect, useState } from 'react';
import { config, validateEnvironment } from '../config/environment';

const DebugInfo = () => {
  const [envStatus, setEnvStatus] = useState<any>({});

  useEffect(() => {
    const isValid = validateEnvironment();
    setEnvStatus({
      isValid,
      hasClientId: !!config.google.clientId,
      hasApiKey: !!config.google.apiKey,
      clientIdLength: config.google.clientId?.length || 0,
      apiKeyLength: config.google.apiKey?.length || 0,
      clientIdPrefix: config.google.clientId?.substring(0, 10) + '...',
      apiKeyPrefix: config.google.apiKey?.substring(0, 10) + '...'
    });
  }, []);

  return (
    <div className="fixed bottom-4 right-4 bg-white border border-gray-300 rounded-lg p-4 shadow-lg text-xs max-w-sm">
      <h4 className="font-semibold mb-2">Debug Info</h4>
      <div className="space-y-1">
        <div>Environment Valid: {envStatus.isValid ? '✅' : '❌'}</div>
        <div>Client ID: {envStatus.hasClientId ? '✅' : '❌'} ({envStatus.clientIdLength} chars)</div>
        <div>API Key: {envStatus.hasApiKey ? '✅' : '❌'} ({envStatus.apiKeyLength} chars)</div>
        <div>Client ID Preview: {envStatus.clientIdPrefix}</div>
        <div>API Key Preview: {envStatus.apiKeyPrefix}</div>
      </div>
    </div>
  );
};

export default DebugInfo; 