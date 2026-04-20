import { 
  collection, 
  query, 
  getDocs, 
  addDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  orderBy,
  getDocFromServer
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject,
  getBlob
} from 'firebase/storage';
import { db, storage } from '../firebase';

export interface CloudGame {
  id: string;
  name: string;
  size: number;
  date: number;
  storagePath: string;
}

// Critical for testing connection on boot
export async function testFirestoreConnection() {
  try {
    // Attempt to read a non-existent test doc to trigger connection check
    await getDocFromServer(doc(db, 'system', 'health'));
  } catch (error: any) {
    if (error?.message?.includes('the client is offline')) {
      console.error("Firebase connection error: The client is offline.");
    }
    throw error;
  }
}

export async function fetchCloudLibrary(userId: string): Promise<CloudGame[]> {
  const q = query(
    collection(db, 'users', userId, 'rulebooks'),
    orderBy('date', 'desc')
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as CloudGame));
}

export async function uploadRulebookToCloud(userId: string, file: File): Promise<CloudGame> {
  const rulebookId = crypto.randomUUID();
  const storagePath = `users/${userId}/rulebooks/${rulebookId}_${file.name}`;
  const storageRef = ref(storage, storagePath);
  
  // 1. Upload to Storage
  await uploadBytes(storageRef, file);
  
  // 2. Save Metadata to Firestore
  const rulebookData = {
    name: file.name,
    size: file.size,
    date: Date.now(),
    storagePath: storagePath
  };
  
  const docRef = await addDoc(collection(db, 'users', userId, 'rulebooks'), rulebookData);
  
  return {
    id: docRef.id,
    ...rulebookData
  };
}

export async function deleteRulebookFromCloud(userId: string, gameId: string, storagePath: string) {
  // 1. Delete from Firestore
  await deleteDoc(doc(db, 'users', userId, 'rulebooks', gameId));
  
  // 2. Delete from Storage
  const storageRef = ref(storage, storagePath);
  await deleteObject(storageRef);
}

export async function downloadRulebookAsBase64(storagePath: string): Promise<string> {
  const storageRef = ref(storage, storagePath);
  const blob = await getBlob(storageRef);
  
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
