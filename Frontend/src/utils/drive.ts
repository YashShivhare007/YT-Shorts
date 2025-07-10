export const getDriveEmbedUrl = (driveLink: string): string | null => {
  const match = driveLink.match(/file\/d\/([^/]+)/);
  if (match && match[1]) {
    const fileId = match[1];
    return `https://drive.google.com/file/d/${fileId}/preview`;
  }
  return null;
};

export const getDriveDownloadUrl = (driveLink: string): string | null => {
  const match = driveLink.match(/file\/d\/([^/]+)/);
  if (match && match[1]) {
    const fileId = match[1];
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }
  return null;
}; 