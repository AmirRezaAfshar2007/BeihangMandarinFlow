import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Pause, Play, Volume2 } from 'lucide-react';
import { api } from '../../lib/api';

interface RecordingPlayerProps {
  /** Server-stored recording. Fetched with the session token. */
  submissionId?: string;
  /** A just-recorded local blob (played before it is uploaded). */
  blob?: Blob | null;
  title?: string;
  subtitle?: string;
  /**
   * Fetch the audio as soon as the player mounts. Off by default so a list of
   * submissions does not download every student's recording up front; the
   * play button triggers the fetch instead.
   */
  autoLoad?: boolean;
  compact?: boolean;
  /**
   * Length to fall back on when the container carries none. MediaRecorder
   * output is a live WebM stream with no duration field, so the element
   * reports Infinity and the scrub bar would be dead for every recording —
   * the recorder's own timer (or the stored metadata) is the honest source.
   */
  fallbackDurationSeconds?: number;
  onError?: (message: string) => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Plays a voice recording.
 *
 * Two sources, one control surface: a local blob captured seconds ago, or a
 * recording stored server-side. The stored case is deliberately fetched with
 * the Bearer token into an object URL rather than handed to `<audio src>` —
 * a raw media URL cannot carry the Authorization header, and an
 * unauthenticated one would expose student work to anyone who has the id.
 */
export default function RecordingPlayer({
  submissionId,
  blob,
  title = 'Recording',
  subtitle,
  autoLoad = false,
  compact = false,
  fallbackDurationSeconds,
  onError,
}: RecordingPlayerProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const revoke = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const attach = useCallback(
    (next: Blob) => {
      revoke();
      const url = URL.createObjectURL(next);
      objectUrlRef.current = url;
      setSrc(url);
    },
    [revoke]
  );

  // A local blob wins: it is the freshest take and needs no network.
  useEffect(() => {
    if (blob) {
      setError(null);
      attach(blob);
      return;
    }
    setSrc(null);
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);
  }, [blob, attach]);

  useEffect(() => () => revoke(), [revoke]);

  const loadRemote = useCallback(
    async (autoplay: boolean) => {
      if (!submissionId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await api.getSubmissionAudio(submissionId);
        attach(data);
        if (autoplay) {
          // Let the element pick up the new src before playing it.
          window.setTimeout(() => {
            audioRef.current?.play().catch(() => setPlaying(false));
          }, 0);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Could not load the recording.';
        setError(message);
        onError?.(message);
      } finally {
        setLoading(false);
      }
    },
    [submissionId, attach, onError]
  );

  useEffect(() => {
    if (autoLoad && submissionId && !blob) {
      loadRemote(false);
    }
    // Intentionally keyed on the source identity only: re-running on every
    // callback identity would re-download the audio on unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad, submissionId, blob]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!src) {
      loadRemote(true);
      return;
    }
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => setError('Playback was blocked by the browser. Press play again.'));
    } else {
      audio.pause();
    }
  };

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(duration) || duration <= 0) return;
    audio.currentTime = value;
    setCurrentTime(value);
  };

  // The element's own duration wins when it is real; otherwise the caller's
  // known length is used so seeking and the time readout still work.
  const reportedDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const effectiveDuration = reportedDuration || Math.max(0, fallbackDurationSeconds ?? 0);
  const progressPercent =
    effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;

  return (
    <div
      className={`bg-slate-950/50 border border-white/10 rounded-2xl ${compact ? 'p-3' : 'p-4'} space-y-3`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={toggle}
          disabled={loading || (!src && !submissionId)}
          className="w-11 h-11 bg-gradient-to-tr from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 rounded-2xl flex items-center justify-center shrink-0 shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={playing ? 'Pause recording' : 'Play recording'}
          title={playing ? 'Pause' : 'Play'}
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : playing ? (
            <Pause className="w-5 h-5 fill-current" />
          ) : (
            <Play className="w-5 h-5 fill-current" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-black text-white truncate flex items-center gap-1.5">
            <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">{title}</span>
          </p>
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 truncate">
            {error ? 'Unavailable' : subtitle || (src ? 'Ready' : 'Tap play to load')}
          </p>
        </div>

        <span className="text-[10px] font-black text-slate-400 tabular-nums shrink-0">
          {formatTime(currentTime)} / {formatTime(effectiveDuration)}
        </span>
      </div>

      {/* Seek bar. A range input keeps keyboard/screen-reader support and
          touch dragging for free. */}
      <div className="relative">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 bg-white/10 rounded-full overflow-hidden pointer-events-none">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-[width] duration-100"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={effectiveDuration > 0 ? effectiveDuration : 1}
          step={0.05}
          value={Math.min(currentTime, effectiveDuration > 0 ? effectiveDuration : 1)}
          onChange={(e) => seek(Number(e.target.value))}
          disabled={!src || effectiveDuration <= 0}
          className="relative w-full h-5 appearance-none bg-transparent cursor-pointer disabled:cursor-not-allowed accent-emerald-500"
          aria-label="Seek within the recording"
        />
      </div>

      {error && (
        <p className="flex items-start gap-1.5 text-[10px] font-bold text-rose-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-[1px]" />
          <span className="break-words">{error}</span>
        </p>
      )}

      {/* The real media element. Hidden because the controls above are the UI,
          but still a real <audio> so seeking/decoding is the browser's job. */}
      <audio
        ref={audioRef}
        src={src ?? undefined}
        preload="metadata"
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(effectiveDuration);
        }}
        onLoadedMetadata={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onDurationChange={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onError={() => setError('This recording could not be played.')}
      />
    </div>
  );
}
