/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  MessageSquare, 
  Book, 
  Send, 
  X, 
  Loader2, 
  ChevronRight,
  Library,
  Bot,
  User,
  Info,
  Dices,
  Trash2,
  Clock,
  LogIn,
  LogOut,
  UserCircle,
  Edit2,
  Check,
  ListChecks,
  HelpCircle,
  MessageCircle,
  ShieldCheck,
  Image,
  Eye,
  Link as LinkIcon,
  XCircle,
  Settings,
  Sparkles,
  Zap,
  Sun,
  Moon,
  CloudUpload,
  RefreshCw
} from 'lucide-react';
import Markdown from 'react-markdown';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  sendEmailVerification,
  User as FirebaseUser
} from 'firebase/auth';
import { db, auth } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { 
  LocalGame, 
  fetchLocalLibrary, 
  saveRulebookLocally, 
  deleteRulebookLocally, 
  renameRulebookLocally,
  updateRulebookIconLocally,
  updateRulebookMetadataLocally,
  getBase64FromUint8Array
} from './services/localRulebookStorage';
import { 
  fetchFromDrive, 
  uploadToDrive, 
  downloadFromDrive, 
  deleteFromDrive,
  renameInDrive,
  updateIconInDrive,
  updateFullMetadataInDrive,
  DriveFileMetadata 
} from './services/googleDriveService';
import { rulebookService, Message } from './services/geminiService';

interface GameIconProps {
  iconUrl?: string;
  className?: string;
  name?: string;
}

const GameIcon: React.FC<GameIconProps> = ({ iconUrl, className = "w-8 h-8" }) => {
  const [hasError, setHasError] = useState(false);

  // Reset error if iconUrl changes
  useEffect(() => {
    setHasError(false);
  }, [iconUrl]);

  return (
    <div className={`${className} bg-gold/5 flex items-center justify-center border border-gold/10 group-hover:border-gold/30 rounded overflow-hidden relative transition-all`}>
      {iconUrl && !hasError ? (
        <img 
          src={iconUrl} 
          alt="" 
          className="w-full h-full object-cover" 
          referrerPolicy="no-referrer"
          onError={() => setHasError(true)}
        />
      ) : (
        <Book className="w-1/2 h-1/2 text-gold/60 group-hover:text-gold" />
      )}
    </div>
  );
};

export default function App() {
  const [isActive, setIsActive] = useState(false);
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [library, setLibrary] = useState<LocalGame[]>([]);
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [userApiKey, setUserApiKey] = useState<string>('');
  const [isEmailUnverified, setIsEmailUnverified] = useState(false);
  const [isNotAllowed, setIsNotAllowed] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasLocalGames, setHasLocalGames] = useState(false);
  const [isSyncingLocalToCloud, setIsSyncingLocalToCloud] = useState(false);
  const [managingGame, setManagingGame] = useState<LocalGame | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('theme', theme);
    } catch (e) {
      console.warn('LocalStorage blocked, theme will not persist');
    }
    if (theme === 'light') {
      document.body.classList.add('light-theme');
      document.documentElement.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
      document.documentElement.classList.remove('light-theme');
    }
  }, [theme]);
  const [manageName, setManageName] = useState('');
  const [manageLogo, setManageLogo] = useState('');
  const [manageHouseRules, setManageHouseRules] = useState('');
  const [isFindingLogo, setIsFindingLogo] = useState(false);
  const [findLogoError, setFindLogoError] = useState(false);
  const [findLogoLimit, setFindLogoLimit] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAllowedUser = async (user: FirebaseUser) => {
    const adminEmail = 'kellyellen.kenyon@gmail.com';
    if (user.email === adminEmail) {
      setIsAdmin(true);
      return true;
    }
    
    setIsAdmin(false);
    try {
      const allowRef = doc(db, 'allowlist', user.email || '');
      const docSnap = await getDoc(allowRef);
      return docSnap.exists();
    } catch (e) {
      // If we can't even check, they are likely not allowed due to rule denying read
      return false;
    }
  };

  useEffect(() => {
    // Sync logic: When user logs in/out, reload the library
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const savedKey = localStorage.getItem('user_gemini_api_key');
      if (savedKey) {
        setUserApiKey(savedKey);
        rulebookService.updateApiKey(savedKey);
      }

      if (user) {
        setCurrentUser(user);
        if (!user.emailVerified) {
          setIsEmailUnverified(true);
          setDriveToken(null);
        } else {
          setIsEmailUnverified(false);
          const allowed = await isAllowedUser(user);
          if (!allowed) {
            setIsNotAllowed(true);
            setDriveToken(null);
          } else {
            setIsNotAllowed(false);
          }
        }
      } else {
        setIsEmailUnverified(false);
        setIsNotAllowed(false);
        setIsAdmin(false);
        setCurrentUser(null);
        setDriveToken(null);
        loadLibrary(); // Fallback to local
      }
      setAuthLoading(false);
    });

    loadLibrary();

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (findLogoLimit) {
      timer = setTimeout(() => {
        setFindLogoLimit(false);
      }, 60000);
    }
    return () => clearTimeout(timer);
  }, [findLogoLimit]);

  const loadLibrary = async (token?: string) => {
    setIsSyncing(true);
    try {
      // Always check for local games to see if we need to offer a sync
      const localGames = await fetchLocalLibrary();
      setHasLocalGames(localGames.length > 0);

      if (token) {
        const driveGames = await fetchFromDrive(token);
        // Map Drive metadata to our UI format
        const games: LocalGame[] = driveGames.map(f => {
          let iconUrl = f.description;
          let lastUsed = 0;
          
          try {
            const meta = JSON.parse(f.description || '{}');
            iconUrl = meta.iconUrl || iconUrl;
            lastUsed = meta.lastUsed || 0;
          } catch {
            // Keep iconUrl as raw description if parse fails
          }

          return {
            id: f.id,
            name: f.name,
            size: Number(f.size),
            date: new Date(f.createdTime).getTime(),
            data: new Uint8Array(), // Data is fetched on-demand for Drive files
            iconUrl,
            lastUsed
          };
        });
        setLibrary(games);
      } else {
        setLibrary(localGames);
      }
    } catch (err) {
      console.error("Failed to load library:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const syncLocalToDrive = async () => {
    if (!driveToken) return;
    setIsSyncingLocalToCloud(true);
    try {
      const localGames = await fetchLocalLibrary();
      for (const game of localGames) {
        // Create a File-like object from the local data
        const blob = new Blob([game.data], { type: 'application/pdf' });
        const fileObj = new File([blob], game.name, { type: 'application/pdf' });
        
        // 1. Upload the file
        const driveFile = await uploadToDrive(driveToken, fileObj);
        
        // 2. Upload metadata (icon)
        if (game.iconUrl) {
          await updateIconInDrive(driveToken, driveFile.id, game.iconUrl);
        }
        
        // 3. Delete locally after successful cloud push
        await deleteRulebookLocally(game.id);
      }
      
      // Refresh library
      await loadLibrary(driveToken);
      setMessages(prev => [
        ...prev,
        { role: 'model', content: `✨ **Migration Complete!** I've synced ${localGames.length} rulebooks from your local storage to your Google Drive.` }
      ]);
    } catch (err) {
      console.error("Sync failed:", err);
      alert("Cloud Sync failed. Please ensure you have sufficient Drive space.");
    } finally {
      setIsSyncingLocalToCloud(false);
    }
  };

  const handleResendVerification = async () => {
    if (currentUser) {
      try {
        await sendEmailVerification(currentUser);
        setVerificationSent(true);
        setTimeout(() => setVerificationSent(false), 5000);
      } catch (err) {
        console.error("Failed to send verification email:", err);
      }
    }
  };

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    
    try {
      const result = await signInWithPopup(auth, provider);
      if (result.user && !result.user.emailVerified) {
        setIsEmailUnverified(true);
        return;
      }
      
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        const token = credential.accessToken;
        setDriveToken(token);
        await loadLibrary(token);
      }
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  const handleAddToAllowList = async (email: string) => {
    if (!isAdmin) return;
    try {
      await setDoc(doc(db, 'allowlist', email.toLowerCase().trim()), {
        addedAt: Date.now(),
        addedBy: currentUser?.email
      });
      alert(`Access granted to ${email}`);
    } catch (err) {
      console.error("Failed to add to allowlist:", err);
      alert("Error adding user to access list.");
    }
  };

  const handleSaveUserApiKey = (key: string) => {
    const trimmed = key.trim();
    setUserApiKey(trimmed);
    localStorage.setItem('user_gemini_api_key', trimmed);
    rulebookService.updateApiKey(trimmed);
    if (trimmed) {
      alert("API Key saved! The Arbiter will now use your personal quota.");
    } else {
      alert("API Key cleared. The Arbiter will revert to the default shared quota.");
    }
  };
  const handleLogout = async () => {
    try {
      await signOut(auth);
      resetOracle();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const processFile = async (selectedFile: File) => {
    setIsUploading(true);
    const now = Date.now();
    try {
      if (driveToken) {
        // Cloud Sync: Upload to Drive
        const driveFile = await uploadToDrive(driveToken, selectedFile);
        if (driveToken && driveFile.id) {
          await updateFullMetadataInDrive(driveToken, driveFile.id, { lastUsed: now });
        }
        
        // Prepare for current session (local read)
        const arrayBuffer = await selectedFile.arrayBuffer();
        const base64Data = await getBase64FromUint8Array(new Uint8Array(arrayBuffer));
        rulebookService.setPDF(base64Data);

        setFile({ name: driveFile.name, size: Number(driveFile.size) });
        setIsActive(true);
        setMessages([
          { role: 'model', content: `The Arbiter has synced **${driveFile.name}** to your Google Drive. It is now available on all your devices.` }
        ]);
        
        loadLibrary(driveToken);
      } else {
        // Local Only
        const localGame = await saveRulebookLocally(selectedFile);
        const base64Data = await getBase64FromUint8Array(localGame.data);
        rulebookService.setPDF(base64Data);
        
        setFile({ name: localGame.name, size: localGame.size });
        setIsActive(true);
        setMessages([
          { role: 'model', content: `The Arbiter has indexed **${localGame.name}** to your local library. (Note: Sign in to sync this game across devices).` }
        ]);
        loadLibrary();
      }
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Failed to process rulebook. Ensure the Drive API is enabled for your project.");
    } finally {
      setIsUploading(false);
    }
  };

  const deleteFromLibrary = async (gameId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (driveToken) {
        await deleteFromDrive(driveToken, gameId);
        loadLibrary(driveToken);
      } else {
        await deleteRulebookLocally(gameId);
        loadLibrary();
      }
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const openManageModal = (game: LocalGame, e: React.MouseEvent) => {
    e.stopPropagation();
    setManagingGame(game);
    setManageName(game.name);
    setManageLogo(game.iconUrl || '');
    setManageHouseRules(game.houseRules || '');
  };

  const handleMagicLogo = async () => {
    if (!manageName.trim() || isFindingLogo) return;
    setIsFindingLogo(true);
    setFindLogoError(false);
    setFindLogoLimit(false);
    try {
      const url = await rulebookService.findLogoUrl(manageName.trim());
      if (url) {
        setManageLogo(url);
      } else {
        setFindLogoError(true);
        setTimeout(() => setFindLogoError(false), 3000);
      }
    } catch (err: any) {
      if (err.message === 'RATE_LIMIT') {
        setFindLogoLimit(true);
      } else {
        console.error("Magic logo failed:", err);
        setFindLogoError(true);
        setTimeout(() => setFindLogoError(false), 3000);
      }
    } finally {
      setIsFindingLogo(false);
    }
  };

  const handleSaveMetadata = async () => {
    if (!managingGame) return;

    // Background the actual update but close modal instantly
    const updates = {
      name: manageName.trim(),
      iconUrl: manageLogo.trim() || undefined,
      houseRules: manageHouseRules.trim() || undefined
    };
    const gameId = managingGame.id;
    const currentDriveToken = driveToken;

    setManagingGame(null); // Close modal immediately

    try {
      if (currentDriveToken) {
        await updateFullMetadataInDrive(currentDriveToken, gameId, {
          name: updates.name,
          iconUrl: updates.iconUrl,
          houseRules: updates.houseRules
        });
        loadLibrary(currentDriveToken);
      } else {
        await updateRulebookMetadataLocally(gameId, updates);
        loadLibrary();
      }
    } catch (err) {
      console.error("Background metadata update failed:", err);
    }
  };

  const viewRulebook = async (game: LocalGame) => {
    try {
      let base64 = '';
      if (driveToken && game.data.length === 0) {
        base64 = await downloadFromDrive(driveToken, game.id);
      } else {
        base64 = await getBase64FromUint8Array(game.data);
      }
      const binaryString = window.atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      console.error("Failed to view rulebook:", err);
      alert("Could not open file for viewing.");
    }
  };

  const loadFromLibrary = async (game: LocalGame) => {
    setIsGenerating(false);
    setStreamingMessage('');
    setMessages([]);
    
    // Update last used
    const now = Date.now();
    if (driveToken && game.id) {
      updateFullMetadataInDrive(driveToken, game.id, { lastUsed: now });
    } else if (game.id) {
      updateRulebookMetadataLocally(game.id, { lastUsed: now });
    }
    
    // Optimistic update
    setLibrary(prev => prev.map(g => g.id === game.id ? { ...g, lastUsed: now } : g));

    let base64 = '';
    setIsUploading(true);
    try {
      if (driveToken && game.data.length === 0) {
        // Fetch data from Drive if it's not local
        base64 = await downloadFromDrive(driveToken, game.id);
      } else {
        base64 = await getBase64FromUint8Array(game.data);
      }
      
      rulebookService.setHouseRules(game.houseRules || '');
      rulebookService.setPDF(base64);
      setFile({ name: game.name, size: game.size });
      setActiveGameId(game.id);
      setIsActive(true);
      setIsLibraryOpen(false);
      setMessages([
        { role: 'model', content: `The Arbiter has recalled the rules for **${game.name}**. I am ready to provide final rulings.` }
      ]);
    } catch (err) {
      console.error("Failed to load rulebook:", err);
      alert("Could not retrieve file. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      await processFile(selectedFile);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isGenerating) return;

    const userMsg = inputValue.trim();
    setInputValue('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsGenerating(true);
    setStreamingMessage('');

    try {
      if (!process.env.GEMINI_API_KEY && !userApiKey) {
        setMessages(prev => [...prev, { role: 'model', content: "⚠️ **Arbiter Key Missing**: Please set your personal Gemini API key in **About > AI Costs & Quotas** to use the Arbiter." }]);
        setIsGenerating(false);
        return;
      }

      await rulebookService.askQuestion(userMsg, (chunk) => {
        setStreamingMessage(chunk);
      });
      
      setMessages(prev => [...prev, { role: 'model', content: rulebookService.getHistory().slice(-1)[0].content }]);
      setStreamingMessage('');
    } catch (err: any) {
      const isOverloaded = err?.message?.includes("503") || err?.stack?.includes("503");
      const errorMessage = isOverloaded 
        ? "The Arbiter is currently experiencing high demand and cannot provide a ruling right now. Please wait a moment and try again."
        : "The Arbiter encountered an unexpected error while processing your request. Please check your connection and try again.";
      
      setMessages(prev => [...prev, { role: 'model', content: errorMessage }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateQuickStart = async () => {
    if (isGenerating) return;

    setIsGenerating(true);
    setStreamingMessage('');
    setMessages(prev => [...prev, { role: 'user', content: "Generating Quick Start Guide..." }]);

    try {
      await rulebookService.generateQuickStart((chunk) => {
        setStreamingMessage(chunk);
      });
      
      setMessages(prev => [...prev, { role: 'model', content: rulebookService.getHistory().slice(-1)[0].content }]);
      setStreamingMessage('');
    } catch (err: any) {
      const isOverloaded = err?.message?.includes("503") || err?.stack?.includes("503");
      const errorMessage = isOverloaded 
        ? "The Arbiter is currently under high demand. I couldn't generate the Quick Start guide—please try again in a few seconds."
        : "I encountered an error while generating the Quick Start guide. Please try again.";
      setMessages(prev => [...prev, { role: 'model', content: errorMessage }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateSetupGuide = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setStreamingMessage('');
    setMessages(prev => [...prev, { role: 'user', content: "Generating Setup Guide..." }]);
    try {
      await rulebookService.generateSetupGuide((chunk) => setStreamingMessage(chunk));
      setMessages(prev => [...prev, { role: 'model', content: rulebookService.getHistory().slice(-1)[0].content }]);
      setStreamingMessage('');
    } catch (err: any) {
      const isOverloaded = err?.message?.includes("503") || err?.stack?.includes("503");
      const errorMessage = isOverloaded 
        ? "The Arbiter is currently under high demand. I couldn't generate the setup guide—please try again in a few seconds."
        : "I encountered an error while generating the setup guide. Please try again.";
      setMessages(prev => [...prev, { role: 'model', content: errorMessage }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateFAQ = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setStreamingMessage('');
    setMessages(prev => [...prev, { role: 'user', content: "Generating FAQ..." }]);
    try {
      await rulebookService.generateFAQ((chunk) => setStreamingMessage(chunk));
      setMessages(prev => [...prev, { role: 'model', content: rulebookService.getHistory().slice(-1)[0].content }]);
      setStreamingMessage('');
    } catch (err: any) {
      const isOverloaded = err?.message?.includes("503") || err?.stack?.includes("503");
      const errorMessage = isOverloaded 
        ? "The Arbiter is currently under high demand. I couldn't generate the FAQ—please try again in a few seconds."
        : "I encountered an error while generating the FAQ. Please try again.";
      setMessages(prev => [...prev, { role: 'model', content: errorMessage }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFocusChat = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    document.getElementById('chat-input')?.focus();
  };

  const resetOracle = () => {
    setIsActive(false);
    setFile(null);
    setMessages([]);
    setStreamingMessage('');
  };

  return (
    <div className="min-h-screen bg-bg-base flex flex-col md:flex-row text-text-primary">
      {/* Sidebar - Desktop */}
      <div className="hidden md:flex w-72 bg-bg-sidebar border-r border-line flex-col">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-8 group">
            <div className="relative">
              <div className="w-10 h-10 bg-gold/10 rounded-xl border border-gold/40 flex items-center justify-center transition-transform group-hover:-rotate-6 gold-glow">
                <Library className="w-5 h-5 text-gold" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-gold rounded-lg flex items-center justify-center shadow-lg transition-transform group-hover:rotate-12">
                <Dices className="w-3.5 h-3.5 text-bg-base" />
              </div>
            </div>
            <h1 className="font-serif text-lg font-light text-text-gold tracking-widest uppercase gold-text-glow">Rulebooks</h1>
          </div>
          
          <button 
            onClick={() => {
              if (isGenerating) return;
              if (file) resetOracle();
              fileInputRef.current?.click();
            }}
            className="w-full glass py-3 rounded text-[10px] uppercase tracking-[0.2em] text-gold font-bold mb-8 hover:bg-gold/10 hover:border-gold/30 transition-all cursor-pointer gold-glow"
          >
            + Summon Arbiter
          </button>

          <div className="flex flex-col gap-6 flex-1 overflow-hidden">
            <div className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-bold flex items-center justify-between">
              <span>Active Rulebook</span>
              {file && <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse"></span>}
            </div>
            
            {file ? (
              <div className="space-y-4">
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-3 bg-[var(--color-gold-muted)] border-l-2 border-gold rounded-r flex items-center gap-3 group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-text-primary truncate">{file.name}</div>
                    <div className="text-[10px] opacity-60 text-text-muted">{(file.size / 1024 / 1024).toFixed(1)} MB • PDF</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => {
                         // Find the game in library to get its data
                         const game = library.find(g => g.name === file.name);
                         if (game) viewRulebook(game);
                      }}
                      className="p-1 text-text-muted hover:text-white transition-colors"
                      title="View PDF"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={resetOracle}
                      className="p-1 text-text-muted hover:text-red-500 transition-colors"
                      title="Close current game"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
                
                <div className="grid grid-cols-1 gap-2 pt-2">
                  <button
                    onClick={handleFocusChat}
                    className="w-full flex items-center gap-3 p-3 border border-gold/20 rounded-xl hover:bg-gold/10 transition-all text-left group glass"
                  >
                    <div className="w-6 h-6 rounded-lg bg-gold/20 flex items-center justify-center">
                      <MessageCircle className="w-4 h-4 text-text-gold" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-text-gold">Summon Arbiter Chat</span>
                  </button>

                  <button
                    onClick={handleGenerateQuickStart}
                    disabled={isGenerating}
                    className="w-full flex items-center gap-3 p-3 border border-gold/20 rounded-xl hover:bg-gold/10 transition-all text-left group"
                  >
                    <div className="w-6 h-6 rounded-lg bg-gold/20 flex items-center justify-center">
                      <ChevronRight className="w-4 h-4 text-text-gold" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-text-gold">Quick Start Guide</span>
                  </button>

                  <button
                    onClick={handleGenerateSetupGuide}
                    disabled={isGenerating}
                    className="w-full flex items-center gap-3 p-3 border border-gold/20 rounded-xl hover:bg-gold/10 transition-all text-left group"
                  >
                    <div className="w-6 h-6 rounded-lg bg-gold/20 flex items-center justify-center">
                      <ListChecks className="w-4 h-4 text-text-gold" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-text-gold">How to Set Up</span>
                  </button>

                  <button
                    onClick={handleGenerateFAQ}
                    disabled={isGenerating}
                    className="w-full flex items-center gap-3 p-3 border border-gold/20 rounded-xl hover:bg-gold/10 transition-all text-left group"
                  >
                    <div className="w-6 h-6 rounded-lg bg-gold/20 flex items-center justify-center">
                      <HelpCircle className="w-4 h-4 text-text-gold" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-text-gold">Rules FAQ</span>
                  </button>

                  <button
                    onClick={resetOracle}
                    className="w-full flex items-center gap-3 p-3 border border-red-500/20 rounded-xl hover:bg-red-500/10 transition-all text-left group mt-2"
                  >
                    <div className="w-6 h-6 rounded-lg bg-red-500/20 flex items-center justify-center">
                      <XCircle className="w-4 h-4 text-red-400" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">Close Active Game</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 glass rounded-xl border border-dashed border-white/5">
                <p className="text-[10px] uppercase tracking-widest text-center text-text-muted opacity-50 italic">No game summoned</p>
              </div>
            )}

            <div className="mt-4 pt-6 border-t border-line/30 flex flex-col gap-4 overflow-hidden">
              <div className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-bold flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Library className="w-3 h-3" /> Game Shelf
                </span>
                <div className="flex items-center gap-2">
                  {driveToken && (
                    <button 
                      onClick={() => loadLibrary(driveToken)}
                      disabled={isSyncing}
                      className="p-1 px-1.5 text-text-muted hover:text-gold transition-colors flex items-center gap-1 group"
                      title="Reload library from cloud"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform'}`} />
                      <span className="text-[9px] uppercase tracking-tighter hidden sm:inline">Refresh</span>
                    </button>
                  )}
                  {hasLocalGames && driveToken && !isSyncingLocalToCloud && (
                    <button 
                      onClick={syncLocalToDrive}
                      className="text-[9px] px-2 py-1 bg-gold/20 hover:bg-gold/30 text-gold rounded border border-gold/30 flex items-center gap-1 transition-colors animate-pulse"
                      title="Move local rulebooks to your Google Drive"
                    >
                      <CloudUpload className="w-3 h-3" /> Sync
                    </button>
                  )}
                  {isSyncingLocalToCloud && <Loader2 className="w-3 h-3 animate-spin text-gold" />}
                  {isSyncing && <Loader2 className="w-3 h-3 animate-spin text-gold/50" />}
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                {library.length > 0 ? (
                  library
                    .sort((a, b) => (b.lastUsed || b.date) - (a.lastUsed || a.date))
                    .map((game) => (
                    <motion.div
                      key={game.id}
                      className="relative group"
                    >
                      <motion.button
                        whileHover={{ x: 4 }}
                        onClick={() => !isGenerating && !managingGame && loadFromLibrary(game)}
                        className={`w-full text-left p-3 rounded-lg border transition-all flex items-center gap-3 relative
                          ${file?.name === game.name 
                            ? 'bg-gold/10 border-gold/40' 
                            : 'bg-white/[0.02] border-transparent hover:border-gold/20 hover:bg-white/[0.04]'}`}
                      >
                        <GameIcon 
                          iconUrl={game.iconUrl} 
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-medium text-text-primary truncate">{game.name}</div>
                          <div className="text-[9px] text-text-muted font-medium italic opacity-60">{(game.size / 1024 / 1024).toFixed(1)} MB</div>
                        </div>
                      </motion.button>
                      
                      {!managingGame && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={(e) => { e.stopPropagation(); viewRulebook(game); }}
                            className="p-1.5 text-text-muted hover:text-white transition-colors"
                            title="View Rulebook"
                          >
                            <Eye className="w-3 h-3" />
                          </button>
                          <button 
                            onClick={(e) => openManageModal(game, e)}
                            className="p-1.5 text-text-muted hover:text-gold transition-colors"
                            title="Manage Game"
                          >
                            <Settings className="w-3 h-3" />
                          </button>
                          <button 
                            onClick={(e) => deleteFromLibrary(game.id, e)}
                            className="p-1.5 text-text-muted hover:text-red-500 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </motion.div>
                  ))
                ) : (
                  <p className="text-[10px] text-text-muted italic opacity-50 px-2">Your shelf is empty...</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-auto p-6 border-t border-line">
          {currentUser ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {currentUser.photoURL ? (
                  <img src={currentUser.photoURL} alt={currentUser.displayName || ''} className="w-8 h-8 rounded-full border border-gold/30" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center text-gold border border-gold/30">
                    <UserCircle className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <p className="text-[11px] font-bold text-text-primary truncate max-w-[100px]">{currentUser.displayName || 'The Scribe'}</p>
                  <p className="text-[9px] text-text-gold uppercase tracking-widest opacity-60">
                    {driveToken ? 'Cloud Sync On' : 'Session Active'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} 
                  className="p-2 text-text-muted hover:text-gold transition-colors" 
                  title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
                <button onClick={handleLogout} className="p-2 text-text-muted hover:text-red-400 transition-colors" title="Sign Out">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 glass rounded-xl text-[10px] uppercase tracking-widest font-bold text-gold hover:bg-gold/10 transition-all border border-gold/20"
            >
              <LogIn className="w-4 h-4" /> Sign In
            </button>
          )}
          <div className="flex items-center justify-between mt-6 pt-6 border-t border-line/30">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
              <p className="text-[10px] text-text-muted font-medium tracking-tight">The Arbiter is Online</p>
            </div>
            <div className="flex flex-col items-end opacity-30 select-none">
              <p className="text-[8px] font-mono tracking-tighter">v1.0.4-keysync</p>
              {process.env.GEMINI_API_KEY && (
                <p className="text-[7px] font-mono">key: {process.env.GEMINI_API_KEY.length}ch</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen max-h-screen relative overflow-hidden bg-bg-base">
        {/* Mobile Header */}
        <header className="h-16 md:h-18 border-b border-line flex items-center justify-between px-4 md:px-8 bg-bg-surface z-20">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsLibraryOpen(true)}
              className="md:hidden flex items-center gap-2 mr-2 p-1 active:scale-95 transition-transform"
            >
              <div className="w-8 h-8 bg-gold/10 rounded-lg border border-gold/40 flex items-center justify-center">
                <Library className="w-4 h-4 text-gold" />
              </div>
            </button>
            <h2 className="text-[11px] md:text-sm font-light flex flex-col md:flex-row md:items-center md:gap-2">
              <span className="opacity-40 uppercase text-[8px] md:text-[10px] tracking-widest">Arbiter Ruling on</span> 
              <span className="text-text-gold font-serif italic truncate max-w-[120px] md:max-w-none">{file ? file.name : "Unbound Rules"}</span>
            </h2>
          </div>
          
          <div className="flex items-center gap-1 md:gap-4">
            <button 
              onClick={() => setIsAboutOpen(true)}
              className="p-2 text-text-muted hover:text-gold transition-colors"
              title="About Rulebook Arbiter"
            >
              <Info className="w-4 h-4" />
            </button>

            <div className="h-4 w-[1px] bg-line/50 mx-1 md:hidden"></div>

            {/* Mobile-only User Controls */}
            <div className="flex items-center gap-1 md:hidden">
              {currentUser ? (
                <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} className="p-2 text-text-muted">
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
              ) : (
                <button onClick={handleLogin} className="flex items-center gap-1.5 px-3 py-1.5 bg-gold/10 text-gold rounded-lg text-[10px] font-bold uppercase tracking-wider">
                  <LogIn className="w-3.5 h-3.5" /> Sign In
                </button>
              )}
              {currentUser && (
                <div className="w-7 h-7 rounded-full border border-gold/30 overflow-hidden ml-1">
                   <img src={currentUser.photoURL || ''} alt="" className="w-full h-full object-cover" />
                </div>
              )}
            </div>

            {!isActive && <Bot className="hidden md:block w-4 h-4 text-text-gold opacity-50" />}
            {isActive && (
              <button onClick={resetOracle} className="text-[9px] md:text-[10px] uppercase tracking-widest opacity-60 hover:opacity-100 text-text-gold">
                Dismiss Arbiter
              </button>
            )}
          </div>
        </header>

        {!isActive ? (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-12 bg-[radial-gradient(circle_at_50%_-20%,_rgba(212,175,55,0.05)_0%,_transparent_50%)]">
            <div className="max-w-6xl mx-auto space-y-12 pb-24">
              {/* Library / Pick a Game Section */}
              <div className="flex flex-col gap-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-line pb-6 gap-6">
                  <div className="flex flex-col">
                    <h3 className="text-xl font-serif text-text-gold gold-text-glow flex items-center gap-3">
                      <Library className="w-6 h-6" /> Rulebook Library
                    </h3>
                    <p className="text-sm text-text-muted mt-1 italic">Knowledge catalogued for your consultation</p>
                  </div>

                  {isAdmin && (
                    <div className="flex-1 max-w-md mx-auto md:mx-0">
                      <div className="glass p-1.5 rounded-full border-gold/20 flex items-center gap-2 pr-4 bg-gold/5">
                        <div className="w-8 h-8 rounded-full bg-gold/10 flex items-center justify-center border border-gold/20 ml-1">
                          <ShieldCheck className="w-4 h-4 text-gold" />
                        </div>
                        <input 
                          type="email"
                          placeholder="Invite by email..."
                          className="flex-1 bg-transparent border-none text-xs focus:ring-0 text-text-primary placeholder:text-text-muted/50"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleAddToAllowList((e.target as HTMLInputElement).value);
                              (e.target as HTMLInputElement).value = '';
                            }
                          }}
                        />
                        <button 
                          onClick={(e) => {
                            const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                            if (input && input.value) {
                              handleAddToAllowList(input.value);
                              input.value = '';
                            }
                          }}
                          className="text-[10px] font-bold text-gold uppercase tracking-widest hover:text-white transition-colors"
                        >
                          Invite
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-4">
                    <span className="hidden sm:inline-block px-3 py-1.5 rounded-full bg-gold/10 border border-gold/20 text-[10px] text-gold font-bold tracking-widest uppercase">
                      {library.length} Rulebook{library.length !== 1 ? 's' : ''}
                    </span>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-gold text-bg-base px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest hover:scale-105 transition-all shadow-xl shadow-gold/20"
                    >
                      + Summon Arbiter
                    </button>
                    <input 
                      type="file" 
                      className="hidden" 
                      ref={fileInputRef} 
                      onChange={handleFileChange}
                      accept=".pdf"
                    />
                  </div>
                </div>
                
                {library.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    <AnimatePresence>
                      {[...library]
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((game) => (
                        <motion.div
                          key={game.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          whileHover={{ y: -6 }}
                          onClick={() => loadFromLibrary(game)}
                          className="glass p-6 rounded-[2rem] cursor-pointer hover:bg-gold/10 hover:border-gold/40 transition-all border border-line/10 relative group/item flex flex-col shadow-xl hover:shadow-gold/10"
                        >
                          <div className="flex gap-4 items-start mb-6">
                            <GameIcon 
                              iconUrl={game.iconUrl} 
                              className="w-16 h-16 rounded-2xl group-hover/item:shadow-lg group-hover/item:shadow-gold/10 transition-shadow"
                            />
                            <div className="flex-1 min-w-0 pt-1">
                              <h4 className="text-sm font-serif text-text-primary line-clamp-2 leading-tight group-hover/item:text-text-gold transition-colors">{game.name}</h4>
                              <p className="text-[10px] text-text-muted uppercase tracking-widest mt-2 flex items-center gap-1.5">
                                <Clock className="w-3 h-3" /> 
                                {game.lastUsed ? new Date(game.lastUsed).toLocaleDateString() : 'Last Saved: ' + new Date(game.date).toLocaleDateString()}
                              </p>
                            </div>
                          </div>

                          <div className="mt-auto flex items-center justify-between pt-6 border-t border-line/10">
                            <div className="flex items-center gap-1 text-text-muted">
                              <span className="text-[9px] font-bold">{(game.size / 1024 / 1024).toFixed(1)} MB</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={(e) => { e.stopPropagation(); viewRulebook(game); }}
                                className="p-2 text-text-muted hover:text-text-primary transition-colors hover:bg-white/5 rounded-full"
                                title="Open PDF"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => deleteFromLibrary(game.id, e)}
                                className="p-2 text-text-muted hover:text-red-500 transition-colors hover:bg-red-500/5 rounded-full"
                                title="Remove"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          
                          <div className="absolute inset-x-0 bottom-0 h-1.5 bg-gold/0 group-hover/item:bg-gold/40 rounded-b-[2rem] transition-all"></div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div 
                    onClick={() => !isUploading && fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-line/20 rounded-[3rem] opacity-40 hover:opacity-100 hover:border-gold/40 hover:bg-gold/5 transition-all cursor-pointer group"
                  >
                    <div className={`w-20 h-20 bg-gold/10 rounded-full flex items-center justify-center mb-6 border border-gold/20 group-hover:scale-110 transition-transform ${isUploading ? 'animate-pulse' : ''}`}>
                      <CloudUpload className="w-10 h-10 text-gold" />
                    </div>
                    <p className="text-lg font-serif italic text-text-primary">{isUploading ? 'The Arbiter is indexing...' : 'Your library is waiting to be filled...'}</p>
                    <p className="text-[10px] uppercase tracking-widest text-text-muted mt-2">Click or drag a Rulebook PDF to summon the Arbiter</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Chat History */}
            <div className="flex-1 overflow-y-scroll scroll-smooth p-6 md:p-12 space-y-10 custom-scrollbar">
              {messages.map((msg, idx) => (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={idx} 
                  className={`flex gap-6 items-start max-w-3xl ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'justify-start'}`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border 
                    ${msg.role === 'user' 
                      ? 'border-line/20 text-text-muted/60 glass' 
                      : 'bg-gold/10 border-gold/30 text-text-gold shadow-gold/10 shadow-lg'}`}
                  >
                    {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                  </div>
                  
                  <div className={`p-6 rounded-2xl shadow-xl relative
                    ${msg.role === 'user' 
                      ? 'glass rounded-tr-none border border-line/10' 
                      : 'bg-bg-chat rounded-tl-none border border-gold/10'}`}
                  >
                    <div className="markdown-body prose prose-slate dark:prose-invert max-w-none">
                      <Markdown>{msg.content}</Markdown>
                    </div>
                  </div>
                </motion.div>
              ))}

              {isGenerating && streamingMessage && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-6 items-start max-w-3xl justify-start"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-gold/10 border border-gold/30 text-text-gold shadow-gold/10 shadow-lg">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div className="p-6 rounded-2xl bg-bg-chat rounded-tl-none border border-white/5 shadow-2xl">
                    <div className="markdown-body prose prose-invert max-w-none font-serif">
                      <Markdown>{streamingMessage}</Markdown>
                    </div>
                  </div>
                </motion.div>
              )}
              {isGenerating && !streamingMessage && (
                <div className="flex gap-6 items-start justify-start">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-gold/10 border border-gold/30 text-text-gold animate-pulse">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div className="p-4 rounded-2xl glass flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-gold rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1.5 h-1.5 bg-gold rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1.5 h-1.5 bg-gold rounded-full animate-bounce"></div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <footer className="p-8 bg-gradient-to-t from-bg-base to-transparent">
              <div className="max-w-3xl mx-auto relative group">
                <input
                  id="chat-input"
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Request a ruling..."
                  className="w-full bg-bg-chat border border-line rounded-full py-4 px-8 text-sm focus:outline-none focus:border-gold/50 transition-all shadow-2xl placeholder:text-text-muted/50"
                />
                <button
                  disabled={!inputValue.trim() || isGenerating}
                  onClick={handleSendMessage}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center transition-all
                    ${!inputValue.trim() || isGenerating 
                      ? 'bg-line/20 text-text-muted/40' 
                      : 'bg-gold text-bg-base hover:scale-105 shadow-[0_0_20px_rgba(197,163,104,0.3)]'}`}
                >
                  {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </div>
              <p className="text-center text-[10px] text-text-muted opacity-30 mt-6 tracking-[0.2em] uppercase">
                Arbiter rulings are strictly rooted in the text provided.
              </p>
            </footer>
          </div>
        )}
      </div>
      {/* About Modal */}
      <AnimatePresence>
        {isAboutOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg glass rounded-[2.5rem] p-4 md:p-10 border border-gold/20 shadow-2xl relative"
            >
              <button 
                onClick={() => setIsAboutOpen(false)} 
                className="absolute right-6 top-6 p-2 text-text-muted hover:text-white transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>

              <div className="flex flex-col items-center text-center mb-8">
                <div className="w-16 h-16 bg-gold/10 rounded-2xl border border-gold/40 flex items-center justify-center mb-6 gold-glow">
                  <Library className="w-8 h-8 text-gold" />
                </div>
                <h3 className="text-3xl font-serif text-text-gold mb-2 gold-text-glow">The Rulebook Arbiter</h3>
                <p className="text-[10px] uppercase tracking-[0.3em] text-text-muted font-bold opacity-50">Grand Library Edition • v1.0.4</p>
              </div>

              <div className="space-y-6 text-sm text-text-muted leading-relaxed max-h-[60vh] overflow-y-auto px-4 custom-scrollbar">
                <div className="p-4 bg-gold/5 rounded-2xl border border-gold/10">
                  <p className="text-text-primary mb-3 font-semibold flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-gold" /> For Players, By Choice
                  </p>
                  <p>
                    This service is provided entirely <strong className="text-text-gold">free of charge</strong> as a resource for the tabletop gaming community.
                  </p>
                </div>

                <div className="space-y-4">
                  <p>
                    The Rulebook Arbiter is a specialized AI engine designed to provide instant, precise rulings based strictly on the text of your tabletop games.
                  </p>
                  
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-line/20 flex items-center justify-center shrink-0 mt-1">
                      <ShieldCheck className="w-4 h-4 text-text-gold" />
                    </div>
                    <div>
                      <p className="text-white font-medium mb-1">Your Library, Your Privacy</p>
                      <p className="text-xs">Your rulebooks are stored locally in your browser. If you choose to sign in, your library syncs securely with your private Google Drive—I never see your files on my servers.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-full bg-line/20 flex items-center justify-center shrink-0 mt-1">
                      <Zap className="w-4 h-4 text-text-gold" />
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-medium mb-1">AI Costs & Quotas</p>
                      <p className="text-xs mb-4">The brain power (Gemini AI) is provided through the creator's API project. Because I pay for the tokens (words) processed, there are small rate limits to ensure the service remains free for everyone.</p>
                      
                      <div className="p-4 bg-black/20 rounded-xl border border-white/5 space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gold/80">Support the Arbiter: Provide your own key</p>
                        <div className="flex gap-2">
                          <input 
                            type="password"
                            placeholder="Enter your Gemini API Key..."
                            value={userApiKey}
                            onChange={(e) => setUserApiKey(e.target.value)}
                            className="flex-1 bg-bg-base border border-line rounded-lg px-3 py-2 text-xs focus:border-gold/50 outline-none transition-all placeholder:opacity-30"
                          />
                          <button 
                            onClick={() => handleSaveUserApiKey(userApiKey)}
                            className="bg-gold text-bg-base px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:scale-105 transition-all"
                          >
                            Save
                          </button>
                        </div>
                        <p className="text-[9px] text-[#8d8d99]">
                          Get a free key at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-gold underline">Google AI Studio</a>. Using your own key removes shared rate limits.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 text-center italic text-[#8d8d99]">
                  "Justice for the board, integrity for the rules."
                </div>
              </div>

              <div className="mt-10">
                <button 
                  onClick={() => setIsAboutOpen(false)}
                  className="w-full py-4 px-8 rounded-2xl bg-gold text-bg-base font-bold uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  Return to Library
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Manage Game Modal */}
      <AnimatePresence>
        {managingGame && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md glass rounded-[2rem] p-8 border border-gold/20 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-serif text-text-gold">Manage rulebook details</h3>
                <button onClick={() => setManagingGame(null)} className="p-2 text-text-muted hover:text-white transition-colors">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="flex items-center gap-6 p-4 glass rounded-2xl border border-line/10 bg-white/[0.02]">
                  <GameIcon 
                    iconUrl={manageLogo} 
                    className="w-20 h-20 rounded-2xl shadow-2xl border-line/20"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-text-muted mb-1 font-bold">Preview</div>
                    <div className="text-sm font-serif text-text-primary truncate">{manageName || "Game Title"}</div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-widest text-text-muted mb-2 block font-bold">Game Name</label>
                  <input 
                    value={manageName}
                    onChange={e => setManageName(e.target.value)}
                    className="w-full bg-bg-base border border-line rounded-xl px-4 py-3 text-sm focus:border-gold/50 outline-none transition-all"
                    placeholder="Enter game title..."
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-widest text-text-muted mb-2 block font-bold">Logo URL</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Image className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gold/50" />
                      <input 
                        value={manageLogo}
                        onChange={e => setManageLogo(e.target.value)}
                        className="w-full bg-bg-base border border-line rounded-xl pl-12 pr-4 py-3 text-sm focus:border-gold/50 outline-none transition-all"
                        placeholder="https://example.com/logo.png"
                      />
                    </div>
                    <button 
                      onClick={handleMagicLogo}
                      disabled={!manageName.trim() || isFindingLogo}
                      className={`px-4 border rounded-xl transition-all flex items-center justify-center disabled:opacity-30 ${
                        findLogoLimit 
                          ? 'bg-orange-500/10 border-orange-500/40 text-orange-400' 
                          : findLogoError 
                            ? 'bg-red-500/20 border-red-500/50 text-red-500' 
                            : 'bg-gold/10 border-gold/40 text-text-gold hover:bg-gold/20'
                      }`}
                      title={findLogoLimit ? "Rate limit reached. Wait 60s." : findLogoError ? "Logo not found" : "Magic Auto-Logo"}
                    >
                      {isFindingLogo ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : findLogoLimit ? (
                        <Clock className="w-4 h-4" />
                      ) : findLogoError ? (
                        <XCircle className="w-4 h-4" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-[9px] text-text-muted mt-2 pl-1">
                    {findLogoLimit ? (
                      <span className="text-orange-400 font-bold flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" /> Rate limit reached. The Arbiter needs a 60-second break between magic searches.
                      </span>
                    ) : (
                      "✨ Hit the sparkles to fetch the official logo from BoardGameGeek."
                    )}
                  </p>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-widest text-text-muted mb-2 block font-bold">House Rules & Additional Context</label>
                  <textarea 
                    value={manageHouseRules}
                    onChange={e => setManageHouseRules(e.target.value)}
                    className="w-full bg-bg-base border border-line rounded-xl px-4 py-3 text-sm focus:border-gold/50 outline-none transition-all min-h-[120px] resize-none custom-scrollbar"
                    placeholder="Enter custom house rules, eratta, or specific instructions for the Arbiter..."
                  />
                  <p className="text-[9px] text-text-muted mt-2 pl-1 leading-relaxed">
                    💡 The Arbiter will prioritize these instructions over the official rulebook if a conflict arises.
                  </p>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    onClick={() => setManagingGame(null)}
                    className="flex-1 py-3 px-6 rounded-xl border border-line text-sm hover:bg-white/5 transition-all text-text-muted font-bold"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSaveMetadata}
                    className="flex-1 py-3 px-6 rounded-xl bg-gold text-bg-base text-sm hover:scale-[1.02] active:scale-[0.98] transition-all font-bold"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Library Drawer */}
      <AnimatePresence>
        {isLibraryOpen && (
          <div className="fixed inset-0 z-[120] md:hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsLibraryOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              className="absolute inset-y-0 left-0 w-[85%] max-w-sm bg-bg-sidebar border-r border-line flex flex-col p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gold/10 rounded-lg border border-gold/40 flex items-center justify-center">
                    <Library className="w-4 h-4 text-gold" />
                  </div>
                  <h3 className="font-serif text-lg text-text-gold tracking-wide uppercase">Rulebook Library</h3>
                </div>
                <button onClick={() => setIsLibraryOpen(false)} className="p-2 text-text-muted hover:text-white">
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
                {library.length > 0 ? (
                  library.map((game) => (
                    <div key={game.id} className="relative">
                      <button
                        onClick={() => {
                          loadFromLibrary(game);
                          setIsLibraryOpen(false);
                        }}
                        className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center gap-4
                          ${file?.name === game.name 
                            ? 'bg-gold/10 border-gold/40' 
                            : 'bg-white/[0.02] border-transparent active:bg-white/[0.05]'}`}
                      >
                        <GameIcon iconUrl={game.iconUrl} className="w-10 h-10" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-text-primary truncate">{game.name}</div>
                          <div className="text-[10px] text-text-muted">{(game.size / 1024 / 1024).toFixed(1)} MB</div>
                        </div>
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); viewRulebook(game); }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-bg-base/50 rounded-lg border border-line/30 text-text-muted"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 opacity-30 italic text-xs">Library is empty</div>
                )}
              </div>

              <button 
                onClick={() => {
                  setIsLibraryOpen(false);
                  fileInputRef.current?.click();
                }}
                className="w-full mt-6 py-4 bg-gold text-bg-base rounded-2xl font-bold uppercase tracking-widest flex items-center justify-center gap-2"
              >
                <CloudUpload className="w-4 h-4" /> New Rulebook
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isEmailUnverified && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-bg-base/80 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-md w-full glass p-10 rounded-[3rem] border-gold/30 shadow-2xl text-center"
            >
              <div className="w-20 h-20 bg-gold/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-gold/20 shadow-inner">
                <ShieldCheck className="w-10 h-10 text-gold" />
              </div>
              <h2 className="text-3xl font-serif text-text-gold mb-4 gold-text-glow">Verification Required</h2>
              <p className="text-text-muted mb-10 leading-relaxed text-sm">
                To consult the Arbiter and safeguard your data, you must confirm your email address: <span className="text-text-primary font-bold">{currentUser?.email}</span>
              </p>
              
              <div className="flex flex-col gap-4">
                <button 
                  onClick={handleResendVerification}
                  disabled={verificationSent}
                  className={`w-full py-4 rounded-2xl font-bold uppercase tracking-widest text-xs transition-all shadow-xl
                    ${verificationSent 
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                      : 'bg-gold text-bg-base hover:scale-[1.02] active:scale-[0.98] shadow-gold/20'}`}
                >
                  {verificationSent ? (
                    <span className="flex items-center justify-center gap-2"><Check className="w-4 h-4" /> Link Sent</span>
                  ) : (
                    'Send Verification Link'
                  )}
                </button>
                <button 
                  onClick={handleLogout}
                  className="w-full py-4 rounded-2xl border border-line text-text-muted font-bold uppercase tracking-widest text-xs hover:bg-white/5 transition-all"
                >
                  Sign Out
                </button>
              </div>
              
              <p className="mt-8 text-[11px] text-text-muted italic">
                Please check your inbox (and spam folder) for the confirmation link. You may need to refresh the page after verifying.
              </p>
            </motion.div>
          </div>
        )}
        {isNotAllowed && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-bg-base/80 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-md w-full glass p-10 rounded-[3rem] border-red-500/30 shadow-2xl text-center"
            >
              <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-8 border border-red-500/20 shadow-inner">
                <XCircle className="w-10 h-10 text-red-500" />
              </div>
              <h2 className="text-3xl font-serif text-text-gold mb-4 gold-text-glow">Access Denied</h2>
              <p className="text-text-muted mb-10 leading-relaxed text-sm">
                Your account (<span className="text-text-primary font-bold">{currentUser?.email}</span>) is not on the invited list. To consult the Arbiter, please contact your administrator for access.
              </p>
              
              <button 
                onClick={handleLogout}
                className="w-full py-4 rounded-2xl bg-gold text-bg-base font-bold uppercase tracking-widest text-xs hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-gold/20"
              >
                Sign Out
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

