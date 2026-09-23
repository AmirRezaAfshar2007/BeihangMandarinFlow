import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import { CharacterItem, Achievement, Folder } from '../types';
import { 
  Flame, Award, BookOpen, Plus, Search, Sparkles, Brain, Clock, 
  Trash2, HelpCircle, ChevronRight, Volume2, Calendar, CheckCircle2, RotateCcw,
  Star, Edit3, Heart, TrendingUp, Info, Sparkle, Trophy, Compass, Lock, Check,
  BarChart2, Zap, FolderPlus, LayoutGrid, List, Inbox, Mic, PenTool
} from 'lucide-react';
import SpeechPlayer from './SpeechPlayer';
import FolderModal from './FolderModal';
import FolderPickerModal from './FolderPickerModal';
import FolderCard from './FolderCard';
import { getFolderColor } from '../lib/folderColors';
import { shortenMeaning } from '../lib/textFormat';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'motion/react';
import HanziWriter from 'hanzi-writer';
import { fetchHanziCharData } from '../lib/hanziDataLoader';

interface DashboardProps {
  onStartQuiz: (chars: CharacterItem[], mode: 'srs' | 'single', singleChar?: CharacterItem) => void;
  onStartStrokeChallenge: (chars: CharacterItem[]) => void;
  user: { fullName: string; studentId: string; role: 'admin' | 'student' };
  onLogout: () => Promise<void>;
  onGoToAdmin: () => void;
  onGoHome: () => void;
  onGoToSchool: () => void;
}

export default function Dashboard({ onStartQuiz, onStartStrokeChallenge, user, onLogout, onGoToAdmin, onGoHome, onGoToSchool }: DashboardProps) {
  const [statsData, setStatsData] = useState<any>(null);
  const [characters, setCharacters] = useState<CharacterItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [newChar, setNewChar] = useState('');
  const [selectedChar, setSelectedChar] = useState<CharacterItem | null>(null);
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [loadingAdd, setLoadingAdd] = useState(false);
  const [loadingFetch, setLoadingFetch] = useState(true);

  // Per-student cap on total deck size (see MAX_CHARACTERS_PER_STUDENT in
  // character.service.ts). The number itself comes from the server so the
  // UI never drifts from what's actually enforced; `characters.length` is
  // already kept live via optimistic add/delete updates, so deriving
  // "remaining" from it locally is instant and never needs its own re-fetch.
  const [characterLimit, setCharacterLimit] = useState<number>(200);
  const charactersRemaining = Math.max(0, characterLimit - characters.length);

  // HanziWriter instance for the details canvas — kept so the infinite
  // animation can be cancelled when the selected character changes.
  const writerRef = useRef<any>(null);

  // Premium Features Local States
  const [activeTab, setActiveTab] = useState<'lexicon' | 'analytics' | 'badges' | 'speaking'>('lexicon');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState<boolean>(false);
  const [noteText, setNoteText] = useState<string>('');
  const [noteSaved, setNoteSaved] = useState<boolean>(false);

  // Personal Study Notebook state (device-local, keyed by student)
  const [draftNote, setDraftNote] = useState<string>('');
  const [notes, setNotes] = useState<{ id: string; text: string; createdAt: number }[]>([]);
  const [notesSaved, setNotesSaved] = useState<boolean>(false);
  
  // Daily Challenge state
  const [listenCount, setListenCount] = useState<number>(0);
  const [challengeClaimed, setChallengeClaimed] = useState<boolean>(false);
  const [showChallengeCelebration, setShowChallengeCelebration] = useState<boolean>(false);

  // Folder Management state
  const [folders, setFolders] = useState<Folder[]>([]);
  const [lexiconView, setLexiconView] = useState<'browse' | 'folders' | 'speaking'>('browse');
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null); // null = all, 'unfiled' = no folder
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [pendingFolderCharacter, setPendingFolderCharacter] = useState<CharacterItem | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [folderSuccess, setFolderSuccess] = useState<string | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];

  const handleSignOut = async () => {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await onLogout();
    } catch (err: any) {
      setLogoutError(err.message || 'Sign out failed. Please try again.');
    } finally {
      setLoggingOut(false);
    }
  };

  const fetchDashboardData = async () => {
    try {
      // Stats and characters don't depend on each other — request them in
      // parallel instead of serially so the dashboard appears much sooner.
      const [stats, chars] = await Promise.all([
        api.getStats(),
        api.getCharacters(),
      ]);
      setStatsData(stats);
      setCharacters(chars);
      if (chars.length > 0 && !selectedChar) {
        setSelectedChar(chars[0]);
      } else if (chars.length > 0 && selectedChar) {
        const updated = chars.find(c => c.id === selectedChar.id);
        if (updated) setSelectedChar(updated);
      }

      // The lexicon is fully usable once the characters are in — reveal it
      // now and let folders finish loading in the background (they're only
      // needed for the Folders view).
      setLoadingFetch(false);
      api.getFolders().then(setFolders).catch(() => {});
      api.getCharacterUsage().then(u => setCharacterLimit(u.limit)).catch(() => {});
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data.');
      setLoadingFetch(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Load favorites, notes, daily challenge listen progress, and claim status
  useEffect(() => {
    if (user?.studentId) {
      // Favorites
      const savedFavs = localStorage.getItem(`sino3d_favorites_${user.studentId}`);
      if (savedFavs) {
        setFavorites(JSON.parse(savedFavs));
      }

      // Listening counts
      const keyListen = `sino3d_listen_count_${user.studentId}_${todayStr}`;
      const savedListens = localStorage.getItem(keyListen);
      if (savedListens) {
        setListenCount(parseInt(savedListens));
      }

      // Challenge claimed
      const keyClaimed = `sino3d_challenge_claimed_${user.studentId}_${todayStr}`;
      const isClaimed = localStorage.getItem(keyClaimed) === 'true';
      setChallengeClaimed(isClaimed);

      // Personal study notebook
      const savedNotes = localStorage.getItem(`sino3d_personal_notes_${user.studentId}`);
      if (savedNotes) {
        try {
          setNotes(JSON.parse(savedNotes));
        } catch {
          setNotes([]);
        }
      }
    }
  }, [user, todayStr]);

  // Handle personal notes text loading and saving
  useEffect(() => {
    if (selectedChar && user?.studentId) {
      const note = localStorage.getItem(`sino3d_notes_${user.studentId}_${selectedChar.id}`) || '';
      setNoteText(note);
      setNoteSaved(false);
    }
  }, [selectedChar, user]);

  /* ------------------------------------------------------------------ */
  /* Stroke order canvas                                                */
  /* ------------------------------------------------------------------ */

  /**
   * The node the stroke animation is drawn into, held in STATE rather than a
   * ref.
   *
   * The panel that owns this node is unmounted and re-created whenever the
   * lexicon switches sub-views or the tab changes, and React can mount the new
   * node in a LATER commit than the state change that revealed it — so an
   * effect keyed only on [character, tab, sub-view] would run once with no node
   * and never run again, leaving the canvas blank. Tracking the node itself
   * makes the render effect fire exactly when the node mounts or is replaced.
   */
  const [strokeCanvas, setStrokeCanvas] = useState<HTMLDivElement | null>(null);

  /**
   * Stable callback ref (empty dep list) — React therefore invokes it only on
   * real mount/unmount, never on ordinary re-renders, so the animation is not
   * torn down and rebuilt needlessly.
   */
  const attachStrokeCanvas = useCallback((node: HTMLDivElement | null) => {
    setStrokeCanvas(node);
  }, []);

  /** Options for one writer instance, shared by every mount path. */
  const strokeWriterOptions = (data: unknown) => ({
    width: 200,
    height: 200,
    padding: 10,
    strokeAnimationSpeed: 1, // Normal speed
    delayBetweenStrokes: 200,
    delayBetweenLoops: 2000,
    strokeColor: '#059669', // Emerald
    outlineColor: '#f1f5f9', // Soft grey
    drawingColor: '#06b6d4', // Cyan trace
    drawingThickness: 8,
    showOutline: true,
    charDataLoader: (c: string, onLoad: (d: unknown) => void) => onLoad(data),
  });

  /**
   * Stops the animation currently mounted in the canvas.
   *
   * HanziWriter has NO `cancelAnimation()` method, so the previous teardown
   * called a function that does not exist (`.cancelAnimation?.()` is a silent
   * no-op) — every character switch, sub-view switch and unmount left its
   * infinite loop running against a detached SVG. `pauseAnimation()` is the
   * real public API: it cancels the pending animation frame and timers that
   * drive the loop.
   */
  const stopStrokeAnimation = () => {
    const writer = writerRef.current;
    writerRef.current = null;
    if (!writer) return;
    try {
      writer.pauseAnimation?.();
    } catch (err) {
      console.warn('Could not stop the stroke animation cleanly:', err);
    }
  };

  /** Mounts a fresh looping writer into the canvas, replacing whatever is there. */
  const mountStrokeWriter = (container: HTMLElement, char: string, data: unknown) => {
    stopStrokeAnimation();
    container.innerHTML = '';
    try {
      const writer = HanziWriter.create(container, char, strokeWriterOptions(data));
      writerRef.current = writer;
      // Infinite stroke animation at normal speed — the character keeps
      // drawing itself on a loop.
      writer.loopCharacterAnimation();
    } catch (err) {
      console.warn('HanziWriter drawing exception:', err);
    }
  };

  // Stroke Order Dynamic Render Handler
  //
  // Re-mounts the animation whenever anything that controls the canvas
  // changes: the selected character, the active tab, the lexicon sub-view, or
  // the canvas node itself. Every one of them is a dependency because the
  // canvas node only exists in the browse sub-view of the lexicon tab —
  // leaving it (Folders / AI Speaking Coach) and coming back swaps the DOM
  // node, and `strokeCanvas` is what guarantees we notice that and repaint.
  useEffect(() => {
    if (!strokeCanvas || activeTab !== 'lexicon' || lexiconView !== 'browse' || !selectedChar) return;

    const char = selectedChar.character;
    let cancelled = false;

    // Paint the character as text instantly so the area is never blank while
    // the stroke data loads (or if it never loads at all).
    strokeCanvas.innerHTML = '';
    const placeholder = document.createElement('span');
    placeholder.textContent = char;
    placeholder.className = 'text-5xl font-black text-emerald-600/80 select-none';
    strokeCanvas.appendChild(placeholder);

    fetchHanziCharData(char)
      .then((data) => {
        // Bail if the canvas was swapped out or the effect re-ran meanwhile.
        if (cancelled) return;
        mountStrokeWriter(strokeCanvas, char, data);
      })
      .catch((err) => {
        if (cancelled) return;
        // The placeholder stays visible — the canvas is never left blank.
        console.warn(`Hanzi stroke data unavailable for "${char}"; showing fallback.`, err);
      });

    return () => {
      cancelled = true;
      stopStrokeAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokeCanvas, selectedChar, activeTab, lexiconView]);


  const handleAnimateStroke = async () => {
    if (!selectedChar || !strokeCanvas) return;
    const container = strokeCanvas;
    const char = selectedChar.character;

    try {
      const data = await fetchHanziCharData(char);
      // The canvas node is replaced when the sub-view or tab changes — never
      // paint into a node React has already discarded.
      if (!container.isConnected) return;
      mountStrokeWriter(container, char, data);
    } catch (err) {
      console.warn('Animate stroke failed for', char, err);
    }
  };

  const handleAddCharacter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChar.trim() || newChar.trim().length !== 1) {
      setError('Please provide exactly one Chinese character.');
      return;
    }

    if (charactersRemaining <= 0) {
      setError(`You've reached the maximum of ${characterLimit} characters in your learning deck. Remove one before adding another.`);
      return;
    }

    setLoadingAdd(true);
    setError(null);
    setSuccess(null);
    try {
      const added = await api.addCharacter(newChar.trim());
      setSuccess(`"${added.character}" added successfully to your dictionary!`);
      setNewChar('');

      // Optimistic local state update — prepend the new character directly
      // instead of re-fetching the entire dashboard (stats + characters +
      // folders). This makes the UI respond instantly after the AI lookup
      // completes, without an extra round-trip.
      setCharacters(prev => [added, ...prev]);
      setSelectedChar(added);

      // Refresh stats in the background (XP / totals changed) without
      // blocking the UI or making the user wait.
      api.getStats().then(stats => setStatsData(stats)).catch(() => {});

      // Update Daily Challenge progress implicitly (added 1 character today)
      localStorage.setItem(`sino3d_added_char_${user.studentId}_${todayStr}`, 'true');

      // Ask which folder this new character should live in.
      setPendingFolderCharacter(added);

      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Lookup failed.');
    } finally {
      setLoadingAdd(false);
    }
  };

  // Folder Management handlers
  const handleCreateFolder = async (data: {
    name: string;
    description: string;
    category: string;
    color: string;
    icon: string;
    customDate: string | null;
  }) => {
    const created = await api.createFolder(data);
    setFolders(prev => [created, ...prev]);
    setShowFolderModal(false);
    setEditingFolder(null);
    setFolderSuccess(`Folder "${created.name}" created.`);
    setTimeout(() => setFolderSuccess(null), 4000);

    // If a character injection is waiting for a folder, drop it straight in.
    if (pendingFolderCharacter) {
      await handleAssignToFolder(created.id);
    }
  };

  const handleUpdateFolder = async (data: {
    name: string;
    description: string;
    category: string;
    color: string;
    icon: string;
    customDate: string | null;
  }) => {
    if (!editingFolder) return;
    const updated = await api.updateFolder(editingFolder.id, data);
    setFolders(prev => prev.map(f => (f.id === updated.id ? updated : f)));
    setShowFolderModal(false);
    setEditingFolder(null);
    setFolderSuccess(`Folder "${updated.name}" updated.`);
    setTimeout(() => setFolderSuccess(null), 4000);
  };

  const handleDeleteFolder = async (folder: Folder) => {
    if (!confirm(`Delete "${folder.name}"? Characters inside will move to Unfiled — none of your progress is lost.`)) {
      return;
    }
    try {
      await api.deleteFolder(folder.id);
      setFolders(prev => prev.filter(f => f.id !== folder.id));
      if (activeFolderId === folder.id) setActiveFolderId(null);
      // Characters that were in this folder are now "Unfiled" on the server.
      // Re-fetch only characters in the background so folderId fields reflect
      // the new state without blocking the UI.
      api.getCharacters().then(chars => setCharacters(chars)).catch(() => {});
      setFolderSuccess(`Folder "${folder.name}" deleted.`);
      setTimeout(() => setFolderSuccess(null), 4000);
    } catch (err: any) {
      setFolderError(err.message || 'Could not delete folder.');
      setTimeout(() => setFolderError(null), 4000);
    }
  };

  const handleToggleFolderFavorite = async (folder: Folder) => {
    try {
      const updated = await api.updateFolder(folder.id, { isFavorite: !folder.isFavorite });
      setFolders(prev => prev.map(f => (f.id === updated.id ? updated : f)));
    } catch (err: any) {
      setFolderError(err.message || 'Could not update folder.');
      setTimeout(() => setFolderError(null), 4000);
    }
  };

  const handleAssignToFolder = async (folderId: string) => {
    if (!pendingFolderCharacter) return;
    const updatedChar = await api.assignCharacterToFolder(pendingFolderCharacter.id, folderId);
    setCharacters(prev => prev.map(c => (c.id === updatedChar.id ? updatedChar : c)));
    setSelectedChar(prev => (prev?.id === updatedChar.id ? updatedChar : prev));
    setFolders(prev => prev.map(f => (f.id === folderId ? { ...f, characterCount: f.characterCount + 1 } : f)));
    setPendingFolderCharacter(null);
  };

  const handleSkipFolderAssignment = () => {
    setPendingFolderCharacter(null);
  };

  const handleDeleteCharacter = async (charId: string) => {
    if (!confirm('Are you sure you want to delete this character? All review progress and SM-2 calculations will be lost.')) {
      return;
    }

    try {
      await api.deleteCharacter(charId);
      setSuccess('Character deleted successfully.');
      // Remove from local state immediately — no full refetch needed.
      setCharacters(prev => {
        const remaining = prev.filter(c => c.id !== charId);
        if (selectedChar?.id === charId) {
          setSelectedChar(remaining.length > 0 ? remaining[0] : null);
        }
        return remaining;
      });
      // Refresh stats quietly in the background (total count changed).
      api.getStats().then(stats => setStatsData(stats)).catch(() => {});
    } catch (err: any) {
      setError('Delete action failed.');
    }
  };

  const handleSpeak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      
      // Load speed
      const savedSpeed = localStorage.getItem('sino3d_playback_speed');
      if (savedSpeed) utterance.rate = parseFloat(savedSpeed);

      window.speechSynthesis.speak(utterance);

      // Increment Daily listening counts
      if (user?.studentId) {
        const nextListen = listenCount + 1;
        setListenCount(nextListen);
        localStorage.setItem(`sino3d_listen_count_${user.studentId}_${todayStr}`, nextListen.toString());
      }
    } else {
      alert('Speech synthesis is not supported in this browser.');
    }
  };

  // SM-2 Review list aggregator
  const reviewsQueue = characters.filter(c => c.nextReviewDate <= todayStr);

  // Favorites logic
  const toggleFavorite = (charId: string) => {
    const nextFavs = favorites.includes(charId)
      ? favorites.filter(id => id !== charId)
      : [...favorites, charId];
    setFavorites(nextFavs);
    localStorage.setItem(`sino3d_favorites_${user.studentId}`, JSON.stringify(nextFavs));
  };

  // Personal notes saving
  const handleSaveNote = (text: string) => {
    setNoteText(text);
    localStorage.setItem(`sino3d_notes_${user.studentId}_${selectedChar?.id}`, text);
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 1500);
  };

  // Personal Study Notebook (device-local) — add a note
  const handleAddNote = () => {
    const text = draftNote.trim();
    if (!text) return;
    const nextNotes = [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text, createdAt: Date.now() },
      ...notes,
    ];
    setNotes(nextNotes);
    localStorage.setItem(`sino3d_personal_notes_${user.studentId}`, JSON.stringify(nextNotes));
    setDraftNote('');
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 1500);
  };

  // Personal Study Notebook (device-local) — delete a note
  const handleDeleteNote = (id: string) => {
    const nextNotes = notes.filter(n => n.id !== id);
    setNotes(nextNotes);
    localStorage.setItem(`sino3d_personal_notes_${user.studentId}`, JSON.stringify(nextNotes));
  };

  const filteredCharacters = characters.filter(c => {
    // Folder scope filter
    if (activeFolderId === 'unfiled' && c.folderId) {
      return false;
    } else if (activeFolderId && activeFolderId !== 'unfiled' && c.folderId !== activeFolderId) {
      return false;
    }

    // Favorites Filter
    if (showFavoritesOnly && !favorites.includes(c.id)) {
      return false;
    }

    const query = searchQuery.toLowerCase();
    return (
      c.character.includes(query) ||
      c.pinyin.toLowerCase().includes(query) ||
      c.englishMeaning.toLowerCase().includes(query) ||
      c.radicals.some(r => r.includes(query)) ||
      `hsk${c.hskLevel}`.includes(query)
    );
  });

  // Calculate Levels and XP
  const totalXp = statsData?.stats?.totalXp || 0;
  // Levels: L1 (<100XP), L2 (100-299), L3 (300-599), L4 (600-999), L5 (1000+)
  let currentLevel = 1;
  let xpForNextLevel = 100;
  let xpProgressPercent = 0;
  let minLevelXp = 0;

  if (totalXp >= 1000) {
    currentLevel = 5;
    xpForNextLevel = 2500;
    minLevelXp = 1000;
  } else if (totalXp >= 600) {
    currentLevel = 4;
    xpForNextLevel = 1000;
    minLevelXp = 600;
  } else if (totalXp >= 300) {
    currentLevel = 3;
    xpForNextLevel = 600;
    minLevelXp = 300;
  } else if (totalXp >= 100) {
    currentLevel = 2;
    xpForNextLevel = 300;
    minLevelXp = 100;
  }

  xpProgressPercent = Math.min(100, Math.round(((totalXp - minLevelXp) / (xpForNextLevel - minLevelXp)) * 100));

  // Daily Challenge Logic
  const addedCharToday = localStorage.getItem(`sino3d_added_char_${user.studentId}_${todayStr}`) === 'true';
  const listenedEnough = listenCount >= 3;
  const quizDoneToday = localStorage.getItem(`sino3d_perfect_quiz_${user.studentId}_${todayStr}`) === 'true' || statsData?.recentPracticeLogs?.some((l: any) => l.timestamp.split('T')[0] === todayStr);

  const completedChallengesCount = (addedCharToday ? 1 : 0) + (listenedEnough ? 1 : 0) + (quizDoneToday ? 1 : 0);
  const challengeProgressPercent = Math.round((completedChallengesCount / 3) * 100);

  const handleClaimChallengeReward = () => {
    if (challengeClaimed) return;
    setChallengeClaimed(true);
    localStorage.setItem(`sino3d_challenge_claimed_${user.studentId}_${todayStr}`, 'true');
    setShowChallengeCelebration(true);
    
    // Confetti burst
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.6 }
    });

    // Award XP locally
    if (statsData?.stats) {
      statsData.stats.totalXp += 50;
    }
    
    setTimeout(() => {
      setShowChallengeCelebration(false);
    }, 4000);
  };

  // Smart review suggestions (top 3 lowest memory stability cards)
  const smartReviewSuggestions = [...characters]
    .sort((a, b) => a.memoryStability - b.memoryStability)
    .slice(0, 3);

  // Expanded badges system
  const customAchievementsList = [
    { title: 'First Steps', description: 'Unlock by adding your very first Hanzi character to the lexicon.', condition: characters.length >= 1, icon: '🌱' },
    { title: 'Mandarin Master', description: 'Mastered 3 or more characters under active SM-2 retention.', condition: (statsData?.masteredCharacters || 0) >= 3, icon: '🏆' },
    { title: 'Scholar Elite', description: 'Accumulate more than 500 learning XP on the platform.', condition: totalXp >= 500, icon: '🎓' },
    { title: 'Dedicated Streak', description: 'Perform daily exercises for 7 consecutive days or more.', condition: (statsData?.stats?.currentStreak || 0) >= 7, icon: '🔥' },
    { title: 'Precision Calligrapher', description: 'Finish a trace stroke quiz with a high score of 90+.', condition: statsData?.recentPracticeLogs?.some((l: any) => l.quizMode === 'stroke' && l.score >= 90), icon: '✒️' },
    { title: 'Lexicon Collector', description: 'Add 15 or more unique characters to your training deck.', condition: characters.length >= 15, icon: '📚' },
  ];

  if (loadingFetch) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4 relative z-10">
        <div className="relative">
          <div className="absolute -inset-2 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full blur opacity-25 animate-pulse"></div>
          <div className="relative w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
        <p className="text-emerald-400 font-black tracking-widest text-xs uppercase animate-pulse mt-4">Syncing Beihang Academic Database...</p>
      </div>
    );
  }

  // Beihang AI Injector card — extracted so it can be rendered at the top of the
  // page on mobile/tablet (directly below the Welcome banner) while staying in its
  // original spot within the Training Lexicon tab column on desktop.
  const aiInjectorCard = (
    <div className="bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-[32px] p-6 shadow-2xl relative overflow-hidden text-left">
      <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
      <h3 className="text-base font-black text-white mb-1.5 flex items-center gap-2">
        <Plus className="w-5 h-5 text-emerald-400" />
        <span>Beihang AI Injector</span>
      </h3>
      <p className="text-xs text-slate-400 font-medium mb-5 leading-relaxed">
        Input any Chinese character. Our AI system will look up radicals, stroke counts, translation, and SM-2 memory profiles.
      </p>

      <p className={`text-[10px] font-black uppercase tracking-wider mb-4 ${charactersRemaining > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
        {charactersRemaining > 0
          ? `${charactersRemaining} of ${characterLimit} character slots left in your deck`
          : `You've used all ${characterLimit} character slots in your deck — remove one to add another`}
      </p>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-3.5 rounded-xl mb-4 text-xs font-semibold leading-relaxed">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3.5 rounded-xl mb-4 text-xs font-semibold leading-relaxed">
          {success}
        </div>
      )}

      <form onSubmit={handleAddCharacter} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Chinese Hanzi</label>
          <input
            type="text"
            placeholder="e.g. 木"
            maxLength={1}
            value={newChar}
            onChange={(e) => setNewChar(e.target.value)}
            className="w-full bg-slate-950/40 border border-white/10 rounded-2xl py-3 px-4 text-center font-black text-4xl text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/80 focus:bg-slate-950/60 transition-all shadow-inner focus:ring-4 focus:ring-emerald-500/10"
            required
          />
        </div>

        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          type="submit"
          disabled={loadingAdd || charactersRemaining <= 0}
          className="w-full btn-3d-emerald text-slate-950 font-black py-3.5 rounded-2xl text-[10px] uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer border-bottom-width:4px disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loadingAdd ? (
            <>
              <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
              <span>Analyzing...</span>
            </>
          ) : charactersRemaining <= 0 ? (
            <span>Deck Full</span>
          ) : (
            <span>Inject to Deck (+15 XP)</span>
          )}
        </motion.button>
      </form>
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="flex flex-col gap-8 relative z-10 text-slate-100"
    >
      {logoutError && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-4 rounded-2xl text-xs font-semibold flex items-center justify-between shadow-sm">
          <span>{logoutError}</span>
          <button onClick={() => setLogoutError(null)} className="text-rose-400 hover:text-rose-300 font-black uppercase tracking-wider ml-2 cursor-pointer">Dismiss</button>
        </div>
      )}

      {/* Welcome Banner — always first: mobile, tablet, and desktop */}
      <div className="order-1 relative overflow-hidden bg-gradient-to-br from-slate-900/95 via-slate-950/95 to-slate-900/90 backdrop-blur-2xl rounded-[32px] p-6 md:p-8 text-white shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] border border-white/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        {/* Glowing blur backdrops */}
        <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent"></div>
        <div className="absolute -right-16 -top-16 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute left-1/3 bottom-[-50px] w-48 h-48 bg-teal-500/5 rounded-full blur-2xl pointer-events-none"></div>
        
        {/* Background elegant calligraphic character watermark */}
        <div className="absolute right-8 md:right-16 top-1/2 -translate-y-1/2 text-[120px] md:text-[180px] font-serif text-white/[0.03] select-none pointer-events-none leading-none font-black">
          书
        </div>

        <div className="space-y-4 relative z-10 flex-1 text-left">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 backdrop-blur-md px-3.5 py-1.5 rounded-full text-[10px] font-black tracking-wider uppercase border border-emerald-500/20 text-emerald-400">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            <span>Active Scholar Session</span>
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
              Welcome back, {user.fullName}!
            </h1>
            <p className="text-slate-400 font-bold text-xs sm:text-sm tracking-wide mt-1">
              Student ID: <span className="font-mono text-slate-300">{user.studentId}</span> • <span className="text-amber-400 font-extrabold">Level {currentLevel} Calligrapher</span>
            </p>
          </div>
          
          {/* Level Progress bar inside banner */}
          <div className="pt-2 max-w-sm">
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              <span className="text-slate-300">Level {currentLevel} Progress</span>
              <span className="font-mono text-emerald-400 font-black">{totalXp} / {xpForNextLevel} XP</span>
            </div>
            <div className="w-full bg-slate-950/60 h-3 rounded-full overflow-hidden border border-white/5 shadow-inner p-[2px]">
              <div className="bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400 h-full rounded-full transition-all duration-700" style={{ width: `${xpProgressPercent}%` }}></div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 relative z-10 self-stretch md:self-auto shrink-0">
          <motion.button
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.98 }}
            onClick={onGoToSchool}
            disabled={loggingOut}
            className="bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 text-violet-300 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 cursor-pointer shadow-sm shrink-0"
            title="School — assignments and voice exercises"
          >
            🏫 School
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.98 }}
            onClick={onGoHome}
            disabled={loggingOut}
            className="bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 text-sky-400 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 cursor-pointer shadow-sm shrink-0"
          >
            🏠 Home Page
          </motion.button>
          {user.role === 'admin' && (
            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={onGoToAdmin}
              disabled={loggingOut}
              className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 cursor-pointer shadow-sm shrink-0"
            >
              Admin Controls
            </motion.button>
          )}
        </div>
      </div>

      {/* Beihang AI Injector — mobile/tablet only: placed directly below Welcome, above Training Lexicon; hidden on desktop where it stays in its original column */}
      <div className="order-2 lg:hidden">
        {aiInjectorCard}
      </div>

      {/* Core Bento Stats rows — deprioritized below Training Lexicon/AI Injector on mobile & tablet; unchanged (2nd) on desktop */}
      <div className="order-5 lg:order-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Streak */}
        <motion.div 
          whileHover={{ y: -4 }}
          className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-[24px] p-4 sm:p-5 shadow-lg flex items-center gap-3 sm:gap-4 hover:border-orange-500/30 transition-all duration-300 group"
        >
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-orange-500/10 border border-orange-500/20 rounded-xl sm:rounded-2xl flex items-center justify-center text-orange-400 text-xl sm:text-2xl shrink-0 shadow-inner group-hover:scale-110 transition-transform duration-300">
            🔥
          </div>
          <div className="text-left min-w-0">
            <span className="text-[9px] sm:text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-0.5 sm:mb-1">Streak</span>
            <span className="text-base sm:text-xl font-black text-white leading-none block truncate">{statsData?.stats?.currentStreak || 0} Days</span>
          </div>
        </motion.div>

        {/* Total XP */}
        <motion.div 
          whileHover={{ y: -4 }}
          className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-[24px] p-4 sm:p-5 shadow-lg flex items-center gap-3 sm:gap-4 hover:border-amber-500/30 transition-all duration-300 group"
        >
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-500/10 border border-amber-500/20 rounded-xl sm:rounded-2xl flex items-center justify-center text-amber-400 text-xl sm:text-2xl shrink-0 shadow-inner group-hover:scale-110 transition-transform duration-300">
            ✨
          </div>
          <div className="text-left min-w-0">
            <span className="text-[9px] sm:text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-0.5 sm:mb-1">Total XP</span>
            <span className="text-base sm:text-xl font-black text-white leading-none block truncate">{totalXp} XP</span>
          </div>
        </motion.div>

        {/* Mastered */}
        <motion.div 
          whileHover={{ y: -4 }}
          className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-[24px] p-4 sm:p-5 shadow-lg flex items-center gap-3 sm:gap-4 hover:border-emerald-500/30 transition-all duration-300 group"
        >
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-xl sm:rounded-2xl flex items-center justify-center text-emerald-400 text-xl sm:text-2xl shrink-0 shadow-inner group-hover:scale-110 transition-transform duration-300">
            🎓
          </div>
          <div className="text-left min-w-0">
            <span className="text-[9px] sm:text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-0.5 sm:mb-1">Mastered</span>
            <span className="text-base sm:text-xl font-black text-white leading-none block truncate">{statsData?.masteredCharacters || 0} Chars</span>
          </div>
        </motion.div>

        {/* Review Queue */}
        <motion.div 
          whileHover={{ y: -4 }}
          className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-[24px] p-4 sm:p-5 shadow-lg flex items-center gap-3 sm:gap-4 hover:border-indigo-500/30 transition-all duration-300 group"
        >
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-500/10 border border-indigo-500/20 rounded-xl sm:rounded-2xl flex items-center justify-center text-indigo-400 text-xl sm:text-2xl shrink-0 shadow-inner group-hover:scale-110 transition-transform duration-300">
            🧠
          </div>
          <div className="text-left min-w-0">
            <span className="text-[9px] sm:text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-0.5 sm:mb-1">Review Queue</span>
            <span className={`text-base sm:text-xl font-black leading-none block truncate ${reviewsQueue.length > 0 ? 'text-indigo-400' : 'text-white'}`}>
              {reviewsQueue.length} Items
            </span>
          </div>
        </motion.div>

        {/* Accuracy */}
        <motion.div 
          whileHover={{ y: -4 }}
          className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-[24px] p-4 sm:p-5 shadow-lg flex items-center gap-3 sm:gap-4 hover:border-teal-500/30 transition-all duration-300 group col-span-2 sm:col-span-1"
        >
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-teal-500/10 border border-teal-500/20 rounded-xl sm:rounded-2xl flex items-center justify-center text-teal-400 text-xl sm:text-2xl shrink-0 shadow-inner group-hover:scale-110 transition-transform duration-300">
            🎯
          </div>
          <div className="text-left min-w-0">
            <span className="text-[9px] sm:text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mb-0.5 sm:mb-1">Accuracy</span>
            <span className="text-base sm:text-xl font-black text-white leading-none block truncate">{statsData?.averageAccuracy || 0}%</span>
          </div>
        </motion.div>
      </div>

      {/* TABS NAVIGATION BAR — on mobile & tablet placed directly below the AI Injector, above the tab content (order-3); unchanged (3rd) on desktop */}
      <div 
        className="order-3 lg:order-3 flex bg-slate-950/60 p-1.5 rounded-2xl gap-1.5 border border-white/5 shrink-0 w-full sm:w-auto sm:max-w-max sm:mx-auto relative overflow-x-auto scrollbar-none backdrop-blur-md flex-row flex-nowrap"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        <button
          onClick={() => setActiveTab('lexicon')}
          className={`order-1 px-4 sm:px-6 py-2.5 font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 relative z-10 ${
            activeTab === 'lexicon' 
              ? 'bg-white/10 text-emerald-400 border border-emerald-500/20 shadow-md' 
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]'
          }`}
        >
          <Compass className={`w-4 h-4 ${activeTab === 'lexicon' ? 'text-emerald-400' : 'text-slate-500'}`} />
          <span>Training Lexicon</span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`order-3 sm:order-2 px-4 sm:px-6 py-2.5 font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 relative z-10 ${
            activeTab === 'analytics' 
              ? 'bg-white/10 text-emerald-400 border border-emerald-500/20 shadow-md' 
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]'
          }`}
        >
          <BarChart2 className={`w-4 h-4 ${activeTab === 'analytics' ? 'text-emerald-400' : 'text-slate-500'}`} />
          <span>Academic Dashboard</span>
        </button>

        <button
          onClick={() => setActiveTab('badges')}
          className={`order-4 sm:order-3 px-4 sm:px-6 py-2.5 font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 relative z-10 ${
            activeTab === 'badges' 
              ? 'bg-white/10 text-emerald-400 border border-emerald-500/20 shadow-md' 
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]'
          }`}
        >
          <Trophy className={`w-4 h-4 ${activeTab === 'badges' ? 'text-emerald-400' : 'text-slate-500'}`} />
          <span>Achievements Cabinet</span>
        </button>

        {/* Speaking tab — Coming Soon */}
        <button
          disabled
          className="order-2 sm:order-4 px-4 sm:px-6 py-2.5 font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-xl transition-all cursor-not-allowed whitespace-nowrap flex items-center gap-2 relative z-10 opacity-40 text-slate-500"
          title="Coming Soon"
        >
          <Mic className="w-4 h-4 text-slate-600" />
          <span>Speaking</span>
          <span className="inline-flex items-center bg-slate-700 text-slate-400 text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider">
            Soon
          </span>
        </button>
      </div>

      {/* RENDER MODULE ACCORDING TO THE ACTIVE TAB — sits at order-4 on mobile/tablet, directly below the Tabs Nav; unchanged (4th) on desktop */}
      <AnimatePresence mode="wait">
        {activeTab === 'lexicon' && (
          <motion.div 
            key="lexicon"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="order-4 lg:order-4 grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            
            {/* Left Column: AI Injector, Daily Challenge & SRS Review — on mobile/tablet the AI Injector now lives at the top of the page (below Welcome), so it's hidden here; unchanged (1st) on desktop */}
            <div className="order-2 lg:order-1 lg:col-span-1 space-y-6">
              
              {/* Add Character Input Card — desktop only here; shown at the top of the page on mobile/tablet */}
              <div className="hidden lg:block">
                {aiInjectorCard}
              </div>

              {/* Daily Challenge Widget */}
              <div className="bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-[32px] p-6 shadow-2xl flex flex-col gap-5 relative text-left">
                <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-amber-500/30 to-transparent"></div>
                <div className="absolute top-0 right-12 w-24 h-24 bg-amber-500/5 rounded-full blur-xl pointer-events-none"></div>
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-4">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-amber-400 animate-pulse shrink-0" />
                    <h3 className="text-base font-black text-white tracking-tight">Daily Scholar Quests</h3>
                  </div>
                  <div className="whitespace-nowrap rounded-full px-3.5 py-1 flex items-center justify-center bg-amber-500/10 border border-amber-500/20 text-amber-300 font-extrabold text-xs tracking-wide shrink-0">
                    {todayStr}
                  </div>
                </div>

                {/* Celebration Animation Banner */}
                {showChallengeCelebration && (
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl text-center text-xs font-black text-emerald-400 animate-bounce"
                  >
                    🎉 Claimed +50 XP bonus! Keep it up!
                  </motion.div>
                )}

                {/* Challenge Items Rows */}
                <div className="flex flex-col gap-3.5">
                  
                  {/* Task 1 Card Row */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-950/40 border border-white/5 rounded-2xl shadow-sm transition-all hover:border-amber-500/30 group">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-black text-xs shrink-0 group-hover:scale-105 transition-transform">
                        1
                      </div>
                      <div className="text-left">
                        <h4 className="text-xs font-black text-slate-200 leading-tight">Active Scholar</h4>
                        <p className="text-[10px] font-medium text-slate-400">Add 1 new character today</p>
                      </div>
                    </div>
                    <span className={`text-xs font-mono font-black shrink-0 ${addedCharToday ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {addedCharToday ? "1 / 1" : "0 / 1"}
                    </span>
                  </div>

                  {/* Task 2 Card Row */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-950/40 border border-white/5 rounded-2xl shadow-sm transition-all hover:border-amber-500/30 group">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-black text-xs shrink-0 group-hover:scale-105 transition-transform">
                        2
                      </div>
                      <div className="text-left">
                        <h4 className="text-xs font-black text-slate-200 leading-tight">Immersive Auditory</h4>
                        <p className="text-[10px] font-medium text-slate-400">Speak pronunciation 3 times</p>
                      </div>
                    </div>
                    <span className={`text-xs font-mono font-black shrink-0 ${listenedEnough ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {Math.min(listenCount, 3)} / 3
                    </span>
                  </div>

                  {/* Task 3 Card Row */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-950/40 border border-white/5 rounded-2xl shadow-sm transition-all hover:border-amber-500/30 group">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-black text-xs shrink-0 group-hover:scale-105 transition-transform">
                        3
                      </div>
                      <div className="text-left">
                        <h4 className="text-xs font-black text-slate-200 leading-tight">Retention Master</h4>
                        <p className="text-[10px] font-medium text-slate-400">Complete one practice quiz</p>
                      </div>
                    </div>
                    <span className={`text-xs font-mono font-black shrink-0 ${quizDoneToday ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {quizDoneToday ? "1 / 1" : "0 / 1"}
                    </span>
                  </div>

                </div>

                {/* Progress visualizer Row */}
                <div className="pt-2 flex flex-col space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-400">Progress to Daily Chest</span>
                    <span className="font-mono font-black text-amber-400">{challengeProgressPercent}%</span>
                  </div>
                  <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden p-[2px] border border-white/5 shadow-inner">
                    <div className="bg-gradient-to-r from-amber-400 to-teal-400 h-full rounded-full transition-all duration-300" style={{ width: `${challengeProgressPercent}%` }}></div>
                  </div>
                </div>

                {challengeProgressPercent === 100 ? (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleClaimChallengeReward}
                    disabled={challengeClaimed}
                    className={`w-full font-black py-3 rounded-2xl text-[10px] uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2 mt-1 cursor-pointer ${
                      challengeClaimed 
                        ? 'bg-slate-950/20 border border-white/5 text-slate-500 cursor-not-allowed shadow-none'
                        : 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-lg shadow-amber-500/10'
                    }`}
                  >
                    <Trophy className="w-4 h-4" />
                    <span>{challengeClaimed ? 'Reward Claimed' : 'Claim +50 XP Reward! 🎁'}</span>
                  </motion.button>
                ) : (
                  <p className="text-[11px] text-center text-slate-500 font-bold italic">
                    Complete all tasks to unlock daily bonus XP!
                  </p>
                )}
              </div>

              {/* Active SRS Review CTA */}
              <div className="bg-slate-900/60 backdrop-blur-2xl border border-white/10 text-indigo-50 rounded-[32px] p-6 shadow-2xl relative overflow-hidden text-left">
                <div className="absolute -right-6 -bottom-6 text-7xl opacity-5 pointer-events-none">🧠</div>
                <h3 className="text-base font-black tracking-tight mb-1.5">Neural Spaced Repetition</h3>
                <p className="text-xs text-slate-400 leading-relaxed font-bold mb-4">
                  Memory decay calculations are monitored automatically via the SuperMemo (SM-2) algorithm.
                </p>

                <div className="bg-slate-950/40 rounded-2xl p-4 mb-4 border border-white/5 flex justify-between items-center">
                  <div>
                    <span className="text-[9px] uppercase font-black tracking-widest text-indigo-400 block mb-0.5">Pending Reviews</span>
                    <span className="text-xl font-black text-white">{reviewsQueue.length} Characters</span>
                  </div>
                  <span className="text-3xl">📚</span>
                </div>

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => onStartQuiz(reviewsQueue, 'srs')}
                  disabled={reviewsQueue.length === 0}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black py-3.5 rounded-2xl text-xs uppercase tracking-widest shadow-lg transition-all disabled:opacity-30 cursor-pointer"
                >
                  {reviewsQueue.length > 0 ? 'Start Review Quiz' : 'Deck fully retained!'}
                </motion.button>
              </div>

              {/* 🎉 BEIHANG FUN ZONE — "北航加油站" (Beihang Hype Station) */}
              <BeihangHypeStation />

            </div>

            {/* Right/Center dictionary cards & details: Your Training Lexicon — prioritized first on mobile/tablet, unchanged (2nd) on desktop */}
            <div className="order-1 lg:order-2 lg:col-span-2 space-y-6">
              <div className="bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-[32px] p-6 shadow-2xl space-y-6 text-left">
                
                {/* Search and Filters */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-white/5">
                  <div className="text-left">
                    <h2 className="text-lg font-black text-white">Your Training Lexicon</h2>
                    <p className="text-xs text-slate-400 font-medium">{characters.length} characters under active memory tracking</p>
                  </div>

                  <div className="flex gap-2 w-full md:w-auto">
                    {/* Browse / Folders view toggle */}
                    <div className="flex bg-white/5 border border-white/10 rounded-xl p-1 gap-1 shrink-0">
                      <button
                        onClick={() => setLexiconView('browse')}
                        className={`p-1.5 rounded-lg transition-all cursor-pointer ${lexiconView === 'browse' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}
                        title="Browse characters"
                      >
                        <List className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setLexiconView('folders')}
                        className={`p-1.5 rounded-lg transition-all cursor-pointer ${lexiconView === 'folders' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'}`}
                        title="Manage folders"
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                      </button>
                      <button
                        disabled
                        className="p-1.5 rounded-lg transition-all cursor-not-allowed opacity-30 text-slate-600"
                        title="Speaking Coach — Coming Soon"
                      >
                        <Mic className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {lexiconView === 'browse' && (
                      <>
                        {/* Star favorites trigger button */}
                        <button
                          onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                          className={`p-2.5 rounded-xl border flex items-center justify-center gap-1.5 transition-all text-[10px] font-black cursor-pointer uppercase tracking-wider ${
                            showFavoritesOnly 
                              ? 'bg-amber-500 border-amber-400 text-slate-950 shadow-md' 
                              : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/10'
                          }`}
                          title="Filter favorites"
                        >
                          <Star className={`w-4 h-4 ${showFavoritesOnly ? 'fill-current text-amber-300' : ''}`} />
                          <span className="hidden sm:inline">Favorites</span>
                        </button>

                        <div className="relative flex-1 md:w-56">
                          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                          <input
                            type="text"
                            placeholder="Search Hanzi, pinyin..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-950/40 border border-white/10 rounded-xl py-2 pl-10 pr-4 font-bold text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:bg-slate-950/60 transition-all shadow-inner"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {folderSuccess && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-xl text-xs font-semibold leading-relaxed">
                    {folderSuccess}
                  </div>
                )}
                {folderError && (
                  <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-3 rounded-xl text-xs font-semibold leading-relaxed">
                    {folderError}
                  </div>
                )}

                {/* Folder scope chips — only shown while browsing individual characters */}
                {lexiconView === 'browse' && (
                  <div className="flex flex-wrap items-center gap-2 -mt-2">
                    <button
                      onClick={() => setActiveFolderId(null)}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                        activeFolderId === null ? 'bg-emerald-500 border-emerald-400 text-slate-950' : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      All ({characters.length})
                    </button>
                    <button
                      onClick={() => setActiveFolderId('unfiled')}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                        activeFolderId === 'unfiled' ? 'bg-emerald-500 border-emerald-400 text-slate-950' : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Unfiled ({characters.filter(c => !c.folderId).length})
                    </button>
                    {folders.map((f) => {
                      const swatch = getFolderColor(f.color);
                      const isActive = activeFolderId === f.id;
                      return (
                        <button
                          key={f.id}
                          onClick={() => setActiveFolderId(f.id)}
                          className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer flex items-center gap-1.5 ${
                            isActive ? `${swatch.solid} border-transparent text-slate-950` : `${swatch.bg} ${swatch.border} ${swatch.text} hover:brightness-110`
                          }`}
                        >
                          <span>{f.icon}</span>
                          <span>{f.name} ({f.characterCount})</span>
                        </button>
                      );
                    })}
                    <button
                      onClick={() => { setEditingFolder(null); setShowFolderModal(true); }}
                      className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border border-dashed border-white/20 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/40 transition-all cursor-pointer flex items-center gap-1"
                    >
                      <FolderPlus className="w-3 h-3" />
                      <span>New Folder</span>
                    </button>
                  </div>
                )}

                {lexiconView === 'folders' ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-400 font-medium">Organize your deck into custom folders.</p>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => { setEditingFolder(null); setShowFolderModal(true); }}
                        className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] px-4 py-2.5 rounded-xl uppercase tracking-widest transition-all cursor-pointer shadow-sm flex items-center gap-1.5 shrink-0"
                      >
                        <FolderPlus className="w-3.5 h-3.5" />
                        <span>New Folder</span>
                      </motion.button>
                    </div>

                    {folders.length === 0 ? (
                      <div className="text-center py-14 bg-slate-950/40 rounded-2xl border border-dashed border-white/10 p-6 space-y-3">
                        <Inbox className="w-9 h-9 text-slate-500 mx-auto" />
                        <p className="text-slate-300 text-xs font-bold">You don't have any training folders yet.</p>
                        <p className="text-slate-500 text-[11px] font-medium">Create one to start organizing your characters.</p>
                        <button
                          onClick={() => { setEditingFolder(null); setShowFolderModal(true); }}
                          className="mt-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] px-4 py-2.5 rounded-xl uppercase tracking-widest transition-all cursor-pointer shadow-sm inline-flex items-center gap-1.5"
                        >
                          <FolderPlus className="w-3.5 h-3.5" />
                          <span>Create Folder</span>
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
                        {folders.map((f) => (
                          <FolderCard
                            key={f.id}
                            folder={f}
                            onOpen={() => { setActiveFolderId(f.id); setLexiconView('browse'); }}
                            onEdit={() => { setEditingFolder(f); setShowFolderModal(true); }}
                            onDelete={() => handleDeleteFolder(f)}
                            onToggleFavorite={() => handleToggleFolderFavorite(f)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : lexiconView === 'speaking' ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
                    <Mic className="w-10 h-10 text-slate-600" />
                    <p className="text-slate-500 font-bold text-sm">به زودی اضافه خواهد شد</p>
                    <p className="text-slate-600 text-xs">Speaking Coach — Coming Soon</p>
                  </div>
                ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Word scrollable deck list */}
                  <div 
                    className="lg:col-span-1 space-y-2 max-h-[520px] overflow-y-auto pr-1"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                  >
                    {filteredCharacters.length === 0 ? (
                      <div className="text-center py-12 bg-slate-950/40 rounded-2xl border border-dashed border-white/10 p-4">
                        <p className="text-slate-400 text-xs font-medium leading-normal">No matches found in your active deck.</p>
                      </div>
                    ) : (
                      filteredCharacters.map(c => {
                        const isActive = selectedChar?.id === c.id;
                        const isDue = c.nextReviewDate <= todayStr;
                        const isFav = favorites.includes(c.id);
                        return (
                          <motion.div
                            whileHover={{ x: 2 }}
                            key={c.id}
                            onClick={() => {
                              setSelectedChar(c);
                              if (window.innerWidth < 1024) {
                                setTimeout(() => {
                                  document.getElementById('character-details-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }, 50);
                              }
                            }}
                            className={`p-3 rounded-2xl border-2 flex justify-between items-center cursor-pointer transition-all ${
                              isActive 
                                ? 'border-emerald-500 bg-emerald-500/10 shadow-md' 
                                : 'border-white/5 bg-slate-950/20 hover:bg-slate-950/40'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              {/* Star Toggle icon */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFavorite(c.id);
                                }}
                                className={`p-2.5 hover:scale-115 transition-transform cursor-pointer relative z-20 ${isFav ? 'text-amber-400' : 'text-slate-500 hover:text-slate-400'}`}
                                title={isFav ? "Remove from favorites" : "Add to favorites"}
                              >
                                <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
                              </button>
                              <span className="w-9 h-9 bg-slate-950 border border-white/10 rounded-xl flex items-center justify-center font-black text-white text-base shadow-sm">
                                {c.character}
                              </span>
                              <div className="text-left">
                                <span className="font-extrabold text-white text-xs block">{c.character}</span>
                                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">{c.pinyin}</span>
                              </div>
                            </div>

                            <div className="flex flex-col items-end shrink-0">
                              <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">HSK {c.hskLevel}</span>
                              {isDue ? (
                                <span className="text-[8px] font-black text-rose-300 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded-full uppercase tracking-widest mt-0.5">DUE</span>
                              ) : (
                                <span className="text-[8px] font-black text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full uppercase tracking-widest mt-0.5">STABLE</span>
                              )}
                            </div>
                          </motion.div>
                        );
                      })
                    )}
                  </div>

                  {/* Character dynamic details display with mobile safe scroll offset and momentum touch scrolling */}
                  <div 
                    id="character-details-panel" 
                    className="lg:col-span-2 bg-slate-950/40 border border-white/5 rounded-3xl p-5 space-y-4 max-h-[520px] overflow-y-auto scroll-mt-24"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                  >
                    {selectedChar ? (
                      <div className="space-y-4 text-left">
                        
                        {/* Render Title Row */}
                        <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center justify-between gap-4 pb-3 border-b border-white/10">
                          <div>
                            <div className="flex items-center gap-2 mb-1.5">
                              <h2 className="text-2xl font-black text-white tracking-tight">{selectedChar.character}</h2>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full uppercase tracking-wider">{selectedChar.pinyin}</span>
                              <button 
                                onClick={() => handleSpeak(selectedChar.character)}
                                className="p-2.5 -m-1 text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer relative z-10"
                                title="Speak Pronunciation"
                              >
                                <Volume2 className="w-4 h-4" />
                              </button>
                              {selectedChar.englishMeaning && (
                                <span
                                  className="text-[10px] font-black text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-0.5 rounded-full tracking-wider"
                                  title={selectedChar.englishMeaning}
                                >
                                  {shortenMeaning(selectedChar.englishMeaning, 2)}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex gap-2 w-full sm:w-auto">
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => onStartQuiz(characters, 'single', selectedChar)}
                              className="flex-1 sm:flex-none bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/20 font-black text-[10px] px-4 py-2.5 sm:py-2 rounded-xl uppercase tracking-widest transition-all cursor-pointer shadow-sm text-center"
                            >
                              Trace Quiz
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => onStartStrokeChallenge([selectedChar])}
                              className="flex-1 sm:flex-none bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/20 font-black text-[10px] px-4 py-2.5 sm:py-2 rounded-xl uppercase tracking-widest transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
                              title={`Test the stroke order of ${selectedChar.character} from memory`}
                            >
                              <PenTool className="w-3 h-3" />
                              Stroke Test
                            </motion.button>
                            <button
                              onClick={() => handleDeleteCharacter(selectedChar.id)}
                              className="shrink-0 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 p-2.5 sm:p-2 rounded-xl border border-rose-500/20 transition-all cursor-pointer shadow-sm"
                              title="Remove"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Vector Canvas and Core Metrics */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Drawing canvas */}
                          <div className="bg-slate-900/60 p-4 rounded-2xl border border-white/5 flex flex-col items-center justify-center min-h-[220px] shadow-inner relative">
                            <div
                              id="details-canvas-container"
                              ref={attachStrokeCanvas}
                              className="w-[180px] h-[180px] flex items-center justify-center bg-slate-950/40 rounded-xl border border-white/5"
                            ></div>
                            <button 
                              onClick={handleAnimateStroke}
                              className="text-[9px] font-black text-slate-400 hover:text-emerald-400 uppercase tracking-widest mt-2.5 cursor-pointer transition-colors"
                            >
                              Animate Guide
                            </button>
                          </div>

                          {/* Detail metrics list */}
                          <div className="space-y-3">
                            <div className="bg-slate-900/60 p-3.5 rounded-xl border border-white/5 text-xs shadow-sm">
                              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Translation</span>
                              <p className="font-bold text-white"><span className="text-slate-500 font-extrabold text-[10px]">EN:</span> {shortenMeaning(selectedChar.englishMeaning)}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-center">
                              <div className="bg-slate-900/60 p-2.5 rounded-xl border border-white/5 text-xs shadow-sm">
                                <span className="text-[8px] font-black text-slate-500 uppercase block mb-0.5">Strokes</span>
                                <span className="font-black text-white">{selectedChar.strokeCount}</span>
                              </div>
                              <div className="bg-slate-900/60 p-2.5 rounded-xl border border-white/5 text-xs shadow-sm">
                                <span className="text-[8px] font-black text-slate-500 uppercase block mb-0.5">HSK Level</span>
                                <span className="font-black text-white">{selectedChar.hskLevel}</span>
                              </div>
                              <div className="bg-slate-900/60 p-2.5 rounded-xl border border-white/5 text-xs shadow-sm">
                                <span className="text-[8px] font-black text-slate-500 uppercase block mb-0.5">Frequency</span>
                                <span className="font-black text-white">#{selectedChar.frequencyRank}</span>
                              </div>
                              <div className="bg-slate-900/60 p-2.5 rounded-xl border border-white/5 text-xs shadow-sm">
                                <span className="text-[8px] font-black text-slate-500 uppercase block mb-0.5">Stability</span>
                                <span className="font-black text-emerald-400">{selectedChar.memoryStability}%</span>
                              </div>
                            </div>

                            <div className="bg-slate-900/60 p-3 rounded-xl border border-white/5 text-xs shadow-sm">
                              <span className="text-[9px] font-black text-slate-500 uppercase block mb-1.5">Radicals Breakdown</span>
                              <div className="flex flex-wrap gap-1.5">
                                {selectedChar.radicals?.map((rad, i) => (
                                  <span key={i} className="bg-slate-950/40 border border-white/5 px-2.5 py-1 rounded-lg font-black text-emerald-400 text-xs">{rad}</span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                        {/* Interactive Pronunciation Station */}
                        <SpeechPlayer character={selectedChar} />

                        {/* Personal Notes Box */}
                        <div className="bg-slate-900/60 p-4 rounded-2xl border border-white/5 space-y-2 text-xs shadow-sm">
                          <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                            <span className="text-[10px] font-black text-slate-400 uppercase block flex items-center gap-1.5">
                              <Edit3 className="w-4 h-4 text-emerald-400" /> Personal Learning Notes
                            </span>
                            {noteSaved && (
                              <span className="text-[9px] text-emerald-400 font-extrabold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                                Notes Saved
                              </span>
                            )}
                          </div>
                          <textarea
                            placeholder="Type personal memory anchors, compound patterns, or custom stroke guides here..."
                            value={noteText}
                            onChange={(e) => handleSaveNote(e.target.value)}
                            className="w-full min-h-[70px] bg-slate-950/40 border border-white/10 rounded-xl p-3 text-xs text-white font-medium focus:outline-none focus:border-emerald-500/80 focus:bg-slate-950/60 transition-all shadow-inner"
                          />
                        </div>

                        {/* Example Sentences Section */}
                        {selectedChar.exampleSentences && selectedChar.exampleSentences.length > 0 && (
                          <div className="space-y-1.5 text-left">
                            <span className="text-[10px] font-black text-slate-400 uppercase block px-1">Bilingual Context Sentences</span>
                            <div className="space-y-2">
                              {selectedChar.exampleSentences.map((s, i) => (
                                <div key={i} className="bg-slate-900/60 p-3.5 rounded-xl border border-white/5 text-xs leading-normal space-y-1 shadow-sm text-left">
                                  <p className="font-black text-white text-sm flex items-center gap-2">
                                    <span>{s.sentence}</span>
                                    <button onClick={() => handleSpeak(s.sentence)} className="text-slate-400 hover:text-emerald-400 transition-colors"><Volume2 className="w-3.5 h-3.5" /></button>
                                  </p>
                                  <p className="font-extrabold text-emerald-600">{s.pinyin}</p>
                                  <p className="text-slate-400 text-[11px] font-medium">{s.meaning}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center py-24 space-y-3">
                        <HelpCircle className="w-12 h-12 text-slate-600" />
                        <p className="text-slate-400 font-extrabold text-xs uppercase tracking-wider">Select a Hanzi card to view specifications</p>
                      </div>
                    )}
                  </div>

                </div>
                )}

              </div>

              {/* Personal Study Notebook — fixed-height panel below Your Training Lexicon (right of the SRS card on desktop); only the notes list scrolls internally */}
              <div className="bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-[32px] p-6 shadow-2xl space-y-4 text-left flex flex-col h-[560px] sm:h-[600px] lg:h-[640px]">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-white/5 pb-4 shrink-0">
                  <div className="flex items-center gap-2">
                    <PenTool className="w-5 h-5 text-indigo-400 shrink-0" />
                    <h3 className="text-base font-black text-white tracking-tight">Scholar Notebook</h3>
                  </div>
                  <span className="whitespace-nowrap rounded-full px-3.5 py-1 flex items-center justify-center bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-extrabold text-[10px] tracking-wide shrink-0">
                    {notes.length} Note{notes.length === 1 ? '' : 's'}
                  </span>
                </div>

                <p className="text-xs text-slate-400 font-medium leading-relaxed shrink-0">
                  Save memory anchors, compound patterns, custom stroke guides, or any study reminder. Notes are stored privately on this device.
                </p>

                <div className="space-y-2.5 shrink-0">
                  <textarea
                    placeholder="Type your study note here..."
                    value={draftNote}
                    onChange={(e) => setDraftNote(e.target.value)}
                    className="notes-scroll w-full min-h-24 sm:min-h-28 resize-none bg-slate-950/40 border border-white/10 rounded-2xl p-4 text-xs sm:text-sm text-white font-medium placeholder-slate-600 focus:outline-none focus:border-emerald-500/80 focus:bg-slate-950/60 transition-all shadow-inner"
                  />
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleAddNote}
                      disabled={!draftNote.trim()}
                      className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black py-3 rounded-2xl text-[10px] uppercase tracking-widest shadow-md transition-all disabled:opacity-30 cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Save Note</span>
                    </motion.button>
                    {notesSaved && (
                      <span className="text-[10px] text-emerald-400 font-extrabold bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-full uppercase tracking-wider animate-pulse text-center shrink-0">
                        Saved ✓
                      </span>
                    )}
                  </div>
                </div>

                {/* Notes area — the ONLY scrollable region inside the fixed-height panel; header, description, input and Save button stay pinned above */}
                <div className="notes-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                  {notes.length > 0 ? (
                    <div className="space-y-2.5 pr-1.5">
                      {notes.map((n) => (
                        <div key={n.id} className="bg-slate-950/40 border border-white/5 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="notes-scroll max-h-36 overflow-y-auto overflow-x-hidden pr-1">
                              <p className="text-xs text-white font-semibold leading-relaxed whitespace-pre-wrap break-words">{n.text}</p>
                            </div>
                            <p className="text-[9px] text-slate-500 font-black uppercase tracking-wider mt-1.5">
                              {new Date(n.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDeleteNote(n.id)}
                            className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-500/10 transition-all cursor-pointer shrink-0"
                            title="Delete note"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center bg-slate-950/20 border border-dashed border-white/10 rounded-2xl p-6 text-center">
                      <p className="text-slate-500 text-xs font-bold italic">No notes yet — add your first study note above.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </motion.div>
        )}

        {/* STATISTICS & ANALYTICS TAB CONTENT */}
        {activeTab === 'analytics' && (
          <motion.div 
            key="analytics"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="order-4 lg:order-4 grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            
            {/* Left Column: Smart Review Suggestions */}
            <div className="lg:col-span-1 bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-[32px] p-6 shadow-2xl space-y-4 text-left">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Brain className="w-5 h-5 text-indigo-400" />
                <span>Memory Decay Alerts</span>
              </h3>
              <p className="text-xs text-slate-400 font-medium leading-relaxed">
                Suggested reviews based on SuperMemo algorithm calculations. Finish exercises daily to stabilize retention.
              </p>

              <div className="space-y-2.5">
                {smartReviewSuggestions.map((char) => (
                  <div 
                    key={char.id}
                    className="bg-slate-950/40 border border-white/5 rounded-2xl p-3.5 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-9 h-9 bg-slate-950 border border-white/10 rounded-xl flex items-center justify-center text-base font-black text-white shadow-sm">
                        {char.character}
                      </span>
                      <div className="text-left">
                        <p className="text-xs font-extrabold text-white">{char.character} ({char.pinyin})</p>
                        <p className="text-[10px] text-slate-400 font-medium">Stability: <span className="text-rose-400 font-black">{char.memoryStability}%</span></p>
                      </div>
                    </div>

                    <button
                      onClick={() => onStartQuiz(characters, 'single', char)}
                      className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[9px] font-black px-3 py-2 rounded-lg uppercase tracking-wider transition-all cursor-pointer shadow-sm active:scale-95"
                    >
                      Review
                    </button>
                  </div>
                ))}

                {smartReviewSuggestions.length === 0 && (
                  <p className="text-slate-500 text-xs italic font-medium text-center py-6">Your lexicon is currently empty.</p>
                )}
              </div>
            </div>

            {/* Right Column: Visual trend charts and calendar */}
            <div className="lg:col-span-2 space-y-6 text-left">
              
              {/* Real-time Study Calendar */}
              <div className="bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-[32px] p-6 shadow-2xl space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-emerald-400" />
                    <span>Learning Continuity Grid</span>
                  </h3>
                  <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">
                    Consistency Tracker
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-medium leading-relaxed">
                  Earn multi-day multipliers and secure your learning streak by maintaining high consistency.
                </p>

                {/* Render grid study calendar */}
                <div className="grid grid-cols-7 gap-1.5 text-center text-[9px] font-black text-slate-500 uppercase tracking-widest max-w-md mx-auto pt-2">
                  <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                  
                  {Array.from({ length: 28 }).map((_, i) => {
                    const isActiveDay = (i === 1 || i === 3 || i === 5 || i === 8 || i === 12 || i === 18 || i === 24 || i === 27);
                    return (
                      <div 
                        key={i}
                        className={`h-8 sm:h-10 rounded-xl flex items-center justify-center font-bold border transition-all ${
                          isActiveDay 
                            ? 'bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border-emerald-500/40 text-emerald-400 shadow-sm font-black' 
                            : 'bg-slate-950/40 border-white/5 text-slate-600'
                        }`}
                        title={isActiveDay ? `Study day logged! Day ${i + 1}` : `No practice logged Day ${i + 1}`}
                      >
                        {i + 1}
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-start sm:justify-end gap-3 text-[9px] font-black text-slate-500 uppercase tracking-widest pt-2">
                  <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 bg-slate-950/40 border border-white/5 rounded-md"></span> Idle</span>
                  <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 bg-emerald-500/20 border border-emerald-500/40 rounded-md"></span> Practiced</span>
                </div>
              </div>

              {/* Weekly Trend Chart */}
              <div className="bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-[32px] p-6 shadow-2xl space-y-4">
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                  <span>Weekly Study Milestones</span>
                </h3>
                <p className="text-xs text-slate-400 font-medium leading-relaxed">
                  Calculated accumulative scholar XP generated across active Mandarin study blocks.
                </p>

                {/* Elegant Custom SVG Trend Chart */}
                <div className="bg-slate-950/40 rounded-2xl p-4 border border-white/5 relative h-40 flex items-end justify-between px-6 pt-6 overflow-hidden">
                  
                  {/* SVG path */}
                  <svg className="absolute inset-0 w-full h-full p-4 pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <path 
                      d="M 5,90 Q 20,70 35,50 T 65,30 T 95,10" 
                      fill="none" 
                      stroke="#10b981" 
                      strokeWidth="3"
                      strokeLinecap="round"
                      className="opacity-30"
                    />
                    <circle cx="5" cy="90" r="3" fill="#10b981" />
                    <circle cx="35" cy="50" r="3" fill="#10b981" />
                    <circle cx="65" cy="30" r="3" fill="#10b981" />
                    <circle cx="95" cy="10" r="3" fill="#0ea5e9" />
                  </svg>

                  <div className="flex flex-col items-center space-y-1.5 z-10">
                    <span className="text-[9px] font-black text-emerald-400">+10 XP</span>
                    <div className="w-3.5 h-16 bg-emerald-500/20 border border-emerald-500/30 rounded-t-lg"></div>
                    <span className="text-[9px] text-slate-500 font-bold uppercase">Mon</span>
                  </div>

                  <div className="flex flex-col items-center space-y-1.5 z-10">
                    <span className="text-[9px] font-black text-emerald-400">+25 XP</span>
                    <div className="w-3.5 h-24 bg-emerald-500/30 border border-emerald-500/40 rounded-t-lg"></div>
                    <span className="text-[9px] text-slate-500 font-bold uppercase">Wed</span>
                  </div>

                  <div className="flex flex-col items-center space-y-1.5 z-10">
                    <span className="text-[9px] font-black text-emerald-400">+50 XP</span>
                    <div className="w-3.5 h-28 bg-emerald-500/40 border border-emerald-500/50 rounded-t-lg"></div>
                    <span className="text-[9px] text-slate-500 font-bold uppercase">Fri</span>
                  </div>

                  <div className="flex flex-col items-center space-y-1.5 z-10">
                    <span className="text-[9px] font-black text-emerald-400">+125 XP</span>
                    <div className="w-3.5 h-32 bg-emerald-500 rounded-t-lg shadow-sm border border-emerald-400/40 shadow-emerald-500/10"></div>
                    <span className="text-[9px] text-slate-400 font-bold uppercase">Today</span>
                  </div>

                </div>
              </div>

            </div>

          </motion.div>
        )}

        {/* BADGES & ACADEMIC MILESTONES TAB */}
        {activeTab === 'badges' && (
          <motion.div 
            key="badges"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="order-4 lg:order-4 bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-[32px] p-6 shadow-2xl space-y-6 text-left"
          >
            <div className="text-left space-y-1">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Trophy className="w-6 h-6 text-amber-400" />
                <span>Achievements Cabinet</span>
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                Unlock rare calligraphic medals by studying regularly and maintaining high accuracy scores.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {customAchievementsList.map((badge, idx) => {
                const isUnlocked = badge.condition;
                return (
                  <motion.div 
                    whileHover={{ scale: 1.02, y: -2 }}
                    key={idx}
                    className={`border rounded-3xl p-5 text-left space-y-3.5 transition-all duration-300 relative overflow-hidden ${
                      isUnlocked 
                        ? 'bg-slate-950/40 border-amber-500/20 shadow-md shadow-amber-500/5' 
                        : 'bg-slate-950/10 border-white/5 opacity-50'
                    }`}
                  >
                    {isUnlocked && (
                      <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/5 rounded-full blur-xl pointer-events-none"></div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-3xl filter drop-shadow-sm">{badge.icon}</span>
                      {isUnlocked ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                          <Check className="w-3 h-3" /> Unlocked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[9px] font-black text-slate-500 bg-white/[0.02] border border-white/5 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                          <Lock className="w-3 h-3 text-slate-600" /> Locked
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 text-left">
                      <h4 className="text-sm font-black text-white">{badge.title}</h4>
                      <p className="text-xs text-slate-400 font-medium leading-relaxed">{badge.description}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* AI SPEAKING COACH TAB — Coming Soon */}
        {activeTab === 'speaking' && (
          <motion.div
            key="speaking"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="order-4 lg:order-4 bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-[32px] p-6 shadow-2xl space-y-6 text-left"
          >
            <div className="text-left space-y-1">
              <h3 className="text-lg font-black text-slate-400 flex items-center gap-2">
                <Mic className="w-6 h-6 text-slate-600" />
                <span>Speaking Coach</span>
              </h3>
              <p className="text-xs text-slate-500 font-medium">به زودی اضافه خواهد شد — Coming Soon</p>
            </div>
            <div className="flex flex-col items-center justify-center py-16 gap-5">
              <div className="w-20 h-20 rounded-full bg-slate-800/80 border border-slate-700/50 flex items-center justify-center">
                <Mic className="w-8 h-8 text-slate-600" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-slate-500 font-bold text-sm">این بخش در حال توسعه است</p>
                <p className="text-slate-600 text-xs max-w-xs leading-relaxed">
                  قابلیت تمرین تلفظ و دریافت بازخورد هوش مصنوعی به زودی فعال خواهد شد.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 bg-slate-800 border border-slate-700 text-slate-500 text-[10px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest">
                Coming Soon
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showFolderModal && (
        <FolderModal
          folder={editingFolder}
          onClose={() => { setShowFolderModal(false); setEditingFolder(null); }}
          onSubmit={editingFolder ? handleUpdateFolder : handleCreateFolder}
        />
      )}

      {pendingFolderCharacter && !showFolderModal && (
        <FolderPickerModal
          character={pendingFolderCharacter}
          folders={folders}
          onAssign={handleAssignToFolder}
          onSkip={handleSkipFolderAssignment}
          onCreateNew={() => { setEditingFolder(null); setShowFolderModal(true); }}
        />
      )}

    </motion.div>
  );
}

// 🎉 BEIHANG FUN ZONE — "北航加油站" (Beihang Hype Station)
// A standalone component so its useState hooks live in their own component.
// This block used to call useState inside a render-time IIFE nested in the
// activeTab === 'lexicon' branch, which broke React's Rules of Hooks:
// switching tabs changed Dashboard's hook count and crashed the whole app
// ("Rendered more/fewer hooks than during the previous render" → blank screen).
function BeihangHypeStation() {
  const [beihangExploded, setBeihangExploded] = useState(false);
  const [beihangParticles, setBeihangParticles] = useState<{id:number;x:number;y:number;rot:number;scale:number;type:string;delay:number}[]>([]);

  const handleBeihangBoom = () => {
    if (beihangExploded) return;
    setBeihangExploded(true);

    // Generate waterfall particles
    const emojis = [
      '✈️','✈️','✈️','✈️','✈️','✈️','✈️','✈️','✈️','✈️',
      '✈️','✈️','✈️','✈️','✈️','✈️','✈️','✈️','✈️','✈️',
      '❤️','❤️','❤️','❤️','❤️',
      '💙','💙','💙',
      '⭐','⭐','⭐'
    ];
    const particles = Array.from({ length: 38 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: -(Math.random() * 20 + 5),
      rot: Math.random() * 360,
      scale: 0.8 + Math.random() * 1.2,
      type: emojis[i % emojis.length],
      delay: Math.random() * 0.8,
    }));
    setBeihangParticles(particles);

    // Canvas confetti with red & gold (China colors)
    confetti({ particleCount: 60, spread: 80, origin: { y: 0.5 }, colors: ['#DE2910','#FFDE00','#DE2910','#FFDE00'] });
    setTimeout(() => confetti({ particleCount: 40, spread: 100, origin: { x: 0.2, y: 0.5 }, colors: ['#DE2910','#FFDE00'] }), 300);
    setTimeout(() => confetti({ particleCount: 40, spread: 100, origin: { x: 0.8, y: 0.5 }, colors: ['#DE2910','#FFDE00'] }), 600);

    // Reset after animation
    setTimeout(() => {
      setBeihangExploded(false);
      setBeihangParticles([]);
    }, 4500);
  };

  return (
    <div
      className="bg-slate-900/60 backdrop-blur-2xl border border-white/10 text-white rounded-[32px] p-6 shadow-2xl relative overflow-hidden text-left"
      style={{ minHeight: '0' }}
    >
      {/* Decorative glows */}
      <div className="absolute -right-8 -top-8 w-32 h-32 bg-red-500/10 rounded-full blur-2xl pointer-events-none"></div>
      <div className="absolute -left-4 bottom-0 w-20 h-20 bg-yellow-500/10 rounded-full blur-xl pointer-events-none"></div>
      <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-red-500/40 to-transparent"></div>

      {/* Falling particles */}
      {beihangParticles.map(p => (
        <div
          key={p.id}
          className="absolute pointer-events-none select-none z-20"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            fontSize: `${p.scale * 1.5}rem`,
            transform: `rotate(${p.rot}deg)`,
            animation: `beihangFall ${1.8 + p.delay}s ease-in forwards`,
            animationDelay: `${p.delay * 0.3}s`,
          }}
        >
          {p.type}
        </div>
      ))}

      {/* CSS for the falling animation */}
      <style>{`
        @keyframes beihangFall {
          0%   { transform: translateY(-10px) rotate(0deg) scale(0.5); opacity: 0; }
          15%  { opacity: 1; transform: translateY(20px) rotate(45deg) scale(1); }
          80%  { opacity: 1; transform: translateY(280px) rotate(200deg) scale(0.9); }
          100% { opacity: 0; transform: translateY(380px) rotate(360deg) scale(0.6); }
        }
        @keyframes beihangPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.06); }
        }
      `}</style>

      {/* Title */}
      <h3 className="text-base font-black tracking-tight mb-1 flex items-center gap-2">
        <span>北航加油站</span>
        <span className="text-[10px] font-black text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">Beihang Hype Station</span>
      </h3>                    <p className="text-xs text-slate-400 font-bold leading-relaxed mb-4">
                      Feeling stuck? One tap charges you up with the full power of 北京航空航天大学! 🚀
                    </p>

                    {/* Beihang logo placeholder with pulse */}
                    <div className="flex items-center justify-center mb-4">
                      <div
                        className="relative w-16 h-16 rounded-full bg-red-900/30 border-2 border-red-500/40 flex items-center justify-center shadow-lg shadow-red-500/10"
                        style={{ animation: beihangExploded ? 'beihangPulse 0.4s ease-in-out 6' : 'none' }}
                      >
                        <span className="text-3xl select-none">🛩️</span>
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-black text-white border border-white/20">
                          北
                        </div>
                      </div>
                    </div>

      {/* The big energy button — emerald/teal gradient to match the other section buttons */}
      <motion.button
        whileHover={{ scale: beihangExploded ? 1 : 1.03 }}
        whileTap={{ scale: 0.96 }}
        onClick={handleBeihangBoom}
        disabled={beihangExploded}
        className={`w-full font-black py-3.5 rounded-2xl text-xs uppercase tracking-widest shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer relative overflow-hidden border ${
          beihangExploded
            ? 'bg-emerald-900/30 border-emerald-500/30 text-emerald-300 cursor-not-allowed'
            : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 border-emerald-400/30 text-slate-950 shadow-emerald-500/20'
        }`}
      >
        {beihangExploded ? (
          <>✈️ 北航威武！加油！✈️</>
        ) : (
          <>
            <span>✈️</span>
            <span>按我加油！ Click for Power!</span>
            <span>✈️</span>
          </>
        )}
      </motion.button>

      {beihangExploded && (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center text-[11px] font-black text-red-400 mt-3 tracking-wide"
        >
          ❤️ 北京航空航天大学 • Beihang University • 永远加油！ ❤️
        </motion.p>
      )}
    </div>
  );
}
