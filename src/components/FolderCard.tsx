import React from 'react';
import { motion } from 'motion/react';
import { Edit3, Trash2, ChevronRight, Star } from 'lucide-react';
import { Folder } from '../types';
import { getFolderColor } from '../lib/folderColors';

interface FolderCardProps {
  folder: Folder;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
}

export default function FolderCard({ folder, onOpen, onEdit, onDelete, onToggleFavorite }: FolderCardProps) {
  const swatch = getFolderColor(folder.color);
  const displayDate = folder.customDate || folder.createdAt;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="bg-slate-950/40 border border-white/5 hover:border-white/10 rounded-2xl p-4 shadow-sm transition-all flex flex-col gap-3 text-left group"
    >
      <div className="flex items-start justify-between gap-2">
        <button onClick={onOpen} className="flex items-center gap-3 min-w-0 text-left cursor-pointer">
          <span className={`w-11 h-11 rounded-2xl ${swatch.bg} border ${swatch.border} flex items-center justify-center text-xl shrink-0`}>
            {folder.icon}
          </span>
          <div className="min-w-0">
            <h4 className="font-black text-white text-sm truncate">{folder.name}</h4>
            <span className={`text-[9px] font-black uppercase tracking-widest ${swatch.text}`}>{folder.category}</span>
          </div>
        </button>

        <button
          onClick={onToggleFavorite}
          className={`p-1.5 -m-1 rounded-lg hover:scale-110 transition-transform cursor-pointer shrink-0 ${folder.isFavorite ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'}`}
          title={folder.isFavorite ? 'Unpin folder' : 'Pin folder'}
        >
          <Star className={`w-3.5 h-3.5 ${folder.isFavorite ? 'fill-current' : ''}`} />
        </button>
      </div>

      {folder.description && (
        <p className="text-[11px] text-slate-400 font-medium leading-relaxed line-clamp-2">{folder.description}</p>
      )}

      <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-slate-500 pt-1 border-t border-white/5">
        <span>{folder.characterCount} {folder.characterCount === 1 ? 'character' : 'characters'}</span>
        <span>{displayDate.split('T')[0]}</span>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onOpen}
          className="flex-1 bg-white/5 hover:bg-white/10 text-slate-200 font-black text-[9px] uppercase tracking-widest py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1"
        >
          <span>Open</span>
          <ChevronRight className="w-3 h-3" />
        </button>
        <button
          onClick={onEdit}
          className="p-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl transition-all cursor-pointer"
          title="Edit / Rename"
        >
          <Edit3 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded-xl border border-rose-500/20 transition-all cursor-pointer"
          title="Delete folder"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}
