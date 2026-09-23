import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Overlay from './ui/Overlay';
import { X, Search, FolderPlus, Check, Inbox } from 'lucide-react';
import { Folder, CharacterItem } from '../types';
import { getFolderColor } from '../lib/folderColors';

interface FolderPickerModalProps {
  character: CharacterItem;
  folders: Folder[];
  onAssign: (folderId: string) => Promise<void>;
  onSkip: () => void;
  onCreateNew: () => void;
}

export default function FolderPickerModal({
  character,
  folders,
  onAssign,
  onSkip,
  onCreateNew,
}: FolderPickerModalProps) {
  const [query, setQuery] = useState('');
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = folders.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()));

  const handlePick = async (folderId: string) => {
    setAssigningId(folderId);
    setError(null);
    try {
      await onAssign(folderId);
    } catch (err: any) {
      setError(err.message || 'Could not add the character to that folder.');
      setAssigningId(null);
    }
  };

  return (
    <AnimatePresence>
      <Overlay
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-md bg-slate-900 border border-white/10 rounded-[28px] shadow-2xl p-6 space-y-5 max-h-[85vh] overflow-y-auto text-left"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 bg-slate-950 border border-white/10 rounded-2xl flex items-center justify-center font-black text-white text-xl shrink-0 shadow-sm">
                {character.character}
              </span>
              <div>
                <h3 className="text-sm font-black text-white leading-tight">Added to your deck!</h3>
                <p className="text-[11px] text-slate-400 font-medium">Which folder would you like to add this character to?</p>
              </div>
            </div>
            <button
              onClick={onSkip}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer shrink-0"
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

          {folders.length === 0 ? (
            <div className="text-center py-8 bg-slate-950/40 rounded-2xl border border-dashed border-white/10 p-5 space-y-3">
              <Inbox className="w-8 h-8 text-slate-500 mx-auto" />
              <p className="text-slate-300 text-xs font-bold leading-relaxed">
                You don't have any training folders yet. Would you like to create one?
              </p>
            </div>
          ) : (
            <>
              {folders.length > 5 && (
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search folders..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full bg-slate-950/40 border border-white/10 rounded-xl py-2 pl-10 pr-4 font-bold text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-all shadow-inner"
                  />
                </div>
              )}

              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {filtered.length === 0 ? (
                  <p className="text-center text-xs text-slate-500 font-medium py-4">No folders match your search.</p>
                ) : (
                  filtered.map((f) => {
                    const swatch = getFolderColor(f.color);
                    const isAssigning = assigningId === f.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => handlePick(f.id)}
                        disabled={!!assigningId}
                        className={`w-full flex items-center justify-between gap-3 p-3 rounded-2xl border-2 border-white/5 bg-slate-950/20 hover:bg-slate-950/40 hover:border-white/10 transition-all cursor-pointer text-left disabled:opacity-60 disabled:cursor-wait`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`w-9 h-9 rounded-xl ${swatch.bg} border ${swatch.border} flex items-center justify-center text-base shrink-0`}>
                            {f.icon}
                          </span>
                          <div className="min-w-0">
                            <span className="font-extrabold text-white text-xs block truncate">{f.name}</span>
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{f.characterCount} items</span>
                          </div>
                        </div>
                        {isAssigning ? (
                          <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0"></div>
                        ) : (
                          <Check className="w-4 h-4 text-slate-600 shrink-0" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={onCreateNew}
              className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black py-3 rounded-2xl text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <FolderPlus className="w-4 h-4 text-emerald-400" />
              <span>Create New Folder</span>
            </motion.button>
            <button
              onClick={onSkip}
              className="flex-1 text-slate-400 hover:text-white font-black py-3 rounded-2xl text-[10px] uppercase tracking-widest transition-all cursor-pointer"
            >
              Continue Without Folder
            </button>
          </div>
        </motion.div>
      </Overlay>
    </AnimatePresence>
  );
}
