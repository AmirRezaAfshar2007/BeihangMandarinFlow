import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  Eye,
  FileCheck2,
  HardDrive,
  Loader2,
  Mic,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import Overlay from '../ui/Overlay';
import RecordingPlayer from './RecordingPlayer';
import type {
  SchoolOverview,
  TeacherVoiceAssignment,
  TeacherVoiceSubmission,
  TeacherVoiceSubmissionDetail,
  VoiceSentence,
} from './schoolTypes';

type Tab = 'assignments' | 'submissions';

interface SentenceDraft {
  id: string;
  text: string;
}

function newSentenceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** `<input type="datetime-local">` wants a local-time `YYYY-MM-DDTHH:mm`. */
function toLocalInputValue(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}

function StatusPill({ status }: { status: 'submitted' | 'reviewed' }) {
  return status === 'reviewed' ? (
    <span className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shrink-0">
      <CheckCircle2 className="w-3 h-3" /> Reviewed
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shrink-0">
      <Clock className="w-3 h-3" /> Submitted
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Assignment editor                                                   */
/* ------------------------------------------------------------------ */

interface AssignmentEditorProps {
  /** null = create a new assignment. */
  assignment: TeacherVoiceAssignment | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

function AssignmentEditor({ assignment, onClose, onSaved }: AssignmentEditorProps) {
  const [title, setTitle] = useState(assignment?.title ?? '');
  const [instructions, setInstructions] = useState(assignment?.instructions ?? '');
  const [dueDate, setDueDate] = useState(toLocalInputValue(assignment?.dueDate ?? null));
  const [sentences, setSentences] = useState<SentenceDraft[]>(
    assignment?.sentences?.length
      ? assignment.sentences.map((s) => ({ id: s.id, text: s.text }))
      : [{ id: newSentenceId(), text: '' }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateSentence = (id: string, text: string) =>
    setSentences((prev) => prev.map((s) => (s.id === id ? { ...s, text } : s)));

  const addSentence = () => setSentences((prev) => [...prev, { id: newSentenceId(), text: '' }]);

  const removeSentence = (id: string) =>
    setSentences((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== id)));

  const save = async (publishAfter: boolean) => {
    setError(null);
    const cleanSentences: VoiceSentence[] = sentences
      .map((s) => ({ id: s.id, text: s.text.trim() }))
      .filter((s) => s.text.length > 0);

    if (!title.trim()) {
      setError('Give the assignment a title.');
      return;
    }
    if (cleanSentences.length === 0) {
      setError('Add at least one sentence for students to read.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        instructions: instructions.trim(),
        sentences: cleanSentences,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      };
      const saved = assignment
        ? await api.updateVoiceAssignment(assignment.id, payload)
        : await api.createVoiceAssignment(payload);

      if (publishAfter) {
        await api.setVoiceAssignmentStatus(saved.id, 'published');
      }
      onSaved(
        publishAfter
          ? `"${saved.title}" is published — students can see it now.`
          : `"${saved.title}" was saved as a draft.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the assignment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay
      className="fixed inset-0 z-[70] bg-slate-950/80 backdrop-blur-xl overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={assignment ? 'Edit voice assignment' : 'Create voice assignment'}
    >
      <div className="min-h-full flex items-start justify-center p-3 sm:p-6">
        <div className="w-full max-w-3xl bg-slate-900/95 border border-white/10 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <Mic className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-white truncate">
                  {assignment ? 'Edit Voice Assignment' : 'New Voice Assignment'}
                </p>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 truncate">
                  Students read these sentences aloud
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-xl text-slate-300 cursor-pointer shrink-0"
              aria-label="Close editor"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            {error && (
              <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-300 p-3.5 rounded-2xl text-[11px] font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-[1px]" />
                <span className="break-words">{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">
                Assignment Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={160}
                placeholder="e.g. Pronunciation Practice 01"
                className="w-full bg-slate-950/40 border border-white/10 rounded-2xl py-3 px-4 text-sm font-bold text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500/70 focus:ring-4 focus:ring-emerald-500/10 transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">
                Instructions for Students
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
                maxLength={1200}
                placeholder="e.g. Read each sentence slowly and clearly. Mind the tones."
                className="w-full bg-slate-950/40 border border-white/10 rounded-2xl py-3 px-4 text-xs font-semibold text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500/70 focus:ring-4 focus:ring-emerald-500/10 transition-all resize-y leading-relaxed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">
                Due Date (optional)
              </label>
              <input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full sm:w-auto bg-slate-950/40 border border-white/10 rounded-2xl py-2.5 px-4 text-xs font-bold text-slate-100 focus:outline-none focus:border-emerald-500/70 transition-all"
              />
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  Sentences to Read
                </label>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                  {sentences.filter((s) => s.text.trim()).length} ready
                </span>
              </div>

              {sentences.map((sentence, index) => (
                <div key={sentence.id} className="flex items-start gap-2">
                  <span className="w-8 h-8 mt-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-black flex items-center justify-center shrink-0">
                    {index + 1}
                  </span>
                  <input
                    type="text"
                    value={sentence.text}
                    onChange={(e) => updateSentence(sentence.id, e.target.value)}
                    maxLength={400}
                    placeholder={index === 0 ? 'e.g. 我叫小明。' : 'Next sentence…'}
                    className="flex-1 min-w-0 bg-slate-950/40 border border-white/10 rounded-2xl py-2.5 px-4 text-sm font-bold text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500/70 focus:ring-4 focus:ring-emerald-500/10 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => removeSentence(sentence.id)}
                    disabled={sentences.length <= 1}
                    className="p-2.5 mt-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl text-rose-300 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                    aria-label={`Remove sentence ${index + 1}`}
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={addSentence}
                className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-200 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Sentence
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5 px-5 py-4 border-t border-white/10 bg-slate-950/40">
            <button
              onClick={() => save(false)}
              disabled={saving}
              className="bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer disabled:opacity-50"
            >
              Save as Draft
            </button>
            <button
              onClick={() => save(true)}
              disabled={saving}
              className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer active:scale-95 disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Save & Publish
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

/* ------------------------------------------------------------------ */
/* Submission review                                                   */
/* ------------------------------------------------------------------ */

function SubmissionReview({
  submissionId,
  onClose,
  onReviewed,
}: {
  submissionId: string;
  onClose: () => void;
  onReviewed: (message: string) => void;
}) {
  const [detail, setDetail] = useState<TeacherVoiceSubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getVoiceSubmissionDetail(submissionId);
        if (cancelled) return;
        setDetail(data);
        setScore(data.teacherScore !== null ? String(data.teacherScore) : '');
        setFeedback(data.teacherFeedback ?? '');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the submission.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [submissionId]);

  const saveReview = async () => {
    const parsed = Number(score);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setError('Enter a score between 0 and 100.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api.reviewVoiceSubmission(submissionId, {
        score: Math.round(parsed),
        feedback,
      });
      setDetail(updated);
      setScore(String(updated.teacherScore ?? ''));
      onReviewed(`Review saved for ${updated.studentName} (${updated.studentId}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the review.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay
      className="fixed inset-0 z-[70] bg-slate-950/80 backdrop-blur-xl overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Voice submission review"
    >
      <div className="min-h-full flex items-start justify-center p-3 sm:p-6">
        <div className="w-full max-w-4xl bg-slate-900/95 border border-white/10 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <Play className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black text-white truncate">
                  {detail ? detail.assignmentTitle : 'Submission Review'}
                </p>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 truncate">
                  Voice Recording Exercise
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-xl text-slate-300 cursor-pointer shrink-0"
              aria-label="Close review"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-9 h-9 text-emerald-400 animate-spin" />
              <p className="text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse">
                Loading submission…
              </p>
            </div>
          ) : !detail ? (
            <div className="p-5">
              <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-300 p-4 rounded-2xl text-xs font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-[1px]" />
                <span>{error ?? 'Submission not found.'}</span>
              </div>
            </div>
          ) : (
            <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Student + audio */}
              <div className="space-y-4">
                <div className="bg-slate-950/50 border border-white/10 rounded-2xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                        Student
                      </p>
                      <p className="text-base font-black text-white truncate">{detail.studentName}</p>
                      <p className="text-[10px] font-bold text-slate-400 font-mono truncate">
                        ID: {detail.studentId}
                      </p>
                    </div>
                    <StatusPill status={detail.status} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    <span>Submitted {formatDateTime(detail.submittedAt)}</span>
                    {detail.reviewedAt && <span>Reviewed {formatDateTime(detail.reviewedAt)}</span>}
                    {detail.submissionCount > 1 && <span>{detail.submissionCount} takes</span>}
                  </div>
                </div>

                <RecordingPlayer
                  submissionId={detail.id}
                  autoLoad
                  title={`${detail.studentName}'s recording`}
                  subtitle={`${detail.studentId} • submitted ${formatDateTime(detail.submittedAt)}`}
                  fallbackDurationSeconds={detail.audio.durationSeconds}
                />

                <div className="bg-slate-950/50 border border-white/10 rounded-2xl p-4 space-y-2.5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                    <FileCheck2 className="w-3.5 h-3.5" />
                    Sentences that were read
                  </p>
                  <ol className="space-y-2">
                    {detail.sentences.map((sentence, index) => (
                      <li key={sentence.id} className="flex items-start gap-2.5">
                        <span className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black flex items-center justify-center shrink-0">
                          {index + 1}
                        </span>
                        <p className="text-sm font-bold text-slate-100 leading-relaxed break-words pt-0.5">
                          {sentence.text}
                        </p>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              {/* Grading */}
              <div className="space-y-4">
                {error && (
                  <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-300 p-3.5 rounded-2xl text-[11px] font-bold">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-[1px]" />
                    <span className="break-words">{error}</span>
                  </div>
                )}

                <div className="bg-slate-950/50 border border-white/10 rounded-2xl p-4 space-y-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                    Review
                  </p>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">
                      Score (0-100)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={score}
                      onChange={(e) => setScore(e.target.value)}
                      placeholder="e.g. 88"
                      className="w-full bg-slate-900 border border-white/10 rounded-2xl py-3 px-4 text-sm font-black text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500/70 focus:ring-4 focus:ring-emerald-500/10 transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block">
                      Feedback (optional)
                    </label>
                    <textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      rows={5}
                      maxLength={2000}
                      placeholder="e.g. Tones are clear. Watch the third tone in the second sentence."
                      className="w-full bg-slate-900 border border-white/10 rounded-2xl py-3 px-4 text-xs font-semibold text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500/70 focus:ring-4 focus:ring-emerald-500/10 transition-all resize-y leading-relaxed"
                    />
                  </div>

                  <button
                    onClick={saveReview}
                    disabled={saving}
                    className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 px-5 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    {detail.status === 'reviewed' ? 'Update Review' : 'Mark as Reviewed'}
                  </button>
                </div>

                {detail.status === 'reviewed' && detail.teacherScore !== null && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-emerald-300 mb-1">
                      Current review
                    </p>
                    <p className="text-3xl font-black text-emerald-400 tabular-nums">
                      {detail.teacherScore}
                      <span className="text-sm text-emerald-300/70">/100</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Overlay>
  );
}

/* ------------------------------------------------------------------ */
/* Teacher School                                                      */
/* ------------------------------------------------------------------ */

interface TeacherSchoolProps {
  onBack: () => void;
}

/**
 * The teacher side of the School section: build voice assignments and review
 * the recordings students submit.
 *
 * Everything here is admin-only on the server. Submissions carry the student's
 * name and ID resolved from their account — the teacher never has to reconcile
 * a typed-in identifier with the audio.
 */
export default function TeacherSchool({ onBack }: TeacherSchoolProps) {
  const [tab, setTab] = useState<Tab>('assignments');
  const [overview, setOverview] = useState<SchoolOverview | null>(null);
  const [assignments, setAssignments] = useState<TeacherVoiceAssignment[]>([]);
  const [submissions, setSubmissions] = useState<TeacherVoiceSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; assignment: TeacherVoiceAssignment | null }>({
    open: false,
    assignment: null,
  });
  const [openSubmissionId, setOpenSubmissionId] = useState<string | null>(null);
  const [submissionFilter, setSubmissionFilter] = useState<string>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [overviewData, assignmentData, submissionData] = await Promise.all([
        api.getSchoolOverview(),
        api.getTeacherVoiceAssignments(),
        api.getTeacherVoiceSubmissions(),
      ]);
      setOverview(overviewData);
      setAssignments(assignmentData);
      setSubmissions(submissionData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the School section.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleStatus = async (assignment: TeacherVoiceAssignment) => {
    setBusyId(assignment.id);
    setError(null);
    try {
      const next = assignment.status === 'published' ? 'draft' : 'published';
      const updated = await api.setVoiceAssignmentStatus(assignment.id, next);
      setAssignments((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
      setNotice(
        next === 'published'
          ? `"${updated.title}" is published — students can see it now.`
          : `"${updated.title}" was unpublished and hidden from students.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the assignment status.');
    } finally {
      setBusyId(null);
    }
  };

  const removeAssignment = async (assignment: TeacherVoiceAssignment) => {
    const warning =
      assignment.submissionCount > 0
        ? `"${assignment.title}" has ${assignment.submissionCount} student submission(s). Deleting it will permanently remove those recordings. Continue?`
        : `Delete "${assignment.title}"?`;
    if (!window.confirm(warning)) return;
    setBusyId(assignment.id);
    setError(null);
    try {
      const result = await api.deleteVoiceAssignment(assignment.id);
      setNotice(result.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the assignment.');
    } finally {
      setBusyId(null);
    }
  };

  const purgeAudio = async (assignment: TeacherVoiceAssignment) => {
    // اول stats رو بگیر
    let stats;
    try {
      stats = await api.getAssignmentAudioStats(assignment.id);
    } catch {
      setError('Could not load audio stats.');
      return;
    }

    if (stats.hasAudio === 0) {
      setNotice('Audio files have already been purged for this assignment.');
      return;
    }

    const msg = stats.canSafelyPurge
      ? `Purge ${stats.hasAudio} audio file(s) for "${assignment.title}"?\n\n` +
        `✅ All ${stats.reviewed} submissions have been reviewed.\n` +
        `💾 This will free ~${stats.totalSizeMB} MB.\n` +
        `📊 Grades and feedback will be preserved.`
      : `⚠️ ${stats.unreviewed} submission(s) are not reviewed yet.\n\n` +
        `Purge ${stats.hasAudio} audio file(s) anyway?\n` +
        `Grades and feedback will be preserved.`;

    if (!window.confirm(msg)) return;

    setBusyId(assignment.id);
    setError(null);
    try {
      const result = await api.purgeAssignmentAudio(assignment.id, !stats.canSafelyPurge);
      setNotice(result.message);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not purge audio files.');
    } finally {
      setBusyId(null);
    }
  };

  const filteredSubmissions = useMemo(() => {
    if (submissionFilter === 'all') return submissions;
    return submissions.filter((s) => s.assignmentId === submissionFilter);
  }, [submissions, submissionFilter]);

  const filteredLabel = useMemo(() => {
    const match = assignments.find((a) => a.id === submissionFilter);
    return match ? match.title : null;
  }, [assignments, submissionFilter]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/10 border border-emerald-500/20 flex items-center justify-center text-2xl shrink-0">
            🏫
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">School</h1>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-0.5">
              Voice assignments &amp; student recordings
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button
            onClick={() => setEditor({ open: true, assignment: null })}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer active:scale-95 shadow-[0_10px_30px_-14px_rgba(16,185,129,0.8)]"
          >
            <Plus className="w-4 h-4" />
            New Voice Assignment
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 px-3.5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-200 transition-all cursor-pointer disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onBack}
            className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 px-3.5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-200 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-300 p-4 rounded-2xl text-xs font-bold">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-[1px]" />
          <span className="break-words">{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-start justify-between gap-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 p-4 rounded-2xl text-xs font-bold">
          <span className="break-words">{notice}</span>
          <button
            onClick={() => setNotice(null)}
            className="text-emerald-400 hover:text-emerald-200 font-black uppercase tracking-wider shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'Assignments',
            value: overview?.totalAssignments ?? 0,
            icon: <ClipboardList className="w-5 h-5 text-indigo-400" />,
            accent: 'bg-indigo-500/10 border-indigo-500/20',
          },
          {
            label: 'Published',
            value: overview?.publishedAssignments ?? 0,
            icon: <Send className="w-5 h-5 text-sky-400" />,
            accent: 'bg-sky-500/10 border-sky-500/20',
          },
          {
            label: 'Recordings in',
            value: overview?.totalSubmissions ?? 0,
            icon: <Mic className="w-5 h-5 text-emerald-400" />,
            accent: 'bg-emerald-500/10 border-emerald-500/20',
          },
          {
            label: 'Awaiting review',
            value: overview?.pendingSubmissions ?? 0,
            icon: <Clock className="w-5 h-5 text-amber-400" />,
            accent: 'bg-amber-500/10 border-amber-500/20',
          },
        ].map((tile) => (
          <div
            key={tile.label}
            className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-lg flex items-center gap-3 min-w-0"
          >
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${tile.accent}`}>
              {tile.icon}
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-0.5 truncate">
                {tile.label}
              </p>
              <p className="text-lg font-black text-white leading-none tabular-nums">{tile.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {(
          [
            { key: 'assignments' as Tab, label: 'Assignments', count: assignments.length },
            { key: 'submissions' as Tab, label: 'Submissions', count: submissions.length },
          ]
        ).map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              tab === item.key
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/[0.07]'
            }`}
          >
            {item.label}
            <span className={`tabular-nums ${tab === item.key ? 'text-emerald-400' : 'text-slate-500'}`}>
              {item.count}
            </span>
          </button>
        ))}
      </div>

      {loading && assignments.length === 0 && submissions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-9 h-9 text-emerald-400 animate-spin" />
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse">
            Loading School…
          </p>
        </div>
      ) : tab === 'assignments' ? (
        assignments.length === 0 ? (
          <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-3xl p-10 text-center space-y-3">
            <div className="w-14 h-14 mx-auto rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-2xl">
              🎙️
            </div>
            <h3 className="text-white font-black text-base">No voice assignments yet</h3>
            <p className="text-slate-400 text-xs font-semibold leading-relaxed max-w-md mx-auto">
              Create one with a few sentences. Students record themselves reading them aloud and you
              review each recording here.
            </p>
            <button
              onClick={() => setEditor({ open: true, assignment: null })}
              className="mt-2 inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" />
              New Voice Assignment
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assignments.map((assignment) => (
              <motion.div
                key={assignment.id}
                whileHover={{ y: -3 }}
                className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-3xl p-5 shadow-lg hover:border-emerald-500/30 transition-all flex flex-col gap-3.5 relative overflow-hidden"
              >
                <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />

                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                      {assignment.isMine ? 'Your assignment' : `By ${assignment.teacherName}`}
                    </p>
                    <h3 className="text-base font-black text-white leading-snug break-words">
                      {assignment.title}
                    </h3>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                      assignment.status === 'published'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : 'bg-slate-500/10 border-slate-500/20 text-slate-400'
                    }`}
                  >
                    {assignment.status === 'published' ? 'Published' : 'Draft'}
                  </span>
                </div>

                {assignment.instructions && (
                  <p className="text-[11px] font-semibold text-slate-400 leading-relaxed line-clamp-2 break-words">
                    {assignment.instructions}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-widest">
                  <span className="bg-white/[0.04] border border-white/10 px-2.5 py-1 rounded-full text-slate-300">
                    {assignment.sentenceCount} {assignment.sentenceCount === 1 ? 'sentence' : 'sentences'}
                  </span>
                  <span className="inline-flex items-center gap-1 bg-white/[0.04] border border-white/10 px-2.5 py-1 rounded-full text-slate-300">
                    <Users className="w-3 h-3" />
                    {assignment.studentCount} student{assignment.studentCount === 1 ? '' : 's'}
                  </span>
                  {assignment.pendingCount > 0 ? (
                    <span className="bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full text-amber-400">
                      {assignment.pendingCount} awaiting review
                    </span>
                  ) : assignment.submissionCount > 0 ? (
                    <span className="bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full text-emerald-400">
                      All reviewed
                    </span>
                  ) : (
                    <span className="bg-white/[0.04] border border-white/10 px-2.5 py-1 rounded-full text-slate-500">
                      No recordings yet
                    </span>
                  )}
                  {assignment.dueDate && (
                    <span className="inline-flex items-center gap-1 bg-white/[0.04] border border-white/10 px-2.5 py-1 rounded-full text-slate-300">
                      <CalendarClock className="w-3 h-3" />
                      Due {new Date(assignment.dueDate).toLocaleDateString()}
                    </span>
                  )}
                </div>

                <div className="mt-auto grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setSubmissionFilter(assignment.id);
                      setTab('submissions');
                    }}
                    disabled={assignment.submissionCount === 0}
                    className="col-span-2 flex items-center justify-center gap-2 bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-slate-200 px-3 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Eye className="w-4 h-4" />
                    {assignment.submissionCount} Submission{assignment.submissionCount === 1 ? '' : 's'}
                  </button>
                  <button
                    onClick={() => toggleStatus(assignment)}
                    disabled={busyId === assignment.id}
                    className="flex items-center justify-center gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 px-3 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer disabled:opacity-50"
                  >
                    {busyId === assignment.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    {assignment.status === 'published' ? 'Unpublish' : 'Publish'}
                  </button>
                  <button
                    onClick={() => setEditor({ open: true, assignment })}
                    className="flex items-center justify-center gap-2 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 text-sky-400 px-3 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => purgeAudio(assignment)}
                    disabled={busyId === assignment.id || assignment.submissionCount === 0}
                    className="flex items-center justify-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 px-3 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title={assignment.submissionCount === 0 ? 'No submissions yet' : 'Free up storage — keeps grades'}
                  >
                    <HardDrive className="w-3.5 h-3.5" />
                    Free Storage
                  </button>
                  <button
                    onClick={() => removeAssignment(assignment)}
                    disabled={busyId === assignment.id}
                    className="col-span-2 flex items-center justify-center gap-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 px-3 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete assignment
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )
      ) : (
        /* Submissions tab */
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSubmissionFilter('all')}
              className={`px-3.5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all cursor-pointer ${
                submissionFilter === 'all'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-slate-200'
              }`}
            >
              All assignments
            </button>
            <select
              value={submissionFilter}
              onChange={(e) => setSubmissionFilter(e.target.value)}
              className="bg-slate-950/60 border border-white/10 rounded-2xl px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-300 focus:outline-none focus:border-emerald-500/70 cursor-pointer max-w-full"
              aria-label="Filter submissions by assignment"
            >
              <option value="all">Filter by assignment…</option>
              {assignments.map((assignment) => (
                <option key={assignment.id} value={assignment.id}>
                  {assignment.title}
                </option>
              ))}
            </select>
          </div>

          {filteredSubmissions.length === 0 ? (
            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-3xl p-10 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-2xl">
                🎧
              </div>
              <h3 className="text-white font-black text-base">No recordings yet</h3>
              <p className="text-slate-400 text-xs font-semibold leading-relaxed max-w-md mx-auto">
                {filteredLabel
                  ? `No student has submitted a recording for "${filteredLabel}" yet.`
                  : 'Student recordings appear here as soon as they submit, with their name and student ID.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSubmissions.map((submission) => (
                <motion.div
                  key={submission.id}
                  whileHover={{ y: -2 }}
                  className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-3xl p-4 sm:p-5 shadow-lg hover:border-emerald-500/30 transition-all"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400 mb-1 truncate">
                            {submission.assignmentTitle}
                          </p>
                          <p className="text-base font-black text-white truncate">
                            {submission.studentName}
                          </p>
                          <p className="text-[10px] font-bold font-mono text-slate-400 truncate">
                            ID: {submission.studentId}
                          </p>
                        </div>
                        <StatusPill status={submission.status} />
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <span>Submitted {formatDateTime(submission.submittedAt)}</span>
                        <span>
                          {submission.sentenceCount}{' '}
                          {submission.sentenceCount === 1 ? 'sentence' : 'sentences'}
                        </span>
                        {submission.submissionCount > 1 && <span>{submission.submissionCount} takes</span>}
                        {submission.status === 'reviewed' && submission.teacherScore !== null && (
                          <span className="text-emerald-400">Score {submission.teacherScore}/100</span>
                        )}
                      </div>
                    </div>

                    <div className="lg:w-72 shrink-0">
                      <RecordingPlayer
                        submissionId={submission.id}
                        title="Student recording"
                        subtitle={`${submission.studentId} • press play to load`}
                        fallbackDurationSeconds={submission.audio.durationSeconds}
                        compact
                      />
                    </div>

                    <button
                      onClick={() => setOpenSubmissionId(submission.id)}
                      className="lg:w-auto w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer active:scale-95 shrink-0"
                    >
                      <ClipboardList className="w-4 h-4" />
                      Open &amp; Review
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {editor.open && (
        <AssignmentEditor
          assignment={editor.assignment}
          onClose={() => setEditor({ open: false, assignment: null })}
          onSaved={(message) => {
            setEditor({ open: false, assignment: null });
            setNotice(message);
            load();
          }}
        />
      )}

      {openSubmissionId && (
        <SubmissionReview
          submissionId={openSubmissionId}
          onClose={() => setOpenSubmissionId(null)}
          onReviewed={(message) => {
            setNotice(message);
            load();
          }}
        />
      )}
    </motion.div>
  );
}
