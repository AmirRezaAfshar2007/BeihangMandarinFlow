import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import { CharacterItem } from '../types';
import {
  ArrowLeft, PenTool, Eye, EyeOff, Lightbulb, RotateCcw, Flame, Trophy,
  Star, Target, Volume2, VolumeX, CheckCircle2, XCircle, Sparkles, Award,
  Zap, Gauge, ChevronRight, Shuffle, GraduationCap, Info, Medal
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'motion/react';
import HanziWriter from 'hanzi-writer';
import { hanziCharDataLoader } from '../lib/hanziDataLoader';

interface StrokeOrderChallengeProps {
  characters: CharacterItem[];
  studentId: string;
  onClose: () => void;
}

type ChallengeMode = 'practice' | 'challenge';
type ScreenState = 'setup' | 'playing' | 'summary';

interface CharProgress {
  attempts: number;
  bestScore: number;
  mastered: boolean;
}

interface StrokeChallengeProgress {
  perCharacter: Record<string, CharProgress>;
  dailyCounts: Record<string, number>;
  totalAttempts: number;
  totalPassed: number;
  bestStreak: number;
}

interface CharResult {
  character: CharacterItem;
  score: number;
  passed: boolean;
  mistakes: number;
}

const SUCCESS_MESSAGES = [
  'Excellent! 🎉',
  'Perfect Stroke Order! ✨',
  'Great job! Keep practicing! 💪',
  'Beautiful writing! 🌸',
  'You nailed it! 🔥',
];

const GENTLE_ERROR_MESSAGES = [
  'Almost! Try this stroke again.',
  'Check the stroke direction.',
  'Take your time — position matters more than speed.',
  'Close! Watch your starting point.',
];

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function progressStorageKey(studentId: string): string {
  return `bmf_stroke_challenge_progress_${studentId}`;
}

function loadProgress(studentId: string): StrokeChallengeProgress {
  try {
    const raw = localStorage.getItem(progressStorageKey(studentId));
    if (raw) return JSON.parse(raw);
  } catch {
    // fall through to fresh state
  }
  return { perCharacter: {}, dailyCounts: {}, totalAttempts: 0, totalPassed: 0, bestStreak: 0 };
}

function saveProgress(studentId: string, progress: StrokeChallengeProgress) {
  try {
    localStorage.setItem(progressStorageKey(studentId), JSON.stringify(progress));
  } catch {
    // Storage unavailable (private browsing, quota) — non-fatal for this feature.
  }
}

export default function StrokeOrderChallenge({ characters, studentId, onClose }: StrokeOrderChallengeProps) {
  const [screen, setScreen] = useState<ScreenState>('setup');
  const [mode, setMode] = useState<ChallengeMode>('practice');
  const [sessionSize, setSessionSize] = useState<5 | 10 | 999>(5);
  const [soundOn, setSoundOn] = useState(true);

  const [deck, setDeck] = useState<CharacterItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [results, setResults] = useState<CharResult[]>([]);

  const [strokeNum, setStrokeNum] = useState(0);
  const [totalStrokes, setTotalStrokes] = useState(0);
  const [mistakesThisChar, setMistakesThisChar] = useState(0);
  const [feedback, setFeedback] = useState<{ text: string; type: 'info' | 'error' | 'success' } | null>(null);
  const [charComplete, setCharComplete] = useState(false);
  const [charScore, setCharScore] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [xpEarnedSession, setXpEarnedSession] = useState(0);

  const [progress, setProgress] = useState<StrokeChallengeProgress>(() => loadProgress(studentId));
  const [statsLoading, setStatsLoading] = useState(true);
  const [serverStats, setServerStats] = useState<{ masteredCharacters: number } | null>(null);

  const writerRef = useRef<any>(null);
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerIdRef = useRef('stroke-challenge-canvas');

  // Pull server-side dashboard stats (mastered count etc.) once on mount.
  useEffect(() => {
    let cancelled = false;
    api.getStats()
      .then(res => {
        if (!cancelled) setServerStats({ masteredCharacters: res.masteredCharacters });
      })
      .catch(() => {
        if (!cancelled) setServerStats(null);
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const playTone = useCallback((type: 'success' | 'error' | 'complete') => {
    if (!soundOn) return;
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(type === 'error' ? [80, 40, 80] : 50);
      } catch {
        // ignore devices without vibration support
      }
    }
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const notes = type === 'complete'
        ? [523.25, 659.25, 783.99, 1046.5]
        : type === 'success'
        ? [523.25, 659.25, 783.99]
        : [200, 150];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = type === 'error' ? 'sawtooth' : 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.09);
        gain.gain.setValueAtTime(0.07, ctx.currentTime + i * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.09 + 0.3);
        osc.start(ctx.currentTime + i * 0.09);
        osc.stop(ctx.currentTime + i * 0.09 + 0.3);
      });
    } catch {
      // Web Audio unsupported — silently skip.
    }
  }, [soundOn]);

  const burstConfetti = useCallback((big: boolean) => {
    const canvasEl = confettiCanvasRef.current;
    if (!canvasEl) return;
    const myConfetti = confetti.create(canvasEl, { resize: true, useWorker: false });
    if (big) {
      myConfetti({ particleCount: 180, spread: 90, origin: { y: 0.6 }, colors: ['#10b981', '#14b8a6', '#0ea5e9', '#f59e0b'] });
      try {
        const flower = confetti.shapeFromText({ text: '🌸', scalar: 2.2 });
        myConfetti({ particleCount: 30, spread: 100, startVelocity: 35, shapes: [flower], scalar: 2.2, origin: { y: 0.5 } });
      } catch {
        // emoji shapes unsupported — the burst above still plays
      }
    } else {
      myConfetti({ particleCount: 70, spread: 70, origin: { y: 0.45 }, colors: ['#10b981', '#14b8a6', '#f59e0b', '#a855f7'] });
    }
  }, []);

  // Build a fresh session deck from the user's own lexicon.
  const startSession = () => {
    if (characters.length === 0) return;
    const shuffled = [...characters].sort(() => Math.random() - 0.5);
    const size = sessionSize === 999 ? shuffled.length : Math.min(sessionSize, shuffled.length);
    setDeck(shuffled.slice(0, size));
    setCurrentIdx(0);
    setResults([]);
    setCurrentStreak(0);
    setXpEarnedSession(0);
    setScreen('playing');
  };

  const logToServer = async (charId: string, score: number) => {
    try {
      const res = await api.logPractice(charId, 'stroke', score, 5);
      setXpEarnedSession(prev => prev + res.awardedXp);
    } catch {
      // Non-fatal for the practice experience itself; local progress still updates.
    }
  };

  const recordLocalProgress = (char: CharacterItem, score: number) => {
    setProgress(prev => {
      const existing = prev.perCharacter[char.character] || { attempts: 0, bestScore: 0, mastered: false };
      const updatedChar: CharProgress = {
        attempts: existing.attempts + 1,
        bestScore: Math.max(existing.bestScore, score),
        mastered: existing.mastered || score >= 90,
      };
      const key = todayKey();
      const next: StrokeChallengeProgress = {
        perCharacter: { ...prev.perCharacter, [char.character]: updatedChar },
        dailyCounts: { ...prev.dailyCounts, [key]: (prev.dailyCounts[key] || 0) + 1 },
        totalAttempts: prev.totalAttempts + 1,
        totalPassed: prev.totalPassed + (score >= 70 ? 1 : 0),
        bestStreak: prev.bestStreak,
      };
      saveProgress(studentId, next);
      return next;
    });
  };

  // Mount HanziWriter fresh for the active character.
  useEffect(() => {
    if (screen !== 'playing' || deck.length === 0 || currentIdx >= deck.length) return;
    const currentChar = deck[currentIdx];

    setStrokeNum(0);
    setTotalStrokes(currentChar.strokeCount || 0);
    setMistakesThisChar(0);
    setFeedback(null);
    setCharComplete(false);
    setCharScore(0);
    setShowSuccessOverlay(false);

    const timer = setTimeout(() => {
      const container = document.getElementById(containerIdRef.current);
      if (!container) return;
      container.innerHTML = '';

      try {
        const writer = HanziWriter.create(containerIdRef.current, currentChar.character, {
          width: 280,
          height: 280,
          padding: 18,
          strokeAnimationSpeed: 1.2,
          delayBetweenStrokes: 150,
          strokeColor: '#10b981',
          outlineColor: '#f8fafc',
          drawingColor: '#0ea5e9',
          drawingThickness: 10,
          highlightColor: '#f59e0b',
          showOutline: mode === 'practice',
          showCharacter: false,
          charDataLoader: hanziCharDataLoader,
        });
        writerRef.current = writer;

        let localMistakes = 0;

        writer.quiz({
          showHintAfterMisses: mode === 'practice' ? 1 : false,
          highlightOnComplete: true,
          leniency: mode === 'practice' ? 1.6 : 1,
          onStrokeCorrect: (strokeData: any) => {
            const { strokeNum: sn, mistakesOnStroke, isBackwards } = strokeData || {};
            setStrokeNum((sn ?? 0) + 1);
            if (isBackwards) {
              setFeedback({ text: 'Correct shape — but that stroke was drawn backwards. Watch the direction!', type: 'error' });
            } else if (mistakesOnStroke > 0) {
              setFeedback({ text: 'Good — a little off, but accepted. Keep going!', type: 'info' });
            } else {
              setFeedback({ text: 'Nice stroke!', type: 'success' });
            }
          },
          onStrokeIncorrect: () => {
            localMistakes += 1;
            setMistakesThisChar(localMistakes);
            const msg = GENTLE_ERROR_MESSAGES[Math.floor(Math.random() * GENTLE_ERROR_MESSAGES.length)];
            setFeedback({ text: msg, type: 'error' });
          },
          onComplete: (summaryData: any) => {
            const totalMistakes = summaryData?.totalMistakes ?? localMistakes;
            const rawScore = Math.max(10, Math.round(100 - totalMistakes * 8));
            const passed = rawScore >= 70;

            setCharScore(rawScore);
            setCharComplete(true);
            setFeedback({
              text: passed
                ? SUCCESS_MESSAGES[Math.floor(Math.random() * SUCCESS_MESSAGES.length)]
                : "Character finished — let's review the tricky strokes next round.",
              type: passed ? 'success' : 'info',
            });

            setResults(prev => [...prev, { character: currentChar, score: rawScore, passed, mistakes: totalMistakes }]);
            setCurrentStreak(prev => (passed ? prev + 1 : 0));
            recordLocalProgress(currentChar, rawScore);
            logToServer(currentChar.id, rawScore);

            if (passed) {
              setShowSuccessOverlay(true);
              playTone('success');
              burstConfetti(false);
            } else {
              playTone('error');
            }
          },
        });
      } catch (err) {
        console.error('Error starting Stroke Order Challenge writer:', err);
      }
    }, 120);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, deck, screen, mode]);

  const handleRetryChar = () => {
    // Re-mount the writer for the same character by nudging currentIdx via a fake state churn.
    const container = document.getElementById(containerIdRef.current);
    if (container) container.innerHTML = '';
    setStrokeNum(0);
    setMistakesThisChar(0);
    setCharComplete(false);
    setCharScore(0);
    setFeedback(null);
    setShowSuccessOverlay(false);

    const currentChar = deck[currentIdx];
    if (!currentChar) return;
    try {
      const writer = HanziWriter.create(containerIdRef.current, currentChar.character, {
        width: 280,
        height: 280,
        padding: 18,
        strokeAnimationSpeed: 1.2,
        delayBetweenStrokes: 150,
        strokeColor: '#10b981',
        outlineColor: '#f8fafc',
        drawingColor: '#0ea5e9',
        drawingThickness: 10,
        highlightColor: '#f59e0b',
        showOutline: mode === 'practice',
        showCharacter: false,
        charDataLoader: hanziCharDataLoader,
      });
      writerRef.current = writer;
      let localMistakes = 0;
      writer.quiz({
        showHintAfterMisses: mode === 'practice' ? 1 : false,
        highlightOnComplete: true,
        leniency: mode === 'practice' ? 1.6 : 1,
        onStrokeCorrect: (strokeData: any) => {
          const { strokeNum: sn, isBackwards } = strokeData || {};
          setStrokeNum((sn ?? 0) + 1);
          setFeedback(isBackwards
            ? { text: 'Correct shape — check the stroke direction next time!', type: 'error' }
            : { text: 'Nice stroke!', type: 'success' });
        },
        onStrokeIncorrect: () => {
          localMistakes += 1;
          setMistakesThisChar(localMistakes);
          setFeedback({ text: GENTLE_ERROR_MESSAGES[Math.floor(Math.random() * GENTLE_ERROR_MESSAGES.length)], type: 'error' });
        },
        onComplete: (summaryData: any) => {
          const totalMistakes = summaryData?.totalMistakes ?? localMistakes;
          const rawScore = Math.max(10, Math.round(100 - totalMistakes * 8));
          const passed = rawScore >= 70;
          setCharScore(rawScore);
          setCharComplete(true);
          setFeedback({
            text: passed ? SUCCESS_MESSAGES[Math.floor(Math.random() * SUCCESS_MESSAGES.length)] : "Better! Try once more if you'd like.",
            type: passed ? 'success' : 'info',
          });
          setResults(prev => [...prev, { character: currentChar, score: rawScore, passed, mistakes: totalMistakes }]);
          setCurrentStreak(prev => (passed ? prev + 1 : 0));
          recordLocalProgress(currentChar, rawScore);
          logToServer(currentChar.id, rawScore);
          if (passed) {
            setShowSuccessOverlay(true);
            playTone('success');
            burstConfetti(false);
          } else {
            playTone('error');
          }
        },
      });
    } catch (err) {
      console.error('Error restarting stroke writer:', err);
    }
  };

  const handleShowAnimation = () => {
    if (mode !== 'practice') return;
    try {
      writerRef.current?.animateCharacter();
    } catch {
      // ignore if writer isn't ready yet
    }
  };

  const handleNextChar = () => {
    if (currentIdx + 1 < deck.length) {
      setCurrentIdx(prev => prev + 1);
    } else {
      playTone('complete');
      burstConfetti(true);
      setScreen('summary');
    }
  };

  // ---------- Derived progress-dashboard numbers ----------
  const masteredLocal = Object.values(progress.perCharacter).filter(c => c.mastered).length;
  const masteredCount = serverStats?.masteredCharacters ?? masteredLocal;
  const todayCount = progress.dailyCounts[todayKey()] || 0;
  const accuracyPct = progress.totalAttempts > 0 ? Math.round((progress.totalPassed / progress.totalAttempts) * 100) : 0;
  const level = 1 + Math.floor(masteredLocal / 5);

  // ================= SETUP SCREEN =================
  const isSingleCharacter = characters.length === 1;

  if (screen === 'setup') {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 hover:text-white uppercase tracking-widest cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> {isSingleCharacter ? 'Back to Character' : 'Back to Dashboard'}
          </button>
          <button
            onClick={() => setSoundOn(s => !s)}
            className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 hover:text-white uppercase tracking-widest cursor-pointer"
            title={soundOn ? 'Mute sound effects' : 'Unmute sound effects'}
          >
            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-[32px] p-6 md:p-8 shadow-2xl relative overflow-hidden text-left">
          <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-sky-500/50 to-transparent"></div>
          <div className="absolute -right-6 -top-6 text-8xl opacity-5 pointer-events-none">笔</div>

          <div className="flex items-center gap-3 mb-1.5">
            {isSingleCharacter ? (
              <div className="w-11 h-11 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0 text-xl font-black text-sky-300">
                {characters[0].character}
              </div>
            ) : (
              <div className="w-11 h-11 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
                <PenTool className="w-5 h-5 text-sky-400" />
              </div>
            )}
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">
                {isSingleCharacter ? `Stroke Test: ${characters[0].character}` : 'Stroke Order Challenge'}
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                {isSingleCharacter
                  ? `笔顺测试 — Write "${characters[0].character}" (${characters[0].pinyin}) from memory, in the correct stroke order.`
                  : '笔顺挑战 — Prove you know the real stroke order, from memory.'}
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed mt-4 mb-6">
            {isSingleCharacter
              ? 'This is a real handwriting exam for this character only, not just an animation viewer. Draw it on the canvas — we\'ll check your stroke count, order, direction, and shape.'
              : "This is a real handwriting exam, not just an animation viewer. Draw each character on the canvas — we'll check your stroke count, order, direction, and shape as you go."}
          </p>

          {/* Mini progress dashboard */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-3.5 text-center">
              <Flame className="w-4 h-4 text-amber-400 mx-auto mb-1" />
              <span className="block text-lg font-black text-white">{todayCount}</span>
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Today</span>
            </div>
            <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-3.5 text-center">
              <Target className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
              <span className="block text-lg font-black text-white">{progress.totalAttempts > 0 ? `${accuracyPct}%` : '—'}</span>
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Accuracy</span>
            </div>
            <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-3.5 text-center">
              <Trophy className="w-4 h-4 text-teal-400 mx-auto mb-1" />
              <span className="block text-lg font-black text-white">{statsLoading ? '…' : masteredCount}</span>
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Mastered</span>
            </div>
            <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-3.5 text-center">
              <Medal className="w-4 h-4 text-indigo-400 mx-auto mb-1" />
              <span className="block text-lg font-black text-white">Lv {level}</span>
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Level</span>
            </div>
          </div>

          {/* Mode selector */}
          <div className="mb-6">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2.5">Choose your mode</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => setMode('practice')}
                className={`text-left p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                  mode === 'practice'
                    ? 'border-emerald-500/80 bg-emerald-500/10'
                    : 'border-white/5 bg-white/[0.02] hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Eye className={`w-4 h-4 ${mode === 'practice' ? 'text-emerald-400' : 'text-slate-500'}`} />
                  <span className={`text-xs font-black ${mode === 'practice' ? 'text-emerald-300' : 'text-slate-300'}`}>Practice Mode</span>
                </div>
                <p className="text-[10px] text-slate-400 font-medium leading-relaxed">Guide outline visible, quick hints, and unlimited retries. Best for learning.</p>
              </button>

              <button
                onClick={() => setMode('challenge')}
                className={`text-left p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                  mode === 'challenge'
                    ? 'border-amber-500/80 bg-amber-500/10'
                    : 'border-white/5 bg-white/[0.02] hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <EyeOff className={`w-4 h-4 ${mode === 'challenge' ? 'text-amber-400' : 'text-slate-500'}`} />
                  <span className={`text-xs font-black ${mode === 'challenge' ? 'text-amber-300' : 'text-slate-300'}`}>Challenge Mode</span>
                </div>
                <p className="text-[10px] text-slate-400 font-medium leading-relaxed">No hints, no outline. Write entirely from memory and earn a final score.</p>
              </button>
            </div>
          </div>

          {/* Session length — irrelevant when testing a single character, so it's hidden in that case */}
          {!isSingleCharacter && (
            <div className="mb-7">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2.5">Session length</span>
              <div className="flex gap-2">
                {[5, 10, 999].map(size => (
                  <button
                    key={size}
                    onClick={() => setSessionSize(size as 5 | 10 | 999)}
                    className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all cursor-pointer ${
                      sessionSize === size
                        ? 'bg-sky-500/10 border-sky-500/40 text-sky-300'
                        : 'bg-white/[0.02] border-white/5 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    {size === 999 ? 'Whole deck' : `${size} chars`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {characters.length === 0 ? (
            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 p-4 rounded-2xl text-xs font-semibold text-center">
              Add a few characters to your Training Lexicon first — the Stroke Order Challenge draws from your own deck.
            </div>
          ) : (
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={startSession}
              className="w-full bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 text-slate-950 font-black py-4 rounded-2xl text-xs uppercase tracking-widest shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              {isSingleCharacter ? (
                <>
                  <PenTool className="w-4 h-4" />
                  <span>Start {mode === 'practice' ? 'Practice' : 'Test'}</span>
                </>
              ) : (
                <>
                  <Shuffle className="w-4 h-4" />
                  <span>Start {mode === 'practice' ? 'Practice' : 'Challenge'}</span>
                </>
              )}
            </motion.button>
          )}
        </div>
      </div>
    );
  }

  // ================= SUMMARY SCREEN =================
  if (screen === 'summary') {
    const total = results.length;
    const passedCount = results.filter(r => r.passed).length;
    const avgScore = total > 0 ? Math.round(results.reduce((s, r) => s + r.score, 0) / total) : 0;
    const masteredThisSession = results.filter(r => r.score >= 90).map(r => r.character.character);

    let tierEmoji = '💪';
    let tierText = 'Keep Practicing!';
    let tierColor = 'text-slate-400 bg-slate-950/40 border-white/5';
    if (avgScore >= 90) { tierEmoji = '⭐'; tierText = 'Outstanding!'; tierColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20'; }
    else if (avgScore >= 75) { tierEmoji = '🎉'; tierText = 'Excellent Work!'; tierColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'; }
    else if (avgScore >= 60) { tierEmoji = '👏'; tierText = 'Great Job!'; tierColor = 'text-sky-400 bg-sky-500/10 border-sky-500/20'; }

    return (
      <>
        <canvas ref={confettiCanvasRef} className="fixed inset-0 w-screen h-screen pointer-events-none" style={{ zIndex: 99999 }} />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="max-w-xl mx-auto bg-slate-900/60 border border-white/10 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl overflow-hidden p-6 md:p-8 space-y-6 relative z-10"
        >
          <div className="text-center space-y-2">
            <span className="text-5xl block">{tierEmoji}</span>
            <h2 className="text-xl font-black text-white">{tierText}</h2>
            <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${tierColor}`}>
              Session Complete
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-4 text-center">
              <span className="block text-2xl font-black text-white">{total}</span>
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Practiced</span>
            </div>
            <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-4 text-center">
              <span className="block text-2xl font-black text-emerald-400">{avgScore}</span>
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Avg Score</span>
            </div>
            <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-4 text-center">
              <span className="block text-2xl font-black text-amber-400">+{xpEarnedSession}</span>
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">XP Earned</span>
            </div>
          </div>

          <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-4 space-y-2">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Character Breakdown</span>
            <div className="flex flex-wrap gap-2">
              {results.map((r, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black border ${
                    r.score >= 90 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' :
                    r.passed ? 'bg-sky-500/10 border-sky-500/20 text-sky-300' :
                    'bg-rose-500/10 border-rose-500/20 text-rose-300'
                  }`}
                  title={`${r.character.character}: ${r.score}/100`}
                >
                  <span className="text-base">{r.character.character}</span>
                  <span>{r.score}</span>
                </div>
              ))}
            </div>
            {masteredThisSession.length > 0 && (
              <p className="text-[10px] text-emerald-400 font-bold pt-1">
                🏆 Mastered this session: {masteredThisSession.join(' ')}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => setScreen('setup')}
              className="flex-1 bg-slate-800 hover:bg-slate-700 border border-white/5 text-white font-black py-4 rounded-2xl text-[10px] uppercase tracking-widest transition-all shadow-sm cursor-pointer flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Practice Again
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={onClose}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black py-4 rounded-2xl text-[10px] uppercase tracking-widest transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
            >
              <span>{isSingleCharacter ? 'Back to Character' : 'Back to Dashboard'}</span>
              <ChevronRight className="w-4 h-4" />
            </motion.button>
          </div>
        </motion.div>
      </>
    );
  }

  // ================= PLAYING SCREEN =================
  const currentChar = deck[currentIdx];
  if (!currentChar) return null;
  const progressPercent = Math.round(((currentIdx + 1) / deck.length) * 100);

  return (
    <div className="max-w-xl mx-auto bg-slate-900/60 border border-white/10 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl overflow-hidden flex flex-col relative">
      <canvas ref={confettiCanvasRef} className="fixed inset-0 w-screen h-screen pointer-events-none" style={{ zIndex: 99999 }} />

      {/* Header */}
      <div className="px-5 py-4 bg-slate-950/40 border-b border-white/5 flex items-center justify-between gap-4 shrink-0">
        <button onClick={onClose} className="text-[10px] font-black text-rose-400 hover:text-rose-300 uppercase tracking-widest cursor-pointer">
          Quit
        </button>

        <div className="flex-1 max-w-xs bg-slate-950/80 h-2.5 rounded-full overflow-hidden relative shadow-inner">
          <div className="bg-gradient-to-r from-sky-500 to-emerald-500 h-full transition-all duration-500 rounded-full" style={{ width: `${progressPercent}%` }}></div>
        </div>

        <div className="text-right flex flex-col">
          <span className="text-xs font-black text-white">{currentIdx + 1} / {deck.length}</span>
          <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider">
            {mode === 'practice' ? 'Practice Mode' : 'Challenge Mode'}
          </span>
        </div>
      </div>

      <div className="p-6 md:p-8 flex-1 flex flex-col items-center justify-center space-y-5">
        {/* Meta row */}
        <div className="w-full flex justify-between items-center text-[9px] text-slate-500 font-black uppercase tracking-widest px-2">
          <span className="flex items-center gap-1">
            <Award className="w-3.5 h-3.5 text-emerald-500" /> {currentChar.pinyin} · {currentChar.englishMeaning}
          </span>
          {currentStreak > 1 && (
            <span className="flex items-center gap-1 text-amber-400">
              <Flame className="w-3.5 h-3.5" /> {currentStreak} streak
            </span>
          )}
        </div>

        <h3 className="font-extrabold text-base text-white tracking-tight text-center">
          {mode === 'practice'
            ? 'Draw the character. Use the guide if you need it.'
            : 'Draw it entirely from memory — no hints this time!'}
        </h3>

        {/* Canvas */}
        <div className="relative">
          <div className={`bg-slate-950/40 p-3.5 rounded-3xl border shadow-inner flex items-center justify-center w-[310px] h-[310px] transition-all duration-500 ${
            showSuccessOverlay ? 'border-emerald-400/60 shadow-[0_0_40px_rgba(16,185,129,0.35)]' : 'border-white/5'
          }`}>
            <div id={containerIdRef.current} className="w-[280px] h-[280px] flex items-center justify-center"></div>
          </div>

          <AnimatePresence>
            {showSuccessOverlay && (
              <motion.div
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                <span className="text-6xl drop-shadow-[0_0_20px_rgba(16,185,129,0.8)]">✨</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Practice mode helper row */}
        {mode === 'practice' && !charComplete && (
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
            <span className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/5 text-slate-300">
              Stroke {strokeNum + 1} of {totalStrokes || '…'}
            </span>
            <button
              onClick={handleShowAnimation}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 text-sky-300 transition-all cursor-pointer"
              title="Show the correct stroke order animation"
            >
              <Lightbulb className="w-3.5 h-3.5" /> Hint
            </button>
          </div>
        )}

        {mode === 'challenge' && !charComplete && (
          <span className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
            <GraduationCap className="w-3.5 h-3.5" /> From memory — no hints
          </span>
        )}

        {/* Feedback banner */}
        <AnimatePresence mode="wait">
          {feedback && (
            <motion.div
              key={feedback.text}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className={`w-full max-w-sm px-4 py-3 rounded-2xl text-xs font-bold text-center flex items-center justify-center gap-2 border ${
                feedback.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' :
                feedback.type === 'error' ? 'bg-rose-500/10 border-rose-500/20 text-rose-300' :
                'bg-sky-500/10 border-sky-500/20 text-sky-300'
              }`}
            >
              {feedback.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
              {feedback.type === 'error' && <XCircle className="w-4 h-4 shrink-0" />}
              {feedback.type === 'info' && <Info className="w-4 h-4 shrink-0" />}
              <span>{feedback.text}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom action tray */}
      {charComplete && (
        <div className={`p-5 md:p-6 border-t border-white/5 flex flex-col items-stretch gap-4 shrink-0 ${
          charScore >= 70 ? 'bg-emerald-500/5' : 'bg-amber-500/5'
        }`}>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className={`w-11 h-11 rounded-full flex items-center justify-center text-slate-950 font-bold text-lg shrink-0 shadow-md ${
                charScore >= 70 ? 'bg-emerald-500' : 'bg-amber-500'
              }`}>
                {charScore >= 70 ? <Sparkles className="w-5 h-5" /> : <RotateCcw className="w-5 h-5" />}
              </div>
              <div className="text-left">
                <span className="text-[9px] font-black uppercase tracking-wider block text-slate-400">Stroke Score</span>
                <h4 className="font-extrabold text-lg text-white leading-tight">{charScore} / 100</h4>
                {mistakesThisChar > 0 && (
                  <p className="text-[10px] text-slate-400 font-bold mt-0.5">{mistakesThisChar} mistake{mistakesThisChar > 1 ? 's' : ''} along the way</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleRetryChar}
                className="bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-300 font-black text-[10px] px-4 py-3.5 rounded-xl uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Retry
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleNextChar}
                className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-[10px] px-5 py-3.5 rounded-xl uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <span>{currentIdx + 1 < deck.length ? 'Next Character' : 'Finish Session'}</span>
                <ChevronRight className="w-4 h-4" />
              </motion.button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
