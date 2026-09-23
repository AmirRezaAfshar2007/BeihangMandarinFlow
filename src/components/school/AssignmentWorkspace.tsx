import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileCheck2,
  Info,
  Loader2,
  MessageSquareQuote,
  Sparkles,
} from 'lucide-react';
import { api } from '../../lib/api';
import RecordingPlayer from './RecordingPlayer';
import VoiceRecorder from './VoiceRecorder';
import type { StudentVoiceAssignmentDetail, VoiceSubmitResult } from './schoolTypes';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

interface AssignmentWorkspaceProps {
  assignmentId: string;
  onBack: () => void;
}

/**
 * One voice assignment, as the student sees it: instructions, the exact
 * sentences to read, their own submission (if any) and the recorder.
 *
 * The student's own recording is the only one this view can ever load — the
 * server refuses everyone else's — so the review panel below is genuinely
 * private to the signed-in account.
 */
export default function AssignmentWorkspace({ assignmentId, onBack }: AssignmentWorkspaceProps) {
  const [data, setData] = useState<StudentVoiceAssignmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const detail = await api.getStudentVoiceAssignment(assignmentId);
      setData(detail);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this assignment.');
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    load();
  }, [load]);

  // A fresh submission is written straight into state so the panel updates
  // instantly, then the server is re-read to pick up anything else it changed.
  const handleSubmitted = (result: VoiceSubmitResult) => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            submission: {
              id: result.id,
              status: result.status,
              submissionCount: result.submissionCount,
              teacherScore: result.teacherScore,
              teacherFeedback: result.teacherFeedback,
              submittedAt: result.submittedAt,
              reviewedAt: result.reviewedAt,
              audio: result.audio,
            },
          }
        : prev
    );
    load();
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
        <p className="text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse">
          Loading assignment…
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-200 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to School
        </button>
        <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-300 p-4 rounded-2xl text-xs font-bold">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-[1px]" />
          <span>{error ?? 'This assignment is not available.'}</span>
        </div>
      </div>
    );
  }

  const submission = data.submission;
  const reviewed = submission?.status === 'reviewed';
  const submitted = Boolean(submission);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="space-y-5"
    >
      <button
        onClick={onBack}
        className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-200 transition-all cursor-pointer active:scale-95"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to School
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Prompts */}
        <div className="lg:col-span-3 space-y-5">
          <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-6 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">
                <Sparkles className="w-3 h-3" />
                Voice Recording Exercise
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                  reviewed
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : submitted
                      ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                      : 'bg-slate-500/10 border-slate-500/20 text-slate-400'
                }`}
              >
                {reviewed ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                {reviewed ? 'Reviewed' : submitted ? 'Submitted ✓' : 'Not started'}
              </span>
              {data.dueDate && (
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                    data.isOverdue
                      ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                      : 'bg-white/[0.04] border-white/10 text-slate-300'
                  }`}
                >
                  <CalendarClock className="w-3 h-3" />
                  Due {formatDateTime(data.dueDate)}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight break-words">
              {data.title}
            </h1>

            {data.instructions && (
              <p className="text-slate-300 text-xs sm:text-sm font-semibold leading-relaxed mt-3 whitespace-pre-wrap break-words">
                {data.instructions}
              </p>
            )}
          </div>

          <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-5 sm:p-6 shadow-lg space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-black text-white flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-emerald-400" />
                Read these aloud
              </h2>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                {data.sentences.length} {data.sentences.length === 1 ? 'sentence' : 'sentences'}
              </span>
            </div>

            <ol className="space-y-2.5">
              {data.sentences.map((sentence, index) => (
                <li
                  key={sentence.id}
                  className="flex items-start gap-3 bg-slate-950/40 border border-white/5 rounded-2xl p-3.5 hover:border-emerald-500/20 transition-colors"
                >
                  <span className="w-7 h-7 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-black flex items-center justify-center shrink-0">
                    {index + 1}
                  </span>
                  <p className="text-slate-100 text-base sm:text-lg font-bold leading-relaxed break-words pt-0.5">
                    {sentence.text}
                  </p>
                </li>
              ))}
            </ol>

            <p className="flex items-start gap-1.5 text-[10px] font-bold text-slate-500 leading-relaxed">
              <Info className="w-3.5 h-3.5 shrink-0 mt-[1px]" />
              <span>
                Read every sentence clearly at a natural pace. You can listen to your recording and
                record again as many times as you like before submitting.
              </span>
            </p>
          </div>
        </div>

        {/* Recorder + my submission */}
        <div className="lg:col-span-2 space-y-5">
          <VoiceRecorder
            assignmentId={data.id}
            existing={submission}
            onSubmitted={handleSubmitted}
          />

          {submission && (
            <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-sm font-black text-white flex items-center gap-2">
                  {reviewed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Clock className="w-4 h-4 text-amber-400" />
                  )}
                  {reviewed ? 'Reviewed by your teacher' : 'Status: Submitted ✓'}
                </h2>
                {submission.submissionCount > 1 && (
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                    {submission.submissionCount} takes
                  </span>
                )}
              </div>

              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Submitted {formatDateTime(submission.submittedAt)}
                {reviewed && submission.reviewedAt ? ` • Reviewed ${formatDateTime(submission.reviewedAt)}` : ''}
              </p>

              <RecordingPlayer
                submissionId={submission.id}
                autoLoad
                title="Your submitted recording"
                subtitle={reviewed ? 'Reviewed — you can still record a new take' : 'Waiting for review'}
                fallbackDurationSeconds={submission.audio.durationSeconds}
              />

              {reviewed && submission.teacherScore !== null && (
                <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3.5">
                  <span className="text-2xl font-black text-emerald-400 tabular-nums">
                    {submission.teacherScore}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300 leading-tight">
                    Score
                    <br />
                    out of 100
                  </span>
                </div>
              )}

              {reviewed && submission.teacherFeedback && (
                <div className="bg-slate-950/50 border border-white/10 rounded-2xl p-3.5 space-y-1.5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                    <MessageSquareQuote className="w-3 h-3" />
                    Teacher feedback
                  </p>
                  <p className="text-xs font-semibold text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
                    {submission.teacherFeedback}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
