/**
 * Google Drive Storage Service
 * Uses the user's personal Drive space for free, syncable storage.
 */

const DRIVE_MIME_TYPE = 'application/pdf';
const FOLDER_NAME = 'RuleBook Rules';

export interface DriveFileMetadata {
  id: string;
  name: string;
  size: number;
  createdTime: string;
  description?: string; // We'll use this to store the icon URL
}

/**
 * Uploads a PDF to a specific "RuleBook" folder in the user's Google Drive.
 */
export async function uploadToDrive(accessToken: string, file: File): Promise<DriveFileMetadata> {
  // 1. Ensure the folder exists or get its ID
  const folderId = await getOrCreateFolder(accessToken);

  // 2. Upload the file
  const metadata = {
    name: file.name,
    parents: [folderId],
    mimeType: DRIVE_MIME_TYPE,
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,createdTime', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` },
    body: form,
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Drive Upload Failed: ${err.error.message}`);
  }

  return await response.json();
}

/**
 * Fetches all PDFs from the RuleBook folder in Drive.
 */
export async function fetchFromDrive(accessToken: string): Promise<DriveFileMetadata[]> {
  const folderId = await getOrCreateFolder(accessToken);
  
  const query = `'${folderId}' in parents and trashed = false and mimeType = '${DRIVE_MIME_TYPE}'`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,size,createdTime,description)&orderBy=createdTime desc`;

  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) throw new Error('Failed to fetch from Drive');
  
  const data = await response.json();
  return data.files || [];
}

/**
 * Downloads a file from Drive and returns it as a Base64 string for the AI.
 */
export async function downloadFromDrive(accessToken: string, fileId: string): Promise<string> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) throw new Error('Failed to download from Drive');

  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      resolve(base64.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Deletes a file from Drive.
 */
export async function deleteFromDrive(accessToken: string, fileId: string): Promise<void> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) throw new Error('Failed to delete from Drive');
}

/**
 * Renames a file in Drive.
 */
export async function renameInDrive(accessToken: string, fileId: string, newName: string): Promise<void> {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'PATCH',
    headers: { 
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: newName })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Drive Rename Failed: ${err.error.message}`);
  }
}

/**
 * Updates the icon URL in Drive (stored in description).
 * We store it as a JSON string to keep things tidy.
 */
export async function updateMetadataInDrive(accessToken: string, fileId: string, updates: { iconUrl?: string, lastUsed?: number }): Promise<void> {
  // 1. Get existing description first to merge
  const getResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=description`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  let currentMetadata: any = {};
  if (getResponse.ok) {
    const data = await getResponse.json();
    try {
      currentMetadata = JSON.parse(data.description || '{}');
    } catch {
      // If not JSON, it was likely just a plain iconUrl from previous versions
      if (data.description) currentMetadata = { iconUrl: data.description };
    }
  }

  const newMetadata = { ...currentMetadata, ...updates };

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'PATCH',
    headers: { 
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ description: JSON.stringify(newMetadata) })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Drive Metadata Update Failed: ${err.error.message}`);
  }
}

// Keep the old name but redirect to new logic for backward compatibility in App.tsx imports (though I'll update App.tsx too)
export async function updateIconInDrive(accessToken: string, fileId: string, iconUrl: string): Promise<void> {
  return updateMetadataInDrive(accessToken, fileId, { iconUrl });
}

export async function updateFullMetadataInDrive(accessToken: string, fileId: string, updates: { name?: string, iconUrl?: string, lastUsed?: number }): Promise<void> {
  const body: any = {};
  if (updates.name) body.name = updates.name;
  
  if (updates.iconUrl !== undefined || updates.lastUsed !== undefined) {
    // 1. Get existing description first to merge
    const getResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=description`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    let currentMetadata: any = {};
    if (getResponse.ok) {
      const data = await getResponse.json();
      try {
        currentMetadata = JSON.parse(data.description || '{}');
      } catch {
        if (data.description) currentMetadata = { iconUrl: data.description };
      }
    }

    const mergedMeta = { ...currentMetadata, ...updates };
    delete mergedMeta.name; // Don't store name in description JSON
    
    body.description = JSON.stringify(mergedMeta);
  }

  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'PATCH',
    headers: { 
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Drive Full Update Failed: ${err.error.message}`);
  }
}

/**
 * Helper to find or create the hidden app folder.
 */
async function getOrCreateFolder(accessToken: string): Promise<string> {
  const query = `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const searchResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  const searchData = await searchResponse.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create it if it doesn't exist
  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });

  const createData = await createResponse.json();
  return createData.id;
}
