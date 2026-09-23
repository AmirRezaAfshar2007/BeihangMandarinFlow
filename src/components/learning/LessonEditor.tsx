import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X, UploadCloud, FileText, Trash2, Download, Eye, Loader2, CheckCircle2,
  AlertTriangle, Plus, BookOpen, Presentation, File as FileIcon, CloudUpload,
} from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import Overlay from '../ui/Overlay';
import { api } from '../../lib/api';
import DocumentViewer from './DocumentViewer';
import type { LearningMaterial, LearningLessonCard } from './learningTypes';

/* ------------------------------------------------------------------ */
/* File helpers                                                        */
/* ------------------------------------------------------------------ */

// Must mirror ALLOWED_MATERIAL_TYPES in src/services/storage.service.ts.
const ACCEPTED_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const MAX_SIZE_BYTES = 15 * 1024 * 1024;

function getExtension(name: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(name);
  return match ? match[1].toLowerCase() : '';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function materialIcon(kind: string) {
  if (kind === 'pdf') return FileText;
  if (kind === 'ppt' || kind === 'pptx') return Presentation;
  return FileIcon;
}

interface UploadItem {
  localId: string;
  name: string;
  size: number;
  kind: string;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

interface LessonEditorProps {
  /** Existing lesson to edit, or null to create a new one. */
  lesson: LearningLessonCard | null;
  onClose: () => void;
  /** Called after any change the teacher hub should re-render for. */
  onSaved: (lesson: LearningLessonCard) => void;
}

/**
 * Lesson creation/editing + material management.
 * Frontend validation mirrors the backend rules exactly, but the backend
 * re-validates everything (extension, MIME, magic bytes, size) — the checks
 * here exist only to fail fast with a nicer message.
 */
export default function LessonEditor({ lesson, onClose, onSaved }: LessonEditorProps) {
  const [title, setTitle] = useState(lesson?.title ?? '');
  const [description, setDescription] = useState(lesson?.description ?? '');
  const [savingMeta, setSavingMeta] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaSuccess, setMetaSuccess] = useState<string | null>(null);

  const [materials, setMaterials] = useState<LearningMaterial[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsError, setMaterialsError] = useState<string | null>(null);

  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [viewingMaterial, setViewingMaterial] = useState<LearningMaterial | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  let uploadCounter = 0;

  const lessonId = lesson?.id ?? null;
  const isCreate = lesson === null;

  const loadMaterials = useCallback(async () => {
    if (!lessonId) return;
    setMaterialsLoading(true);
    setMaterialsError(null);
    try {
      setMaterials(await api.listMaterials(lessonId));
    } catch (err) {
      setMaterialsError(err instanceof Error ? err.message : 'Could not load materials.');
    } finally {
      setMaterialsLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    if (!isCreate) {
      loadMaterials();
    }
  }, [isCreate, loadMaterials]);

  /* ---------------------------------------------------------------- */
  /* Meta save (create or update)                                      */
  /* ---------------------------------------------------------------- */

  const handleSaveMeta = async (): Promise<LearningLessonCard | null> => {
    if (!title.trim()) {
      setMetaError('Give the lesson a title, e.g. “HSK 2 — Lesson 05”.');
      return null;
    }
    setSavingMeta(true);
    setMetaError(null);
    try {
      const saved = lesson
        ? await api.updateLesson(lesson.id, { title: title.trim(), description: description.trim() })
        : await api.createLesson({ title: title.trim(), description: description.trim() });
      setMetaSuccess(lesson ? 'Lesson updated.' : 'Lesson created — you can now attach materials.');
      setTimeout(() => setMetaSuccess(null), 4000);
      onSaved(saved);
      return saved;
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : 'Saving failed.');
      return null;
    } finally {
      setSavingMeta(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Uploads                                                           */
  /* ---------------------------------------------------------------- */

  const validateFile = (file: File): string | null => {
    const ext = getExtension(file.name);
    if (!ext || !ACCEPTED_MIME[ext]) {
      return `“${file.name}”: .${ext || '?'} files are not supported. Use PDF, PPT, PPTX, DOC or DOCX.`;
    }
    if (file.size > MAX_SIZE_BYTES) {
      return `“${file.name}” is ${formatBytes(file.size)} — the limit is 15 MB.`;
    }
    if (file.size === 0) {
      return `“${file.name}” is empty.`;
    }
    return null;
  };

  const startUpload = (file: File) => {
    if (!lessonId) {
      setMetaError('Save the lesson first, then attach materials.');
      return;
    }
    const validationError = validateFile(file);
    const localId = `up-${Date.now()}-${(uploadCounter += 1)}`;
    if (validationError) {
      setUploads((prev) => [
        ...prev,
        { localId, name: file.name, size: file.size, kind: getExtension(file.name), progress: 0, status: 'error', error: validationError },
      ]);
      return;
    }
    setUploads((prev) => [
      ...prev,
      { localId, name: file.name, size: file.size, kind: getExtension(file.name), progress: 0, status: 'uploading' },
    ]);
    api
      .uploadMaterial(lessonId, file, (percent) => {
        setUploads((prev) => prev.map((u) => (u.localId === localId ? { ...u, progress: percent } : u)));
      })
      .then((material) => {
        setUploads((prev) => prev.map((u) => (u.localId === localId ? { ...u, progress: 100, status: 'done' } : u)));
        setMaterials((prev) => [...prev, material]);
      })
      .catch((err) => {
        setUploads((prev) =>
          prev.map((u) => (u.localId === localId ? { ...u, status: 'error', error: err instanceof Error ? err.message : 'Upload failed.' } : u))
        );
      });
  };

  const handleFilesPicked = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(startUpload);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteMaterial = async (material: LearningMaterial) => {
    if (!confirm(`Remove “${material.originalName}” from this lesson? Students will no longer see it.`)) return;
    try {
      await api.deleteMaterial(material.id);
      setMaterials((prev) => prev.filter((m) => m.id !== material.id));
    } catch (err) {
      setMaterialsError(err instanceof Error ? err.message : 'Could not remove the material.');
    }
  };

  return (
    <Overlay
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] bg-slate-950/95 backdrop-blur-xl overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Lesson editor"
    >
      <div className="max-w-3xl mx-auto p-4 sm:p-6 pb-16">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">Learning Hub</p>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              {isCreate ? '📚 Create New Lesson' : '✏️ Edit Lesson'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-xl text-slate-300 hover:text-white cursor-pointer shrink-0"
            aria-label="Close editor"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {metaError && (
          <div className="mb-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 p-3.5 rounded-2xl text-xs font-semibold flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {metaError}
          </div>
        )}
        {metaSuccess && (
          <div className="mb-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3.5 rounded-2xl text-xs font-semibold flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> {metaSuccess}
          </div>
        )}

        {/* Lesson meta */}
        <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-5 sm:p-6 space-y-4 mb-6 backdrop-blur-xl">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Lesson Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="HSK 2 — Lesson 05"
              maxLength={160}
              className="w-full bg-slate-950/40 border border-white/10 rounded-2xl py-3 px-4 text-sm font-bold text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/80 transition-all shadow-inner"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Learn how to use 把 sentences in everyday Chinese."
              rows={3}
              maxLength={1200}
              className="w-full bg-slate-950/40 border border-white/10 rounded-2xl py-3 px-4 text-sm font-semibold text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/80 transition-all shadow-inner resize-none"
            />
          </div>
          <button
            onClick={handleSaveMeta}
            disabled={savingMeta}
            className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
          >
            {savingMeta ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
            {isCreate ? 'Create Lesson' : 'Save Changes'}
          </button>
        </div>

        {/* Materials */}
        {!isCreate && (
          <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-5 sm:p-6 backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-white uppercase tracking-widest">📚 Learning Materials</h3>
              <span className="text-[10px] font-bold text-slate-500">{materials.length} file{materials.length === 1 ? '' : 's'}</span>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                handleFilesPicked(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-3xl p-6 sm:p-8 text-center cursor-pointer transition-all mb-5 ${
                dragActive ? 'border-emerald-400/60 bg-emerald-500/5' : 'border-white/10 hover:border-emerald-500/30 hover:bg-white/[0.02]'
              }`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
              }}
              aria-label="Upload materials"
            >
              <CloudUpload className={`w-8 h-8 mx-auto mb-2 ${dragActive ? 'text-emerald-400' : 'text-slate-500'}`} />
              <p className="text-xs font-black text-slate-300 uppercase tracking-widest">Drop files or click to upload</p>
              <p className="text-[10px] font-semibold text-slate-500 mt-1">
                PDF · PPT · PPTX · DOC · DOCX — up to 15 MB each
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={Object.values(ACCEPTED_MIME).join(',')}
                className="hidden"
                onChange={(e) => handleFilesPicked(e.target.files)}
              />
            </div>

            {materialsError && (
              <div className="mb-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 p-3 rounded-2xl text-xs font-semibold">
                {materialsError}
              </div>
            )}

            {/* Active uploads */}
            <AnimatePresence>
              {uploads.map((upload) => (
                <div key={upload.localId} className="mb-3 bg-slate-950/40 border border-white/10 rounded-2xl p-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0">
                      {upload.status === 'done' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : upload.status === 'error' ? (
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                      ) : (
                        <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-xs font-bold text-white truncate">{upload.name}</p>
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 shrink-0">
                          {upload.status === 'uploading' ? `${upload.progress}%` : formatBytes(upload.size)}
                        </span>
                      </div>
                      {upload.status === 'uploading' && (
                        <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden border border-white/5">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                            style={{ width: `${upload.progress}%` }}
                          />
                        </div>
                      )}
                      {upload.status === 'error' && <p className="text-[10px] text-rose-300 font-semibold">{upload.error}</p>}
                      {upload.status === 'done' && <p className="text-[10px] text-emerald-400 font-semibold">Uploaded successfully.</p>}
                    </div>
                    <button
                      onClick={() => setUploads((prev) => prev.filter((u) => u.localId !== upload.localId))}
                      className="p-1.5 text-slate-500 hover:text-white cursor-pointer shrink-0"
                      aria-label="Dismiss upload entry"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </AnimatePresence>

            {/* Material list */}
            {materialsLoading ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
              </div>
            ) : materials.length === 0 && uploads.every((u) => u.status !== 'done') ? (
              <div className="py-8 text-center border border-dashed border-white/10 rounded-2xl">
                <p className="text-slate-500 font-bold text-xs">No materials yet.</p>
                <p className="text-slate-600 text-[10px] font-semibold mt-1">Upload a PDF or PPTX above — students will see it here.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {materials.map((material) => {
                  const Icon = materialIcon(material.kind);
                  return (
                    <div
                      key={material.id}
                      className="flex items-center gap-3 bg-slate-950/40 border border-white/10 rounded-2xl p-3.5 hover:border-white/20 transition-all"
                    >
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                        <Icon className="w-4.5 h-4.5 text-emerald-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white truncate">{material.originalName}</p>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                          {material.kind.toUpperCase()} • {formatBytes(material.size)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setViewingMaterial(material)}
                          className="p-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-xl text-slate-300 hover:text-white cursor-pointer"
                          title="Preview"
                          aria-label={`Preview ${material.originalName}`}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <a
                          href={`/api/learning/materials/${material.id}/download`}
                          className="p-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-xl text-slate-300 hover:text-white cursor-pointer"
                          title="Download"
                          aria-label={`Download ${material.originalName}`}
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => handleDeleteMaterial(material)}
                          className="p-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl text-rose-300 cursor-pointer"
                          title="Remove"
                          aria-label={`Remove ${material.originalName}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {isCreate && (
          <div className="bg-indigo-500/[0.06] border border-indigo-500/20 rounded-3xl p-5 flex items-start gap-3">
            <Plus className="w-5 h-5 text-indigo-300 shrink-0 mt-0.5" />
            <p className="text-xs font-semibold text-indigo-200/80 leading-relaxed">
              After creating the lesson you'll be able to attach materials (PDF/PPT/PPTX/DOC/DOCX), build
              exercises, and publish it to your students.
            </p>
          </div>
        )}
      </div>

      {/* In-app document viewer */}
      <AnimatePresence>
        {viewingMaterial && (
          <DocumentViewer material={viewingMaterial} onClose={() => setViewingMaterial(null)} />
        )}
      </AnimatePresence>
    </Overlay>
  );
}
