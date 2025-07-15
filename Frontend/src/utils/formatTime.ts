// Utility to format processing time from ISO 8601 strings to human-readable duration
export function formatProcessingTime(startTime?: string, endTime?: string): string {
  if (!startTime || !endTime) return 'N/A';
  try {
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 'N/A';
    let diff = Math.floor((end.getTime() - start.getTime()) / 1000); // in seconds
    if (diff < 0) return 'N/A';
    const hours = Math.floor(diff / 3600);
    diff %= 3600;
    const minutes = Math.floor(diff / 60);
    const seconds = diff % 60;
    let result = '';
    if (hours > 0) result += `${hours}h `;
    if (minutes > 0 || hours > 0) result += `${minutes}m `;
    result += `${seconds}s`;
    return result.trim();
  } catch {
    return 'N/A';
  }
} 