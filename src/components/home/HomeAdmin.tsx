import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { HomeFeedbackStats } from './homeTypes';
import { AlertTriangle, Heart, Loader2, RefreshCw, ThumbsDown, Users } from 'lucide-react';

/**
 * Admin Panel section for the public landing page.
 *
 * The landing page itself is content-free (hero copy is part of the page, not
 * the database), so the only thing left to administer is the interest
 * questionnaire — everything here reads from GET /api/home/admin/feedback.
 */

export default function HomeAdminSection() {
  const [stats, setStats] = useState<HomeFeedbackStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setStats(await api.getHomeFeedbackStats());
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load questionnaire analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-6 flex items-center justify-center gap-3 min-h-[120px]">
        <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center">
          Loading questionnaire results…
        </span>
      </div>
    );
  }

  if (loadError || !stats) {
    return (
      <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-6 flex flex-col items-center gap-3 text-center">
        <AlertTriangle className="w-8 h-8 text-amber-400" />
        <p className="text-xs font-bold text-slate-300">
          {loadError || 'Questionnaire results are unavailable.'}
        </p>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-2 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-5 sm:p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl relative overflow-hidden">
      <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-rose-500/20 to-transparent" />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-base font-black text-white mb-1 flex items-center gap-2">
            <Users className="w-5 h-5 text-rose-400 shrink-0" />
            <span>Landing Page — Interest Questionnaire</span>
          </h3>
          <p className="text-xs text-slate-400 font-bold">
            "Are you interested in this project?" — answered publicly from the Home page.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-300 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Stat tiles */}
      <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-4">
          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Total responses</span>
          <span className="text-2xl font-black text-white mt-1 block">{stats.total}</span>
        </div>
        <div className="bg-emerald-500/[0.06] border border-emerald-500/20 rounded-2xl p-4">
          <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
            <Heart className="w-3 h-3" /> Interested
          </span>
          <span className="text-2xl font-black text-emerald-400 mt-1 block">{stats.interested}</span>
          <span className="text-[10px] font-bold text-emerald-400/70 block">{stats.interestedPercent}%</span>
        </div>
        <div className="bg-rose-500/[0.06] border border-rose-500/20 rounded-2xl p-4">
          <span className="text-[9px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
            <ThumbsDown className="w-3 h-3" /> Not interested
          </span>
          <span className="text-2xl font-black text-rose-400 mt-1 block">{stats.notInterested}</span>
          <span className="text-[10px] font-bold text-rose-400/70 block">{stats.notInterestedPercent}%</span>
        </div>
        <div className="bg-indigo-500/[0.06] border border-indigo-500/20 rounded-2xl p-4">
          <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">Interest rate</span>
          <span className="text-2xl font-black text-indigo-400 mt-1 block">{stats.interestedPercent}%</span>
          <span className="text-[10px] font-bold text-indigo-400/70 block">of all responses</span>
        </div>
      </div>

      {/* Distribution bar */}
      <div className="mt-4">
        <div className="flex h-4 rounded-full overflow-hidden bg-slate-800 border border-white/5">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
            style={{ width: `${stats.interestedPercent}%` }}
          />
          <div
            className="h-full bg-gradient-to-r from-rose-500 to-rose-400 transition-all duration-700"
            style={{ width: `${stats.notInterestedPercent}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[10px] font-bold text-slate-400">
          <span className="text-emerald-400">❤️ {stats.interestedPercent}% interested</span>
          <span className="text-rose-400">❌ {stats.notInterestedPercent}% not interested</span>
        </div>
      </div>

      {/* Recent responses */}
      {stats.recent.length > 0 && (
        <div className="mt-4">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Most recent responses</p>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {stats.recent.map((row) => (
              <div
                key={`${row.studentId}-${row.updatedAt}`}
                className="flex items-center justify-between gap-3 bg-white/[0.02] border border-white/5 rounded-xl px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <span className="text-xs font-black text-white block truncate">{row.fullName}</span>
                  <span className="text-[10px] font-bold text-slate-500 block truncate">
                    ID: {row.studentId} • {new Date(row.updatedAt).toLocaleString()}
                  </span>
                </div>
                <span
                  className={`shrink-0 text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest border ${
                    row.choice === 'interested'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  }`}
                >
                  {row.choice === 'interested' ? '❤️ Interested' : '❌ Not interested'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.total === 0 && (
        <div className="mt-4 flex items-center gap-2.5 bg-slate-950/40 border border-white/5 rounded-2xl px-4 py-3">
          <Users className="w-4 h-4 text-slate-500 shrink-0" />
          <p className="text-[11px] font-semibold text-slate-500">
            No responses yet. Answers submitted from the public Home page will appear here.
          </p>
        </div>
      )}
    </div>
  );
}
