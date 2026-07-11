import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Student, StudentStats } from '../types';
import { 
  Users, Key, Shield, ShieldAlert, Trash2, ArrowLeft, Plus, 
  Search, CheckCircle, XCircle, AlertTriangle, Play, RefreshCw
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
      await api.register(newStudentId.trim(), newFullName.trim(), newPassword);
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
