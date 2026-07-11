import React, { useState, useEffect, useRef } from 'react';
import { Volume2, Play, Pause, Square, RotateCcw, VolumeX, BookOpen, MessageSquare, Settings2, Info } from 'lucide-react';
import { CharacterItem } from '../types';

interface SpeechPlayerProps {
  character: CharacterItem;
}

export default function SpeechPlayer({ character }: SpeechPlayerProps) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(0.75); // Standard slow educational rate
  const [volume, setVolume] = useState<number>(0.85);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [currentText, setCurrentText] = useState<string>('');
  const [currentLangCode, setCurrentLangCode] = useState<string>('zh');
  const [repeatCount, setRepeatCount] = useState<number>(1);
  const [currentRepeatIndex, setCurrentRepeatIndex] = useState<number>(1);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Load and subscribe to speechSynthesis voices & load persistent preferences
  useEffect(() => {
    // Load local storage preferences
    const savedVoiceName = localStorage.getItem('sino3d_voice_name');
    const savedSpeed = localStorage.getItem('sino3d_playback_speed');
    const savedVolume = localStorage.getItem('sino3d_volume');

    if (savedSpeed) setPlaybackSpeed(parseFloat(savedSpeed));
    if (savedVolume) setVolume(parseFloat(savedVolume));

    const loadVoices = () => {
      if ('speechSynthesis' in window) {
        const availableVoices = window.speechSynthesis.getVoices();
        // Filter out duplicate or non-essential voices for clarity, keep CN and EN.
        // Some browsers list the exact same voice (same name + lang) more than
        // once, so de-dupe on that composite key as well.
        const seen = new Set<string>();
        const filteredVoices = availableVoices.filter(v => {
          if (!(v.lang.startsWith('zh') || v.lang.startsWith('en'))) return false;
          const dedupeKey = `${v.name}-${v.lang}`;
          if (seen.has(dedupeKey)) return false;
          seen.add(dedupeKey);
          return true;
        });
        setVoices(filteredVoices);
        
        // Match saved voice name if possible
        if (savedVoiceName) {
          const matched = filteredVoices.find(v => v.name === savedVoiceName);
          if (matched) {
            setSelectedVoice(matched);
            return;
          }
        }

        // Otherwise auto-select the best natural Chinese voice available
        const bestChinese = filteredVoices.find(v => 
          (v.lang.startsWith('zh-CN') && v.name.toLowerCase().includes('natural')) ||
          (v.lang.startsWith('zh-CN') && v.name.toLowerCase().includes('premium')) ||
          (v.lang.startsWith('zh-CN') && v.name.toLowerCase().includes('google')) ||
          v.lang.startsWith('zh-CN') ||
          v.lang.startsWith('zh')
        );
        setSelectedVoice(bestChinese || filteredVoices.find(v => v.lang.startsWith('zh')) || null);
      }
    };

    loadVoices();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Save selected voice preference to localStorage
  const handleVoiceChange = (voiceName: string) => {
    const voice = voices.find(v => v.name === voiceName);
    if (voice) {
      setSelectedVoice(voice);
      localStorage.setItem('sino3d_voice_name', voice.name);
      
      // Briefly play pronunciation of selected voice to confirm
      if (isPlaying) {
        window.speechSynthesis.cancel();
        setIsPlaying(false);
        setIsPaused(false);
      }
    }
  };

  // Save playback speed to localStorage
  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    localStorage.setItem('sino3d_playback_speed', speed.toString());
  };

  // Save volume to localStorage
  const handleVolumeChange = (vol: number) => {
    setVolume(vol);
    localStorage.setItem('sino3d_volume', vol.toString());
  };

  const handleStop = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      setIsPaused(false);
      setCurrentRepeatIndex(1);
    }
  };

  const handlePause = () => {
    if ('speechSynthesis' in window && isPlaying && !isPaused) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  };

  const handleResume = () => {
    if ('speechSynthesis' in window && isPlaying && isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  };

  const speakText = (text: string, forceLanguage: 'zh' | 'en' = 'zh') => {
    if (!('speechSynthesis' in window)) return;

    // Stop current speaking
    window.speechSynthesis.cancel();
    setCurrentText(text);
    setCurrentLangCode(forceLanguage);
    setIsPlaying(true);
    setIsPaused(false);

    // Create new utterance
    const utterance = new SpeechSynthesisUtterance(text);
    currentUtteranceRef.current = utterance;

    // Select correct voice matching requested language
    if (forceLanguage === 'zh') {
      utterance.lang = 'zh-CN';
      if (selectedVoice && selectedVoice.lang.startsWith('zh')) {
        utterance.voice = selectedVoice;
      } else {
        const fallbackCN = voices.find(v => v.lang.startsWith('zh-CN') || v.lang.startsWith('zh'));
        if (fallbackCN) utterance.voice = fallbackCN;
      }
    } else {
      utterance.lang = 'en-US';
      const englishVoice = voices.find(v => v.name.toLowerCase().includes('natural') && v.lang.startsWith('en')) || 
                           voices.find(v => v.lang.startsWith('en'));
      if (englishVoice) utterance.voice = englishVoice;
    }

    utterance.rate = playbackSpeed;
    utterance.volume = volume;

    utterance.onend = () => {
      // Handle repeat loop
      if (currentRepeatIndex < repeatCount) {
        const nextIndex = currentRepeatIndex + 1;
        setCurrentRepeatIndex(nextIndex);
        setTimeout(() => {
          speakText(text, forceLanguage);
        }, 600);
      } else {
        setIsPlaying(false);
        setIsPaused(false);
        setCurrentRepeatIndex(1);
      }
    };

    utterance.onerror = (e) => {
      if (e.error !== 'interrupted') {
        console.warn('SpeechSynthesis event status:', e.error || e);
      }
      setIsPlaying(false);
      setIsPaused(false);
      setCurrentRepeatIndex(1);
    };

    window.speechSynthesis.speak(utterance);
  };

  const handleReplay = () => {
    if (currentText) {
      setCurrentRepeatIndex(1);
      speakText(currentText, currentLangCode as 'zh' | 'en');
    } else {
      setCurrentRepeatIndex(1);
      speakText(character.character, 'zh');
    }
  };

  return (
    <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 p-3 sm:p-5 rounded-3xl space-y-3.5 sm:space-y-4 shadow-lg overflow-hidden">
      
      {/* Header section with minimal badge */}
      <div className="flex flex-col min-[480px]:flex-row min-[480px]:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400 shrink-0">
            <Volume2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-black text-white block truncate">Beihang Speech Flow</span>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block truncate">Premium Audio System</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap min-[480px]:flex-nowrap shrink-0">
          {isPlaying && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 animate-pulse uppercase tracking-wider">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
              Active ({currentRepeatIndex}/{repeatCount})
            </span>
          )}
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded-xl border transition-all ${
              showSettings 
                ? 'bg-white/15 border-white/30 text-white' 
                : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/10'
            }`}
            title="Configure TTS Audio Settings"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Pronunciation Buttons Matrix */}
      <div className="grid grid-cols-1 min-[450px]:grid-cols-2 gap-2 sm:gap-3">
        
        {/* Hanzi */}
        <button
          onClick={() => speakText(character.character, 'zh')}
          className="flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3.5 bg-slate-950/40 hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/30 rounded-2xl text-left transition-all duration-200 group cursor-pointer min-w-0"
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-slate-900 border border-white/10 rounded-xl flex items-center justify-center font-black text-white text-lg sm:text-xl shadow-sm group-hover:scale-105 transition-transform shrink-0">
            {character.character}
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider block">Hanzi</span>
            <span className="text-xs font-black text-white block truncate">Pronounce Character</span>
          </div>
        </button>

        {/* Pinyin */}
        <button
          onClick={() => speakText(character.pinyin, 'zh')}
          className="flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3.5 bg-slate-950/40 hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/30 rounded-2xl text-left transition-all duration-200 group cursor-pointer min-w-0"
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-slate-900 border border-white/10 rounded-xl flex items-center justify-center font-black text-emerald-400 text-xs sm:text-sm shadow-sm group-hover:scale-105 transition-transform shrink-0 px-1 truncate">
            {character.pinyin}
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider block">Pinyin</span>
            <span className="text-xs font-black text-white block truncate">Hear Tone Inflection</span>
          </div>
        </button>

        {/* English Translation */}
        <button
          onClick={() => speakText(character.englishMeaning, 'en')}
          className="flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3.5 bg-slate-950/40 hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/30 rounded-2xl text-left transition-all duration-200 group cursor-pointer min-w-0"
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-slate-900 border border-white/10 rounded-xl flex items-center justify-center text-indigo-400 shadow-sm group-hover:scale-105 transition-transform shrink-0">
            <BookOpen className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider block">Meaning</span>
            <span className="text-xs font-black text-white block truncate">English Context</span>
          </div>
        </button>

        {/* Example Sentence / Sample Compound */}
        {character.exampleSentences && character.exampleSentences[0] ? (
          <button
            onClick={() => speakText(character.exampleSentences[0].sentence, 'zh')}
            className="flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3.5 bg-slate-950/40 hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/30 rounded-2xl text-left transition-all duration-200 group cursor-pointer min-w-0"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-slate-900 border border-white/10 rounded-xl flex items-center justify-center text-teal-400 shadow-sm group-hover:scale-105 transition-transform shrink-0">
              <MessageSquare className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider block">Example</span>
              <span className="text-xs font-black text-white block truncate">Bilingual Sentence</span>
            </div>
          </button>
        ) : character.exampleWords && character.exampleWords[0] ? (
          <button
            onClick={() => speakText(character.exampleWords[0].word, 'zh')}
            className="flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3.5 bg-slate-950/40 hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/30 rounded-2xl text-left transition-all duration-200 group cursor-pointer min-w-0"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-slate-900 border border-white/10 rounded-xl flex items-center justify-center text-teal-400 shadow-sm group-hover:scale-105 transition-transform shrink-0">
              <MessageSquare className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider block">Compound</span>
              <span className="text-xs font-black text-white block truncate">{character.exampleWords[0].word}</span>
            </div>
          </button>
        ) : (
          <div className="flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3.5 bg-slate-950/20 border border-white/5 rounded-2xl text-left select-none opacity-40 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-slate-900 rounded-xl flex items-center justify-center text-slate-500 shrink-0">
              <Info className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-wider block">Example</span>
              <span className="text-xs font-bold text-slate-400 block truncate">No Compound available</span>
            </div>
          </div>
        )}

      </div>

      {/* Advanced Drawer settings for voice name, rate, volume, repetitions */}
      {(showSettings || voices.length === 0) && (
        <div className="bg-slate-950/60 p-4 rounded-2xl border border-white/10 space-y-3.5 text-xs">
          <div className="flex items-center gap-1 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-1">
            <Settings2 className="w-3.5 h-3.5 text-slate-400" />
            <span>Premium Speech Controls</span>
          </div>

          {/* Voice select dropdown */}
          <div className="space-y-1 text-left">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">
              Active Chinese/English Voice
            </label>
            {voices.length > 0 ? (
              <select
                value={selectedVoice?.name || ''}
                onChange={(e) => handleVoiceChange(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 font-bold text-slate-300 focus:outline-none focus:border-emerald-500 shadow-sm text-xs cursor-pointer"
              >
                {voices.map((v) => (
                  <option key={`${v.name}-${v.lang}`} value={v.name} className="bg-slate-900 text-slate-300">
                    {v.name} ({v.lang.startsWith('zh') ? 'Chinese Mandarin' : 'English'}) {v.localService ? '• Local' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[10px] text-slate-400 italic font-medium">Initializing system voices...</span>
            )}
          </div>

          {/* Playback rate & Loop options */}
          <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3.5 sm:gap-4">
            {/* Speed slider */}
            <div className="space-y-1 text-left">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block flex justify-between">
                <span>Speed rate</span>
                <span className="text-emerald-400 font-bold">{playbackSpeed.toFixed(2)}x</span>
              </label>
              <input
                type="range"
                min="0.4"
                max="1.8"
                step="0.05"
                value={playbackSpeed}
                onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              <div className="flex justify-between text-[8px] text-slate-500 font-bold uppercase">
                <span>Slow</span>
                <span>Normal (1.0x)</span>
                <span>Fast</span>
              </div>
            </div>

            {/* Repeat count dropdown */}
            <div className="space-y-1 text-left">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">
                Practice Repetitions
              </label>
              <select
                value={repeatCount}
                onChange={(e) => setRepeatCount(parseInt(e.target.value))}
                className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 font-bold text-slate-300 focus:outline-none focus:border-emerald-500 shadow-sm text-xs cursor-pointer"
              >
                <option value="1" className="bg-slate-900 text-slate-300">1 Playback</option>
                <option value="2" className="bg-slate-900 text-slate-300">2 Repeats</option>
                <option value="3" className="bg-slate-900 text-slate-300">3 Repeats (Fluent)</option>
                <option value="5" className="bg-slate-900 text-slate-300">5 Repeats (Mastery)</option>
              </select>
            </div>
          </div>

          {/* Volume control slider */}
          <div className="space-y-1 text-left">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block flex justify-between">
              <span>Volume Output</span>
              <span className="text-slate-400 font-bold">{Math.round(volume * 100)}%</span>
            </label>
            <div className="flex items-center gap-2">
              <VolumeX className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              <Volume2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            </div>
          </div>

        </div>
      )}

      {/* Control Actions Row (Play, Pause, Stop, Replay) */}
      <div className="flex flex-col sm:flex-row items-center sm:items-center justify-between border-t border-white/5 pt-3 gap-2.5 text-xs">
        <span className="text-[9px] sm:text-[10px] text-slate-400 font-black uppercase tracking-wider text-center sm:text-left w-full sm:w-auto max-w-full sm:max-w-[200px] truncate">
          {currentText ? `Playing: ${currentText}` : 'Ready to pronounce'}
        </span>

        <div className="flex flex-wrap gap-1.5 shrink-0 w-full sm:w-auto justify-center sm:justify-end">
          {isPaused ? (
            <button
              onClick={handleResume}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-xl font-black text-[10px] transition-all uppercase tracking-wider shadow-sm cursor-pointer"
            >
              <Play className="w-3 h-3 fill-current" />
              Resume
            </button>
          ) : (
            <button
              onClick={handlePause}
              disabled={!isPlaying}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-slate-950 rounded-xl font-black text-[10px] transition-all uppercase tracking-wider shadow-sm cursor-pointer"
            >
              <Pause className="w-3 h-3 fill-current" />
              Pause
            </button>
          )}

          <button
            onClick={handleStop}
            disabled={!isPlaying}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 disabled:opacity-40 text-rose-300 border border-rose-500/20 rounded-xl font-black text-[10px] transition-all uppercase tracking-wider shadow-sm cursor-pointer"
          >
            <Square className="w-3 h-3 fill-current" />
            Stop
          </button>

          <button
            onClick={handleReplay}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/15 text-white rounded-xl font-black text-[10px] transition-all uppercase tracking-wider shadow-sm cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            Replay
          </button>
        </div>
      </div>

    </div>
  );
}
