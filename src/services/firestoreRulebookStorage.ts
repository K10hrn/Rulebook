import { 
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  writeBatch,
  updateDoc,
  deleteField
} from 'firebase/firestore';
import { db } from '../firebase';
import { LocalGame } from './localRulebookStorage';

const COLLECTION_NAME = 'rulebooks';
const CHUNK_SIZE = 500 * 1024; // 500KB chunks to be safe

export async function saveRulebookToGlobal(file: File): Promise<string> {
  const id = crypto.randomUUID();
  const arrayBuffer = await file.arrayBuffer();
  const base64 = await getBase64FromBuffer(arrayBuffer);
  
  // 1. Save metadata
  const gameMetadata = {
    id,
    name: file.name,
    size: file.size,
    date: Date.now(),
    lastUsed: Date.now()
  };
  
  await setDoc(doc(db, COLLECTION_NAME, id), gameMetadata);
  
  // 2. Chunk and save PDF data
  const chunks = chunkString(base64, CHUNK_SIZE);
  for (let i = 0; i < chunks.length; i++) {
    await setDoc(doc(db, `${COLLECTION_NAME}/${id}/chunks`, `chunk_${i}`), {
      data: chunks[i],
      index: i
    });
  }
  
  return id;
}

export async function fetchGlobalLibrary(): Promise<LocalGame[]> {
  const q = query(collection(db, COLLECTION_NAME), orderBy('date', 'desc'));
  const querySnapshot = await getDocs(q);
  
  return querySnapshot.docs.map(doc => ({
    ...doc.data(),
    id: doc.id,
    data: new Uint8Array(0) // We don't fetch data until needed
  } as LocalGame));
}

export async function downloadFromGlobal(gameId: string): Promise<string> {
  const chunksSnap = await getDocs(query(collection(db, `${COLLECTION_NAME}/${gameId}/chunks`), orderBy('index', 'asc')));
  let fullBase64 = '';
  chunksSnap.forEach(doc => {
    fullBase64 += doc.data().data;
  });
  return fullBase64;
}

export async function deleteFromGlobal(gameId: string) {
  // 1. Delete chunks first
  const chunksSnap = await getDocs(collection(db, `${COLLECTION_NAME}/${gameId}/chunks`));
  const batch = writeBatch(db);
  chunksSnap.forEach(chunkDoc => {
    batch.delete(chunkDoc.ref);
  });
  await batch.commit();
  
  // 2. Delete metadata
  await deleteDoc(doc(db, COLLECTION_NAME, gameId));
}

export async function updateGlobalMetadata(id: string, updates: {
  name?: string,
  iconUrl?: string,
  lastUsed?: number,
  houseRules?: string
}) {
  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(updates)) {
    sanitized[k] = v === undefined ? deleteField() : v;
  }
  await updateDoc(doc(db, COLLECTION_NAME, id), sanitized);
}

function chunkString(str: string, size: number): string[] {
  const chunks = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.substring(i, i + size));
  }
  return chunks;
}

async function getBase64FromBuffer(buffer: ArrayBuffer): Promise<string> {
  const blob = new Blob([buffer], { type: 'application/pdf' });
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
