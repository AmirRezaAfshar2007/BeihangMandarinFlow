import React, { useEffect, useState } from 'react';
import {
  Plus, BookOpen, Users, ClipboardList, TrendingUp, Globe, FileText, Presentation,
  File as FileIcon, Dumbbell, Edit3, Upload, Trash2, Send,
  Loader2, Megaphone, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, ArrowLeft,
  Search, CheckSquare, Square, EyeOff, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../../lib/api';
import LessonEditor from './LessonEditor';
import ExerciseBuilder from './ExerciseBuilder';
import SubmissionCenter from './SubmissionCenter';
import type {
  LearningLessonCard, LearningQuizCard, TeacherOverviewDTO as Overview, LearningExercise,
  LearningMaterial, AnnouncementDTO, ExerciseQuestionDTO,
} from './learningTypes';

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MaterialIcon({ kind }: { kind: string }) {
  const Icon = kind === 'pdf' ? FileText : kind === 'ppt' || kind === 'pptx' ? Presentation : FileIcon;
  return <Icon className="w-3.5 h-3.5 text-emerald-400" />;
}

function QuestionTypeChip({ type }: { type: string }) {
  const labels: Record<string, string> = {
    short_answer: 'Short Answer',
    multiple_choice: 'Multiple Choice',
    fill_blank: 'Fill Blank',
  };
  return (
    <span className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest">
      {labels[type] ?? type}
    </span>
  );
}

interface TeacherHubProps {
  user: { studentId: string; fullName: string; role: 'admin' | 'student' };
  onBack: () => void;
}

export default function TeacherHub({ user, onBack }: TeacherHubProps) {
  const [tab, setTab] = useState<'lessons' | 'quizzes' | 'submissions' | 'announcements'>('lessons');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [lessons, setLessons] = useState<LearningLessonCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // Lesson management: server-side search/filter + bulk selection.
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published'>('all');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'mine'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  // Bumping this remounts the submissions list so a review that was just
  // invalidated by a lesson change is refetched instead of going stale.
  const [submissionsRefreshKey, setSubmissionsRefreshKey] = useState(0);

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<LearningLessonCard | null>(null);

  // Expanded lesson detail (materials + exercises inline)
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);
  const [lessonMaterials, setLessonMaterials] = useState<Record<string, LearningMaterial[]>>({});
  const [lessonExercises, setLessonExercises] = useState<Record<string, LearningExercise[]>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [builderExercise, setBuilderExercise] = useState<{ lessonId: string; lessonTitle: string; exercise: LearningExercise | null } | null>(null);

  // Quiz Management (cross-lesson view of the exercise collection).
  const [quizzes, setQuizzes] = useState<LearningQuizCard[]>([]);
  const [quizzesLoading, setQuizzesLoading] = useState(false);
  const [quizSearch, setQuizSearch] = useState('');
  const [quizStatusFilter, setQuizStatusFilter] = useState<'all' | 'draft' | 'published'>('all');
  const [quizLessonPickerOpen, setQuizLessonPickerOpen] = useState(false);
  const [quizLessonOptions, setQuizLessonOptions] = useState<LearningLessonCard[]>([]);

  // Announcements
  const [announcements, setAnnouncements] = useState<AnnouncementDTO[]>([]);
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annSaving, setAnnSaving] = useState(false);
  const [annError, setAnnError] = useState<string | null>(null);

  const flash = (message: string) => {
    setSuccess(message);
    setTimeout(() => setSuccess(null), 4000);
  };

  const loadOverview = async () => {
    const data = await api.getLearningOverview();
    setOverview(data);
  };

  /**
   * Lessons always come from the server (search/filter run in the query), so
   * what the table shows is exactly what the authorization scope allows — no
   * client-side copy can drift from it after a bulk action.
   */
  const loadLessons = async () => {
    setLessonsLoading(true);
    try {
      const data = await api.getTeacherLessons({
        q: searchTerm,
        status: statusFilter,
        scope: scopeFilter,
      });
      setLessons(data);
      // Selections that scrolled out of the current result set are dropped so
      // a bulk action can never hit a lesson the teacher can no longer see.
      setSelectedIds((prev) => prev.filter((id) => data.some((lesson) => lesson.id === id)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load lessons.');
    } finally {
      setLessonsLoading(false);
    }
  };

  /** The Quiz Management table: every quiz across every lesson. */
  const loadQuizzes = async () => {
    setQuizzesLoading(true);
    try {
      setQuizzes(await api.getTeacherQuizzes());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quizzes.');
    } finally {
      setQuizzesLoading(false);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      await Promise.all([loadOverview(), loadLessons(), loadQuizzes()]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the Learning Hub.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSearchTerm(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const firstFilterRun = React.useRef(true);
  useEffect(() => {
    if (firstFilterRun.current) {
      // loadAll() already ran the first query with the default filters.
      firstFilterRun.current = false;
      return;
    }
    loadLessons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, statusFilter, scopeFilter]);

  useEffect(() => {
    if (tab === 'announcements') {
      api.getAnnouncements().then(setAnnouncements).catch(() => {});
    }
    if (tab === 'quizzes') {
      loadQuizzes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  /** Create-flow: pick the lesson a new quiz belongs to (unfiltered list). */
  const openQuizLessonPicker = async () => {
    if (quizLessonPickerOpen) {
      setQuizLessonPickerOpen(false);
      return;
    }
    setQuizLessonPickerOpen(true);
    try {
      setQuizLessonOptions(await api.getTeacherLessons());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load lessons.');
    }
  };

  const loadLessonDetail = async (lessonId: string) => {
    setDetailLoading(true);
    try {
      const [materials, exercises] = await Promise.all([api.listMaterials(lessonId), api.listExercises(lessonId)]);
      setLessonMaterials((prev) => ({ ...prev, [lessonId]: materials }));
      setLessonExercises((prev) => ({ ...prev, [lessonId]: exercises }));
    } catch {
      setError('Could not load lesson details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleLesson = (lessonId: string) => {
    if (expandedLessonId === lessonId) {
      setExpandedLessonId(null);
      return;
    }
    setExpandedLessonId(lessonId);
    if (!lessonMaterials[lessonId]) {
      loadLessonDetail(lessonId);
    }
  };

  const handlePublishToggle = async (lesson: LearningLessonCard) => {
    try {
      const updated = await api.setLessonStatus(lesson.id, lesson.status === 'published' ? 'unpublish' : 'publish');
      // Drop the row when the new status no longer matches the active filter,
      // otherwise update it in place — either way the table reflects the
      // server's answer immediately, with no manual refresh.
      setLessons((prev) =>
        statusFilter === 'all'
          ? prev.map((l) => (l.id === updated.id ? updated : l))
          : prev.filter((l) => l.id !== updated.id)
      );
      await loadOverview();
      flash(updated.status === 'published' ? 'Lesson published — students can see it now.' : 'Lesson moved back to draft — hidden from students.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status change failed.');
    }
  };

  const handleDeleteLesson = async (lesson: LearningLessonCard) => {
    const risk =
      lesson.submissionCount > 0
        ? `\n\n⚠️ ${lesson.submissionCount} student submission(s) are attached. Deleting this lesson permanently removes that student work. Unpublish instead to keep it.`
        : '';
    if (!confirm(`Delete “${lesson.title}”? All its materials and exercises will be permanently removed.${risk}`)) return;
    try {
      const result = await api.deleteLesson(lesson.id);
      setLessons((prev) => prev.filter((l) => l.id !== lesson.id));
      setSelectedIds((prev) => prev.filter((id) => id !== lesson.id));
      setSubmissionsRefreshKey((n) => n + 1);
      await loadOverview();
      flash(result.message || 'Lesson deleted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  const toggleSelected = (lessonId: string) => {
    setSelectedIds((prev) =>
      prev.includes(lessonId) ? prev.filter((id) => id !== lessonId) : [...prev, lessonId]
    );
  };

  const visibleIds = lessons.map((lesson) => lesson.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  const handleBulkStatus = async (status: 'draft' | 'published') => {
    if (selectedIds.length === 0) return;
    setBulkBusy(true);
    setWarning(null);
    try {
      const result = await api.bulkSetLessonStatus(selectedIds, status);
      setSelectedIds([]);
      await Promise.all([loadLessons(), loadOverview()]);
      flash(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk update failed.');
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const withWork = lessons.filter((l) => selectedIds.includes(l.id) && l.submissionCount > 0);
    const notice =
      withWork.length > 0
        ? `\n\n⚠️ ${withWork.length} of the selected lessons already have student submissions. Those are kept automatically — unpublish them instead.`
        : '';
    if (!confirm(`Permanently delete ${selectedIds.length} lesson(s), including their materials and exercises?${notice}`)) return;

    setBulkBusy(true);
    setWarning(null);
    try {
      const result = await api.bulkDeleteLessons(selectedIds);
      setSelectedIds([]);
      await Promise.all([loadLessons(), loadOverview()]);
      setSubmissionsRefreshKey((n) => n + 1);
      flash(result.message);
      if (result.keptWithSubmissions.length > 0) {
        setWarning(
          `Kept because they already hold student work: ${result.keptWithSubmissions
            .map((l) => `“${l.title}” (${l.submissionCount})`)
            .join(', ')}. Unpublish them to hide them from students.`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk delete failed.');
    } finally {
      setBulkBusy(false);
    }
  };

  /* Quiz Management actions. A quiz is an exercise; publishing it means
     publishing the lesson it belongs to, which is what reveals it to
     students — the UI says so explicitly rather than pretending a quiz has
     its own independent publish switch. */
  const handleEditQuiz = async (quiz: LearningQuizCard) => {
    try {
      const list = await api.listExercises(quiz.lessonId);
      const found = list.find((exercise) => exercise.id === quiz.id) ?? null;
      if (!found) {
        setError('That quiz no longer exists — refreshing the list.');
        await loadQuizzes();
        return;
      }
      setBuilderExercise({ lessonId: quiz.lessonId, lessonTitle: quiz.lessonTitle, exercise: found });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the quiz.');
    }
  };

  const handleDeleteQuiz = async (quiz: LearningQuizCard) => {
    const risk =
      quiz.submissionCount > 0
        ? `\n\n⚠️ ${quiz.submissionCount} student submission(s) are attached. Deleting this quiz permanently removes that student work.`
        : '';
    if (!confirm(`Delete quiz “${quiz.title}”?${risk}`)) return;
    try {
      await api.deleteExercise(quiz.id);
      setQuizzes((prev) => prev.filter((q) => q.id !== quiz.id));
      setSubmissionsRefreshKey((n) => n + 1);
      await loadOverview();
      flash('Quiz deleted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  const handleQuizPublishToggle = async (quiz: LearningQuizCard) => {
    try {
      await api.setLessonStatus(quiz.lessonId, quiz.lessonStatus === 'published' ? 'unpublish' : 'publish');
      await Promise.all([loadQuizzes(), loadLessons(), loadOverview()]);
      flash(
        quiz.lessonStatus === 'published'
          ? 'Lesson unpublished — students can no longer see this quiz.'
          : 'Lesson published — students can take this quiz now.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status change failed.');
    }
  };

  const quizTerm = quizSearch.trim().toLowerCase();
  const filteredQuizzes = quizzes.filter((quiz) => {
    if (quizStatusFilter !== 'all' && quiz.lessonStatus !== quizStatusFilter) return false;
    if (!quizTerm) return true;
    return (
      quiz.title.toLowerCase().includes(quizTerm) ||
      quiz.lessonTitle.toLowerCase().includes(quizTerm) ||
      quiz.instructions.toLowerCase().includes(quizTerm)
    );
  });
  const quizStats = {
    total: quizzes.length,
    published: quizzes.filter((q) => q.lessonStatus === 'published').length,
    questions: quizzes.reduce((sum, q) => sum + q.questionCount, 0),
    pending: quizzes.reduce((sum, q) => sum + q.pendingCount, 0),
  };

  const hasActiveFilters = searchTerm !== '' || statusFilter !== 'all' || scopeFilter !== 'all';

  const clearFilters = () => {
    setSearchInput('');
    setSearchTerm('');
    setStatusFilter('all');
    setScopeFilter('all');
  };

  const handleEditorSaved = (saved: LearningLessonCard) => {
    setLessons((prev) => {
      const exists = prev.some((l) => l.id === saved.id);
      return exists ? prev.map((l) => (l.id === saved.id ? saved : l)) : [saved, ...prev];
    });
    if (!editingLesson) {
      // A freshly created lesson: open it and load its (empty) detail.
      setEditingLesson(saved);
      setLessonMaterials((prev) => ({ ...prev, [saved.id]: prev[saved.id] ?? [] }));
      setLessonExercises((prev) => ({ ...prev, [saved.id]: prev[saved.id] ?? [] }));
      setExpandedLessonId(saved.id);
    } else {
      loadLessonDetail(saved.id);
    }
  };

  const handlePostAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annBody.trim()) {
      setAnnError('Give the announcement a title and a message.');
      return;
    }
    setAnnSaving(true);
    setAnnError(null);
    try {
      await api.createAnnouncement({ title: annTitle.trim(), body: annBody.trim() });
      setAnnTitle('');
      setAnnBody('');
      const updated = await api.getAnnouncements();
      setAnnouncements(updated);
      flash('Announcement posted.');
    } catch (err) {
      setAnnError(err instanceof Error ? err.message : 'Could not post the announcement.');
    } finally {
      setAnnSaving(false);
    }
  };

  const handleDeleteAnnouncement = async (announcement: AnnouncementDTO) => {
    if (!confirm('Delete this announcement?')) return;
    try {
      await api.deleteAnnouncement(announcement.id);
      setAnnouncements((prev) => prev.filter((a) => a.id !== announcement.id));
    } catch (err) {
      setAnnError(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

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
          教
        </div>
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 backdrop-blur-md px-3.5 py-1.5 rounded-full text-[10px] font-black tracking-wider uppercase border border-emerald-500/20 text-emerald-400">
              <BookOpen className="w-3.5 h-3.5" />
              <span>教师中心 · Teacher Hub</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
              Learning Hub
            </h1>
            <p className="text-slate-400 font-bold text-xs sm:text-sm tracking-wide">
              Create lessons, share materials, build exercises, and review student work.
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
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-4 rounded-2xl text-xs font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-300 font-black uppercase tracking-wider cursor-pointer">Dismiss</button>
        </div>
      )}
      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {success}
        </div>
      )}
      {warning && (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 p-3.5 rounded-2xl text-xs font-semibold flex items-start justify-between gap-3">
          <span className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {warning}
          </span>
          <button
            onClick={() => setWarning(null)}
            className="text-amber-400 hover:text-amber-300 font-black uppercase tracking-wider cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Overview stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <motion.div whileHover={{ y: -4 }} className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-[24px] p-4 sm:p-5 shadow-lg hover:border-emerald-500/30 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <span className="text-[9px] sm:text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Total Lessons</span>
              <span className="text-lg sm:text-xl font-black text-white">{overview?.totalLessons ?? 0}</span>
              <span className="text-[9px] font-bold text-slate-500 ml-1.5">
                ({overview?.publishedLessons ?? 0} published · {overview?.myLessons ?? 0} yours)
              </span>
            </div>
          </div>
        </motion.div>

        <motion.div whileHover={{ y: -4 }} className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-[24px] p-4 sm:p-5 shadow-lg hover:border-blue-500/30 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-500/10 border border-blue-500/20 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <div className="min-w-0">
              <span className="text-[9px] sm:text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Students</span>
              <span className="text-lg sm:text-xl font-black text-white">{overview?.totalStudents ?? 0}</span>
            </div>
          </div>
        </motion.div>

        <motion.div whileHover={{ y: -4 }} className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-[24px] p-4 sm:p-5 shadow-lg hover:border-amber-500/30 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-500/10 border border-amber-500/20 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0">
              <ClipboardList className="w-5 h-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <span className="text-[9px] sm:text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Pending Reviews</span>
              <span className={`text-lg sm:text-xl font-black ${(overview?.pendingSubmissions ?? 0) > 0 ? 'text-amber-400' : 'text-white'}`}>
                {overview?.pendingSubmissions ?? 0}
              </span>
            </div>
          </div>
        </motion.div>

        <motion.div whileHover={{ y: -4 }} className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-[24px] p-4 sm:p-5 shadow-lg hover:border-teal-500/30 transition-all">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-teal-500/10 border border-teal-500/20 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-teal-400" />
            </div>
            <div className="min-w-0">
              <span className="text-[9px] sm:text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Avg. Completion</span>
              <span className="text-lg sm:text-xl font-black text-white">{overview?.averageCompletion ?? 0}%</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-950/60 p-1.5 rounded-2xl gap-1.5 border border-white/5 backdrop-blur-md overflow-x-auto scrollbar-none w-full sm:max-w-max">
        {([
          { key: 'lessons', label: 'Lessons', icon: BookOpen },
          { key: 'quizzes', label: 'Quizzes', icon: Dumbbell },
          { key: 'submissions', label: 'Submissions', icon: ClipboardList },
          { key: 'announcements', label: 'Announcements', icon: Megaphone },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 sm:px-6 py-2.5 font-black text-[10px] sm:text-xs uppercase tracking-widest rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
              tab === key ? 'bg-white/10 text-emerald-400 border border-emerald-500/20 shadow-md' : 'text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {/* LESSONS TAB */}
      {tab === 'lessons' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-white tracking-tight">Lesson Library</h2>
              <p className="text-[11px] font-semibold text-slate-500 mt-1">
                Every lesson on the platform, newest first — publish, unpublish or clean up in bulk.
              </p>
            </div>
            <button
              onClick={() => {
                setEditingLesson(null);
                setEditorOpen(true);
              }}
              className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" /> Create New Lesson
            </button>
          </div>

          {/* Search / filter / bulk toolbar */}
          <div className="bg-slate-900/40 border border-white/10 rounded-[24px] p-3 sm:p-4 backdrop-blur-xl space-y-3">
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search lessons by title or description…"
                  maxLength={80}
                  aria-label="Search lessons"
                  className="w-full bg-slate-950/40 border border-white/10 rounded-2xl py-2.5 pl-10 pr-4 text-sm font-bold text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/80"
                />
              </div>

              <div className="flex items-center gap-1.5 p-1.5 bg-slate-950/50 border border-white/5 rounded-2xl">
                {([
                  { key: 'all', label: 'All' },
                  { key: 'published', label: 'Published' },
                  { key: 'draft', label: 'Draft' },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(key)}
                    className={`px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all whitespace-nowrap ${
                      statusFilter === key
                        ? 'bg-white/10 text-emerald-400 border border-emerald-500/20'
                        : 'text-slate-400 hover:text-white border border-transparent'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5 p-1.5 bg-slate-950/50 border border-white/5 rounded-2xl">
                {([
                  { key: 'all', label: 'Everyone' },
                  { key: 'mine', label: 'Authored by me' },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setScopeFilter(key)}
                    className={`px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all whitespace-nowrap ${
                      scopeFilter === key
                        ? 'bg-white/10 text-emerald-400 border border-emerald-500/20'
                        : 'text-slate-400 hover:text-white border border-transparent'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() =>
                  setSelectedIds(allVisibleSelected ? [] : lessons.map((lesson) => lesson.id))
                }
                disabled={lessons.length === 0}
                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
              >
                {allVisibleSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                {allVisibleSelected ? 'Clear selection' : `Select all ${lessons.length || ''}`.trim()}
              </button>

              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 cursor-pointer flex items-center gap-1.5"
                >
                  <X className="w-3 h-3" /> Clear filters
                </button>
              )}

              {lessonsLoading && <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />}
            </div>

            {selectedIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 bg-emerald-500/[0.06] border border-emerald-500/20 rounded-2xl p-2.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 px-1.5">
                  {selectedIds.length} selected
                </span>
                <button
                  onClick={() => handleBulkStatus('draft')}
                  disabled={bulkBusy}
                  className="bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-300 px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-50 flex items-center gap-1.5 transition-all"
                >
                  {bulkBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <EyeOff className="w-3 h-3" />} Unpublish
                </button>
                <button
                  onClick={() => handleBulkStatus('published')}
                  disabled={bulkBusy}
                  className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-50 flex items-center gap-1.5 transition-all"
                >
                  <Globe className="w-3 h-3" /> Publish
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkBusy}
                  className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-50 flex items-center gap-1.5 transition-all"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
                <button
                  onClick={() => setSelectedIds([])}
                  className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white px-2 cursor-pointer ml-auto"
                >
                  Clear
                </button>
              </div>
            )}
          </div>

          {lessons.length === 0 && hasActiveFilters && (
            <div className="bg-slate-900/40 border border-dashed border-white/10 rounded-3xl py-12 text-center">
              <p className="text-slate-300 font-black text-sm">No lessons match these filters</p>
              <p className="text-slate-500 text-xs font-semibold mt-1.5">
                Try another search term, status or author scope.
              </p>
              <button
                onClick={clearFilters}
                className="mt-5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-300 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer inline-flex items-center gap-2"
              >
                <X className="w-3 h-3" /> Clear filters
              </button>
            </div>
          )}

          {lessons.length === 0 && !hasActiveFilters && (
            <div className="bg-slate-900/40 border border-dashed border-white/10 rounded-[32px] py-16 text-center relative overflow-hidden">
              <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px]" />
              <div className="relative">
                <span className="text-5xl block mb-4">📚</span>
                <p className="text-slate-300 font-black text-base">No lessons yet</p>
                <p className="text-slate-500 text-xs font-semibold mt-1.5 max-w-sm mx-auto leading-relaxed">
                  Create your first lesson, attach PDF/PPT materials, build practice exercises, and publish it to your students.
                </p>
                <button
                  onClick={() => {
                    setEditingLesson(null);
                    setEditorOpen(true);
                  }}
                  className="mt-6 bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer inline-flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  <Plus className="w-4 h-4" /> Create New Lesson
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {lessons.map((lesson) => (
              <div
                key={lesson.id}
                className={`bg-slate-900/50 backdrop-blur-xl border rounded-[28px] overflow-hidden shadow-lg transition-all ${
                  selectedIds.includes(lesson.id)
                    ? 'border-emerald-500/40 ring-1 ring-emerald-500/20'
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                {/* Card head. The select checkbox is a sibling of the expand
                    control — a button cannot be nested inside a button. */}
                <div className="flex items-start gap-3 p-5">
                  <button
                    onClick={() => toggleSelected(lesson.id)}
                    role="checkbox"
                    aria-checked={selectedIds.includes(lesson.id)}
                    aria-label={`Select ${lesson.title}`}
                    title="Select for bulk actions"
                    className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border flex items-center justify-center cursor-pointer transition-all ${
                      selectedIds.includes(lesson.id)
                        ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                        : 'bg-slate-950/40 border-white/20 text-transparent hover:border-emerald-500/50'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3" strokeWidth={3} />
                  </button>

                  <button
                    onClick={() => toggleLesson(lesson.id)}
                    className="flex-1 min-w-0 text-left cursor-pointer"
                    aria-expanded={expandedLessonId === lesson.id}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                            lesson.status === 'published'
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                              : 'bg-slate-500/10 border-slate-500/20 text-slate-400'
                          }`}>
                            {lesson.status === 'published' ? <Globe className="w-2.5 h-2.5" /> : <Edit3 className="w-2.5 h-2.5" />}
                            {lesson.status}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                            lesson.isMine
                              ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300'
                              : 'bg-slate-500/10 border-slate-500/20 text-slate-400'
                          }`}>
                            {lesson.isMine ? 'Authored by you' : `By ${lesson.authorName}`}
                          </span>
                          {lesson.pendingCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border bg-amber-500/10 border-amber-500/20 text-amber-400">
                              <ClipboardList className="w-2.5 h-2.5" /> {lesson.pendingCount} to review
                            </span>
                          )}
                          <span className="text-[9px] font-bold text-slate-500">updated {timeAgo(lesson.updatedAt)}</span>
                        </div>
                        <h3 className="text-sm sm:text-base font-black text-white truncate">{lesson.title}</h3>
                        <p className="text-[11px] text-slate-400 font-semibold line-clamp-2 mt-0.5">{lesson.description || 'No description.'}</p>
                      </div>
                      {expandedLessonId === lesson.id ? <ChevronUp className="w-4 h-4 text-slate-500 shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 mt-1" />}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-[10px] font-bold text-slate-400">
                      <span className="flex items-center gap-1.5"><FileText className="w-3 h-3 text-emerald-500" /> {lesson.materialCount} materials</span>
                      <span className="flex items-center gap-1.5"><Dumbbell className="w-3 h-3 text-indigo-400" /> {lesson.exerciseCount} exercises</span>
                      <span className="flex items-center gap-1.5"><Users className="w-3 h-3 text-blue-400" /> {lesson.studentCount} students</span>
                      <span className="flex items-center gap-1.5"><ClipboardList className="w-3 h-3 text-amber-400" /> {lesson.submissionCount} submissions</span>
                    </div>
                  </button>
                </div>

                {/* Expanded detail */}
                {expandedLessonId === lesson.id && (
                  <div className="px-5 pb-5 border-t border-white/5 pt-4 space-y-4">
                    {detailLoading && <Loader2 className="w-5 h-5 text-emerald-500 animate-spin mx-auto" />}

                    {/* Materials */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Materials</p>
                        <button
                          onClick={() => {
                            setEditingLesson(lesson);
                            setEditorOpen(true);
                          }}
                          className="text-[9px] font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 cursor-pointer flex items-center gap-1"
                        >
                          <Upload className="w-3 h-3" /> Manage
                        </button>
                      </div>
                      {(lessonMaterials[lesson.id]?.length ?? 0) === 0 ? (
                        <p className="text-[10px] text-slate-500 font-semibold bg-slate-950/40 border border-dashed border-white/10 rounded-xl px-3 py-2.5">
                          No materials attached yet.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {lessonMaterials[lesson.id]!.map((material) => (
                            <div key={material.id} className="flex items-center gap-2 bg-slate-950/40 border border-white/5 rounded-xl px-3 py-2">
                              <MaterialIcon kind={material.kind} />
                              <span className="text-[11px] font-bold text-slate-200 truncate flex-1">{material.originalName}</span>
                              <span className="text-[9px] font-bold text-slate-500 shrink-0">{formatBytes(material.size)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Exercises */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Exercises</p>
                        <button
                          onClick={() => setBuilderExercise({ lessonId: lesson.id, lessonTitle: lesson.title, exercise: null })}
                          className="text-[9px] font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 cursor-pointer flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> New
                        </button>
                      </div>
                      {(lessonExercises[lesson.id]?.length ?? 0) === 0 ? (
                        <p className="text-[10px] text-slate-500 font-semibold bg-slate-950/40 border border-dashed border-white/10 rounded-xl px-3 py-2.5">
                          No exercises yet. Create one manually or generate a draft with AI.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {lessonExercises[lesson.id]!.map((exercise) => (
                            <div key={exercise.id} className="bg-slate-950/40 border border-white/5 rounded-xl px-3 py-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-bold text-slate-200 truncate">{exercise.title}</span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={() => setBuilderExercise({ lessonId: lesson.id, lessonTitle: lesson.title, exercise })}
                                    className="p-1.5 text-slate-400 hover:text-emerald-400 cursor-pointer"
                                    title="Edit exercise"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (!confirm(`Delete exercise “${exercise.title}”? Student submissions for it will also be removed.`)) return;
                                      try {
                                        await api.deleteExercise(exercise.id);
                                        setLessonExercises((prev) => ({
                                          ...prev,
                                          [lesson.id]: (prev[lesson.id] ?? []).filter((e) => e.id !== exercise.id),
                                        }));
                                        flash('Exercise deleted.');
                                      } catch (err) {
                                        setError(err instanceof Error ? err.message : 'Delete failed.');
                                      }
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-rose-400 cursor-pointer"
                                    title="Delete exercise"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                {exercise.questions.slice(0, 4).map((q: ExerciseQuestionDTO, index: number) => (
                                  <QuestionTypeChip key={`${q.id}-${index}`} type={q.type} />
                                ))}
                                {exercise.questions.length > 4 && (
                                  <span className="text-[8px] font-black text-slate-500 uppercase">+{exercise.questions.length - 4} more</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Row actions */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        onClick={() => handlePublishToggle(lesson)}
                        className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer flex items-center gap-2 transition-all border ${
                          lesson.status === 'published'
                            ? 'bg-slate-500/10 border-slate-500/20 text-slate-300 hover:bg-slate-500/20'
                            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                        }`}
                      >
                        <Send className="w-3.5 h-3.5" />
                        {lesson.status === 'published' ? 'Unpublish' : 'Publish'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingLesson(lesson);
                          setEditorOpen(true);
                        }}
                        className="bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-300 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer flex items-center gap-2 transition-all"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => handleDeleteLesson(lesson)}
                        className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer flex items-center gap-2 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* QUIZZES TAB */}
      {tab === 'quizzes' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-white tracking-tight">Quiz Management</h2>
              <p className="text-[11px] font-semibold text-slate-500 mt-1">
                Every quiz across all lessons. Publishing a quiz means publishing the lesson it lives in — that is
                what reveals it to students.
              </p>
            </div>
            <div className="relative shrink-0">
              <button
                onClick={openQuizLessonPicker}
                className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" /> Create Quiz
              </button>

              {quizLessonPickerOpen && (
                <div className="absolute right-0 mt-2 w-80 max-w-[85vw] bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl p-3 z-30">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Add a quiz to which lesson?
                    </p>
                    <button
                      onClick={() => setQuizLessonPickerOpen(false)}
                      className="text-slate-500 hover:text-white cursor-pointer"
                      aria-label="Close lesson picker"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto space-y-1.5">
                    {quizLessonOptions.length === 0 ? (
                      <p className="text-[11px] font-semibold text-slate-500 px-1 py-2">
                        No lessons yet — create a lesson first, then add quizzes to it.
                      </p>
                    ) : (
                      quizLessonOptions.map((lesson) => (
                        <button
                          key={lesson.id}
                          onClick={() => {
                            setBuilderExercise({ lessonId: lesson.id, lessonTitle: lesson.title, exercise: null });
                            setQuizLessonPickerOpen(false);
                          }}
                          className="w-full text-left bg-slate-950/40 hover:bg-white/[0.06] border border-white/5 hover:border-emerald-500/30 rounded-xl px-3 py-2.5 cursor-pointer transition-all"
                        >
                          <span className="text-[11px] font-black text-slate-200 block truncate">{lesson.title}</span>
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                            {lesson.status} • {lesson.exerciseCount} quiz{lesson.exerciseCount === 1 ? '' : 'zes'}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quiz stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Quizzes', value: quizStats.total },
              { label: 'Live to Students', value: quizStats.published },
              { label: 'Questions', value: quizStats.questions },
              { label: 'To Review', value: quizStats.pending },
            ].map((stat) => (
              <div key={stat.label} className="bg-slate-900/40 border border-white/10 rounded-2xl p-3.5 backdrop-blur-xl">
                <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block">{stat.label}</span>
                <span className={`text-lg font-black ${stat.label === 'To Review' && stat.value > 0 ? 'text-amber-400' : 'text-white'}`}>
                  {stat.value}
                </span>
              </div>
            ))}
          </div>

          {/* Search + filter */}
          <div className="bg-slate-900/40 border border-white/10 rounded-[24px] p-3 sm:p-4 backdrop-blur-xl flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                value={quizSearch}
                onChange={(e) => setQuizSearch(e.target.value)}
                placeholder="Search quizzes by title, lesson or instructions…"
                maxLength={80}
                aria-label="Search quizzes"
                className="w-full bg-slate-950/40 border border-white/10 rounded-2xl py-2.5 pl-10 pr-4 text-sm font-bold text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/80"
              />
            </div>
            <div className="flex items-center gap-1.5 p-1.5 bg-slate-950/50 border border-white/5 rounded-2xl">
              {([
                { key: 'all', label: 'All' },
                { key: 'published', label: 'Live' },
                { key: 'draft', label: 'Draft' },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setQuizStatusFilter(key)}
                  className={`px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all whitespace-nowrap ${
                    quizStatusFilter === key
                      ? 'bg-white/10 text-emerald-400 border border-emerald-500/20'
                      : 'text-slate-400 hover:text-white border border-transparent'
                  }`}
                >
                  {label}
                </button>
              ))}
              {quizzesLoading && <Loader2 className="w-4 h-4 text-emerald-500 animate-spin ml-1" />}
            </div>
          </div>

          {filteredQuizzes.length === 0 && (
            <div className="bg-slate-900/40 border border-dashed border-white/10 rounded-[32px] py-14 text-center relative overflow-hidden">
              <span className="text-5xl block mb-4">🧩</span>
              <p className="text-slate-300 font-black text-base">
                {quizzes.length === 0 ? 'No quizzes yet' : 'No quizzes match these filters'}
              </p>
              <p className="text-slate-500 text-xs font-semibold mt-1.5 max-w-sm mx-auto leading-relaxed">
                {quizzes.length === 0
                  ? 'Create a quiz, add multiple-choice, fill-in-the-blank or short-answer questions, then publish its lesson so students can take it.'
                  : 'Try another search term or status.'}
              </p>
              {quizzes.length === 0 && (
                <button
                  onClick={openQuizLessonPicker}
                  className="mt-6 bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer inline-flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  <Plus className="w-4 h-4" /> Create Quiz
                </button>
              )}
            </div>
          )}

          <div className="space-y-3">
            {filteredQuizzes.map((quiz) => (
              <div
                key={quiz.id}
                className="bg-slate-900/50 backdrop-blur-xl border border-white/10 hover:border-white/20 rounded-[24px] p-4 sm:p-5 shadow-lg transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                        quiz.lessonStatus === 'published'
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                          : 'bg-slate-500/10 border-slate-500/20 text-slate-400'
                      }`}>
                        {quiz.lessonStatus === 'published' ? <Globe className="w-2.5 h-2.5" /> : <Edit3 className="w-2.5 h-2.5" />}
                        {quiz.lessonStatus === 'published' ? 'Live' : 'Draft'}
                      </span>
                      {quiz.pendingCount > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border bg-amber-500/10 border-amber-500/20 text-amber-400">
                          <ClipboardList className="w-2.5 h-2.5" /> {quiz.pendingCount} to review
                        </span>
                      )}
                      <span className="text-[9px] font-bold text-slate-500">updated {timeAgo(quiz.updatedAt)}</span>
                    </div>
                    <h3 className="text-sm sm:text-base font-black text-white truncate">{quiz.title}</h3>
                    <p className="text-[11px] font-semibold text-slate-400 mt-0.5 truncate">
                      <BookOpen className="w-3 h-3 inline -mt-0.5 mr-1 text-slate-500" />
                      {quiz.lessonTitle}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-[10px] font-bold text-slate-400 mt-3">
                  <span className="flex items-center gap-1.5"><Dumbbell className="w-3 h-3 text-indigo-400" /> {quiz.questionCount} questions</span>
                  <span className="flex items-center gap-1.5"><TrendingUp className="w-3 h-3 text-teal-400" /> {quiz.totalPoints} points</span>
                  <span className="flex items-center gap-1.5"><Users className="w-3 h-3 text-blue-400" /> {quiz.submissionCount} submissions</span>
                </div>

                <div className="flex flex-wrap gap-2 mt-4">
                  <button
                    onClick={() => handleQuizPublishToggle(quiz)}
                    className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer flex items-center gap-2 transition-all border ${
                      quiz.lessonStatus === 'published'
                        ? 'bg-slate-500/10 border-slate-500/20 text-slate-300 hover:bg-slate-500/20'
                        : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                    }`}
                  >
                    {quiz.lessonStatus === 'published' ? <EyeOff className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                    {quiz.lessonStatus === 'published' ? 'Unpublish lesson' : 'Publish lesson'}
                  </button>
                  <button
                    onClick={() => handleEditQuiz(quiz)}
                    className="bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-300 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer flex items-center gap-2 transition-all"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit questions
                  </button>
                  <button
                    onClick={() => handleDeleteQuiz(quiz)}
                    className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-300 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer flex items-center gap-2 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUBMISSIONS TAB */}
      {tab === 'submissions' && (
        <SubmissionCenter refreshKey={submissionsRefreshKey} />
      )}

      {/* ANNOUNCEMENTS TAB */}
      {tab === 'announcements' && (
        <div className="space-y-4">
          <h2 className="text-lg font-black text-white tracking-tight">📣 Announcements</h2>
          <form onSubmit={handlePostAnnouncement} className="bg-slate-900/60 border border-white/10 rounded-3xl p-5 backdrop-blur-xl space-y-3">
            {annError && (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-3 rounded-2xl text-xs font-semibold">
                {annError}
              </div>
            )}
            <input
              value={annTitle}
              onChange={(e) => setAnnTitle(e.target.value)}
              placeholder="Announcement title — e.g. Midterm review session on Friday"
              maxLength={160}
              className="w-full bg-slate-950/40 border border-white/10 rounded-2xl py-3 px-4 text-sm font-bold text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/80"
            />
            <textarea
              value={annBody}
              onChange={(e) => setAnnBody(e.target.value)}
              placeholder="Write the announcement for your students…"
              rows={3}
              maxLength={2000}
              className="w-full bg-slate-950/40 border border-white/10 rounded-2xl py-3 px-4 text-sm font-semibold text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/80 resize-none"
            />
            <button
              type="submit"
              disabled={annSaving}
              className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
            >
              {annSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />} Post Announcement
            </button>
          </form>

          {announcements.length === 0 ? (
            <div className="bg-slate-900/40 border border-dashed border-white/10 rounded-3xl py-12 text-center">
              <p className="text-slate-500 font-bold text-sm">No announcements yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {announcements.map((announcement) => (
                <div key={announcement.id} className="bg-slate-900/50 border border-white/10 rounded-3xl p-5 backdrop-blur-xl">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-white">{announcement.title}</p>
                      <p className="text-xs text-slate-400 font-semibold mt-1 leading-relaxed whitespace-pre-wrap">{announcement.body}</p>
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-2">{timeAgo(announcement.createdAt)}</p>
                    </div>
                    {announcement.teacherId === user.studentId && (
                      <button
                        onClick={() => handleDeleteAnnouncement(announcement)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 cursor-pointer shrink-0"
                        aria-label="Delete announcement"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {editorOpen && (
          <LessonEditor
            lesson={editingLesson}
            onClose={() => {
              setEditorOpen(false);
              setEditingLesson(null);
              loadAll();
            }}
            onSaved={handleEditorSaved}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {builderExercise && (
          <ExerciseBuilder
            lessonId={builderExercise.lessonId}
            lessonTitle={builderExercise.lessonTitle}
            exercise={builderExercise.exercise}
            onClose={() => setBuilderExercise(null)}
            onSaved={() => {
              setBuilderExercise(null);
              if (expandedLessonId) loadLessonDetail(expandedLessonId);
              loadAll();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
