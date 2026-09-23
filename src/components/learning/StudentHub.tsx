import React, { useEffect, useState } from 'react';
import {
  BookOpen, FileText, Dumbbell, CheckCircle2, Clock, ArrowLeft, Megaphone,
  Loader2, AlertTriangle, Trophy, Target, GraduationCap,
} from 'lucide-react';
import { motion } from 'motion/react';
import { api } from '../../lib/api';
import type { LearningStudentLessonCard, LearningStudentProgress as Progress, AnnouncementDTO } from './learningTypes';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function StatusPill({ status }: { status: LearningStudentLessonCard['myStatus'] }) {
  if (status === 'reviewed') {
    return (
      <span className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest">
        <CheckCircle2 className="w-2.5 h-2.5" /> Reviewed
      </span>
    );
  }
  if (status === 'submitted') {
    return (
      <span className="inline-flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest">
        <Clock className="w-2.5 h-2.5" /> Submitted
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 bg-slate-500/10 border border-slate-500/20 text-slate-400 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest">
      Not started
    </span>
  );
}

interface StudentHubProps {
  onOpenLesson: (lessonId: string) => void;
  onBack: () => void;
}

export default function StudentHub({ onOpenLesson, onBack }: StudentHubProps) {
  const [lessons, setLessons] = useState<LearningStudentLessonCard[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [lessonsData, progressData, announcementsData] = await Promise.all([
          api.getStudentLessons(),
          api.getStudentProgress(),
          api.getAnnouncements().catch(() => [] as AnnouncementDTO[]),
        ]);
        if (cancelled) return;
        setLessons(lessonsData);
        setProgress(progressData);
        setAnnouncements(announcementsData);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the Learning Hub.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-36 space-y-4">
        <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 font-bold tracking-wide animate-pulse">Opening the Learning Hub…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900/95 via-slate-950/95 to-slate-900/90 backdrop-blur-2xl rounded-[32px] p-6 md:p-8 text-white shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] border border-white/10">
        <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
        <div className="absolute -right-16 -top-16 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-8 md:right-16 top-1/2 -translate-y-1/2 text-[120px] md:text-[160px] font-serif text-white/[0.03] select-none pointer-events-none leading-none font-black">
          学
        </div>
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 backdrop-blur-md px-3.5 py-1.5 rounded-full text-[10px] font-black tracking-wider uppercase border border-emerald-500/20 text-emerald-400">
              <BookOpen className="w-3.5 h-3.5" />
              <span>学习中心 · Student Hub</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
              Learning Hub
            </h1>
            <p className="text-slate-400 font-bold text-xs sm:text-sm tracking-wide">
              Study your lessons, open materials, and practice what you've learned.
            </p>
          </div>
          <button
            onClick={onBack}
            className="bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white shrink-0 self-start"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-4 rounded-2xl text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Progress stats */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <motion.div whileHover={{ y: -4 }} className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-[24px] p-4 sm:p-5 shadow-lg hover:border-emerald-500/30 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <span className="text-[9px] sm:text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Lessons Done</span>
              <span className="text-base sm:text-xl font-black text-white">
                {progress?.lessonsCompleted ?? 0} <span className="text-slate-500 text-xs">/ {progress?.lessonsTotal ?? 0}</span>
              </span>
            </div>
          </div>
        </motion.div>

        <motion.div whileHover={{ y: -4 }} className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-[24px] p-4 sm:p-5 shadow-lg hover:border-indigo-500/30 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-500/10 border border-indigo-500/20 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0">
              <Target className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <span className="text-[9px] sm:text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Exercises Done</span>
              <span className="text-base sm:text-xl font-black text-white">{progress?.exercisesCompleted ?? 0}</span>
            </div>
          </div>
        </motion.div>

        <motion.div whileHover={{ y: -4 }} className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-[24px] p-4 sm:p-5 shadow-lg hover:border-amber-500/30 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-500/10 border border-amber-500/20 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0">
              <Trophy className="w-5 h-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <span className="text-[9px] sm:text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Avg. Score</span>
              <span className="text-base sm:text-xl font-black text-white">
                {progress?.averageScore !== null && progress?.averageScore !== undefined ? `${progress.averageScore}%` : '—'}
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Lessons */}
      <div className="space-y-4">
        <h2 className="text-lg font-black text-white tracking-tight">Published Lessons</h2>

        {lessons.length === 0 && (
          <div className="bg-slate-900/40 border border-dashed border-white/10 rounded-[32px] py-16 text-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px]" />
            <div className="relative">
              <span className="text-5xl block mb-4">📚</span>
              <p className="text-slate-300 font-black text-base">No lessons yet</p>
              <p className="text-slate-500 text-xs font-semibold mt-1.5 max-w-sm mx-auto leading-relaxed">
                When your teacher publishes a lesson, it will appear here with materials and practice exercises.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {lessons.map((lesson) => (
            <motion.button
              key={lesson.id}
              whileHover={{ y: -3 }}
              onClick={() => onOpenLesson(lesson.id)}
              className="text-left bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-[28px] p-5 shadow-lg hover:border-emerald-500/30 transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="text-sm sm:text-base font-black text-white group-hover:text-emerald-300 transition-colors truncate">
                  {lesson.title}
                </h3>
                <StatusPill status={lesson.myStatus} />
              </div>
              <p className="text-[11px] text-slate-400 font-semibold line-clamp-2 mb-3">
                {lesson.description || 'No description.'}
              </p>
              <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400">
                <span className="flex items-center gap-1.5"><FileText className="w-3 h-3 text-emerald-500" /> {lesson.materialCount} materials</span>
                <span className="flex items-center gap-1.5"><Dumbbell className="w-3 h-3 text-indigo-400" /> {lesson.exerciseCount} exercises</span>
                {lesson.publishedAt && <span className="ml-auto text-slate-500">{timeAgo(lesson.publishedAt)}</span>}
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Announcements */}
      {announcements.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-amber-400" /> Announcements
          </h2>
          <div className="space-y-3">
            {announcements.map((announcement) => (
              <div key={announcement.id} className="bg-slate-900/50 border border-white/10 rounded-3xl p-5 backdrop-blur-xl">
                <p className="text-sm font-black text-white">{announcement.title}</p>
                <p className="text-xs text-slate-400 font-semibold mt-1 leading-relaxed whitespace-pre-wrap">{announcement.body}</p>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-2">{timeAgo(announcement.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
