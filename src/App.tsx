import React, { useState, useEffect } from 'react';
import { api } from './lib/api';
import { CharacterItem } from './types';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Quiz from './components/Quiz';
import Admin from './components/Admin';
import { Shield, Sparkles, BookOpen, LogOut, Sun, Moon } from 'lucide-react';
import beihangLogo from './beihang_logo.jpg';
import { useTheme } from './hooks/useTheme';

type ViewState = 'loading' | 'login' | 'dashboard' | 'quiz' | 'admin';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [view, setView] = useState<ViewState>('loading');
  const [user, setUser] = useState<{ studentId: string; fullName: string; role: 'admin' | 'student' } | null>(null);
  const [logoutSuccess, setLogoutSuccess] = useState<string | null>(null);
  
  // Quiz specific deck variables
  const [quizDeck, setQuizDeck] = useState<CharacterItem[]>([]);
  const [quizMode, setQuizMode] = useState<'srs' | 'single'>('srs');
  const [singleChar, setSingleChar] = useState<CharacterItem | undefined>(undefined);

  // Auto-verify active JWT on startup
  useEffect(() => {
    const checkActiveSession = async () => {
      if (api.getToken()) {
        try {
          const res = await api.getMe();
          setUser(res.user);
          setView('dashboard');
        } catch (err) {
          console.warn('Stale session or expired token. Clearing credentials.');
          await api.logout().catch(() => {});
          setUser(null);
          setView('login');
        }
      } else {
        setView('login');
      }
    };
    checkActiveSession();

    const handleUnauthorized = () => {
      console.warn('Unauthorized request detected. Redirecting to login.');
      setUser(null);
      setView('login');
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        window.location.reload();
      }
    };

    window.addEventListener('unauthorized', handleUnauthorized);
    window.addEventListener('pageshow', handlePageShow);
    
    return () => {
      window.removeEventListener('unauthorized', handleUnauthorized);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  const handleLogout = async () => {
    setLogoutSuccess(null);
    try {
      await api.logout();
      setLogoutSuccess('You have been signed out successfully.');
    } catch (err: any) {
      console.error('Sign out failed:', err);
    } finally {
      setUser(null);
      setView('login');
    }
  };

  if (view === 'login') {
    return (
      <Login 
        onLoginSuccess={(u) => { 
          setUser(u); 
          setLogoutSuccess(null); 
          setView('dashboard'); 
        }} 
        initialSuccessMessage={logoutSuccess}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1d] text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white relative overflow-x-hidden">
      
      {/* Decorative ambient background blur nodes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-500/10 blur-[120px] animate-pulse-slow"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-teal-500/10 blur-[120px] animate-pulse-slower"></div>
        <div className="absolute top-[30%] right-[20%] w-[350px] h-[350px] rounded-full bg-indigo-500/5 blur-[100px]"></div>
        <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      </div>

      {/* Premium Core Global Navigation Rail */}
      <header className="sticky top-0 z-40 border-b border-white/5 shadow-lg backdrop-blur-2xl bg-slate-950/40 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          
          {/* Logo Brand */}
          <div className="flex items-center gap-1.5 sm:gap-3">
            <div className="relative group w-9 h-9 shrink-0">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full blur opacity-20 group-hover:opacity-35 transition duration-500"></div>
              <div className="relative w-9 h-9 rounded-full overflow-hidden border border-white/10 p-0.5 bg-slate-950/80 flex items-center justify-center shrink-0 transform hover:scale-105 transition-transform duration-300 aspect-square">
                <img 
                  src={beihangLogo} 
                  alt="Beihang University Logo" 
                  className="w-full h-full object-contain rounded-full aspect-square"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
            <div className="text-left min-w-0">
              <span className="font-extrabold text-white tracking-tight text-[11px] sm:text-sm uppercase block whitespace-nowrap">Beihang Mandarin Flow</span>
              <span className="text-[9px] font-black tracking-widest text-blue-400 block leading-none mt-1 whitespace-nowrap">Beihang University</span>
            </div>
          </div>

          {/* User Profile Mini Indicator */}
          {user && (
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2 sm:gap-3 bg-white/[0.04] border border-white/10 p-1.5 sm:pl-3.5 sm:pr-2 rounded-2xl shadow-inner">
                <div className="hidden sm:block text-right">
                  <span className="text-xs font-black text-white block">{user.fullName}</span>
                  <span className="text-[9px] text-slate-400 font-medium block">{user.role === 'admin' ? '🛡️ Admin Portal' : `ID: ${user.studentId}`}</span>
                </div>
                <div className="w-8 h-8 bg-gradient-to-tr from-emerald-500 to-teal-500 text-slate-950 font-black text-sm rounded-xl flex items-center justify-center shadow-md">
                  {user.fullName.charAt(0).toUpperCase()}
                </div>
              </div>
              
              <button
                id="theme-toggle-btn"
                onClick={toggleTheme}
                className="flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/10 w-10 h-10 rounded-2xl transition-all shadow-sm hover:shadow-md cursor-pointer active:scale-95"
                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              <button
                id="header-logout-btn"
                onClick={handleLogout}
                className="flex items-center gap-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 px-3.5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-sm hover:shadow-md cursor-pointer active:scale-95"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          )}

        </div>
      </header>

      {/* Main Responsive Canvas Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 pb-20 relative z-10">
        {view === 'loading' && (
          <div className="flex flex-col items-center justify-center py-36 space-y-4">
            <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-500 font-bold tracking-wide animate-pulse">Initializing Beihang Academic Session...</p>
          </div>
        )}

        {view === 'dashboard' && user && (
          <Dashboard 
            user={user} 
            onLogout={handleLogout} 
            onGoToAdmin={() => setView('admin')}
            onStartQuiz={(chars, mode, single) => {
              setQuizDeck(chars);
              setQuizMode(mode);
              setSingleChar(single);
              setView('quiz');
            }} 
          />
        )}

        {view === 'quiz' && (
          <Quiz 
            characters={quizDeck} 
            mode={quizMode} 
            singleChar={singleChar} 
            onClose={() => setView('dashboard')} 
          />
        )}

        {view === 'admin' && user && (
          <Admin 
            currentUser={user} 
            onBackToDashboard={() => setView('dashboard')} 
          />
        )}
      </main>

      {/* Premium Professional Academic Footer */}
      <footer className="bg-slate-950/40 border-t border-white/5 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-[11px] font-bold text-slate-500 uppercase tracking-widest text-center sm:text-left">
          <p>Built for Beihang University</p>
          <p>Created by Amirreza</p>
        </div>
      </footer>

    </div>
  );
}
