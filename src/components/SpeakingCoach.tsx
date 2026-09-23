import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Mic, Square, Upload, RotateCcw, Sparkles, Loader2, History, X,
  CheckCircle2, Lightbulb, Volume2, TrendingUp, Target, ChevronRight,
  AlertTriangle, Play, MicOff,
} from 'lucide-react';
import { api } from '../lib/api';
import { SpeakingAttempt, SpeakingChallenge, SpeakingDifficulty } from '../types';

const DIFFICULTY_OPTIONS: { key: SpeakingDifficulty; label: string }[] = [
  { key: 'beginner', label: 'Beginner' },
  { key: 'intermediate', label: 'Intermediate' },
  { key: 'advanced', label: 'Advanced' },
];

const SCORE_CATEGORIES: { key: 'pronunciation' | 'grammar' | 'fluency' | 'vocabulary'; label: string }[] = [
  { key: 'pronunciation', label: 'Pronunciation' },
  { key: 'grammar', label: 'Grammar' },
  { key: 'fluency', label: 'Fluency' },
  { key: 'vocabulary', label: 'Vocabulary' },
];

type Phase = 'intro' | 'challenge' | 'recording' | 'reviewing' | 'analyzing' | 'result';

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function scoreColor(score: number) {
  if (score >= 85) return { text: 'text-emerald-400', ring: '#10b981', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' };
  if (score >= 70) return { text: 'text-cyan-400', ring: '#22d3ee', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' };
  if (score >= 50) return { text: 'text-amber-400', ring: '#fbbf24', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };
  return { text: 'text-rose-400', ring: '#fb7185', bg: 'bg-rose-500/10', border: 'border-rose-500/20' };
}

function blobToBase64(blob: Blob): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const [prefix, base64] = result.split(',');
      const mimeMatch = prefix.match(/data:(.*);base64/);
      resolve({ base64, mimeType: mimeMatch ? mimeMatch[1] : blob.type || 'audio/webm' });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function SpeakingCoach() {
  const [difficulty, setDifficulty] = useState<SpeakingDifficulty>('beginner');
  const [challenge, setChallenge] = useState<SpeakingChallenge | null>(null);
  const [loadingChallenge, setLoadingChallenge] = useState(false);
  const [phase, setPhase] = useState<Phase>('intro');

  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [waveform, setWaveform] = useState<number[]>(Array(28).fill(4));
  const [liveCaption, setLiveCaption] = useState('');
  const [captionsSupported, setCaptionsSupported] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SpeakingAttempt | null>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<SpeakingAttempt[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  // Daily speaking-exam quota (server-enforced; this is just for display and
  // to avoid letting a student record a full answer only to be rejected).
  const [usage, setUsage] = useState<{ used: number; limit: number; remaining: number; resetsAt: string } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const captionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const captionInFlightRef = useRef(false);
  const captionMimeTypeRef = useRef<string>('audio/webm');

  useEffect(() => {
    return () => {
      cleanupRecordingResources();
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanupRecordingResources = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    if (captionIntervalRef.current) clearInterval(captionIntervalRef.current);
    captionIntervalRef.current = null;
    captionInFlightRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  };

  const loadChallenge = async (diff: SpeakingDifficulty) => {
    setLoadingChallenge(true);
    setError(null);
    try {
      const c = await api.getSpeakingChallenge(diff);
      setChallenge(c);
      setResult(null);
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      setRecordedBlob(null);
      setRecordedUrl(null);
      setPhase('challenge');
    } catch (err: any) {
      setError(err.message || 'Could not load a speaking challenge.');
    } finally {
      setLoadingChallenge(false);
    }
  };

  const startRecording = async () => {
    setError(null);
    setLiveCaption('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const bars = 28;
      const tick = () => {
        analyser.getByteFrequencyData(dataArray);
        const step = Math.floor(dataArray.length / bars) || 1;
        const next: number[] = [];
        for (let i = 0; i < bars; i++) {
          const v = dataArray[i * step] || 0;
          next.push(Math.max(4, Math.round((v / 255) * 44)));
        }
        setWaveform(next);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      captionMimeTypeRef.current = recorder.mimeType || mimeType || 'audio/webm';
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setRecordedBlob(blob);
        setRecordedUrl(URL.createObjectURL(blob));
        setPhase('reviewing');
      };
      mediaRecorderRef.current = recorder;
      // A timeslice makes the recorder hand us audio in periodic pieces via
      // ondataavailable (above) instead of only once at the very end — that's
      // what lets the live-caption poller below have something to send every
      // few seconds while the user is still talking.
      recorder.start(1000);

      // Live captions: shows what the user is saying in real time, before
      // they submit. This sends the recording captured so far to our own
      // backend every few seconds, which forwards it to the same AI engine
      // (Qwen/DashScope) used for the final analysis — see the comment on
      // transcribeChunk() in speaking.service.ts for why this replaced the
      // browser's built-in Web Speech API for this feature. A failed or slow
      // caption request is never allowed to interrupt the actual recording.
      setCaptionsSupported(true);
      const CAPTION_INTERVAL_MS = 3500;
      const MIN_BYTES_TO_TRANSCRIBE = 4000;
      const requestLiveCaption = async () => {
        if (captionInFlightRef.current) return;
        const snapshot = chunksRef.current.slice();
        const totalBytes = snapshot.reduce((sum, c) => sum + c.size, 0);
        if (totalBytes < MIN_BYTES_TO_TRANSCRIBE) return;

        captionInFlightRef.current = true;
        try {
          const blob = new Blob(snapshot, { type: captionMimeTypeRef.current });
          const { base64, mimeType: resolvedMimeType } = await blobToBase64(blob);
          const { transcript } = await api.transcribeSpeakingChunk({
            audioBase64: base64,
            mimeType: resolvedMimeType,
          });
          // The recording may have already been stopped/discarded while this
          // request was in flight — don't resurrect a caption after the fact.
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            if (transcript) setLiveCaption(transcript);
          }
        } catch {
          // Live captions are a nice-to-have; never let a captioning error
          // interrupt the actual recording. We simply try again on the next tick.
        } finally {
          captionInFlightRef.current = false;
        }
      };
      captionIntervalRef.current = setInterval(requestLiveCaption, CAPTION_INTERVAL_MS);

      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((s) => {
          if (s >= 119) {
            stopRecording();
            return s;
          }
          return s + 1;
        });
      }, 1000);

      setPhase('recording');
    } catch (err: any) {
      setError('Microphone access is required to record. Please allow microphone permissions and try again.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    cleanupRecordingResources();
  };

  const discardRecording = () => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setLiveCaption('');
    setPhase('challenge');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      setError('Please upload an audio file.');
      return;
    }
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(file);
    setRecordedUrl(URL.createObjectURL(file));
    setRecordingSeconds(0);
    setLiveCaption('');
    setPhase('reviewing');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submitForAnalysis = async () => {
    if (!recordedBlob || !challenge) return;
    if (usage && usage.remaining <= 0) {
      setError(`You've used all ${usage.limit} speaking practice attempts for today. Come back after midnight (UTC) for more.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    setPhase('analyzing');
    try {
      const { base64, mimeType } = await blobToBase64(recordedBlob);
      const attempt = await api.analyzeSpeaking({
        audioBase64: base64,
        mimeType,
        challengePrompt: challenge.prompt,
        difficulty,
        durationSeconds: recordingSeconds,
      });
      setResult(attempt);
      setHistory((prev) => [attempt, ...prev]);
      setPhase('result');
      fetchUsage();
    } catch (err: any) {
      setError(err.message || 'Something went wrong while analyzing your recording.');
      setPhase('reviewing');
      fetchUsage();
    } finally {
      setSubmitting(false);
    }
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const h = await api.getSpeakingHistory(50);
      setHistory(h);
    } catch (err: any) {
      setError(err.message || 'Could not load your speaking history.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchUsage = async () => {
    try {
      const u = await api.getSpeakingUsage();
      setUsage(u);
    } catch {
      // Non-critical for rendering the rest of the page — the server still
      // enforces the real limit on submit either way, so a failed fetch here
      // just means the badge doesn't show rather than anything breaking.
    }
  };

  useEffect(() => {
    fetchHistory();
    fetchUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Progress trend (oldest -> newest) of scored attempts only
  const trend = useMemo(() => {
    return [...history]
      .filter((h) => h.scores)
      .reverse()
      .slice(-12)
      .map((h) => ({ id: h.id, date: h.createdAt.split('T')[0], overall: h.scores!.overall }));
  }, [history]);

  // Smart recommendation: weakest average category across recent scored attempts
  const recommendation = useMemo(() => {
    const scored = history.filter((h) => h.scores).slice(0, 8);
    if (scored.length === 0) return null;

    const totals = { pronunciation: 0, grammar: 0, fluency: 0, vocabulary: 0 };
    scored.forEach((h) => {
      totals.pronunciation += h.scores!.pronunciation;
      totals.grammar += h.scores!.grammar;
      totals.fluency += h.scores!.fluency;
      totals.vocabulary += h.scores!.vocabulary;
    });
    const averages = Object.entries(totals).map(([key, sum]) => ({ key, avg: sum / scored.length }));
    averages.sort((a, b) => a.avg - b.avg);
    const weakest = averages[0];

    const words = new Map<string, number>();
    scored.forEach((h) => h.mispronuncedWords.forEach((w) => words.set(w, (words.get(w) || 0) + 1)));
    const topWords = [...words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w);

    return { weakestCategory: weakest.key, weakestAvg: Math.round(weakest.avg), topWords };
  }, [history]);

  const resetToIntro = () => {
    setPhase('intro');
    setChallenge(null);
    setResult(null);
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setLiveCaption('');
  };

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-white flex items-center gap-2">
            <Mic className="w-5 h-5 text-emerald-400" />
            <span>AI Speaking Coach</span>
          </h3>
          <p className="text-xs text-slate-400 font-medium leading-relaxed">
            Practice speaking Mandarin, get AI feedback, and improve your fluency and tones.
          </p>
        </div>
        <button
          onClick={() => setShowHistory((v) => !v)}
          className={`p-2.5 rounded-xl border flex items-center justify-center gap-1.5 transition-all text-[10px] font-black cursor-pointer uppercase tracking-wider shrink-0 ${
            showHistory
              ? 'bg-emerald-500 border-emerald-400 text-slate-950 shadow-md'
              : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/10'
          }`}
          title="Speaking history"
        >
          <History className="w-4 h-4" />
          <span className="hidden sm:inline">History</span>
        </button>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-3.5 rounded-xl text-xs font-semibold leading-relaxed flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {showHistory ? (
        <div className="space-y-5">
          {/* Progress trend */}
          <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-5 space-y-3">
            <h4 className="text-xs font-black text-white flex items-center gap-2 uppercase tracking-wider">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span>Progress Over Time</span>
            </h4>
            {trend.length === 0 ? (
              <p className="text-slate-500 text-xs font-medium italic py-4 text-center">
                Complete a few speaking practices to see your trend here.
              </p>
            ) : (
              <div className="flex items-end justify-between gap-1.5 h-28 pt-2">
                {trend.map((t) => {
                  const c = scoreColor(t.overall);
                  return (
                    <div key={t.id} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                      <span className={`text-[8px] font-black ${c.text}`}>{t.overall}</span>
                      <div
                        className={`w-full max-w-[18px] rounded-t-md ${c.bg} border ${c.border}`}
                        style={{ height: `${Math.max(6, t.overall)}%` }}
                      ></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Smart recommendations */}
          {recommendation && (
            <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-5 space-y-3">
              <h4 className="text-xs font-black text-white flex items-center gap-2 uppercase tracking-wider">
                <Target className="w-4 h-4 text-amber-400" />
                <span>Smart Training Recommendations</span>
              </h4>
              <p className="text-xs text-slate-300 font-medium leading-relaxed">
                Your weakest area lately is{' '}
                <span className="font-black text-amber-400 capitalize">{recommendation.weakestCategory}</span>{' '}
                (avg {recommendation.weakestAvg}/100). Try a few extra sessions focused on it this week.
              </p>
              {recommendation.topWords.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Words to practice</span>
                  <div className="flex flex-wrap gap-1.5">
                    {recommendation.topWords.map((w) => (
                      <span key={w} className="bg-amber-500/10 border border-amber-500/20 text-amber-300 px-2.5 py-1 rounded-lg text-xs font-bold">
                        {w}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* History list */}
          <div className="space-y-2.5">
            {loadingHistory ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-12 bg-slate-950/40 rounded-2xl border border-dashed border-white/10 p-5">
                <p className="text-slate-400 text-xs font-medium">No speaking attempts yet. Start your first practice!</p>
              </div>
            ) : (
              history.map((h) => {
                const isExpanded = expandedHistoryId === h.id;
                const c = h.scores ? scoreColor(h.scores.overall) : scoreColor(0);
                return (
                  <div key={h.id} className="bg-slate-950/40 border border-white/5 rounded-2xl overflow-hidden">
                    <button
                      onClick={() => setExpandedHistoryId(isExpanded ? null : h.id)}
                      className="w-full flex items-center justify-between gap-3 p-3.5 cursor-pointer text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{h.challengePrompt}</p>
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-wider mt-0.5">
                          {h.createdAt.split('T')[0]} · {h.difficulty}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {h.scores ? (
                          <span className={`text-xs font-black ${c.text} ${c.bg} border ${c.border} px-2.5 py-1 rounded-full`}>
                            {h.scores.overall}/100
                          </span>
                        ) : (
                          <span className="text-[10px] font-black text-slate-500 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full uppercase">
                            No score
                          </span>
                        )}
                        <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </div>
                    </button>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="p-3.5 pt-0 space-y-3 text-xs">
                            {h.noSpeechDetected ? (
                              <p className="text-rose-400 font-bold flex items-center gap-1.5">
                                <MicOff className="w-3.5 h-3.5" /> No speech detected in this recording.
                              </p>
                            ) : h.scores ? (
                              <>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  {SCORE_CATEGORIES.map((cat) => (
                                    <div key={cat.key} className="bg-slate-900/60 rounded-xl p-2 text-center border border-white/5">
                                      <span className="text-[8px] font-black text-slate-500 uppercase block">{cat.label}</span>
                                      <span className="font-black text-white">{h.scores![cat.key]}</span>
                                    </div>
                                  ))}
                                </div>
                                {h.transcript && (
                                  <div className="space-y-0.5">
                                    <p className="text-slate-200 font-bold leading-relaxed">{h.transcript}</p>
                                    {h.transcriptPinyin && (
                                      <p className="text-slate-500 leading-relaxed">{h.transcriptPinyin}</p>
                                    )}
                                  </div>
                                )}
                                {h.improvementTips.length > 0 && (
                                  <ul className="space-y-1">
                                    {h.improvementTips.map((tip, i) => (
                                      <li key={i} className="flex items-start gap-1.5 text-slate-300">
                                        <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                                        <span>{tip}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </>
                            ) : (
                              <p className="text-slate-500 italic">{h.analysisError || 'Analysis unavailable for this attempt.'}</p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {/* INTRO */}
          {phase === 'intro' && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="bg-slate-950/40 border border-white/5 rounded-2xl p-6 text-center space-y-5"
            >
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
                <Mic className="w-7 h-7 text-emerald-400" />
              </div>
              <div className="space-y-1.5">
                <h4 className="text-sm font-black text-white">Ready to practice speaking?</h4>
                <p className="text-xs text-slate-400 font-medium max-w-sm mx-auto leading-relaxed">
                  Pick a difficulty, get a speaking challenge, and record your response in Mandarin Chinese. Your AI coach will score your pronunciation & tones, grammar, fluency, and vocabulary.
                </p>
                {usage && (
                  <p className={`text-[10px] font-black uppercase tracking-wider ${usage.remaining > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {usage.remaining > 0
                      ? `${usage.remaining} of ${usage.limit} speaking attempts left today`
                      : `You've used all ${usage.limit} speaking attempts for today — more unlock after midnight (UTC)`}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-center gap-2">
                {DIFFICULTY_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setDifficulty(opt.key)}
                    className={`px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                      difficulty === opt.key
                        ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => loadChallenge(difficulty)}
                disabled={loadingChallenge || Boolean(usage && usage.remaining <= 0)}
                className="btn-3d-emerald text-slate-950 font-black py-3.5 px-6 rounded-2xl text-[10px] uppercase tracking-widest shadow-md transition-all inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingChallenge ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Loading...</span>
                  </>
                ) : usage && usage.remaining <= 0 ? (
                  <>
                    <Mic className="w-4 h-4" />
                    <span>Daily Limit Reached</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Start Speaking Practice</span>
                  </>
                )}
              </motion.button>
            </motion.div>
          )}

          {/* CHALLENGE */}
          {phase === 'challenge' && challenge && (
            <motion.div
              key="challenge"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="bg-slate-950/40 border border-white/5 rounded-2xl p-6 space-y-5 text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  {difficulty}
                </span>
                <button
                  onClick={() => loadChallenge(difficulty)}
                  disabled={loadingChallenge}
                  className="text-[10px] font-black text-slate-400 hover:text-emerald-400 uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw className={`w-3 h-3 ${loadingChallenge ? 'animate-spin' : ''}`} />
                  <span>New Challenge</span>
                </button>
              </div>

              <div className="text-center py-4 space-y-2">
                <p className="text-2xl font-black text-white leading-snug">{challenge.prompt}</p>
                <p className="text-xs text-slate-400 font-medium italic">{challenge.translation}</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={startRecording}
                  className="flex-1 btn-3d-emerald text-slate-950 font-black py-3.5 rounded-2xl text-[10px] uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Mic className="w-4 h-4" />
                  <span>Record Voice</span>
                </motion.button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black py-3.5 rounded-2xl text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-emerald-400" />
                  <span>Upload Voice</span>
                </button>
                <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
              </div>
            </motion.div>
          )}

          {/* RECORDING */}
          {phase === 'recording' && (
            <motion.div
              key="recording"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="bg-slate-950/40 border border-rose-500/20 rounded-2xl p-6 space-y-5 text-center"
            >
              <div className="flex items-center justify-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                <span className="text-[10px] font-black text-rose-300 uppercase tracking-widest">Recording</span>
                <span className="text-xs font-mono font-black text-white">{formatTime(recordingSeconds)}</span>
              </div>

              <div className="flex items-end justify-center gap-1 h-16">
                {waveform.map((h, i) => (
                  <div
                    key={i}
                    className="w-1.5 rounded-full bg-gradient-to-t from-emerald-500 to-cyan-400 transition-all duration-75"
                    style={{ height: `${h}px` }}
                  ></div>
                ))}
              </div>

              {/* Live captions — real-time speech-to-text preview while recording */}
              <div className="bg-slate-900/60 border border-white/5 rounded-xl px-4 py-3 min-h-[52px] flex items-center justify-center">
                {captionsSupported ? (
                  <p className="text-xs text-slate-200 font-semibold leading-relaxed">
                    {liveCaption ? (
                      <>
                        {liveCaption}
                        <span className="inline-block w-1.5 h-3.5 bg-emerald-400 ml-1 align-middle animate-pulse"></span>
                      </>
                    ) : (
                      <span className="text-slate-500 italic">Listening... start speaking</span>
                    )}
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-500 font-medium italic">
                    Live captions aren't supported in this browser — your recording is still being captured.
                  </p>
                )}
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={stopRecording}
                className="w-16 h-16 rounded-full bg-rose-500 hover:bg-rose-400 text-white flex items-center justify-center mx-auto shadow-lg shadow-rose-500/30 transition-all cursor-pointer"
                title="Stop recording"
              >
                <Square className="w-6 h-6 fill-current" />
              </motion.button>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Tap to stop</p>
            </motion.div>
          )}

          {/* REVIEWING */}
          {phase === 'reviewing' && recordedUrl && (
            <motion.div
              key="reviewing"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="bg-slate-950/40 border border-white/5 rounded-2xl p-6 space-y-5 text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mx-auto">
                <Play className="w-6 h-6 text-cyan-400" />
              </div>
              <h4 className="text-sm font-black text-white">Review your recording</h4>
              <audio controls src={recordedUrl} className="w-full max-w-sm mx-auto"></audio>

              {liveCaption && (
                <div className="bg-slate-900/60 border border-white/5 rounded-xl px-4 py-3 max-w-sm mx-auto text-left">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Live caption preview</span>
                  <p className="text-xs text-slate-300 font-medium leading-relaxed">{liveCaption}</p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <button
                  onClick={discardRecording}
                  className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black py-3.5 rounded-2xl text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Re-record</span>
                </button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={submitForAnalysis}
                  disabled={submitting}
                  className="flex-1 btn-3d-emerald text-slate-950 font-black py-3.5 rounded-2xl text-[10px] uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Submit for Analysis</span>
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ANALYZING */}
          {phase === 'analyzing' && (
            <motion.div
              key="analyzing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-slate-950/40 border border-white/5 rounded-2xl p-10 space-y-4 text-center"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
                className="w-14 h-14 rounded-full border-4 border-emerald-500/20 border-t-emerald-400 mx-auto"
              ></motion.div>
              <p className="text-sm font-black text-white">Your AI coach is listening...</p>
              <p className="text-xs text-slate-400 font-medium">Analyzing pronunciation, grammar, fluency & vocabulary.</p>
            </motion.div>
          )}

          {/* RESULT */}
          {phase === 'result' && result && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4 text-left"
            >
              {!result.aiAvailable ? (
                <div className="bg-slate-950/40 border border-amber-500/20 rounded-2xl p-6 text-center space-y-3">
                  <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
                  <p className="text-sm font-black text-white">AI coach unavailable right now</p>
                  <p className="text-xs text-slate-400 font-medium">{result.analysisError || 'Please try again in a moment.'}</p>
                  <button
                    onClick={() => loadChallenge(difficulty)}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] px-4 py-2.5 rounded-xl uppercase tracking-widest transition-all cursor-pointer shadow-sm inline-flex items-center gap-1.5 mt-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Try Again</span>
                  </button>
                </div>
              ) : result.noSpeechDetected ? (
                <div className="bg-slate-950/40 border border-rose-500/20 rounded-2xl p-6 text-center space-y-3">
                  <MicOff className="w-8 h-8 text-rose-400 mx-auto" />
                  <p className="text-sm font-black text-white">No speech detected</p>
                  <p className="text-xs text-slate-400 font-medium">
                    We couldn't hear any speech in that recording. Make sure your microphone is working and try again.
                  </p>
                  <button
                    onClick={() => loadChallenge(difficulty)}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] px-4 py-2.5 rounded-xl uppercase tracking-widest transition-all cursor-pointer shadow-sm inline-flex items-center gap-1.5 mt-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Try Again</span>
                  </button>
                </div>
              ) : (
                <>
                  {/* Overall Score */}
                  <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-6 flex flex-col items-center gap-3 text-center">
                    <OverallScoreRing score={result.scores!.overall} />
                    <p className="text-xs text-slate-400 font-medium max-w-sm">
                      Overall Speaking Score for: <span className="text-slate-300 font-bold">"{result.challengePrompt}"</span>
                    </p>
                  </div>

                  {/* Category breakdown */}
                  <div className="grid grid-cols-2 gap-3">
                    {SCORE_CATEGORIES.map((cat) => {
                      const score = result.scores![cat.key];
                      const c = scoreColor(score);
                      return (
                        <div key={cat.key} className={`bg-slate-950/40 border ${c.border} rounded-2xl p-3.5 space-y-1.5`}>
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{cat.label}</span>
                            <span className={`text-sm font-black ${c.text}`}>{score}</span>
                          </div>
                          <div className="w-full bg-slate-900/60 h-2 rounded-full overflow-hidden">
                            <div className={`${c.bg.replace('/10', '')} h-full rounded-full transition-all duration-700`} style={{ width: `${score}%` }}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {result.transcript && (
                    <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-4 space-y-1.5">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                        <Volume2 className="w-3.5 h-3.5" /> What we heard
                      </span>
                      <p className="text-sm text-white font-bold leading-relaxed">{result.transcript}</p>
                      {result.transcriptPinyin && (
                        <p className="text-xs text-slate-400 font-medium leading-relaxed">{result.transcriptPinyin}</p>
                      )}
                    </div>
                  )}

                  {result.strengths.length > 0 && (
                    <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-2xl p-4 space-y-2">
                      <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Strengths</span>
                      <ul className="space-y-1.5">
                        {result.strengths.map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-slate-200 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {result.improvementTips.length > 0 && (
                    <div className="bg-amber-500/5 border border-amber-500/15 rounded-2xl p-4 space-y-2">
                      <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Improvement Tips</span>
                      <ul className="space-y-1.5">
                        {result.improvementTips.map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-slate-200 font-medium">
                            <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(result.mispronuncedWords.length > 0 || result.suggestedPhrases.length > 0) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {result.mispronuncedWords.length > 0 && (
                        <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-4 space-y-2">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Words to Practice</span>
                          <div className="flex flex-wrap gap-1.5">
                            {result.mispronuncedWords.map((w, i) => (
                              <span key={i} className="bg-rose-500/10 border border-rose-500/20 text-rose-300 px-2.5 py-1 rounded-lg text-xs font-bold">{w}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {result.suggestedPhrases.length > 0 && (
                        <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-4 space-y-2">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sound More Natural</span>
                          <div className="flex flex-wrap gap-1.5">
                            {result.suggestedPhrases.map((w, i) => (
                              <span key={i} className="bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 px-2.5 py-1 rounded-lg text-xs font-bold">{w}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => loadChallenge(difficulty)}
                  className="flex-1 btn-3d-emerald text-slate-950 font-black py-3.5 rounded-2xl text-[10px] uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Practice Again</span>
                </motion.button>
                <button
                  onClick={resetToIntro}
                  className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black py-3.5 rounded-2xl text-[10px] uppercase tracking-widest transition-all cursor-pointer"
                >
                  Back to Start
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}

function OverallScoreRing({ score }: { score: number }) {
  const c = scoreColor(score);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative w-32 h-32">
      <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="currentColor" strokeWidth="10" className="text-slate-800/60" />
        <motion.circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={c.ring}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-black ${c.text}`}>{score}</span>
        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">/ 100</span>
      </div>
    </div>
  );
}
