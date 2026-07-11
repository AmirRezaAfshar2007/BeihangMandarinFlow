import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Lock, User, Sparkles, Shield, AlertTriangle, ArrowRight, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import beihangLogo from '../beihang_logo.jpg';

interface LoginProps {
  onLoginSuccess: (user: { studentId: string; fullName: string; role: 'admin' | 'student' }) => void;
  initialSuccessMessage?: string | null;
}

export default function Login({ onLoginSuccess, initialSuccessMessage }: LoginProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialSuccessMessage) {
      setSuccessMessage(initialSuccessMessage);
    }
  }, [initialSuccessMessage]);

  const resetState = () => {
    setError(null);
    setSuccessMessage(null);
    setPassword('');
    setConfirmPassword('');
    setNewPassword('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !password) {
      setError('Please provide your Student ID and Password.');
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const user = await api.login(studentId.trim(), password);
      onLoginSuccess(user);
    } catch (err: any) {
      setError(err.message || 'Login failed. Check your Student ID and Password.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !fullName || !password) {
      setError('Please fill in all registration fields.');
      return;
    }

    if (!/^\d{5,15}$/.test(studentId)) {
      setError('Student ID must be purely numeric and between 5 to 15 digits (e.g., 401120145).');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long for academic security.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const user = await api.register(studentId.trim(), fullName.trim(), password);
      onLoginSuccess(user);
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !fullName || !newPassword) {
      setError('Please provide all verification fields.');
      return;
    }

    if (newPassword.length < 6) {
      setError('New Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const res = await api.forgotPassword(studentId.trim(), fullName.trim(), newPassword);
      setSuccessMessage(res.message || 'Password updated successfully. You can now log in.');
      setIsForgotPassword(false);
      setPassword('');
    } catch (err: any) {
      setError(err.message || 'Verification failed. Student ID or Name did not match our records.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#030712] text-slate-100 flex items-center justify-center font-sans selection:bg-emerald-600 selection:text-white z-50 py-8 px-4 sm:px-6">
      
      {/* BACKGROUND GRAPHICS (Subtle academic emerald glows and grid meshes) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-600/10 blur-[120px] animate-pulse-slow"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-teal-600/10 blur-[120px] animate-pulse-slower"></div>
        <div className="absolute top-[30%] right-[20%] w-[350px] h-[350px] rounded-full bg-emerald-500/5 blur-[100px]"></div>
        {/* Abstract subtle grid pattern overlay */}
        <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      </div>

      {/* CENTERED LOGIN CARD */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={`w-full ${isRegistering ? 'max-w-[500px]' : 'max-w-[440px]'} bg-slate-900/60 backdrop-blur-2xl rounded-[32px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] border border-white/10 flex flex-col shrink-0 relative overflow-hidden my-auto transition-all duration-300 z-10`}
      >
        {/* Glow accent at the top of card */}
        <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-12 bg-emerald-500/20 blur-xl rounded-full pointer-events-none"></div>
        
        {/* Form Header - Separated and spacious */}
        <div className="pt-8 pb-7 px-8 sm:px-10 text-center shrink-0 border-b border-white/5 relative bg-slate-950/20">
          <div className="flex justify-center mb-5">
            <div className="relative group w-16 h-16">
              <div className="absolute -inset-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full blur opacity-25 group-hover:opacity-45 transition duration-500"></div>
              <div className="relative w-16 h-16 rounded-full overflow-hidden border border-white/10 p-1 bg-slate-950/80 flex items-center justify-center shrink-0 transform hover:scale-105 transition-transform duration-300 aspect-square">
                <img 
                  src={beihangLogo} 
                  alt="Beihang University Seal" 
                  className="w-full h-full object-contain rounded-full aspect-square"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          </div>
          
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
            {isForgotPassword ? 'Reset Password' : isRegistering ? 'Create Account' : 'Welcome Scholar'}
          </h2>
          
          <p className="text-xs text-slate-400 font-semibold tracking-wide mt-2.5 max-w-sm mx-auto leading-relaxed">
            {isForgotPassword ? 'Verify academic records to restore your account' : isRegistering ? 'Embark on your journey into Mandarin learning and spaced repetition training' : 'Sign in to access your spaced repetition training deck'}
          </p>
        </div>

        {/* Inner content wrapper with proper comfortable padding */}
        <div className="p-8 sm:p-10 space-y-6 flex-1">
          
          {/* Error and Success notifications */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-4 rounded-2xl flex items-start gap-3 text-xs font-semibold leading-relaxed shadow-sm"
              >
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </motion.div>
            )}

            {successMessage && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 p-4 rounded-2xl flex items-start gap-3 text-xs font-semibold leading-relaxed shadow-sm"
              >
                <Shield className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Dynamic Forms switcher */}
          <AnimatePresence mode="wait">
            {!isForgotPassword ? (
              !isRegistering ? (
                
                /* LOGIN FORM */
                <motion.form 
                  key="login"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.25 }}
                  onSubmit={handleLogin} 
                  className="space-y-6 text-left"
                >
                  <div className="space-y-2">
                    <label htmlFor="student-id-input" className="text-xs font-black text-slate-400 tracking-widest uppercase block">
                      Student ID Username
                    </label>
                    <div className="relative group/field mt-1.5">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within/field:text-emerald-400 transition-colors pointer-events-none" />
                      <input
                        id="student-id-input"
                        type="text"
                        placeholder="e.g. 401120145"
                        value={studentId}
                        onChange={(e) => setStudentId(e.target.value)}
                        className="w-full h-12 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-2xl pl-12 pr-4 font-medium text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 focus:bg-slate-950/40 focus:ring-4 focus:ring-emerald-500/10 transition-all text-sm shadow-inner"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center mb-1.5">
                      <label htmlFor="password-input" className="text-xs font-black text-slate-400 tracking-widest uppercase">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => { resetState(); setIsForgotPassword(true); }}
                        className="text-xs font-black text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer tracking-wider"
                      >
                        Forgot Password?
                      </button>
                    </div>
                    <div className="relative group/field">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within/field:text-emerald-400 transition-colors pointer-events-none" />
                      <input
                        id="password-input"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full h-12 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-2xl pl-12 pr-4 font-medium text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 focus:bg-slate-950/40 focus:ring-4 focus:ring-emerald-500/10 transition-all text-sm shadow-inner"
                        required
                      />
                    </div>
                  </div>

                  <div className="pt-3">
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      type="submit"
                      disabled={loading}
                      className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-950 font-black rounded-2xl shadow-lg shadow-emerald-500/15 uppercase tracking-widest transition-all disabled:opacity-50 cursor-pointer text-sm flex items-center justify-center gap-1.5"
                    >
                      {loading ? 'Authenticating...' : (
                        <>
                          <span>Sign In</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </motion.button>
                  </div>

                  <div className="text-center pt-4 border-t border-white/5 mt-4">
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                      New Student?{' '}
                      <button
                        type="button"
                        onClick={() => { resetState(); setIsRegistering(true); }}
                        className="text-emerald-400 hover:text-emerald-300 hover:underline font-black cursor-pointer transition-colors ml-1"
                      >
                        Create Account
                      </button>
                    </p>
                  </div>
                </motion.form>
              ) : (
                
                /* REGISTER FORM - Spacious layout, perfect spacing, clear labels */
                <motion.form 
                  key="register"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.25 }}
                  onSubmit={handleRegister} 
                  className="space-y-6 text-left"
                >
                  {/* Grid structure for credentials to optimize vertical layout while staying roomy */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    
                    <div className="space-y-2">
                      <label htmlFor="reg-student-id-input" className="text-xs font-black text-slate-400 tracking-widest uppercase block mb-1">
                        Student ID
                      </label>
                      <div className="relative group/field">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within/field:text-emerald-400 transition-colors pointer-events-none" />
                        <input
                          id="reg-student-id-input"
                          type="text"
                          placeholder="e.g. 401120145"
                          value={studentId}
                          onChange={(e) => setStudentId(e.target.value)}
                          className="w-full h-11 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-2xl pl-11 pr-4 font-medium text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 focus:bg-slate-950/40 focus:ring-4 focus:ring-emerald-500/10 transition-all text-sm shadow-inner"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="reg-name-input" className="text-xs font-black text-slate-400 tracking-widest uppercase block mb-1">
                        Full Name
                      </label>
                      <div className="relative group/field">
                        <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within/field:text-emerald-400 transition-colors pointer-events-none" />
                        <input
                          id="reg-name-input"
                          type="text"
                          placeholder="Alex River"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="w-full h-11 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-2xl pl-11 pr-4 font-medium text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 focus:bg-slate-950/40 focus:ring-4 focus:ring-emerald-500/10 transition-all text-sm shadow-inner"
                          required
                        />
                      </div>
                    </div>

                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    
                    <div className="space-y-2">
                      <label htmlFor="reg-password-input" className="text-xs font-black text-slate-400 tracking-widest uppercase block mb-1">
                        Password
                      </label>
                      <div className="relative group/field">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within/field:text-emerald-400 transition-colors pointer-events-none" />
                        <input
                          id="reg-password-input"
                          type="password"
                          placeholder="Min 6 characters"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full h-11 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-2xl pl-11 pr-4 font-medium text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 focus:bg-slate-950/40 focus:ring-4 focus:ring-emerald-500/10 transition-all text-sm shadow-inner"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="reg-confirm-input" className="text-xs font-black text-slate-400 tracking-widest uppercase block mb-1">
                        Confirm Password
                      </label>
                      <div className="relative group/field">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within/field:text-emerald-400 transition-colors pointer-events-none" />
                        <input
                          id="reg-confirm-input"
                          type="password"
                          placeholder="Re-enter password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full h-11 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-2xl pl-11 pr-4 font-medium text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 focus:bg-slate-950/40 focus:ring-4 focus:ring-emerald-500/10 transition-all text-sm shadow-inner"
                          required
                        />
                      </div>
                    </div>

                  </div>

                  {/* Important, separated register button */}
                  <div className="pt-4">
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      type="submit"
                      disabled={loading}
                      className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-950 font-black rounded-2xl shadow-lg shadow-emerald-500/15 uppercase tracking-widest transition-all disabled:opacity-50 cursor-pointer text-sm flex items-center justify-center gap-1.5"
                    >
                      {loading ? 'Creating Account...' : (
                        <>
                          <span>Register Account</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </motion.button>
                  </div>

                  <div className="text-center pt-5 border-t border-white/5 mt-4">
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                      Already registered?{' '}
                      <button
                        type="button"
                        onClick={() => { resetState(); setIsRegistering(false); }}
                        className="text-emerald-400 hover:text-emerald-300 hover:underline font-black cursor-pointer transition-colors ml-1"
                      >
                        Login Here
                      </button>
                    </p>
                  </div>
                </motion.form>
              )
            ) : (
              
              /* FORGOT PASSWORD FORM */
              <motion.form 
                key="forgot"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.25 }}
                onSubmit={handleForgotPassword} 
                className="space-y-5"
              >
                <div className="bg-emerald-500/5 border border-emerald-500/15 p-4 rounded-2xl text-xs text-emerald-300 font-semibold leading-relaxed flex items-start gap-3 shadow-inner">
                  <Shield className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Verify Student ID and full name to restore your credentials and set a new password.</span>
                </div>

                <div className="space-y-2">
                  <label htmlFor="forgot-student-id" className="text-xs font-semibold text-slate-400 tracking-wider block">
                    Student ID
                  </label>
                  <div className="relative group/field">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within/field:text-emerald-400 transition-colors pointer-events-none" />
                    <input
                      id="forgot-student-id"
                      type="text"
                      placeholder="e.g. 401120145"
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      className="w-full h-12 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-2xl pl-12 pr-4 font-medium text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 focus:bg-slate-950/40 focus:ring-4 focus:ring-emerald-500/10 transition-all text-sm shadow-inner"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="forgot-fullname" className="text-xs font-semibold text-slate-400 tracking-wider block">
                    Full Name
                  </label>
                  <div className="relative group/field">
                    <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within/field:text-emerald-400 transition-colors pointer-events-none" />
                    <input
                      id="forgot-fullname"
                      type="text"
                      placeholder="Alex River"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full h-12 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-2xl pl-12 pr-4 font-medium text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 focus:bg-slate-950/40 focus:ring-4 focus:ring-emerald-500/10 transition-all text-sm shadow-inner"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="forgot-new-password" className="text-xs font-semibold text-slate-400 tracking-wider block">
                    New Password
                  </label>
                  <div className="relative group/field">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within/field:text-emerald-400 transition-colors pointer-events-none" />
                    <input
                      id="forgot-new-password"
                      type="password"
                      placeholder="Enter new password (min 6 chars)"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full h-12 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-2xl pl-12 pr-4 font-medium text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 focus:bg-slate-950/40 focus:ring-4 focus:ring-emerald-500/10 transition-all text-sm shadow-inner"
                      required
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    type="submit"
                    disabled={loading}
                    className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-950 font-black rounded-2xl shadow-lg shadow-emerald-500/15 uppercase tracking-widest transition-all disabled:opacity-50 cursor-pointer text-sm flex items-center justify-center gap-1.5"
                  >
                    {loading ? 'Verifying...' : (
                      <>
                        <span>Reset Password</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </motion.button>
                </div>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => { resetState(); setIsForgotPassword(false); }}
                    className="text-xs font-bold text-slate-400 hover:text-slate-300 transition-colors uppercase tracking-widest cursor-pointer"
                  >
                    Cancel and Return
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
        
        {/* Form Footer */}
        <div className="py-4 bg-slate-950/60 border-t border-white/5 text-center text-[10px] font-extrabold text-slate-500 uppercase tracking-widest shrink-0 rounded-b-[32px]">
          New Version 2.3.0 • Beihang Mandarin Flow
        </div>

      </motion.div>
    </div>
  );
}
