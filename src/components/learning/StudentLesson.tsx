import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, FileText, Presentation, File as FileIcon, Download, Eye, Dumbbell, BookOpen,
  CheckCircle2, Clock, Loader2, AlertTriangle, Rocket, PenLine, ListChecks, Type,
  MessageSquareQuote, Trophy,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../../lib/api';
import DocumentViewer from './DocumentViewer';
import type { LearningStudentLesson, LearningMaterial } from './learningTypes';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MaterialIcon({ kind }: { kind: string }) {
  const Icon = kind === 'pdf' ? FileText : kind === 'ppt' || kind === 'pptx' ? Presentation : FileIcon;
  return <Icon className="w-5 h-5 text-emerald-400" />;
}

function QuestionIcon({ type }: { type: string }) {
  if (type === 'multiple_choice') return <ListChecks className="w-3.5 h-3.5 text-indigo-400" />;
  if (type === 'fill_blank') return <Type className="w-3.5 h-3.5 text-teal-400" />;
  return <PenLine className="w-3.5 h-3.5 text-amber-400" />;
}

interface StudentLessonProps {
  lessonId: string;
  onBack: () => void;
}

export default function StudentLesson({ lessonId, onBack }: StudentLessonProps) {
  const [data, setData] = useState<LearningStudentLesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Current exercise being answered (accordion open state)
  const [openExerciseId, setOpenExerciseId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, Record<string, string>>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<Record<string, string>>({});

  const [viewingMaterial, setViewingMaterial] = useState<LearningMaterial | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lessonData = await api.getStudentLesson(lessonId);
        if (cancelled) return;
        setData(lessonData);
        setError(null);
        // Pre-fill the answer state; open the first un-submitted exercise.
        const state: Record<string, Record<string, string>> = {};
        for (const exercise of lessonData.exercises) {
          state[exercise.id] = {};
        }
        setAnswers(state);
        const firstOpen = lessonData.exercises.find(
          (exercise) => !lessonData.submissions.some((s) => s.exerciseId === exercise.id)
        );
        if (firstOpen) setOpenExerciseId(firstOpen.id);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this lesson.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  const submissionByExercise = useMemo(() => {
    const map = new Map<string, LearningStudentLesson['submissions'][number]>();
    for (const submission of data?.submissions ?? []) map.set(submission.exerciseId, submission);
    return map;
  }, [data]);

  const downloadMaterial = (material: LearningMaterial) => {
    // Authenticated fetch -> blob download (the endpoint requires the Bearer
    // token, so a plain href wouldn't authorize).
    const token = api.getToken();
    fetch(`/api/learning/materials/${material.id}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((res) => {
        if (!res.ok) throw new Error('Download failed.');
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = material.originalName;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => setSubmitError((prev) => ({ ...prev, _download: 'Download failed. Please try again.' })));
  };

  const setAnswer = (exerciseId: string, questionId: string, value: string) => {
    setAnswers((prev) => ({
      ...prev,
      [exerciseId]: { ...prev[exerciseId], [questionId]: value },
    }));
  };

  const handleSubmit = async (exerciseId: string) => {
    const exercise = data?.exercises.find((e) => e.id === exerciseId);
    if (!exercise) return;
    const unanswered = exercise.questions.filter((q) => !(answers[exerciseId]?.[q.id] ?? '').trim());
    if (unanswered.length === exercise.questions.length) {
      setSubmitError((prev) => ({ ...prev, [exerciseId]: 'Answer at least one question before submitting.' }));
      return;
    }
    if (unanswered.length > 0) {
      const proceed = confirm(
        `${unanswered.length} question${unanswered.length === 1 ? ' is' : 's are'} still unanswered. Unanswered questions score 0 — submit anyway?`
      );
      if (!proceed) return;
    }
    setSubmitting(exerciseId);
    setSubmitError((prev) => ({ ...prev, [exerciseId]: '' }));
    try {
      const payload = exercise.questions.map((q) => ({
        questionId: q.id,
        answer: answers[exerciseId]?.[q.id] ?? '',
      }));
      await api.submitAnswers(lessonId, exerciseId, payload);
      // Refresh submission state from the server (source of truth).
      const refreshed = await api.getStudentLesson(lessonId);
      setData(refreshed);
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 3500);
    } catch (err) {
      setSubmitError((prev) => ({
        ...prev,
        [exerciseId]: err instanceof Error ? err.message : 'Submission failed.',
      }));
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-36 space-y-4">
        <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 font-bold tracking-wide animate-pulse">Loading lesson…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4 text-center px-6">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-rose-400" />
        </div>
        <p className="text-rose-300 font-bold text-sm">{error ?? 'Lesson not found.'}</p>
        <button
          onClick={onBack}
          className="bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-300 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer"
        >
          Back to Learning Hub
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      {/* Celebration toast — portaled to <body> so it escapes <main>'s z-10 stacking
          context and always paints above the sticky app header (z-40). */}
      <AnimatePresence>
        {showCelebration && createPortal(
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-[80] bg-emerald-500/15 border border-emerald-500/30 backdrop-blur-xl text-emerald-300 px-6 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest shadow-2xl flex items-center gap-2 pointer-events-none"
          >
            <CheckCircle2 className="w-4 h-4" /> Submission Successful — sent to your teacher
          </motion.div>,
          document.body,
        )}
      </AnimatePresence>

      {/* Header */}
      <button
        onClick={onBack}
        className="bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Learning Hub
      </button>

      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900/95 via-slate-950/95 to-slate-900/90 backdrop-blur-2xl rounded-[32px] p-6 md:p-8 text-white shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] border border-white/10">
        <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
        <div className="absolute right-8 md:right-16 top-1/2 -translate-y-1/2 text-[100px] md:text-[150px] font-serif text-white/[0.03] select-none pointer-events-none leading-none font-black">
          课
        </div>
        <div className="relative z-10 space-y-2.5">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 backdrop-blur-md px-3.5 py-1.5 rounded-full text-[10px] font-black tracking-wider uppercase border border-emerald-500/20 text-emerald-400">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Published Lesson</span>
          </div>
          <h1 className="text-2xl md:text-4xl font-black tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
            {data.lesson.title}
          </h1>
          {data.lesson.description && (
            <p className="text-slate-400 font-semibold text-xs sm:text-sm leading-relaxed max-w-2xl">{data.lesson.description}</p>
          )}
        </div>
      </div>

      {/* Materials */}
      <div className="space-y-3">
        <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">📚 Learning Materials</h2>
        {data.materials.length === 0 ? (
          <div className="bg-slate-900/40 border border-dashed border-white/10 rounded-3xl py-10 text-center">
            <p className="text-slate-500 font-bold text-xs">No materials for this lesson yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.materials.map((material) => (
              <div key={material.id} className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-3xl p-4 flex items-center gap-3.5 hover:border-white/20 transition-all">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <MaterialIcon kind={material.kind} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-white truncate">{material.originalName}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-0.5">
                    {material.kind.toUpperCase()} • {formatBytes(material.size)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setViewingMaterial(material)}
                    className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest cursor-pointer flex items-center gap-1.5 transition-all"
                    title="View material"
                  >
                    <Eye className="w-3.5 h-3.5" /> <span className="hidden sm:inline">View</span>
                  </button>
                  <button
                    onClick={() => downloadMaterial(material)}
                    className="bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-300 hover:text-white p-2 rounded-xl cursor-pointer transition-all"
                    title="Download"
                    aria-label={`Download ${material.originalName}`}
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {submitError._download && (
          <p className="text-rose-300 text-xs font-bold">{submitError._download}</p>
        )}
      </div>

      {/* Practice */}
      <div className="space-y-3">
        <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">✏️ Practice</h2>

        {data.exercises.length === 0 && (
          <div className="bg-slate-900/40 border border-dashed border-white/10 rounded-3xl py-10 text-center">
            <p className="text-slate-500 font-bold text-xs">No exercises for this lesson yet.</p>
          </div>
        )}

        <div className="space-y-3">
          {data.exercises.map((exercise) => {
            const submission = submissionByExercise.get(exercise.id);
            const isOpen = openExerciseId === exercise.id;
            const exerciseAnswers = answers[exercise.id] ?? {};
            const answeredCount = exercise.questions.filter((q) => (exerciseAnswers[q.id] ?? '').trim()).length;
            const progressPercent = Math.round((answeredCount / exercise.questions.length) * 100);

            return (
              <div key={exercise.id} className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-[28px] overflow-hidden">
                {/* Exercise head */}
                <button
                  onClick={() => setOpenExerciseId(isOpen ? null : exercise.id)}
                  className="w-full text-left p-5 cursor-pointer hover:bg-white/[0.02] transition-all"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <Dumbbell className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span className="text-sm font-black text-white truncate">{exercise.title}</span>
                        {submission ? (
                          submission.status === 'reviewed' ? (
                            <span className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest">
                              <CheckCircle2 className="w-2.5 h-2.5" /> {submission.teacherScore !== null ? `${submission.teacherScore}%` : 'Reviewed'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest">
                              <Clock className="w-2.5 h-2.5" /> Submitted — awaiting review
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest">
                            {exercise.questions.length} question{exercise.questions.length === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                      {exercise.instructions && (
                        <p className="text-[11px] text-slate-400 font-semibold">{exercise.instructions}</p>
                      )}
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 border-t border-white/5 pt-4">
                    {submission ? (
                      /* Submitted view: status + teacher feedback */
                      <div className="space-y-4">
                        <div className="bg-slate-950/40 border border-white/10 rounded-2xl p-4 flex items-center gap-3">
                          {submission.status === 'reviewed' ? (
                            <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
                          ) : (
                            <Clock className="w-5 h-5 text-amber-400 shrink-0" />
                          )}
                          <div>
                            <p className="text-xs font-black text-white">
                              {submission.status === 'reviewed' ? 'Reviewed by your teacher' : '🟢 Submitted'}
                            </p>
                            <p className="text-[10px] text-slate-500 font-bold">
                              {submission.status === 'reviewed'
                                ? `Score: ${submission.teacherScore !== null ? `${submission.teacherScore}/100` : '—'} • Auto-graded ${submission.autoScore}/${submission.totalPoints} pts`
                                : `Auto-graded ${submission.autoScore}/${submission.totalPoints} pts • waiting for teacher feedback`}
                            </p>
                          </div>
                        </div>

                        {submission.teacherFeedback && (
                          <div className="bg-emerald-500/[0.06] border border-emerald-500/20 rounded-2xl p-4">
                            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500/80 mb-1.5 flex items-center gap-1.5">
                              <MessageSquareQuote className="w-3.5 h-3.5" /> Teacher Feedback
                            </p>
                            <p className="text-xs text-emerald-100 font-semibold leading-relaxed whitespace-pre-wrap">
                              {submission.teacherFeedback}
                            </p>
                          </div>
                        )}

                        <p className="text-[10px] text-slate-500 font-semibold">
                          Resubmission is not available for this exercise — your answers and the teacher's feedback are saved.
                        </p>
                      </div>
                    ) : (
                      /* Answer form */
                      <div className="space-y-4">
                        {/* Progress indicator */}
                        <div>
                          <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1.5">
                            <span>{answeredCount} of {exercise.questions.length} answered</span>
                            <span className={answeredCount === exercise.questions.length ? 'text-emerald-400' : ''}>{progressPercent}%</span>
                          </div>
                          <div className="h-1.5 bg-slate-950/60 rounded-full overflow-hidden border border-white/5">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                        </div>

                        {exercise.questions.map((question, index) => (
                          <div key={question.id} className="bg-slate-950/40 border border-white/10 rounded-2xl p-4">
                            <div className="flex items-start gap-2.5 mb-3">
                              <span
                                className={`w-6 h-6 rounded-lg text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5 border ${
                                  (exerciseAnswers[question.id] ?? '').trim()
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                    : 'bg-slate-500/10 border-slate-500/20 text-slate-400'
                                }`}
                              >
                                {index + 1}
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-white break-words">{question.prompt}</p>
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-1 flex items-center gap-1.5">
                                  <QuestionIcon type={question.type} />
                                  {question.type === 'short_answer' ? 'Short answer' : question.type === 'multiple_choice' ? 'Choose one' : 'Fill in the blank'} • {question.points} pt{question.points === 1 ? '' : 's'}
                                </p>
                              </div>
                            </div>

                            {question.type === 'multiple_choice' ? (
                              <div className="space-y-2">
                                {question.options.map((option, optionIndex) => {
                                  const selected = exerciseAnswers[question.id] === option;
                                  return (
                                    <button
                                      // Options are a fixed list per question and could
                                      // repeat as text, so the index is the only stable key.
                                      key={`${question.id}-${optionIndex}`}
                                      type="button"
                                      onClick={() => setAnswer(exercise.id, question.id, option)}
                                      className={`w-full text-left px-4 py-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all flex items-center gap-2.5 ${
                                        selected
                                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                                          : 'bg-slate-950/40 border-white/10 text-slate-300 hover:border-emerald-500/30'
                                      }`}
                                    >
                                      <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${selected ? 'border-emerald-400' : 'border-white/20'}`}>
                                        {selected && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                                      </span>
                                      {option}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <input
                                value={exerciseAnswers[question.id] ?? ''}
                                onChange={(e) => setAnswer(exercise.id, question.id, e.target.value)}
                                placeholder={question.type === 'fill_blank' ? 'Type the missing word…' : 'Type your answer…'}
                                className="w-full bg-slate-950/60 border border-white/10 rounded-xl py-2.5 px-3.5 text-sm font-semibold text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/80 transition-all"
                              />
                            )}
                          </div>
                        ))}

                        {submitError[exercise.id] && (
                          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-3 rounded-2xl text-xs font-semibold flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0" /> {submitError[exercise.id]}
                          </div>
                        )}

                        <button
                          onClick={() => handleSubmit(exercise.id)}
                          disabled={submitting === exercise.id}
                          className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-[0.99]"
                        >
                          {submitting === exercise.id ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" /> Submitting…
                            </>
                          ) : (
                            <>
                              <Rocket className="w-4 h-4" /> 🚀 Submit Answers
                            </>
                          )}
                        </button>
                        <p className="text-[10px] text-slate-500 font-semibold text-center">
                          You can review and change answers before submitting. Submission is final — resubmission is not allowed.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Document viewer */}
      <AnimatePresence>
        {viewingMaterial && <DocumentViewer material={viewingMaterial} onClose={() => setViewingMaterial(null)} />}
      </AnimatePresence>
    </div>
  );
}
