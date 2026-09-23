import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, Minimize, Download, FileText, AlertTriangle, Loader2,
} from 'lucide-react';
import Overlay from '../ui/Overlay';
import type { LearningMaterial } from './learningTypes';
import { api } from '../../lib/api';

// The worker is bundled by Vite as its own chunk (self-hosted, CSP-friendly —
// no CDN, matching the app's 'self'-only connect-src policy).
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

// cMaps/standard fonts are copied to public/pdfjs at install time so
// non-Latin-1 PDFs (i.e. Chinese courseware) render correctly, same-origin.
const CMAP_URL = '/pdfjs/cmaps/';
const STANDARD_FONTS_URL = '/pdfjs/standard_fonts/';

interface DocumentViewerProps {
  material: LearningMaterial;
  onClose: () => void;
}

type ViewerState = 'loading' | 'ready' | 'error' | 'unsupported';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * In-app document reader.
 *
 * PDF: rendered page-by-page with pdf.js onto a canvas — page navigation,
 * zoom, fullscreen, and download all work inside the app; the browser never
 * leaves the page and the authenticated download URL is never exposed as a
 * raw link (the file is fetched with the Bearer token into a blob).
 *
 * PPT/PPTX/DOC/DOCX: browsers cannot render these natively and the current
 * deployment target (free-tier ephemeral hosting, no LibreOffice) cannot
 * convert them server-side — so instead of pretending, this shows a graceful
 * fallback card with file metadata and a Download Original action.
 */
export default function DocumentViewer({ material, onClose }: DocumentViewerProps) {
  const isPdf = material.kind === 'pdf';

  const [state, setState] = useState<ViewerState>(isPdf ? 'loading' : 'unsupported');
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [fullscreen, setFullscreen] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<ReturnType<pdfjsLib.PDFPageProxy['render']> | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  // Fetch the file with the auth header and hand the raw bytes to pdf.js.
  //
  // Deliberately NOT a blob URL + getDocument({url}): pdf.js loads `url`
  // sources from its worker, and the app's Helmet CSP locks connect-src to
  // 'self' — the worker's fetch of a blob: URL is blocked, which surfaces as
  // the infamous "Unexpected server response (0) while retrieving PDF".
  // Reading the bytes on the main thread and passing { data } needs no blob
  // URL and no CSP exception, while still never exposing an unauthenticated
  // link (a raw <iframe src> can't carry the Authorization header).
  useEffect(() => {
    if (!isPdf) return;
    let cancelled = false;

    (async () => {
      try {
        const token = api.getToken();
        const res = await fetch(`/api/learning/materials/${material.id}/preview`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || `Could not load the document (${res.status}).`);
        }
        const data = new Uint8Array(await res.arrayBuffer());
        if (cancelled) return;
        const doc = await pdfjsLib.getDocument({
          data,
          cMapUrl: CMAP_URL,
          cMapPacked: true,
          standardFontDataUrl: STANDARD_FONTS_URL,
        }).promise;
        if (cancelled) {
          doc.destroy();
          return;
        }
        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setPage(1);
        setState('ready');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load the document.');
          setState('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      pdfDocRef.current?.destroy();
      pdfDocRef.current = null;
    };
  }, [isPdf, material.id]);

  // Render the current page. Re-runs on page/scale changes; a cancelled
  // render is superseded by the next one rather than corrupting the canvas.
  const renderPage = useCallback(async () => {
    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;
    renderTaskRef.current?.cancel();
    try {
      const pdfPage = await doc.getPage(page);
      const dpr = window.devicePixelRatio || 1;
      // Cap effective width so huge slides fit the viewport without a
      // horizontal scrollbar; the zoom control multiplies on top.
      const maxViewportWidth = Math.min(window.innerWidth - 48, 920);
      const base = pdfPage.getViewport({ scale: 1 });
      const fit = Math.min(1.6, maxViewportWidth / base.width);
      const viewport = pdfPage.getViewport({ scale: scale * fit * dpr });
      const context = canvas.getContext('2d');
      if (!context) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;
      const task = pdfPage.render({ canvasContext: context, viewport });
      renderTaskRef.current = task;
      await task.promise;
    } catch (err) {
      // RenderingException from cancel() — expected when superseded.
      if (!(err instanceof Error && err.name === 'RenderingCancelledException')) {
        console.warn('PDF render failed:', err);
      }
    }
  }, [page, scale]);

  useEffect(() => {
    if (state === 'ready') {
      renderPage();
    }
  }, [state, renderPage]);

  // Fullscreen the whole dialog (toolbar included) so page navigation stays
  // available in fullscreen mode.
  const goFullscreen = () => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (el.requestFullscreen) {
      el.requestFullscreen();
    }
  };

  useEffect(() => {
    const onFsChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    // Escape closes the viewer in every state (unless the browser itself is
    // consuming Escape to exit fullscreen — that case already exits FS and
    // leaves the viewer open, which is the expected behavior).
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const download = () => {
    // Trigger an authenticated download without exposing a raw link.
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
      .catch((err) => setError(err instanceof Error ? err.message : 'Download failed.'));
  };

  // Rendered through <Overlay>, which portals to <body>. The app shell stacks
  // <main> as a `relative z-10` context and the header as `sticky z-40`; a
  // fixed overlay rendered inside <main> would be trapped under both (header
  // and footer paint over the toolbar). The overlay escapes that stacking
  // context and covers the entire viewport. z-[60] keeps the viewer above the
  // lesson editor / builder it is opened from (both z-50).
  return (
    <Overlay
      ref={rootRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-slate-950/95 backdrop-blur-xl flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={`Document viewer: ${material.originalName}`}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 px-3 sm:px-5 py-3 border-b border-white/10 bg-slate-950/80 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Always-visible back control — works in every viewer state
              (loading / ready / error / unsupported) so the user can never
              get stuck inside the overlay. Escape also closes it. */}
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-xl px-2.5 sm:px-3 py-2.5 text-slate-300 hover:text-white cursor-pointer shrink-0 transition-all"
            aria-label="Back to lesson"
            title="Back (Esc)"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest">Back</span>
          </button>
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-black text-white truncate">{material.originalName}</p>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
              {material.kind.toUpperCase()} • {formatBytes(material.size)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {state === 'ready' && (
            <>
              <div className="hidden sm:flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-xl px-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[10px] font-black text-slate-300 tabular-nums px-1">
                  {page} / {numPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(numPages, p + 1))}
                  disabled={page >= numPages}
                  className="p-2 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="hidden sm:flex items-center gap-1 bg-white/[0.04] border border-white/10 rounded-xl px-1">
                <button
                  onClick={() => setScale((s) => Math.max(0.6, Math.round((s - 0.2) * 10) / 10))}
                  className="p-2 text-slate-300 hover:text-white cursor-pointer"
                  aria-label="Zoom out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-[10px] font-black text-slate-300 tabular-nums px-1">{Math.round(scale * 100)}%</span>
                <button
                  onClick={() => setScale((s) => Math.min(3, Math.round((s + 0.2) * 10) / 10))}
                  className="p-2 text-slate-300 hover:text-white cursor-pointer"
                  aria-label="Zoom in"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={goFullscreen}
                className="p-2.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-xl text-slate-300 hover:text-white cursor-pointer"
                aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {fullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </>
          )}

          <button
            onClick={download}
            className="p-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl text-emerald-400 cursor-pointer"
            aria-label="Download original file"
            title="Download Original"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            onClick={onClose}
            className="p-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl text-rose-300 cursor-pointer"
            aria-label="Close viewer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-[#0a0f1d] relative">
        {state === 'loading' && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 font-bold text-xs uppercase tracking-widest animate-pulse">Loading document…</p>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-rose-400" />
            </div>
            <p className="text-rose-300 font-bold text-sm">{error}</p>
            <button
              onClick={download}
              className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer"
            >
              Download Instead
            </button>
          </div>
        )}

        {state === 'unsupported' && (
          <div className="flex flex-col items-center justify-center h-full gap-5 px-6 text-center max-w-md mx-auto">
            <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-3xl">
              📊
            </div>
            <div className="space-y-2">
              <h3 className="text-white font-black text-lg">In-app preview not available</h3>
              <p className="text-slate-400 text-xs font-semibold leading-relaxed">
                {material.kind.toUpperCase()} files can't be rendered inside the browser, and this
                deployment environment has no document-conversion service. The original file is
                always available — download it to view in PowerPoint or Word.
              </p>
            </div>
            <div className="bg-slate-900/60 border border-white/10 rounded-2xl px-5 py-3 text-left w-full">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">File</p>
              <p className="text-xs font-bold text-white truncate">{material.originalName}</p>
              <p className="text-[10px] text-slate-500 font-bold mt-0.5">
                {material.kind.toUpperCase()} • {formatBytes(material.size)}
              </p>
            </div>
            <button
              onClick={download}
              className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer shadow-lg shadow-emerald-500/20 flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download Original
            </button>
          </div>
        )}

        {state === 'ready' && (
          <div className="min-h-full flex items-start justify-center p-4 sm:p-6">
            <canvas
              ref={canvasRef}
              className="rounded-lg shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] max-w-full"
              aria-label={`PDF page ${page} of ${numPages}`}
            />
          </div>
        )}
      </div>

      {/* Mobile page navigation */}
      {state === 'ready' && numPages > 1 && (
        <div className="sm:hidden flex items-center justify-center gap-3 py-2.5 border-t border-white/10 bg-slate-950/80 shrink-0">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-2 bg-white/[0.04] border border-white/10 rounded-xl text-slate-300 disabled:opacity-30 cursor-pointer"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[10px] font-black text-slate-300 tabular-nums">
            {page} / {numPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(numPages, p + 1))}
            disabled={page >= numPages}
            className="p-2 bg-white/[0.04] border border-white/10 rounded-xl text-slate-300 disabled:opacity-30 cursor-pointer"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </Overlay>
  );
}
