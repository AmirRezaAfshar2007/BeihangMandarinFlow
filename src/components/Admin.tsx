import React, { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { Student, StudentStats } from '../types';
import HomeAdminSection from './home/HomeAdmin';
import { FOLDER_COLORS, FOLDER_ICONS } from '../lib/folderColors';
import { 
  Users, Key, Shield, ShieldAlert, Trash2, ArrowLeft, Plus, 
  Search, CheckCircle, XCircle, AlertTriangle, Play, RefreshCw,
  FolderPlus, UploadCloud, Megaphone
} from 'lucide-react';

interface AdminProps {
  onBackToDashboard: () => void;
  currentUser: { studentId: string; fullName: string };
}

export default function Admin({ onBackToDashboard, currentUser }: AdminProps) {
  const [students, setStudents] = useState<any[]>([]);
  const [overview, setOverview] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Create Student Form
  const [newStudentId, setNewStudentId] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  // Password reset state
  const [resetStudentId, setResetStudentId] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  // Broadcast character folder (admin/teacher -> every student's deck)
  const [broadcastName, setBroadcastName] = useState('');
  const [broadcastDescription, setBroadcastDescription] = useState('');
  const [broadcastCategory, setBroadcastCategory] = useState('');
  const [broadcastColor, setBroadcastColor] = useState(FOLDER_COLORS[0].key);
  const [broadcastIcon, setBroadcastIcon] = useState(FOLDER_ICONS[1]);
  const [broadcastCharactersText, setBroadcastCharactersText] = useState('');
  const [broadcastError, setBroadcastError] = useState<string | null>(null);
  const [broadcastResult, setBroadcastResult] = useState<{
    message: string;
    studentsAffected: number;
    charactersAddedTotal: number;
    alreadyOwnedSkips: number;
    lookupFailures: string[];
    invalidEntries: string[];
  } | null>(null);
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAdminOverview = async () => {
    setLoading(true);
    try {
      const data = await api.getAdminOverview();
      setStudents(data.students);
      setOverview(data.overview);
    } catch (err: any) {
      setError(err.message || 'Failed to retrieve administrative data overview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminOverview();
  }, []);

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentId || !newFullName || !newPassword) {
      setCreateError('Please fill in all parameters.');
      return;
    }

    if (!/^\d{5,15}$/.test(newStudentId)) {
      setCreateError('Student ID must be numeric (e.g. 401120145).');
      return;
    }

    setCreateError(null);
    setCreateSuccess(null);
    try {
      // Admin-only creation route. The old call went to the public sign-up
      // endpoint, which would have signed the *new student* in and replaced the
      // administrator's own session with theirs.
      await api.adminCreateStudent(newStudentId.trim(), newFullName.trim(), newPassword);
      setCreateSuccess(`Account for student ${newFullName} created successfully!`);
      setNewStudentId('');
      setNewFullName('');
      setNewPassword('');
      await fetchAdminOverview();
    } catch (err: any) {
      setCreateError(err.message || 'Creation failed.');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetStudentId || !resetPassword) {
      setResetError('Choose a student ID and a new password.');
      return;
    }

    setResetError(null);
    setResetSuccess(null);
    try {
      await api.adminResetPassword(resetStudentId, resetPassword);
      setResetSuccess(`Password for Student ${resetStudentId} updated successfully.`);
      setResetStudentId('');
      setResetPassword('');
    } catch (err: any) {
      setResetError(err.message || 'Password reset failed.');
    }
  };

  const handleToggleStatus = async (studentId: string) => {
    try {
      const res = await api.adminToggleStatus(studentId);
      await fetchAdminOverview();
      alert(res.message);
    } catch (err: any) {
      alert(err.message || 'Operation failed.');
    }
  };

  const handleDeleteStudent = async (studentId: string) => {
    if (!confirm(`WARNING: Are you sure you want to permanently delete Student ${studentId}? All card decks, stats, and historical training traces will be immediately and irreversibly purged from our server.`)) {
      return;
    }

    try {
      const res = await api.adminDeleteStudent(studentId);
      await fetchAdminOverview();
      alert(res.message);
    } catch (err: any) {
      alert(err.message || 'Deletion failed.');
    }
  };

  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      // Merge into whatever is already typed rather than silently replacing
      // it, so a teacher can combine a pasted CSV with a few hand-typed
      // extras without losing either.
      setBroadcastCharactersText((prev) => (prev.trim() ? `${prev.trim()},${text.trim()}` : text.trim()));
    };
    reader.onerror = () => {
      setBroadcastError('Could not read that CSV file. Please try again.');
    };
    reader.readAsText(file);

    // Reset so selecting the same file twice in a row still fires onChange.
    if (csvFileInputRef.current) csvFileInputRef.current.value = '';
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastName.trim()) {
      setBroadcastError('Give the folder a name.');
      return;
    }
    if (!broadcastCharactersText.trim()) {
      setBroadcastError('Add at least one character, or upload a CSV.');
      return;
    }
    if (
      !confirm(
        `This will create the folder "${broadcastName.trim()}" in every student's account and add the listed characters to all of their decks. Continue?`
      )
    ) {
      return;
    }

    setBroadcastError(null);
    setBroadcastResult(null);
    setBroadcastLoading(true);
    try {
      const res = await api.adminBroadcastFolder({
        folderName: broadcastName.trim(),
        description: broadcastDescription.trim(),
        category: broadcastCategory.trim(),
        color: broadcastColor,
        icon: broadcastIcon,
        charactersText: broadcastCharactersText,
      });
      setBroadcastResult(res);
      setBroadcastName('');
      setBroadcastDescription('');
      setBroadcastCategory('');
      setBroadcastCharactersText('');
      await fetchAdminOverview();
    } catch (err: any) {
      setBroadcastError(err.message || 'Broadcast failed.');
    } finally {
      setBroadcastLoading(false);
    }
  };

  const filteredStudents = students.filter(s => {
    const query = searchQuery.toLowerCase();
    return (
      s.fullName.toLowerCase().includes(query) ||
      s.studentId.includes(query) ||
      s.role.includes(query)
    );
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4">
        <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 font-bold tracking-wide animate-pulse">Syncing Beihang Governance Core...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Admin Title Banner */}
      <div className="bg-slate-900/60 border border-white/10 backdrop-blur-2xl p-6 md:p-8 rounded-[32px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent"></div>
        <div className="space-y-1.5 text-left relative z-10">
          <div className="inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3.5 py-1 rounded-full text-xs font-black tracking-wider uppercase">
            <Shield className="w-3.5 h-3.5" />
            <span>Administrator Terminal</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight leading-none text-white">Global System Administration</h1>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Active Admin: {currentUser.fullName} ({currentUser.studentId})</p>
        </div>

        <button
          onClick={onBackToDashboard}
          className="bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer text-slate-200 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Dashboard</span>
        </button>
      </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-2xl text-xs font-semibold leading-relaxed">
          {error}
        </div>
      )}

      {/* Aggregate Overview Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent"></div>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Enrolled Scholars</span>
          <span className="text-3xl font-black text-white">{overview?.totalUsers || 0}</span>
          <p className="text-slate-400 text-[10px] font-bold mt-1.5">Registered Student IDs active in database</p>
        </div>

        <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent"></div>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Total Vector Cards</span>
          <span className="text-3xl font-black text-white">{overview?.totalCharactersLoaded || 0}</span>
          <p className="text-slate-400 text-[10px] font-bold mt-1.5">Characters synchronized in active study decks</p>
        </div>

        <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent"></div>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Practice Logs</span>
          <span className="text-3xl font-black text-emerald-400">{overview?.totalPracticeLogsRecorded || 0}</span>
          <p className="text-slate-400 text-[10px] font-bold mt-1.5">Total handwriting trace reviews evaluated</p>
        </div>
      </div>

      {/* Public landing page: interest questionnaire analytics. */}
      <HomeAdminSection />

      {/* Broadcast a character folder + characters to every student at once */}
      <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent"></div>
        <h3 className="text-base font-black text-white mb-2 flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-cyan-400" />
          <span>Broadcast Folder to All Students</span>
        </h3>
        <p className="text-xs text-slate-400 font-bold mb-4 leading-relaxed">
          Creates one folder in every student's account and adds the characters below to all of their decks at once.
          Existing folders with the same name and characters students already own are left untouched.
        </p>

        {broadcastError && <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-2.5 rounded-xl mb-3 text-[11px] font-semibold">{broadcastError}</div>}
        {broadcastResult && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-xl mb-3 text-[11px] font-semibold space-y-1">
            <p>{broadcastResult.message}</p>
            {broadcastResult.lookupFailures.length > 0 && (
              <p className="text-amber-400">Could not look up: {broadcastResult.lookupFailures.join(', ')}</p>
            )}
            {broadcastResult.invalidEntries.length > 0 && (
              <p className="text-amber-400">Ignored (not a single Chinese character): {broadcastResult.invalidEntries.join(', ')}</p>
            )}
          </div>
        )}

        <form onSubmit={handleBroadcast} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Folder Name</label>
              <input
                type="text"
                placeholder="e.g. Week 5 Vocabulary"
                value={broadcastName}
                onChange={(e) => setBroadcastName(e.target.value)}
                className="w-full bg-slate-950/40 border border-white/10 rounded-2xl py-2.5 px-3.5 font-semibold text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/80 focus:bg-slate-950/60 transition-all focus:ring-4 focus:ring-emerald-500/10"
                required
              />
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Category (optional)</label>
              <input
                type="text"
                placeholder="e.g. HSK 3"
                value={broadcastCategory}
                onChange={(e) => setBroadcastCategory(e.target.value)}
                className="w-full bg-slate-950/40 border border-white/10 rounded-2xl py-2.5 px-3.5 font-semibold text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/80 focus:bg-slate-950/60 transition-all focus:ring-4 focus:ring-emerald-500/10"
              />
            </div>
          </div>

          <div>
            <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Description (optional)</label>
            <input
              type="text"
              placeholder="What this folder is for"
              value={broadcastDescription}
              onChange={(e) => setBroadcastDescription(e.target.value)}
              maxLength={300}
              className="w-full bg-slate-950/40 border border-white/10 rounded-2xl py-2.5 px-3.5 font-semibold text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/80 focus:bg-slate-950/60 transition-all focus:ring-4 focus:ring-emerald-500/10"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Color</label>
              <div className="flex flex-wrap gap-1.5">
                {FOLDER_COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setBroadcastColor(c.key)}
                    title={c.label}
                    className={`w-6 h-6 rounded-full ${c.solid} transition-all cursor-pointer ${broadcastColor === c.key ? 'ring-2 ring-offset-2 ring-offset-slate-900 ring-white' : 'opacity-60 hover:opacity-100'}`}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Icon</label>
              <div className="flex flex-wrap gap-1.5">
                {FOLDER_ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setBroadcastIcon(ic)}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-all cursor-pointer border ${broadcastIcon === ic ? 'bg-emerald-500/20 border-emerald-500/50' : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06]'}`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">
              Characters (comma-separated, e.g. 你,好,学,习)
            </label>
            <textarea
              placeholder="你, 好, 学, 习..."
              value={broadcastCharactersText}
              onChange={(e) => setBroadcastCharactersText(e.target.value)}
              rows={3}
              className="w-full bg-slate-950/40 border border-white/10 rounded-2xl py-2.5 px-3.5 font-semibold text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/80 focus:bg-slate-950/60 transition-all focus:ring-4 focus:ring-emerald-500/10 resize-none"
            />
            <div className="mt-2 flex items-center gap-2">
              <input
                ref={csvFileInputRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={handleCsvFileChange}
                className="hidden"
                id="broadcast-csv-input"
              />
              <label
                htmlFor="broadcast-csv-input"
                className="inline-flex items-center gap-1.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer text-slate-300 hover:text-white transition-all"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                Upload CSV
              </label>
              <span className="text-[10px] text-slate-500 font-bold">Adds to the list above instead of replacing it.</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={broadcastLoading}
            className="w-full bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-black py-3 rounded-2xl text-[10px] uppercase tracking-widest transition-all cursor-pointer shadow-md flex items-center justify-center gap-2"
          >
            {broadcastLoading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Broadcasting...
              </>
            ) : (
              <>
                <FolderPlus className="w-3.5 h-3.5" />
                Push Folder + Characters to All Students
              </>
            )}
          </button>
        </form>
      </div>

      {/* Control Forms and Main User List Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side forms panel (Reset password, Create student) */}
        <div className="space-y-6 lg:col-span-1">
          
          {/* Create Student Manually */}
          <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent"></div>
            <h3 className="text-base font-black text-white mb-2 flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-400" />
              <span>Enroll Student Manually</span>
            </h3>
            <p className="text-xs text-slate-400 font-bold mb-4 leading-relaxed">
              Add a new scholar account directly to the server database.
            </p>

            {createError && <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-2.5 rounded-xl mb-3 text-[11px] font-semibold">{createError}</div>}
            {createSuccess && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-2.5 rounded-xl mb-3 text-[11px] font-semibold">{createSuccess}</div>}

            <form onSubmit={handleCreateStudent} className="space-y-3.5">
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Student ID Username</label>
                <input
                  type="text"
                  placeholder="e.g. 401120145"
                  value={newStudentId}
                  onChange={(e) => setNewStudentId(e.target.value)}
                  className="w-full bg-slate-950/40 border border-white/10 rounded-2xl py-2.5 px-3.5 font-semibold text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/80 focus:bg-slate-950/60 transition-all focus:ring-4 focus:ring-emerald-500/10"
                  required
                />
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Scholar Full Name</label>
                <input
                  type="text"
                  placeholder="Alex River"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full bg-slate-950/40 border border-white/10 rounded-2xl py-2.5 px-3.5 font-semibold text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/80 focus:bg-slate-950/60 transition-all focus:ring-4 focus:ring-emerald-500/10"
                  required
                />
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Temporary Password</label>
                <input
                  type="password"
                  placeholder="Minimum 6 chars"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-950/40 border border-white/10 rounded-2xl py-2.5 px-3.5 font-semibold text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/80 focus:bg-slate-950/60 transition-all focus:ring-4 focus:ring-emerald-500/10"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black py-3 rounded-2xl text-[10px] uppercase tracking-widest transition-all cursor-pointer shadow-md"
              >
                Enroll Scholar
              </button>
            </form>
          </div>

          {/* Reset password form */}
          <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent"></div>
            <h3 className="text-base font-black text-white mb-2 flex items-center gap-2">
              <Key className="w-5 h-5 text-amber-400" />
              <span>Reset Scholar Password</span>
            </h3>
            <p className="text-xs text-slate-400 font-bold mb-4 leading-relaxed">
              Administrative bypass to reset a student's forgotten key.
            </p>

            {resetError && <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-2.5 rounded-xl mb-3 text-[11px] font-semibold">{resetError}</div>}
            {resetSuccess && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-2.5 rounded-xl mb-3 text-[11px] font-semibold">{resetSuccess}</div>}

            <form onSubmit={handleResetPassword} className="space-y-3.5">
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">Target Student ID</label>
                <input
                  type="text"
                  placeholder="e.g. 401120145"
                  value={resetStudentId}
                  onChange={(e) => setResetStudentId(e.target.value)}
                  className="w-full bg-slate-950/40 border border-white/10 rounded-2xl py-2.5 px-3.5 font-semibold text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/80 focus:bg-slate-950/60 transition-all focus:ring-4 focus:ring-emerald-500/10"
                  required
                />
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase block mb-1">New Secure Password</label>
                <input
                  type="password"
                  placeholder="New Password Key"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className="w-full bg-slate-950/40 border border-white/10 rounded-2xl py-2.5 px-3.5 font-semibold text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/80 focus:bg-slate-950/60 transition-all focus:ring-4 focus:ring-emerald-500/10"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-black py-3 rounded-2xl text-[10px] uppercase tracking-widest transition-all cursor-pointer shadow-md"
              >
                Reset Account Password
              </button>
            </form>
          </div>

        </div>

        {/* Right side user list and statistics */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl relative overflow-hidden space-y-4">
            <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent"></div>
            
            {/* Search Filter header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-white/5">
              <div>
                <h3 className="text-lg font-black text-white">Scholars Database Registry</h3>
                <p className="text-xs text-slate-400 font-bold">Manage credentials, state locks, and view total logs</p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3.5 top-3 w-4.5 h-4.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search students..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950/40 border border-white/10 rounded-2xl py-2 pl-10 pr-4 font-semibold text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80"
                />
              </div>
            </div>

            {/* Scrollable table cards */}
            <div className="space-y-3 max-h-[580px] overflow-y-auto pr-2">
              {filteredStudents.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-400 font-bold">No students matched search filters.</p>
                </div>
              ) : (
                filteredStudents.map(student => {
                  const isCurrent = student.studentId === currentUser.studentId;
                  return (
                    <div 
                      key={student.id} 
                      className={`p-4 rounded-2xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all ${
                        student.disabled 
                          ? 'border-rose-500/20 bg-rose-500/5' 
                          : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04]'
                      }`}
                    >
                      {/* Left: User metadata */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-white text-sm">{student.fullName}</span>
                          <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest border ${
                            student.role === 'admin' 
                              ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' 
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          }`}>
                            {student.role}
                          </span>
                          {student.disabled && (
                            <span className="text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              DISABLED
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-bold text-slate-400">ID: {student.studentId} • Enrolled: {new Date(student.createdAt).toLocaleDateString()}</p>
                        
                        {/* Stats mini badge */}
                        <div className="flex gap-4 pt-1.5 text-[10px] font-black text-slate-500 uppercase tracking-wider">
                          <span>🔥 {student.stats?.currentStreak || 0}d streak</span>
                          <span>✨ {student.stats?.totalXp || 0} xp</span>
                          <span>📚 {student.deckCount || 0} cards</span>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex gap-2 shrink-0 self-end sm:self-center">
                        {!isCurrent && student.role !== 'admin' ? (
                          <>
                            <button
                              onClick={() => handleToggleStatus(student.studentId)}
                              className={`text-xs font-black px-3.5 py-2 rounded-xl uppercase tracking-widest border transition-all cursor-pointer ${
                                student.disabled 
                                  ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20' 
                                  : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/20'
                              }`}
                            >
                              {student.disabled ? 'Enable' : 'Disable'}
                            </button>
                            <button
                              onClick={() => handleDeleteStudent(student.studentId)}
                              className="bg-white/[0.04] hover:bg-rose-500 hover:text-slate-950 p-2.5 rounded-xl border border-white/5 hover:border-rose-500/30 text-slate-400 transition-all cursor-pointer"
                              title="Delete scholar account"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <span className="text-xs font-bold text-slate-500 italic">No operations (Admin Self)</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>
        </div>

      </div>

    </div>
  );
}
