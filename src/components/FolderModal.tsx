import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Overlay from './ui/Overlay';
import { X, Folder as FolderIcon, Loader2 } from 'lucide-react';
import { Folder } from '../types';
import { FOLDER_COLORS, FOLDER_ICONS, getFolderColor } from '../lib/folderColors';

interface FolderModalProps {
  folder?: Folder | null; // present = editing
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    description: string;
    category: string;
    color: string;
    icon: string;
    customDate: string | null;
  }) => Promise<void>;
}

export default function FolderModal({ folder, onClose, onSubmit }: FolderModalProps) {
  const [name, setName] = useState(folder?.name || '');
  const [description, setDescription] = useState(folder?.description || '');
  const [category, setCategory] = useState(folder?.category || 'General');
  const [color, setColor] = useState(folder?.color || 'emerald');
  const [icon, setIcon] = useState(folder?.icon || '📁');
  const [useCustomDate, setUseCustomDate] = useState(!!folder?.customDate);
  const [customDate, setCustomDate] = useState(
    folder?.customDate ? folder.customDate.split('T')[0] : new Date().toISOString().split('T')[0]
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isEditing = !!folder;
  const swatch = getFolderColor(color);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Give your folder a name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        category: category.trim() || 'General',
        color,
        icon,
        customDate: useCustomDate ? customDate : null,
      });
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <Overlay
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md bg-slate-900 border border-white/10 rounded-[28px] shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto text-left"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <span className={`w-8 h-8 rounded-xl ${swatch.bg} border ${swatch.border} flex items-center justify-center text-base shrink-0`}>
                {icon}
              </span>
              <span>{isEditing ? 'Edit Folder' : 'Create New Folder'}</span>
            </h3>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-3 rounded-xl text-xs font-semibold leading-relaxed">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Folder Name</label>
              <input
                type="text"
                placeholder="e.g. HSK 3 Vocabulary"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                className="w-full bg-slate-950/40 border border-white/10 rounded-xl py-2.5 px-3.5 text-sm font-bold text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/80 focus:bg-slate-950/60 transition-all shadow-inner"
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Description / Notes</label>
              <textarea
                placeholder="What's this folder for?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={300}
                className="w-full min-h-[64px] bg-slate-950/40 border border-white/10 rounded-xl p-3 text-xs text-white font-medium placeholder-slate-600 focus:outline-none focus:border-emerald-500/80 focus:bg-slate-950/60 transition-all shadow-inner"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Category</label>
                <input
                  type="text"
                  placeholder="General"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  maxLength={40}
                  className="w-full bg-slate-950/40 border border-white/10 rounded-xl py-2.5 px-3.5 text-xs font-bold text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/80 focus:bg-slate-950/60 transition-all shadow-inner"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Icon</label>
                <div className="flex flex-wrap gap-1.5">
                  {FOLDER_ICONS.map((ic) => (
                    <button
                      type="button"
                      key={ic}
                      onClick={() => setIcon(ic)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm border transition-all cursor-pointer ${
                        icon === ic
                          ? 'border-emerald-500 bg-emerald-500/10 scale-105'
                          : 'border-white/10 bg-slate-950/40 hover:bg-slate-950/60'
                      }`}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Color Label</label>
              <div className="flex flex-wrap gap-2">
                {FOLDER_COLORS.map((c) => (
                  <button
                    type="button"
                    key={c.key}
                    onClick={() => setColor(c.key)}
                    title={c.label}
                    className={`w-7 h-7 rounded-full ${c.solid} flex items-center justify-center transition-all cursor-pointer ${
                      color === c.key ? 'ring-2 ring-offset-2 ring-offset-slate-900 ring-white/80 scale-110' : 'opacity-70 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2 bg-slate-950/30 border border-white/5 rounded-xl p-3">
              <label className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCustomDate}
                  onChange={(e) => setUseCustomDate(e.target.checked)}
                  className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer"
                />
                Use a custom creation date
              </label>
              {useCustomDate && (
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full bg-slate-950/40 border border-white/10 rounded-xl py-2 px-3 text-xs font-bold text-white focus:outline-none focus:border-emerald-500/80 transition-all shadow-inner"
                />
              )}
              {!useCustomDate && (
                <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                  Leave unchecked to use today's date automatically.
                </p>
              )}
            </div>

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              type="submit"
              disabled={saving}
              className="w-full btn-3d-emerald text-slate-950 font-black py-3 rounded-2xl text-[10px] uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <FolderIcon className="w-4 h-4" />
                  <span>{isEditing ? 'Save Changes' : 'Create Folder'}</span>
                </>
              )}
            </motion.button>
          </form>
        </motion.div>
      </Overlay>
    </AnimatePresence>
  );
}
