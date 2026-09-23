import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mic,
  RotateCcw,
  Square,
  UploadCloud,
} from 'lucide-react';
import { api } from '../../lib/api';
import RecordingPlayer from './RecordingPlayer';
import type { StudentVoiceSubmission, VoiceSubmitResult } from './schoolTypes';

/** Hard stop so a forgotten tab can't record for an hour. */
const MAX_RECORD_SECONDS = 180;

/**
 * Containers we can hand to MediaRecorder, most preferred first. Chromium
 * emits WebM/Opus, Firefox Ogg/Opus, Safari MP4/AAC — the server accepts all
 * of them (see ALLOWED_AUDIO_TYPES) so the feature works on every browser the
 * app supports rather than only on Chrome.
 */
const CANDIDATE_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

/** The server derives the stored container from the MIME type, but a
 *  filename is still required by multipart and is shown in logs. */
function extensionFor(mimeType: string): string {
  const base = (mimeType || '').split(';')[0].trim().toLowerCase();
  if (base === 'audio/ogg') return 'ogg';
  if (base === 'audio/mp4' || base === 'audio/m4a' || base === 'audio/x-m4a') return 'm4a';
  if (base === 'audio/mpeg') return 'mp3';
  if (base === 'audio/wav' || base === 'audio/x-wav' || base === 'audio/wave') return 'wav';
  return 'webm';
}

function pickMimeType(): string | undefined {
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') return undefined;
  if (typeof window.MediaRecorder.isTypeSupported !== 'function') return undefined;
  return CANDIDATE_MIME_TYPES.find((type) => window.MediaRecorder.isTypeSupported(type));
}

function describeMediaError(err: unknown): string {
  const name = (err as { name?: string })?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'Microphone access was blocked. Allow microphone permission for this site in your browser settings, then try again.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No microphone was found on this device. Connect one and try again.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Your microphone is being used by another application. Close it and try again.';
    case 'OverconstrainedError':
      return 'This microphone does not support the requested audio settings.';
    default:
      return err instanceof Error && err.message
        ? err.message
        : 'Could not start recording. Please check your microphone and try again.';
  }
}

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

interface VoiceRecorderProps {
  assignmentId: string;
  /** The student's existing submission, if any — drives the replace flow. */
  existing: StudentVoiceSubmission | null;
  onSubmitted: (result: VoiceSubmitResult) => void;
}

type Phase = 'idle' | 'starting' | 'recording' | 'ready' | 'uploading';

/**
 * In-browser voice recorder: record → listen → re-record → submit.
 *
 * The audio never leaves the browser until the student submits, and it is
 * captured with MediaRecorder from a `getUserMedia` stream — no file picker,
 * no download. Every track and timer is torn down on unmount, and the
 * MediaRecorder's own `stop` event (not just the button click) is what
 * finalizes the blob, so an auto-stop or a device disconnect still produces a
 * usable recording.
 */
export default function VoiceRecorder({ assignmentId, existing, onSubmitted }: VoiceRecorderProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrlType, setBlobUrlType] = useState('audio/webm');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const durationRef = useRef(0);
  const mountedRef = useRef(true);

  const supported =
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // Full teardown: a live microphone indicator left on after navigating away
  // is both a privacy problem and a visible bug.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null;
        try {
          recorder.stop();
        } catch {
          /* already stopped */
        }
      }
      recorderRef.current = null;
      releaseStream();
    };
  }, [clearTimer, releaseStream]);

  const startRecording = async () => {
    setError(null);
    setSuccess(null);
    setConfirmReplace(false);
    setPhase('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        if (!mountedRef.current) return;
        setError('Recording stopped unexpectedly. Please try again.');
        clearTimer();
        releaseStream();
        setPhase('idle');
      };
      recorder.onstop = () => {
        const finalType = recorder.mimeType || mimeType || 'audio/webm';
        const recorded = new Blob(chunksRef.current, { type: finalType.split(';')[0] });
        chunksRef.current = [];
        clearTimer();
        releaseStream();
        if (!mountedRef.current) return;
        if (recorded.size === 0) {
          setError('Nothing was captured. Please check your microphone and record again.');
          setPhase('idle');
          return;
        }
        setBlob(recorded);
        setBlobUrlType(finalType);
        setPhase('ready');
      };

      startedAtRef.current = Date.now();
      durationRef.current = 0;
      setElapsed(0);
      recorder.start();
      setPhase('recording');

      timerRef.current = window.setInterval(() => {
        const seconds = (Date.now() - startedAtRef.current) / 1000;
        durationRef.current = seconds;
        setElapsed(seconds);
        if (seconds >= MAX_RECORD_SECONDS) {
          // Auto-stop keeps the upload inside the server's size/duration caps.
          const active = recorderRef.current;
          if (active && active.state === 'recording') active.stop();
        }
      }, 200);
    } catch (err) {
      releaseStream();
      setError(describeMediaError(err));
      setPhase('idle');
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      clearTimer();
      releaseStream();
      setPhase('idle');
      return;
    }
    durationRef.current = (Date.now() - startedAtRef.current) / 1000;
    setElapsed(durationRef.current);
    // `onstop` builds the blob and moves to 'ready'.
    recorder.stop();
  };

  const reRecord = () => {
    setBlob(null);
    setConfirmReplace(false);
    setSuccess(null);
    setError(null);
    setElapsed(0);
    setPhase('idle');
  };

  const submit = async () => {
    if (!blob) return;
    setError(null);
    setSuccess(null);
    setProgress(0);
    setConfirmReplace(false);
    setPhase('uploading');
    try {
      const duration = durationRef.current || elapsed;
      const result = await api.uploadVoiceRecording(
        assignmentId,
        blob,
        `recording.${extensionFor(blobUrlType)}`,
        duration,
        setProgress
      );
      if (!mountedRef.current) return;
      setSuccess(
        result.replaced
          ? 'Your new recording replaced the previous one and was sent to your teacher.'
          : 'Recording submitted successfully. Your teacher will review it.'
      );
      setBlob(null);
      setElapsed(0);
      setPhase('idle');
      onSubmitted(result);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      // The recording is still in memory, so the student can retry the upload
      // without re-recording.
      setPhase('ready');
    }
  };

  const recording = phase === 'recording';
  const busy = phase === 'uploading' || phase === 'starting';

  return (
    <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-6 shadow-lg space-y-5 relative overflow-hidden">
      <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center border shrink-0 ${
              recording
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            }`}
          >
            <Mic className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-white truncate">Recording Studio</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 truncate">
              {recording ? 'Listening… read the sentences aloud' : 'Record, listen, then submit'}
            </p>
          </div>
        </div>

        {/* Live timer */}
        <div
          className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl border font-mono text-sm font-black tabular-nums shrink-0 ${
            recording
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-white/[0.04] border-white/10 text-slate-300'
          }`}
          aria-live="polite"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              recording ? 'bg-rose-500 animate-pulse' : 'bg-slate-600'
            }`}
          />
          {formatClock(recording ? elapsed : blob ? elapsed : 0)}
        </div>
      </div>

      {!supported && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-300 p-3.5 rounded-2xl text-[11px] font-bold leading-relaxed">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-[1px]" />
          <span>
            This browser cannot record audio. Please use a recent version of Chrome, Edge, Firefox or
            Safari, and make sure the page is served over HTTPS.
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-300 p-3.5 rounded-2xl text-[11px] font-bold leading-relaxed">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-[1px]" />
          <span className="break-words">{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 p-3.5 rounded-2xl text-[11px] font-bold leading-relaxed">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-[1px]" />
          <span className="break-words">{success}</span>
        </div>
      )}

      {/* Playback of the take that is about to be submitted */}
      {blob && !recording && (
        <RecordingPlayer
          blob={blob}
          title="Your new recording"
          subtitle="Listen before submitting"
          fallbackDurationSeconds={elapsed}
        />
      )}

      {busy && (
        <div className="space-y-2">
          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
            <span>{phase === 'uploading' ? 'Uploading recording' : 'Starting microphone'}</span>
            {phase === 'uploading' && <span className="tabular-nums">{progress}%</span>}
          </div>
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-200"
              style={{ width: phase === 'uploading' ? `${progress}%` : '35%' }}
            />
          </div>
        </div>
      )}

      {/* Replace confirmation — re-submission is supported, but never silent. */}
      {confirmReplace && (
        <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl space-y-3">
          <p className="text-[11px] font-bold text-amber-200 leading-relaxed">
            This will replace your recording that was submitted
            {existing?.submittedAt
              ? ` on ${new Date(existing.submittedAt).toLocaleString()}`
              : ''}{' '}
            and send the new one to your teacher.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={submit}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all active:scale-95"
            >
              Yes, replace it
            </button>
            <button
              type="button"
              onClick={() => setConfirmReplace(false)}
              className="bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-300 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-2.5">
        {!recording && phase !== 'ready' && phase !== 'uploading' && (
          <button
            type="button"
            onClick={startRecording}
            disabled={!supported || phase === 'starting'}
            className="flex-1 min-w-[180px] bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 px-5 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-[0_10px_30px_-12px_rgba(16,185,129,0.7)] transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Mic className="w-4 h-4" />
            {existing ? 'Re-record Answer' : 'Start Recording'}
          </button>
        )}

        {recording && (
          <button
            type="button"
            onClick={stopRecording}
            className="flex-1 min-w-[180px] bg-rose-500 hover:bg-rose-400 text-white px-5 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-lg transition-all cursor-pointer active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Square className="w-4 h-4 fill-current" />
            Stop Recording
          </button>
        )}

        {(phase === 'ready' || phase === 'uploading') && !confirmReplace && (
          <>
            <button
              type="button"
              onClick={reRecord}
              disabled={phase === 'uploading'}
              className="flex-1 min-w-[140px] bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200 px-5 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all cursor-pointer active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-4 h-4" />
              Re-record
            </button>
            <button
              type="button"
              onClick={() => (existing ? setConfirmReplace(true) : submit())}
              disabled={phase === 'uploading'}
              className="flex-1 min-w-[160px] bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 px-5 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-[0_10px_30px_-12px_rgba(16,185,129,0.7)] transition-all cursor-pointer active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {phase === 'uploading' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UploadCloud className="w-4 h-4" />
              )}
              {phase === 'uploading'
                ? 'Submitting…'
                : existing
                  ? 'Replace & Submit'
                  : 'Submit Assignment'}
            </button>
          </>
        )}
      </div>

      <p className="text-[10px] font-bold text-slate-500 leading-relaxed">
        Your recording stays in your browser until you press submit, and only you and your teacher can
        listen to it. Recordings are limited to {Math.floor(MAX_RECORD_SECONDS / 60)} minutes.
      </p>
    </div>
  );
}
