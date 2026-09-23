import React, { useEffect, useState } from 'react';
import {
  X, Loader2, CheckCircle2, Clock, Save, User as UserIcon, BookOpen,
  ChevronDown, ChevronUp, CircleDashed, CheckCheck,
} from 'lucide-react';
import Overlay from '../ui/Overlay';
import { api } from '../../lib/api';
import type { LearningSubmissionSummary, LearningSubmissionDetail } from './learningTypes';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: 'submitted' | 'reviewed' }) {
  if (status === 'reviewed') {
    return (
      <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">
        <CheckCheck className="w-3 h-3" /> Reviewed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">
      <Clock className="w-3 h-3" /> Submitted
    </span>
  );
}

interface ReviewPanelProps {
  submissionId: string;
  onClose: () => void;
  onReviewed: () => void;
}

/** Review modal: student answers side-by-side with correct answers + auto-grade results. */
function ReviewPanel({ submissionId, onClose, onReviewed }: ReviewPanelProps) {
  const [detail, setDetail] = useState<LearningSubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [score, setScore] = useState<string>('');
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getSubmissionDetail(submissionId);
        if (cancelled) return;
        setDetail(data);
        setScore(data.teacherScore !== null ? String(data.teacherScore) : '');
        setFeedback(data.teacherFeedback ?? '');
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load the submission.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [submissionId]);

  const handleSaveReview = async () => {
    const numericScore = Number(score);
    if (score.trim() === '' || Number.isNaN(numericScore) || numericScore < 0 || numericScore > 100) {
      setSaveError('Score must be a number between 0 and 100.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await api.reviewSubmission(submissionId, { score: numericScore, feedback: feedback.trim() });
      onReviewed();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Saving the review failed.');
      setSaving(false);
    }
  };

  return (
    <Overlay
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-slate-950/95 backdrop-blur-xl flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Review submission"
    >
      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 pb-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">Submission Review</p>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight truncate">
              {detail ? `${detail.lessonTitle} — ${detail.exerciseTitle}` : 'Loading…'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-xl text-slate-300 hover:text-white cursor-pointer shrink-0"
            aria-label="Close review"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 font-bold text-xs uppercase tracking-widest animate-pulse">Loading submission…</p>
          </div>
        )}

        {loadError && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-4 rounded-2xl text-xs font-semibold">
            {loadError}
          </div>
        )}

        {detail && (
          <>
            {/* Meta */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-3.5">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1">
                  <UserIcon className="w-3 h-3" /> Student
                </p>
                <p className="text-xs font-black text-white truncate">{detail.studentName ?? detail.studentId}</p>
                <p className="text-[9px] text-slate-500 font-bold">ID {detail.studentId}</p>
              </div>
              <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-3.5">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-1">
                  <BookOpen className="w-3 h-3" /> Lesson
                </p>
                <p className="text-xs font-black text-white truncate">{detail.lessonTitle}</p>
              </div>
              <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-3.5">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Auto Score</p>
                <p className="text-xs font-black text-white">
                  {detail.autoScore} / {detail.totalPoints}
                </p>
              </div>
              <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-3.5">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Submitted</p>
                <p className="text-xs font-black text-white">{formatDateTime(detail.submittedAt)}</p>
              </div>
            </div>

            {/* Answers */}
            <div className="space-y-4 mb-8">
              {detail.answers.map((answer, index) => (
                <div key={answer.questionId} className="bg-slate-900/60 border border-white/10 rounded-3xl p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white break-words">{answer.prompt}</p>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-1">
                          {answer.type.replace('_', ' ')} • {answer.maxPoints} pt{answer.maxPoints === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                    {answer.type === 'multiple_choice' || answer.type === 'fill_blank' ? (
                      answer.autoCorrect ? (
                        <span className="shrink-0 inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">
                          <CheckCircle2 className="w-3 h-3" /> Auto ✓
                        </span>
                      ) : (
                        <span className="shrink-0 inline-flex items-center gap-1 bg-rose-500/10 border border-rose-500/20 text-rose-400 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">
                          <CircleDashed className="w-3 h-3" /> Auto ✗
                        </span>
                      )
                    ) : (
                      <span className="shrink-0 inline-flex items-center gap-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">
                        Teacher-graded
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-slate-950/50 border border-white/10 rounded-2xl p-3.5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">Student Answer</p>
                      <p className={`text-sm font-bold break-words ${answer.answer ? 'text-white' : 'text-slate-600 italic'}`}>
                        {answer.answer || '— not answered —'}
                      </p>
                    </div>
                    {answer.type !== 'short_answer' && (
                      <div className="bg-emerald-500/[0.05] border border-emerald-500/20 rounded-2xl p-3.5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500/80 mb-1.5">Correct Answer</p>
                        <p className="text-sm font-bold text-emerald-300 break-words">
                          {detail.correctAnswers?.[answer.questionId] || '—'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Review form */}
            <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-5 sm:p-6 backdrop-blur-xl">
              <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4">Teacher Review</h3>
              {saveError && (
                <div className="mb-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 p-3 rounded-2xl text-xs font-semibold">
                  {saveError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Score (0-100)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    placeholder="89"
                    className="w-full bg-slate-950/40 border border-white/10 rounded-2xl py-3 px-4 text-sm font-black text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/80"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Feedback</label>
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Great use of 把字句! Watch the tone on 苹果 — it's píngguǒ (2nd tone)."
                    rows={3}
                    maxLength={2000}
                    className="w-full bg-slate-950/40 border border-white/10 rounded-2xl py-3 px-4 text-sm font-semibold text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/80 resize-none"
                  />
                </div>
              </div>
              <button
                onClick={handleSaveReview}
                disabled={saving}
                className="mt-5 w-full sm:w-auto bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Review & Feedback
              </button>
            </div>
          </>
        )}
      </div>
      </div>{/* end flex-1 scroll wrapper */}

      {/* Mobile close bar — sits below scroll area as a true flex child, never overlaps content */}
      <div className="shrink-0 sm:hidden bg-slate-950/90 backdrop-blur-xl border-t border-white/10 p-3">
        <button
          onClick={onClose}
          className="w-full bg-white/[0.04] border border-white/10 text-slate-300 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer"
        >
          Close
        </button>
      </div>
    </Overlay>
  );
}

interface SubmissionCenterProps {
  refreshKey: number;
}

/** Teacher submission center: list + review. */
export default function SubmissionCenter({ refreshKey }: SubmissionCenterProps) {
  const [submissions, setSubmissions] = useState<LearningSubmissionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lessonFilter, setLessonFilter] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  // The lesson filter lists the full lesson set, fetched here so the review
  // center never depends on whatever search/filter the lessons tab is using.
  const [lessonOptions, setLessonOptions] = useState<{ id: string; title: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .getTeacherLessons()
      .then((data) => {
        if (!cancelled) setLessonOptions(data.map((lesson) => ({ id: lesson.id, title: lesson.title })));
      })
      .catch(() => {
        // The filter simply falls back to "All lessons".
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getTeacherSubmissions(lessonFilter || undefined)
      .then((data) => {
        if (!cancelled) {
          setSubmissions(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load submissions.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lessonFilter, refreshKey]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h3 className="text-sm font-black text-white uppercase tracking-widest">📊 Student Submissions</h3>
        <select
          value={lessonFilter}
          onChange={(e) => setLessonFilter(e.target.value)}
          className="bg-slate-950/60 border border-white/10 rounded-2xl px-4 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-emerald-500/80 cursor-pointer max-w-full"
        >
          <option value="">All lessons</option>
          {lessonOptions.map((lesson) => (
            <option key={lesson.id} value={lesson.id}>
              {lesson.title}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
        </div>
      )}

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-4 rounded-2xl text-xs font-semibold">
          {error}
        </div>
      )}

      {!loading && !error && submissions.length === 0 && (
        <div className="bg-slate-900/40 border border-dashed border-white/10 rounded-3xl py-14 text-center">
          <p className="text-slate-500 font-bold text-sm">No submissions yet.</p>
          <p className="text-slate-600 text-xs font-semibold mt-1">
            When students submit exercises, their work appears here for review.
          </p>
        </div>
      )}

      <div className="space-y-2.5">
        {submissions.map((submission) => (
          <div key={submission.id} className="bg-slate-900/60 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl">
            <button
              onClick={() => setExpandedId(expandedId === submission.id ? null : submission.id)}
              className="w-full flex items-center justify-between gap-3 p-4 text-left cursor-pointer hover:bg-white/[0.02] transition-all"
              aria-expanded={expandedId === submission.id}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xs font-black text-white truncate">{submission.studentName ?? submission.studentId}</span>
                  <StatusBadge status={submission.status} />
                </div>
                <p className="text-[10px] font-bold text-slate-500 truncate">
                  {submission.lessonTitle} • {submission.exerciseTitle} • {formatDateTime(submission.submittedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {submission.teacherScore !== null && (
                  <span className="text-xs font-black text-emerald-400 tabular-nums">{submission.teacherScore}%</span>
                )}
                {expandedId === submission.id ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </button>

            {expandedId === submission.id && (
              <div className="px-4 pb-4 flex flex-wrap gap-2 border-t border-white/5 pt-3">
                <div className="w-full text-[10px] font-bold text-slate-500 mb-1">
                  Auto-graded: {submission.autoScore} / {submission.totalPoints} points
                </div>
                <button
                  onClick={() => setReviewingId(submission.id)}
                  className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all"
                >
                  {submission.status === 'reviewed' ? 'View / Update Review' : 'Review'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {reviewingId && (
        <ReviewPanel
          submissionId={reviewingId}
          onClose={() => setReviewingId(null)}
          onReviewed={() => {
            setReviewingId(null);
            // Refresh the list so the status badge updates.
            api
              .getTeacherSubmissions(lessonFilter || undefined)
              .then(setSubmissions)
              .catch(() => {});
          }}
        />
      )}
    </div>
  );
}
