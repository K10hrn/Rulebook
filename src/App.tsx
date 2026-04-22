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
  Link as LinkIcon,
  XCircle,
  Settings,
  Sparkles,
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
  User as FirebaseUser
} from 'firebase/auth';
import { auth } from './firebase';
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
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasLocalGames, setHasLocalGames] = useState(false);
  const [isSyncingLocalToCloud, setIsSyncingLocalToCloud] = useState(false);
  const [managingGame, setManagingGame] = useState<LocalGame | null>(null);
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
  const [isFindingLogo, setIsFindingLogo] = useState(false);
  const [findLogoError, setFindLogoError] = useState(false);
  const [findLogoLimit, setFindLogoLimit] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Sync logic: When user logs in/out, reload the library
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
      
      if (!user) {
        setDriveToken(null);
        loadLibrary(); // Fallback to local
      }
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
          
          try {
            const meta = JSON.parse(f.description || '{}');
            iconUrl = meta.iconUrl || iconUrl;
          } catch {
            // Keep iconUrl as raw description if parse fails
          }

          return {
            id: f.id,
            name: f.name,
            size: Number(f.size),
            date: new Date(f.createdTime).getTime(),
            data: new Uint8Array(), // Data is fetched on-demand for Drive files
            iconUrl
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

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    
    try {
      const result = await signInWithPopup(auth, provider);
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
    try {
      if (driveToken) {
        // Cloud Sync: Upload to Drive
        const driveFile = await uploadToDrive(driveToken, selectedFile);
        
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
      iconUrl: manageLogo.trim() || undefined
    };
    const gameId = managingGame.id;
    const currentDriveToken = driveToken;

    setManagingGame(null); // Close modal immediately

    try {
      if (currentDriveToken) {
        await updateFullMetadataInDrive(currentDriveToken, gameId, {
          name: updates.name,
          iconUrl: updates.iconUrl
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

  const loadFromLibrary = async (game: LocalGame) => {
    setIsUploading(true);
    try {
      let base64 = '';
      if (driveToken && game.data.length === 0) {
        // Fetch data from Drive if it's not local
        base64 = await downloadFromDrive(driveToken, game.id);
      } else {
        base64 = await getBase64FromUint8Array(game.data);
      }
      
      rulebookService.setPDF(base64);
      setFile({ name: game.name, size: game.size });
      setIsActive(true);
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
      if (!process.env.GEMINI_API_KEY) {
        setMessages(prev => [...prev, { role: 'model', content: "⚠️ **Arbiter Key Missing**: The Gemini API key hasn't been configured for this deployment. Please set the `GEMINI_API_KEY` secret in your GitHub repository and re-deploy." }]);
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
            <h1 className="font-serif text-xl font-light text-text-gold tracking-widest uppercase gold-text-glow">RULEBOOK</h1>
          </div>
          
          <button 
            onClick={() => {
              if (isGenerating) return;
              if (file) resetOracle();
              fileInputRef.current?.click();
            }}
            className="w-full glass py-3 rounded text-[10px] uppercase tracking-[0.2em] text-gold font-bold mb-8 hover:bg-gold/10 hover:border-gold/30 transition-all cursor-pointer gold-glow"
          >
            + Archive Rulebook
          </button>

          <div className="flex flex-col gap-6 flex-1 overflow-hidden">
            <div className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-bold flex items-center justify-between">
              <span>Active Game</span>
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
                    <div className="text-xs font-semibold text-white truncate">{file.name}</div>
                    <div className="text-[10px] opacity-60">{(file.size / 1024 / 1024).toFixed(1)} MB • PDF</div>
                  </div>
                  <button 
                    onClick={resetOracle}
                    className="p-1 text-text-muted hover:text-red-500 transition-colors"
                    title="Close current game"
                  >
                    <X className="w-4 h-4" />
                  </button>
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
                  library.map((game) => (
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
                          <div className="text-[11px] font-medium text-white truncate pr-16">{game.name}</div>
                          <div className="text-[9px] text-text-muted">{(game.size / 1024 / 1024).toFixed(1)} MB</div>
                        </div>
                      </motion.button>
                      
                      {!managingGame && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                  <p className="text-[11px] font-bold text-white truncate max-w-[100px]">{currentUser.displayName || 'The Scribe'}</p>
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
        {/* Mobile/Floating Header */}
        <header className="h-16 border-b border-line flex items-center justify-between px-8 bg-bg-surface">
          <div>
            <h2 className="text-sm font-light flex items-center gap-2">
              <span className="opacity-40 uppercase text-[10px] tracking-widest">Arbiter Ruling on</span> 
              <span className="text-text-gold font-serif italic">{file ? file.name : "Unbound Rules"}</span>
            </h2>
          </div>
          <div className="flex gap-4">
            {!isActive && <Bot className="w-4 h-4 text-text-gold opacity-50" />}
            {isActive && (
              <button onClick={resetOracle} className="text-[10px] uppercase tracking-widest opacity-60 hover:opacity-100 text-text-gold">
                Dismiss Arbiter
              </button>
            )}
          </div>
        </header>

        {!isActive ? (
          <div className="flex-1 flex flex-col md:flex-row p-8 gap-8 overflow-y-auto bg-[radial-gradient(circle_at_50%_-20%,_rgba(212,175,55,0.08)_0%,_transparent_50%)]">
            {/* Upload Area */}
            <div className="flex-1 flex flex-col justify-center items-center">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="max-w-xl w-full"
              >
                <div 
                  className={`relative group cursor-pointer glass rounded-[2.5rem] p-16 transition-all text-center gold-glow
                    ${isUploading ? 'bg-white/5 border-gold shadow-[0_0_40px_rgba(212,175,55,0.1)]' : 'hover:bg-white/5 hover:scale-[1.01] hover:border-gold/20'}`}
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                >
                  <div className="flex flex-col items-center">
                    <input 
                      type="file" 
                      className="hidden" 
                      ref={fileInputRef} 
                      onChange={handleFileChange}
                      accept=".pdf"
                    />
                    <div className={`relative mb-10 group-hover:scale-105 transition-transform ${isUploading ? 'animate-pulse' : ''}`}>
                      <div className={`p-10 rounded-[2rem] border shadow-2xl relative ${isUploading ? 'bg-gold text-bg-base border-gold' : 'bg-transparent text-gold border-gold/30'}`}>
                        <Library className="w-20 h-20" />
                      </div>
                      <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-gold rounded-2xl flex items-center justify-center shadow-2xl border-4 border-bg-base">
                        <Dices className="w-7 h-7 text-bg-base" />
                      </div>
                    </div>
                    <h2 className="text-4xl font-serif text-text-gold mb-3 gold-text-glow">Summon Arbiter</h2>
                    <p className="text-text-muted max-w-sm mb-10 text-sm leading-relaxed">
                      Index a new game rulebook into your local library to begin your consultation.
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Library / Pick a Game Section */}
            {library.length > 0 && (
              <div className="w-full md:w-[28rem] flex flex-col gap-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex flex-col">
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-text-gold gold-text-glow flex items-center gap-2">
                      <Library className="w-4 h-4" /> Rulebook Library
                    </h3>
                    <p className="text-[10px] text-text-muted mt-1">Select a title to consult the Arbiter</p>
                  </div>
                  <span className="px-2 py-1 rounded bg-gold/10 border border-gold/20 text-[9px] text-gold font-bold">{library.length} Rulebooks</span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-y-auto pr-2 max-h-[600px] custom-scrollbar pb-10">
                  <AnimatePresence>
                    {library.map((game) => (
                      <motion.div
                        key={game.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        whileHover={{ y: -4, scale: 1.02 }}
                        onClick={() => loadFromLibrary(game)}
                        className="glass p-5 rounded-[1.5rem] cursor-pointer hover:bg-gold/10 hover:border-gold/40 transition-all border border-white/5 relative group/item flex flex-col items-center text-center shadow-xl hover:shadow-gold/5"
                      >
                        <GameIcon 
                          iconUrl={game.iconUrl} 
                          className="w-16 h-16 rounded-2xl group-hover/item:bg-gold/20 group-hover/item:border-gold/40 group-hover/item:rotate-3"
                        />
                        
                        <div className="w-full flex-1 min-w-0">
                          <h4 className="text-sm font-serif text-white line-clamp-2 mb-2 min-h-[2.5rem] flex items-center justify-center leading-tight">{game.name}</h4>
                          <div className="flex items-center justify-center gap-2 text-[9px] text-text-muted uppercase tracking-tighter">
                            <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> {new Date(game.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                            <span className="w-1 h-1 rounded-full bg-white/10"></span>
                            <span>{(game.size / 1024 / 1024).toFixed(1)} MB</span>
                          </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-white/5 w-full flex items-center justify-center gap-2">
                           <span className="text-[8px] uppercase tracking-widest text-gold font-bold opacity-0 group-hover/item:opacity-100 transition-opacity">Consult Rules</span>
                           <ChevronRight className="w-3 h-3 text-gold opacity-0 group-hover/item:opacity-100 group-hover/item:translate-x-1 transition-all" />
                        </div>

                        <button
                          onClick={(e) => deleteFromLibrary(game.id, e)}
                          className="absolute top-2 right-2 p-2 text-text-muted hover:text-red-400 opacity-0 group-hover/item:opacity-100 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        
                        {/* Decorative Box Edge */}
                        <div className="absolute inset-x-0 bottom-0 h-1 bg-gold/20 rounded-b-[1.5rem] group-hover/item:bg-gold/40 transition-colors"></div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}
            
            {library.length === 0 && !isUploading && (
              <div className="w-full md:w-80 flex flex-col justify-center items-center p-8 glass rounded-[2.5rem] border border-white/5 opacity-50 select-none">
                <Book className="w-10 h-10 text-gold mb-4 opacity-30" />
                <p className="text-[10px] uppercase tracking-widest text-text-muted text-center font-bold">Your library is empty.<br />Upload a PDF to start.</p>
              </div>
            )}
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
                      ? 'border-white/10 text-white/40 glass' 
                      : 'bg-gold/10 border-gold/30 text-text-gold shadow-gold/10 shadow-lg'}`}
                  >
                    {msg.role === 'user' ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                  </div>
                  
                  <div className={`p-6 rounded-2xl shadow-2xl relative
                    ${msg.role === 'user' 
                      ? 'glass rounded-tr-none' 
                      : 'bg-bg-chat rounded-tl-none border border-white/5'}`}
                  >
                    <div className="markdown-body prose prose-invert max-w-none">
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
                      ? 'bg-zinc-800 text-zinc-500' 
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
                <div className="flex items-center gap-6 p-4 glass rounded-2xl border border-white/5 bg-white/[0.02]">
                  <GameIcon 
                    iconUrl={manageLogo} 
                    className="w-20 h-20 rounded-2xl shadow-2xl border-white/10"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-text-muted mb-1 font-bold">Preview</div>
                    <div className="text-sm font-serif text-white truncate">{manageName || "Game Title"}</div>
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
    </div>
  );
}

