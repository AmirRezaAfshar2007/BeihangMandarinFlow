import React, { useEffect, useState } from 'react';
import {
  X, Plus, Trash2, ChevronUp, ChevronDown, Save, Sparkles, Loader2, GripVertical,
  Type, ListChecks, PenLine, AlertTriangle, Wand2,
} from 'lucide-react';
import Overlay from '../ui/Overlay';
import { api } from '../../lib/api';
import type { LearningExercise, LearningAIDraft, QuestionType } from './learningTypes';

/* ------------------------------------------------------------------ */
/* Question editing model                                              */
/* ------------------------------------------------------------------ */

interface DraftQuestion {
  localId: string;
  type: QuestionType;
  prompt: string;
  options: string[];
  correctAnswer: string;
  points: number;
}

interface ExerciseBuilderProps {
  lessonId: string;
  lessonTitle: string;
  /** Existing exercise to edit, or null to create a new one. */
  exercise: LearningExercise | null;
  onClose: () => void;
  onSaved: () => void;
}

let localIdCounter = 0;
function nextLocalId(): string {
  localIdCounter += 1;
  return `local-${Date.now()}-${localIdCounter}`;
}

const QUESTION_TYPE_META: Record<QuestionType, { label: string; icon: typeof Type; hint: string }> = {
  short_answer: { label: 'Short Answer', icon: PenLine, hint: 'Teacher-graded: translation or open response.' },
  multiple_choice: { label: 'Multiple Choice', icon: ListChecks, hint: '2-6 options, one correct.' },
  fill_blank: { label: 'Fill in the Blank', icon: Type, hint: 'Use ___ in the prompt; graded automatically.' },
};

/**
 * Exercise Builder.
 *
 * The AI generator fills this same editor with DRAFT questions — nothing
 * from the AI is saved or published without the teacher explicitly saving.
 */
export default function ExerciseBuilder({ lessonId, lessonTitle, exercise, onClose, onSaved }: ExerciseBuilderProps) {
  const [title, setTitle] = useState(exercise?.title ?? '');
  const [instructions, setInstructions] = useState(exercise?.instructions ?? '');
  const [questions, setQuestions] = useState<DraftQuestion[]>(() =>
    (exercise?.questions ?? []).map((q) => ({
      localId: nextLocalId(),
      type: q.type,
      prompt: q.prompt,
      options: q.options.length > 0 ? [...q.options] : ['', '', ''],
      correctAnswer: q.correctAnswer ?? '',
      points: q.points,
    }))
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI generation state
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiDifficulty, setAiDifficulty] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [aiCount, setAiCount] = useState(6);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiDraftMeta, setAiDraftMeta] = useState<LearningAIDraft['aiMeta'] | null>(null);

  const addQuestion = (type: QuestionType) => {
    setQuestions((prev) => [
      ...prev,
      {
        localId: nextLocalId(),
        type,
        prompt: '',
        options: type === 'multiple_choice' ? ['', '', ''] : [],
        correctAnswer: '',
        points: 1,
      },
    ]);
  };

  const patchQuestion = (localId: string, patch: Partial<DraftQuestion>) => {
    setQuestions((prev) => prev.map((q) => (q.localId === localId ? { ...q, ...patch } : q)));
  };

  const removeQuestion = (localId: string) => {
    setQuestions((prev) => prev.filter((q) => q.localId !== localId));
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    setQuestions((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  };

  const setOption = (localId: string, optionIndex: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.localId !== localId) return q;
        const options = [...q.options];
        options[optionIndex] = value;
        return { ...q, options };
      })
    );
  };

  const addOption = (localId: string) => {
    setQuestions((prev) =>
      prev.map((q) => (q.localId === localId && q.options.length < 6 ? { ...q, options: [...q.options, ''] } : q))
    );
  };

  const removeOption = (localId: string, optionIndex: number) => {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.localId !== localId) return q;
        const options = q.options.filter((_, i) => i !== optionIndex);
        return { ...q, options, correctAnswer: q.correctAnswer && options.includes(q.correctAnswer) ? q.correctAnswer : '' };
      })
    );
  };

  /* ---------------------------------------------------------------- */
  /* AI generation (draft only — review before save)                   */
  /* ---------------------------------------------------------------- */

  const generateWithAI = async () => {
    if (!aiTopic.trim()) {
      setAiError('Enter a topic first, e.g. 把字句.');
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const draft = await api.generateExerciseAI({
        topic: aiTopic.trim(),
        difficulty: aiDifficulty,
        questionCount: aiCount,
      });
      // Replace the working set with the AI draft. The banner below makes it
      // unmistakable that these are unreviewed AI questions.
      setQuestions(
        draft.questions.map((q) => ({
          localId: nextLocalId(),
          type: q.type,
          prompt: q.prompt,
          options: q.options.length > 0 ? [...q.options] : [],
          correctAnswer: q.correctAnswer ?? '',
          points: q.points,
        }))
      );
      if (!title.trim()) setTitle(draft.title);
      if (!instructions.trim()) setInstructions(draft.instructions);
      setAiDraftMeta(draft.aiMeta);
      setShowAiPanel(false);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI generation failed.');
    } finally {
      setAiLoading(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Save                                                              */
  /* ---------------------------------------------------------------- */

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Give the exercise a title.');
      return;
    }
    if (questions.length === 0) {
      setError('Add at least one question.');
      return;
    }
    for (let i = 0; i < questions.length; i += 1) {
      const q = questions[i];
      if (!q.prompt.trim()) {
        setError(`Question ${i + 1}: the prompt is empty.`);
        return;
      }
      if (q.type === 'multiple_choice') {
        const filled = q.options.map((o) => o.trim()).filter(Boolean);
        if (filled.length < 2) {
          setError(`Question ${i + 1}: provide at least 2 options.`);
          return;
        }
        if (!q.correctAnswer.trim() || !filled.includes(q.correctAnswer.trim())) {
          setError(`Question ${i + 1}: select a correct answer from the options.`);
          return;
        }
      }
      if (q.type === 'fill_blank' && !q.correctAnswer.trim()) {
        setError(`Question ${i + 1}: provide the expected answer.`);
        return;
      }
    }

    setSaving(true);
    setError(null);
    const payload = {
      title: title.trim(),
      instructions: instructions.trim(),
      // Question ids are assigned by the server on save; submissions keep
      // their own snapshot copies, so re-editing never rewrites history.
      questions: questions.map((q) => ({
        type: q.type,
        prompt: q.prompt.trim(),
        options: q.type === 'multiple_choice' ? q.options.map((o) => o.trim()).filter(Boolean) : [],
        correctAnswer: q.correctAnswer.trim(),
        points: q.points,
      })),
    };
    try {
      if (exercise) {
        await api.updateExercise(exercise.id, payload);
      } else {
        await api.createExercise(lessonId, payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saving failed.');
    } finally {
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
      aria-label="Exercise builder"
    >
      {/* Scrollable content — fills the space above the sticky save bar */}
      <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 pb-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">
              {exercise ? 'Edit Exercise' : 'New Exercise'} • {lessonTitle}
            </p>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">✏️ Exercise Builder</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-xl text-slate-300 hover:text-white cursor-pointer shrink-0"
            aria-label="Close builder"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 p-3.5 rounded-2xl text-xs font-semibold flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* AI draft banner */}
        {aiDraftMeta && (
          <div className="mb-4 bg-amber-500/10 border border-amber-500/20 text-amber-300 p-3.5 rounded-2xl text-xs font-semibold leading-relaxed">
            <div className="flex items-center gap-2 mb-1">
              <Wand2 className="w-4 h-4" />
              <span className="font-black uppercase tracking-widest text-[10px]">AI Draft — Review Required</span>
            </div>
            Generated {aiDraftMeta.generated} of {aiDraftMeta.requested} questions on “{aiDraftMeta.topic}” ({aiDraftMeta.difficulty}).
            Nothing is saved yet — edit every question, verify the answers, then press Save.
          </div>
        )}

        {/* Meta fields */}
        <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-5 sm:p-6 space-y-4 mb-6 backdrop-blur-xl">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Exercise Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 把字句 Practice Set 1"
              maxLength={160}
              className="w-full bg-slate-950/40 border border-white/10 rounded-2xl py-3 px-4 text-sm font-bold text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/80 transition-all shadow-inner"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Instructions (optional)</label>
            <input
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Translate the sentences using 把."
              maxLength={600}
              className="w-full bg-slate-950/40 border border-white/10 rounded-2xl py-3 px-4 text-sm font-semibold text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/80 transition-all shadow-inner"
            />
          </div>

          {/* AI generator entry */}
          <div className="pt-1">
            {showAiPanel ? (
              <div className="bg-indigo-500/[0.07] border border-indigo-500/20 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Generate Draft with AI
                  </span>
                  <button onClick={() => setShowAiPanel(false)} className="text-slate-400 hover:text-white cursor-pointer text-xs font-black">
                    Cancel
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Topic</label>
                    <input
                      value={aiTopic}
                      onChange={(e) => setAiTopic(e.target.value)}
                      placeholder="把字句"
                      maxLength={120}
                      className="w-full bg-slate-950/40 border border-white/10 rounded-xl py-2.5 px-3 text-sm font-bold text-white placeholder-slate-600 focus:outline-none focus:border-indigo-400/80"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Difficulty</label>
                    <select
                      value={aiDifficulty}
                      onChange={(e) => setAiDifficulty(e.target.value as typeof aiDifficulty)}
                      className="w-full bg-slate-950/40 border border-white/10 rounded-xl py-2.5 px-3 text-sm font-bold text-white focus:outline-none focus:border-indigo-400/80"
                    >
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Questions</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={aiCount}
                      onChange={(e) => setAiCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                      className="w-full bg-slate-950/40 border border-white/10 rounded-xl py-2.5 px-3 text-sm font-bold text-white focus:outline-none focus:border-indigo-400/80"
                    />
                  </div>
                </div>
                {aiError && <p className="text-rose-300 text-xs font-bold">{aiError}</p>}
                <button
                  onClick={generateWithAI}
                  disabled={aiLoading}
                  className="w-full bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-indigo-200 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                >
                  {aiLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Generating draft…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-400" /> Generate Draft Questions
                    </>
                  )}
                </button>
                <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                  The AI produces a draft only. You must review and edit every question — drafts are never saved or published automatically.
                </p>
              </div>
            ) : (
              <button
                onClick={() => setShowAiPanel(true)}
                className="bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-300 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer flex items-center gap-2 transition-all"
              >
                <Sparkles className="w-4 h-4 text-amber-400" /> Generate with AI
              </button>
            )}
          </div>
        </div>

        {/* Questions */}
        <div className="space-y-4">
          {questions.length === 0 && (
            <div className="bg-slate-900/40 border border-dashed border-white/10 rounded-3xl py-12 text-center">
              <p className="text-slate-500 font-bold text-sm">No questions yet.</p>
              <p className="text-slate-600 text-xs font-semibold mt-1">Add questions manually or generate a draft with AI.</p>
            </div>
          )}

          {questions.map((q, index) => {
            const Meta = QUESTION_TYPE_META[q.type];
            return (
              <div key={q.localId} className="bg-slate-900/60 border border-white/10 rounded-3xl p-4 sm:p-5 backdrop-blur-xl">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <GripVertical className="w-4 h-4 text-slate-600 shrink-0" />
                    <span className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black flex items-center justify-center shrink-0">
                      {index + 1}
                    </span>
                    <select
                      value={q.type}
                      onChange={(e) => {
                        const type = e.target.value as QuestionType;
                        patchQuestion(q.localId, {
                          type,
                          options: type === 'multiple_choice' && q.options.length === 0 ? ['', '', ''] : q.options,
                        });
                      }}
                      className="bg-slate-950/40 border border-white/10 rounded-xl py-1.5 px-2.5 text-[11px] font-black text-white focus:outline-none focus:border-emerald-500/80 cursor-pointer"
                    >
                      <option value="short_answer">Short Answer</option>
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="fill_blank">Fill in the Blank</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => moveQuestion(index, -1)}
                      disabled={index === 0}
                      className="p-1.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"
                      aria-label="Move question up"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moveQuestion(index, 1)}
                      disabled={index === questions.length - 1}
                      className="p-1.5 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"
                      aria-label="Move question down"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removeQuestion(q.localId)}
                      className="p-1.5 text-rose-400 hover:text-rose-300 cursor-pointer ml-1"
                      aria-label="Delete question"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <p className="text-[10px] text-slate-500 font-bold mb-2">{Meta.hint}</p>

                <textarea
                  value={q.prompt}
                  onChange={(e) => patchQuestion(q.localId, { prompt: e.target.value })}
                  placeholder={q.type === 'short_answer' ? 'Translate: 我把作业做完了。' : q.type === 'multiple_choice' ? '她把苹果 ______。' : '我___书放在桌子上。'}
                  rows={2}
                  maxLength={600}
                  className="w-full bg-slate-950/40 border border-white/10 rounded-2xl py-3 px-4 text-sm font-semibold text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/80 transition-all resize-none mb-3"
                />

                {q.type === 'multiple_choice' && (
                  <div className="space-y-2 mb-3">
                    {q.options.map((option, optionIndex) => (
                      <div key={optionIndex} className="flex items-center gap-2">
                        <button
                          onClick={() => patchQuestion(q.localId, { correctAnswer: option.trim() })}
                          className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center cursor-pointer transition-all ${
                            q.correctAnswer && q.correctAnswer === option.trim()
                              ? 'border-emerald-400 bg-emerald-400/20'
                              : 'border-white/20 hover:border-emerald-400/50'
                          }`}
                          aria-label={`Mark option ${optionIndex + 1} as correct`}
                          title="Mark as correct answer"
                        >
                          {q.correctAnswer && q.correctAnswer === option.trim() && (
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          )}
                        </button>
                        <input
                          value={option}
                          onChange={(e) => setOption(q.localId, optionIndex, e.target.value)}
                          placeholder={`Option ${optionIndex + 1} (e.g. 吃了)`}
                          maxLength={200}
                          className="flex-1 bg-slate-950/40 border border-white/10 rounded-xl py-2 px-3 text-xs font-bold text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/80"
                        />
                        {q.options.length > 2 && (
                          <button
                            onClick={() => removeOption(q.localId, optionIndex)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 cursor-pointer shrink-0"
                            aria-label="Remove option"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    {q.options.length < 6 && (
                      <button
                        onClick={() => addOption(q.localId)}
                        className="text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 cursor-pointer flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add option
                      </button>
                    )}
                  </div>
                )}

                {(q.type === 'short_answer' || q.type === 'fill_blank') && (
                  <div className="mb-3">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">
                      {q.type === 'fill_blank' ? 'Correct Answer (auto-graded)' : 'Reference Answer (shown to you during review)'}
                    </label>
                    <input
                      value={q.correctAnswer}
                      onChange={(e) => patchQuestion(q.localId, { correctAnswer: e.target.value })}
                      placeholder={q.type === 'fill_blank' ? '把' : '我把作业做完了。'}
                      maxLength={600}
                      className="w-full bg-slate-950/40 border border-white/10 rounded-xl py-2.5 px-3 text-sm font-bold text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/80"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Points</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={q.points}
                    onChange={(e) => patchQuestion(q.localId, { points: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
                    className="w-20 bg-slate-950/40 border border-white/10 rounded-xl py-1.5 px-3 text-xs font-black text-white focus:outline-none focus:border-emerald-500/80"
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Add question */}
        <div className="mt-5 flex flex-wrap gap-2">
          {(Object.keys(QUESTION_TYPE_META) as QuestionType[]).map((type) => {
            const Meta = QUESTION_TYPE_META[type];
            return (
              <button
                key={type}
                onClick={() => addQuestion(type)}
                className="bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-200 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer flex items-center gap-2 transition-all"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-400" /> {Meta.label}
              </button>
            );
          })}
        </div>

      </div>{/* end scrollable inner */}
      </div>{/* end flex-1 scroll wrapper */}

      {/* Save bar — sits below the scroll area as a true flex child, never overlaps content */}
      <div className="shrink-0 bg-slate-950/90 backdrop-blur-xl border-t border-white/10 p-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest hidden sm:block">
              {questions.length} question{questions.length === 1 ? '' : 's'} •{' '}
              {questions.reduce((sum, q) => sum + q.points, 0)} points total
            </span>
            <div className="flex gap-2 flex-1 sm:flex-none">
              <button
                onClick={onClose}
                className="flex-1 sm:flex-none bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-300 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer"
              >
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 sm:flex-none bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Exercise
              </button>
            </div>
          </div>
        </div>
    </Overlay>
  );
}
