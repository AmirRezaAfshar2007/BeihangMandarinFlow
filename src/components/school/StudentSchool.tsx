import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock,
  GraduationCap,
  ListChecks,
  Loader2,
  Mic,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { api } from '../../lib/api';
import type { StudentAssignmentStatus, StudentVoiceAssignmentSummary } from './schoolTypes';

type FilterKey = 'all' | 'todo' | 'submitted' | 'reviewed';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'todo', label: 'To do' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'reviewed', label: 'Reviewed' },
];

function StatusPill({ status }: { status: StudentAssignmentStatus }) {
  if (status === 'reviewed') {
    return (
      <span className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shrink-0">
        <CheckCircle2 className="w-3 h-3" /> Reviewed
      </span>
    );
  }
  if (status === 'submitted') {
    return (
      <span className="inline-flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shrink-0">
        <Clock className="w-3 h-3" /> Submitted ✓
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 bg-slate-500/10 border border-slate-500/20 text-slate-400 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shrink-0">
      <Mic className="w-3 h-3" /> To do
    </span>
  );
}

function StatTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-lg flex items-center gap-3 min-w-0">
      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${accent}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-0.5 truncate">
          {label}
        </p>
        <p className="text-lg font-black text-white leading-none truncate tabular-nums">{value}</p>
      </div>
    </div>
  );
}

interface StudentSchoolProps {
  onOpenAssignment: (assignmentId: string) => void;
  onBack: () => void;
}

/**
 * The student's School view: every voice assignment their teacher published,
 * with their own submission status. Only published assignments are returned by
 * the server, so drafts never appear here even if someone guesses an id.
 */
export default function StudentSchool({ onOpenAssignment, onBack }: StudentSchoolProps) {
  const [assignments, setAssignments] = useState<StudentVoiceAssignmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');

  const load = async () => {
    setLoading(true);
    try {
      setAssignments(await api.getStudentVoiceAssignments());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load your assignments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const counts = useMemo(() => {
    const todo = assignments.filter((a) => a.myStatus === 'not_submitted').length;
    const submitted = assignments.filter((a) => a.myStatus === 'submitted').length;
    const reviewed = assignments.filter((a) => a.myStatus === 'reviewed').length;
    const scores = assignments
      .filter((a) => a.myStatus === 'reviewed' && typeof a.myScore === 'number')
      .map((a) => a.myScore as number);
    return {
      todo,
      submitted,
      reviewed,
      average: scores.length ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length) : null,
    };
  }, [assignments]);

  const visible = useMemo(() => {
    if (filter === 'todo') return assignments.filter((a) => a.myStatus === 'not_submitted');
    if (filter === 'submitted') return assignments.filter((a) => a.myStatus === 'submitted');
    if (filter === 'reviewed') return assignments.filter((a) => a.myStatus === 'reviewed');
    return assignments;
  }, [assignments, filter]);

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
              Assignments from your teacher
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 px-3.5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-200 transition-all cursor-pointer disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
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

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          icon={<ListChecks className="w-5 h-5 text-indigo-400" />}
          label="Assignments"
          value={assignments.length}
          accent="bg-indigo-500/10 border-indigo-500/20"
        />
        <StatTile
          icon={<Mic className="w-5 h-5 text-sky-400" />}
          label="To do"
          value={counts.todo}
          accent="bg-sky-500/10 border-sky-500/20"
        />
        <StatTile
          icon={<Clock className="w-5 h-5 text-amber-400" />}
          label="Awaiting review"
          value={counts.submitted}
          accent="bg-amber-500/10 border-amber-500/20"
        />
        <StatTile
          icon={<GraduationCap className="w-5 h-5 text-emerald-400" />}
          label="Average score"
          value={counts.average !== null ? `${counts.average}%` : '—'}
          accent="bg-emerald-500/10 border-emerald-500/20"
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {FILTERS.map((item) => {
          const active = filter === item.key;
          const badge =
            item.key === 'todo'
              ? counts.todo
              : item.key === 'submitted'
                ? counts.submitted
                : item.key === 'reviewed'
                  ? counts.reviewed
                  : assignments.length;
          return (
            <button
              key={item.key}
              onClick={() => setFilter(item.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/[0.07]'
              }`}
            >
              {item.label}
              <span className={`tabular-nums ${active ? 'text-emerald-400' : 'text-slate-500'}`}>
                {badge}
              </span>
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading && assignments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="w-9 h-9 text-emerald-400 animate-spin" />
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse">
            Loading assignments…
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-3xl p-10 text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-2xl">
            🎓
          </div>
          <h3 className="text-white font-black text-base">
            {assignments.length === 0 ? 'No assignments yet' : 'Nothing in this filter'}
          </h3>
          <p className="text-slate-400 text-xs font-semibold leading-relaxed max-w-md mx-auto">
            {assignments.length === 0
              ? 'When your teacher publishes a voice recording exercise it will appear here with the sentences you need to read aloud.'
              : 'Try another filter to see the rest of your assignments.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visible.map((assignment) => (
            <motion.div
              key={assignment.id}
              whileHover={{ y: -3 }}
              className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-3xl p-5 shadow-lg hover:border-emerald-500/30 transition-all flex flex-col gap-3.5 relative overflow-hidden"
            >
              <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400 mb-1 flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" />
                    Voice Recording
                  </p>
                  <h3 className="text-base font-black text-white leading-snug break-words">
                    {assignment.title}
                  </h3>
                </div>
                <StatusPill status={assignment.myStatus} />
              </div>

              {assignment.instructions && (
                <p className="text-[11px] font-semibold text-slate-400 leading-relaxed line-clamp-2 break-words">
                  {assignment.instructions}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-widest">
                <span className="bg-white/[0.04] border border-white/10 px-2.5 py-1 rounded-full text-slate-300">
                  {assignment.sentenceCount}{' '}
                  {assignment.sentenceCount === 1 ? 'sentence' : 'sentences'}
                </span>
                {assignment.dueDate && (
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border ${
                      assignment.isOverdue
                        ? 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                        : 'bg-white/[0.04] border-white/10 text-slate-300'
                    }`}
                  >
                    <CalendarClock className="w-3 h-3" />
                    {assignment.isOverdue ? 'Overdue' : 'Due'}{' '}
                    {new Date(assignment.dueDate).toLocaleDateString()}
                  </span>
                )}
                {assignment.myStatus === 'reviewed' && typeof assignment.myScore === 'number' && (
                  <span className="bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full text-emerald-400">
                    Score {assignment.myScore}/100
                  </span>
                )}
              </div>

              <button
                onClick={() => onOpenAssignment(assignment.id)}
                className="mt-auto w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer active:scale-[0.98] flex items-center justify-center gap-2 shadow-[0_10px_30px_-14px_rgba(16,185,129,0.8)]"
              >
                <Mic className="w-4 h-4" />
                {assignment.myStatus === 'not_submitted'
                  ? 'Practice & Record'
                  : assignment.myStatus === 'submitted'
                    ? 'View Submission'
                    : 'Review & Re-record'}
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
