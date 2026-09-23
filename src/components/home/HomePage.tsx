import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { api } from '../../lib/api';
import type { HomeFeedbackChoice, HomeFeedbackTotals } from './homeTypes';
import {
  BookOpen,
  CheckCircle2,
  LayoutDashboard,
  Loader2,
  LogIn,
  PenLine,
  Sparkles,
  Wrench,
  Zap,
} from 'lucide-react';

/**
 * Public landing page — the first thing anyone sees at the site URL, with NO
 * session required.
 *
 * Layout intent: the questionnaire is the product here, so it sits in the
 * first viewport. On desktop the hero copy and the intro boxes occupy the
 * left column while the questionnaire fills the right column; on mobile the
 * DOM order puts the questionnaire directly under the headline (the intro
 * boxes follow it, so a phone never has to scroll past marketing to reach the
 * form). The form itself renders immediately and never waits on the network —
 * only the optional aggregate bar below it depends on the totals request.
 *
 * Theming comes free from the app's global `.light` class overrides in
 * index.css, so this file only uses the standard slate/emerald utilities the
 * rest of the app uses: no dark:/light: variants anywhere.
 */

interface HomePageProps {
  /** Present when a signed-in user opens the landing page; enables prefill. */
  user?: { studentId: string; fullName: string; role: 'admin' | 'student' } | null;
  onSignIn: () => void;
  onGoToDashboard: () => void;
}

const CHOICES: {
  value: HomeFeedbackChoice;
  emoji: string;
  label: string;
  /** Selected-state styling; the neutral state is shared by both options. */
  selectedClasses: string;
}[] = [
  {
    value: 'interested',
    emoji: '❤️',
    label: "Yes, I'm very interested",
    selectedClasses: 'bg-emerald-500/15 border-emerald-500/50 shadow-[0_10px_35px_-12px_rgba(16,185,129,0.55)]',
  },
  {
    value: 'not_interested',
    emoji: '❌',
    label: "No, I don't think we need it",
    selectedClasses: 'bg-rose-500/15 border-rose-500/50 shadow-[0_10px_35px_-12px_rgba(244,63,94,0.5)]',
  },
];

/** The three glass intro boxes — kept short so the hero stays light. */
const INTRO_BOXES = [
  {
    icon: BookOpen,
    title: 'Structured lessons',
    body: 'Characters, vocabulary and dialogues organized into a clear weekly path.',
  },
  {
    icon: PenLine,
    title: 'Stroke-by-stroke practice',
    body: 'Draw every character and get precise, instant feedback on your writing.',
  },
  {
    icon: Zap,
    title: 'Instant feedback',
    body: 'Quizzes and exercises are graded the moment you answer them.',
  },
];

export default function HomePage({ user, onSignIn, onGoToDashboard }: HomePageProps) {
  /* ---------------------------- questionnaire ---------------------------- */
  const [choice, setChoice] = useState<HomeFeedbackChoice | null>(null);
  const [fullName, setFullName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ------------------------------ aggregates ----------------------------- */
  const [totals, setTotals] = useState<HomeFeedbackTotals | null>(null);

  // Prefill for signed-in visitors so answering again takes one tap. Only
  // seeds empty fields — never overwrites something the visitor typed.
  useEffect(() => {
    if (!user) return;
    setFullName((current) => current || user.fullName);
    setStudentId((current) => current || user.studentId);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    api
      .getHomeData()
      .then((data) => {
        if (!cancelled) setTotals(data.totals);
      })
      // The aggregate bar is decorative: if it fails, the questionnaire still
      // works, so the error is deliberately swallowed rather than blocking.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (submitting) return;

      const name = fullName.trim();
      const id = studentId.trim();

      if (!choice) {
        setError('Please choose an answer first.');
        return;
      }
      if (name.length < 2) {
        setError('Please enter your name.');
        return;
      }
      if (!/^\d{5,15}$/.test(id)) {
        setError('Student ID must be 5–15 digits.');
        return;
      }

      setError(null);
      setSubmitting(true);
      try {
        const result = await api.submitHomeFeedback({ fullName: name, studentId: id, choice });
        setTotals(result.totals);
        setSubmitted(true);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Could not save your answer. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
    [choice, fullName, studentId, submitting]
  );

  const resetForm = () => {
    setSubmitted(false);
    setError(null);
  };

  const inputClasses =
    'w-full bg-slate-950/40 border border-white/10 rounded-2xl py-3 px-4 font-semibold text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/80 focus:bg-slate-950/60 transition-all focus:ring-4 focus:ring-emerald-500/10';

  return (
    <div className="relative">
      {/* On mobile this is a flex column (headline → form → intro boxes);
          from `lg` it becomes a two-column grid with the questionnaire
          spanning both rows of the right column. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-8">
        {/* ============================ HEADLINE ============================ */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="order-1 space-y-4 lg:col-start-1 lg:row-start-1"
        >
          <span className="inline-flex items-center gap-2 bg-emerald-500/10 backdrop-blur-md px-3.5 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase border border-emerald-500/20 text-emerald-400">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Beihang Mandarin Flow</span>
          </span>

          <h1 className="text-[2rem] leading-[1.08] sm:text-[2.6rem] lg:text-[3.1rem] font-black tracking-tight break-words bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
            Learn Mandarin,
            <br />
            one stroke at a time.
          </h1>

          <p className="text-slate-400 font-semibold text-xs sm:text-sm leading-relaxed max-w-md">
            A modern learning platform built for Beihang University students — structured lessons,
            handwriting practice, and instant feedback, all in one place.
          </p>
        </motion.div>

        {/* ========================== QUESTIONNAIRE ========================= */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: 'easeOut' }}
          className="order-2 lg:col-start-2 lg:row-span-2 lg:row-start-1"
        >
          <div className="relative rounded-[28px] p-[1.5px] bg-gradient-to-b from-emerald-500/40 via-white/10 to-transparent shadow-[0_25px_60px_-20px_rgba(0,0,0,0.7)]">
            <div className="relative rounded-[27px] bg-slate-900/60 backdrop-blur-2xl p-5 sm:p-6 overflow-hidden">
              <div className="absolute -right-16 -top-16 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10">
                <h2 className="text-lg sm:text-xl font-black text-white tracking-tight leading-snug">
                  Are you interested in this project?
                </h2>
                <p className="mt-1 text-[11px] font-bold text-slate-500 leading-relaxed">
                  Ten seconds, one tap — it shapes what we build next.
                </p>

                {submitted ? (
                  /* ------------------------- Thank-you state ------------------------ */
                  <motion.div
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                    className="mt-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-5 text-center"
                  >
                    <CheckCircle2 className="w-9 h-9 text-emerald-400 mx-auto" />
                    <p className="mt-2 text-sm font-black text-white">Thank you!</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-400">
                      Your answer has been recorded
                      {choice && (
                        <>
                          {' '}
                          —{' '}
                          <span className={choice === 'interested' ? 'text-emerald-400' : 'text-rose-400'}>
                            {choice === 'interested' ? "interested ❤️" : 'not interested ❌'}
                          </span>
                        </>
                      )}
                      .
                    </p>
                    <button
                      type="button"
                      onClick={resetForm}
                      className="mt-3.5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white underline underline-offset-4 cursor-pointer transition-colors"
                    >
                      Change my answer
                    </button>
                  </motion.div>
                ) : (
                  <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
                    {/* --------------------------- Choices --------------------------- */}
                    <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Are you interested in this project?">
                      {CHOICES.map(({ value, emoji, label, selectedClasses }) => {
                        const selected = choice === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => {
                              setChoice(value);
                              setError(null);
                            }}
                            className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border px-2.5 py-3.5 text-center cursor-pointer transition-all active:scale-[0.98] ${
                              selected
                                ? selectedClasses
                                : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06] hover:border-white/20'
                            }`}
                          >
                            <span className="text-2xl leading-none" aria-hidden="true">
                              {emoji}
                            </span>
                            <span className="text-[11px] font-black text-white leading-tight">{label}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* --------------------------- Identity -------------------------- */}
                    <div className="space-y-2.5">
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        maxLength={120}
                        autoComplete="name"
                        placeholder="Your full name"
                        aria-label="Your full name"
                        className={inputClasses}
                      />
                      <input
                        type="text"
                        value={studentId}
                        onChange={(e) => setStudentId(e.target.value)}
                        maxLength={15}
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="Student ID"
                        aria-label="Student ID"
                        className={inputClasses}
                      />
                      <p className="text-[10px] font-semibold text-slate-600 px-1">
                        Your name and student ID are only used to record this answer.
                      </p>
                    </div>

                    {error && (
                      <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-[11px] font-semibold text-rose-400">
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 px-6 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-[0_15px_40px_-12px_rgba(16,185,129,0.6)] cursor-pointer transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      <span>{submitting ? 'Submitting…' : 'Submit response'}</span>
                    </button>
                  </form>
                )}

                {/* ------------------------ Community pulse ------------------------ */}
                {totals && totals.total > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-slate-500">
                      <span>Community</span>
                      <span>
                        {totals.total} response{totals.total === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="mt-2 flex h-1.5 rounded-full overflow-hidden bg-white/10">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
                        style={{ width: `${totals.interestedPercent}%` }}
                      />
                      <div
                        className="h-full bg-gradient-to-r from-rose-500 to-rose-400 transition-all duration-700"
                        style={{ width: `${totals.notInterestedPercent}%` }}
                      />
                    </div>
                    <p className="mt-2 text-[10px] font-bold text-slate-500">
                      <span className="text-emerald-400">{totals.interestedPercent}% interested</span>
                      <span className="text-slate-600"> · </span>
                      <span className="text-rose-400">{totals.notInterestedPercent}% not interested</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* ===================== INTRO BOXES + ENTRY POINT ==================== */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.16, ease: 'easeOut' }}
          className="order-3 space-y-3 lg:col-start-1 lg:row-start-2 lg:max-w-xl"
        >
          {INTRO_BOXES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-3.5 sm:p-4"
            >
              <span className="w-9 h-9 shrink-0 rounded-xl border border-emerald-500/20 bg-emerald-500/10 flex items-center justify-center">
                <Icon className="w-4 h-4 text-emerald-400" />
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-black text-white">{title}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-400 leading-relaxed">{body}</p>
              </div>
            </div>
          ))}

          {user ? (
            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={onGoToDashboard}
              className="mt-1 w-full sm:w-auto flex items-center justify-center gap-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 px-6 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-[0_15px_40px_-12px_rgba(16,185,129,0.6)] cursor-pointer transition-all"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Open Training Dashboard</span>
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={onSignIn}
              className="mt-1 w-full sm:w-auto flex items-center justify-center gap-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 px-6 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-[0_15px_40px_-12px_rgba(16,185,129,0.6)] cursor-pointer transition-all"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In</span>
            </motion.button>
          )}
        </motion.div>
      </div>

      {/* ====================== DEVELOPMENT NOTICE ====================== */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.24, ease: 'easeOut' }}
        className="mt-6 lg:mt-10 flex flex-col sm:flex-row items-start sm:items-center gap-3.5 rounded-[24px] border border-amber-500/20 bg-amber-500/10 backdrop-blur-xl p-4 sm:p-5"
      >
        <span className="w-10 h-10 shrink-0 rounded-2xl border border-amber-500/30 bg-slate-950/40 flex items-center justify-center">
          <Wrench className="w-5 h-5 text-amber-400" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-black text-white flex items-center gap-2">
            Under active development
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-slate-400 leading-relaxed">
            This project is currently under development and is continuously being improved. We are working hard to
            complete every feature — if you would like to see it grow, we would love to hear your feedback.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
