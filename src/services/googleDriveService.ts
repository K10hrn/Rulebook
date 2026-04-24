/**
 * Service for interacting with Google Drive.
 */

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

export const googleDriveService = {
  async findOrCreateFolder(accessToken: string, folderName: string): Promise<string> {
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const response = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await response.json();

    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }

    // Create folder
    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
      })
    });
    const folderData = await createResponse.json();
    return folderData.id;
  },

  async listPdfsInFolder(accessToken: string, folderId: string): Promise<DriveFile[]> {
    const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and mimeType='application/pdf' and trashed=false`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await response.json();
    return data.files || [];
  },

  async downloadFile(accessToken: string, fileId: string): Promise<Blob> {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) throw new Error('Failed to download file from Drive');
    return await response.blob();
  }
};
