import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { CharacterItem, Achievement } from '../types';
import { 
  Flame, Award, BookOpen, Plus, Search, Sparkles, Brain, Clock, 
  Trash2, HelpCircle, ChevronRight, Volume2, Calendar, CheckCircle2, RotateCcw,
  Star, Edit3, Heart, TrendingUp, Info, Sparkle, Trophy, Compass, Lock, Check,
  BarChart2, Zap
} from 'lucide-react';
import SpeechPlayer from './SpeechPlayer';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'motion/react';
import HanziWriter from 'hanzi-writer';
import { hanziCharDataLoader } from '../lib/hanziDataLoader';

interface DashboardProps {
  onStartQuiz: (chars: CharacterItem[], mode: 'srs' | 'single', singleChar?: CharacterItem) => void;
  user: { fullName: string; studentId: string; role: 'admin' | 'student' };
  onLogout: () => Promise<void>;
  onGoToAdmin: () => void;
}

export default function Dashboard({ onStartQuiz, user, onLogout, onGoToAdmin }: DashboardProps) {
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

  // Premium Features Local States
  const [activeTab, setActiveTab] = useState<'lexicon' | 'analytics' | 'badges'>('lexicon');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState<boolean>(false);
  const [noteText, setNoteText] = useState<string>('');
  const [noteSaved, setNoteSaved] = useState<boolean>(false);
  
  // Daily Challenge state
  const [listenCount, setListenCount] = useState<number>(0);
  const [challengeClaimed, setChallengeClaimed] = useState<boolean>(false);
  const [showChallengeCelebration, setShowChallengeCelebration] = useState<boolean>(false);

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
      const stats = await api.getStats();
      setStatsData(stats);
      const chars = await api.getCharacters();
      setCharacters(chars);
      if (chars.length > 0 && !selectedChar) {
        setSelectedChar(chars[0]);
      } else if (chars.length > 0 && selectedChar) {
        const updated = chars.find(c => c.id === selectedChar.id);
        if (updated) setSelectedChar(updated);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data.');
    } finally {
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

  // Stroke Order Dynamic Render Handler
  useEffect(() => {
    if (!selectedChar) return;
    const targetElement = document.getElementById('details-canvas-container');
    if (!targetElement) return;

    targetElement.innerHTML = ''; // safe clear

    try {
      HanziWriter.create('details-canvas-container', selectedChar.character, {
        width: 200,
        height: 200,
        padding: 10,
        strokeAnimationSpeed: 1.5,
        delayBetweenStrokes: 200,
        strokeColor: '#059669', // Emerald
        outlineColor: '#f1f5f9', // Soft grey
        drawingColor: '#06b6d4', // Cyan trace
        drawingThickness: 8,
        showOutline: true,
        charDataLoader: hanziCharDataLoader
      });
    } catch (err) {
      console.warn('HanziWriter drawing exception:', err);
    }
  }, [selectedChar]);

  const handleAnimateStroke = () => {
    if (!selectedChar) return;
    const container = document.getElementById('details-canvas-container');
    if (container) {
      // Re-trigger visual outline animation
      container.innerHTML = '';
      try {
        const writer = HanziWriter.create('details-canvas-container', selectedChar.character, {
          width: 200,
          height: 200,
          padding: 10,
          strokeColor: '#059669',
          outlineColor: '#f1f5f9',
          charDataLoader: hanziCharDataLoader
        });
        writer.animateCharacter();
      } catch (e) {}
    }
  };

  const handleAddCharacter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChar.trim() || newChar.trim().length !== 1) {
      setError('Please provide exactly one Chinese character.');
      return;
    }

    setLoadingAdd(true);
    setError(null);
    setSuccess(null);
    try {
      const added = await api.addCharacter(newChar.trim());
      setSuccess(`"${added.character}" added successfully to your dictionary!`);
      setNewChar('');
      setSelectedChar(added);
      await fetchDashboardData();
      
      // Update Daily Challenge progress implicitly (added 1 character today)
      localStorage.setItem(`sino3d_added_char_${user.studentId}_${todayStr}`, 'true');

      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Lookup failed.');
    } finally {
      setLoadingAdd(false);
    }
  };

  const handleDeleteCharacter = async (charId: string) => {
    if (!confirm('Are you sure you want to delete this character? All review progress and SM-2 calculations will be lost.')) {
      return;
    }

    try {
      await api.deleteCharacter(charId);
      setSuccess('Character deleted successfully.');
      if (selectedChar?.id === charId) {
        setSelectedChar(null);
      }
      await fetchDashboardData();
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

  const filteredCharacters = characters.filter(c => {
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

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="space-y-8 relative z-10 text-slate-100"
    >
      {logoutError && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-4 rounded-2xl text-xs font-semibold flex items-center justify-between shadow-sm">
          <span>{logoutError}</span>
          <button onClick={() => setLogoutError(null)} className="text-rose-400 hover:text-rose-300 font-black uppercase tracking-wider ml-2 cursor-pointer">Dismiss</button>
        </div>
      )}

      {/* Welcome Banner */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900/95 via-slate-950/95 to-slate-900/90 backdrop-blur-2xl rounded-[32px] p-6 md:p-8 text-white shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] border border-white/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
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

        <div className="flex gap-3 relative z-10 self-stretch md:self-auto justify-end shrink-0">
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

      {/* Core Bento Stats rows */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
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

      {/* TABS NAVIGATION BAR */}
      <div 
        className="flex bg-slate-950/60 p-1.5 rounded-2xl gap-1.5 border border-white/5 shrink-0 w-full sm:w-auto sm:max-w-max relative overflow-x-auto scrollbar-none backdrop-blur-md flex-row flex-nowrap"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        <button
          onClick={() => setActiveTab('lexicon')}
          className={`px-4 sm:px-6 py-2.5 font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 relative z-10 ${
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
          className={`px-4 sm:px-6 py-2.5 font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 relative z-10 ${
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
          className={`px-4 sm:px-6 py-2.5 font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 relative z-10 ${
            activeTab === 'badges' 
              ? 'bg-white/10 text-emerald-400 border border-emerald-500/20 shadow-md' 
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]'
          }`}
        >
          <Trophy className={`w-4 h-4 ${activeTab === 'badges' ? 'text-emerald-400' : 'text-slate-500'}`} />
          <span>Achievements Cabinet</span>
        </button>
      </div>

      {/* RENDER MODULE ACCORDING TO THE ACTIVE TAB */}
      <AnimatePresence mode="wait">
        {activeTab === 'lexicon' && (
          <motion.div 
            key="lexicon"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            
            {/* Left Column: Add Hanzi & SRS Review & Daily Challenge */}
            <div className="lg:col-span-1 space-y-6">
              
              {/* Add Character Input Card */}
              <div className="bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-[32px] p-6 shadow-2xl relative overflow-hidden text-left">
                <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
                <h3 className="text-base font-black text-white mb-1.5 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-emerald-400" />
                  <span>Beihang AI Injector</span>
                </h3>
                <p className="text-xs text-slate-400 font-medium mb-5 leading-relaxed">
                  Input any Chinese character. Our AI system will look up radicals, stroke counts, translation, and SM-2 memory profiles.
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
                    disabled={loadingAdd}
                    className="w-full btn-3d-emerald text-slate-950 font-black py-3.5 rounded-2xl text-[10px] uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer border-bottom-width:4px"
                  >
                    {loadingAdd ? (
                      <>
                        <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                        <span>Analyzing...</span>
                      </>
                    ) : (
                      <span>Inject to Deck (+15 XP)</span>
                    )}
                  </motion.button>
                </form>
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
              <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-indigo-50 rounded-[32px] p-6 shadow-2xl relative overflow-hidden border border-white/10 glow-indigo/10 text-left">
                <div className="absolute -right-6 -bottom-6 text-7xl opacity-5 pointer-events-none">🧠</div>
                <h3 className="text-base font-black tracking-tight mb-1.5">Neural Spaced Repetition</h3>
                <p className="text-xs text-indigo-300 leading-relaxed font-bold mb-4">
                  Memory decay calculations are monitored automatically via the SuperMemo (SM-2) algorithm.
                </p>

                <div className="bg-slate-950/60 rounded-2xl p-4 mb-4 border border-white/5 flex justify-between items-center">
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

            </div>

            {/* Right/Center dictionary cards & details */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-[32px] p-6 shadow-2xl space-y-6 text-left">
                
                {/* Search and Filters */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-white/5">
                  <div className="text-left">
                    <h2 className="text-lg font-black text-white">Your Training Lexicon</h2>
                    <p className="text-xs text-slate-400 font-medium">{characters.length} characters under active memory tracking</p>
                  </div>

                  <div className="flex gap-2 w-full md:w-auto">
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
                  </div>
                </div>

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
                        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-white/10">
                          <div>
                            <div className="flex items-center gap-2 mb-1.5">
                              <h2 className="text-2xl font-black text-white tracking-tight">{selectedChar.character}</h2>
                              <span className="text-xs font-medium text-slate-400">[{selectedChar.traditional !== selectedChar.character ? `Trad: ${selectedChar.traditional}` : 'Simplified'}]</span>
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
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => onStartQuiz(characters, 'single', selectedChar)}
                              className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-[10px] px-4 py-2 rounded-xl uppercase tracking-widest transition-all cursor-pointer shadow-md"
                            >
                              Trace Quiz
                            </motion.button>
                            <button
                              onClick={() => handleDeleteCharacter(selectedChar.id)}
                              className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 p-2 rounded-xl border border-rose-500/20 transition-all cursor-pointer shadow-sm"
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
                            <div id="details-canvas-container" className="w-[180px] h-[180px] flex items-center justify-center bg-slate-950/40 rounded-xl border border-white/5"></div>
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
                              <p className="font-bold text-white"><span className="text-slate-500 font-extrabold text-[10px]">EN:</span> {selectedChar.englishMeaning}</p>
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

                        {/* Example Words Section */}
                        {selectedChar.exampleWords && selectedChar.exampleWords.length > 0 && (
                          <div className="space-y-1.5 text-left">
                            <span className="text-[10px] font-black text-slate-400 uppercase block px-1">Lexicon Compounds</span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {selectedChar.exampleWords.map((word, i) => (
                                <div key={i} className="bg-slate-900/60 p-3 rounded-xl border border-white/5 flex items-center gap-3 shadow-xs text-left">
                                  <span className="text-base font-black text-white">{word.word}</span>
                                  <div className="text-left text-xs">
                                    <span className="font-extrabold text-emerald-400 block">{word.pinyin}</span>
                                    <span className="text-[10px] text-slate-400 leading-none">{word.meaning}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

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
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
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
            className="bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-[32px] p-6 shadow-2xl space-y-6 text-left"
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
      </AnimatePresence>

    </motion.div>
  );
}
