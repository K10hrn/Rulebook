import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

const cfg = firebaseConfig as typeof firebaseConfig & { firestoreDatabaseId?: string };
export const db = getFirestore(app, cfg.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);

export default app;
