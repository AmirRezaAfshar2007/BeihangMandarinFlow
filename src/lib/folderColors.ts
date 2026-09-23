export interface FolderColorSwatch {
  key: string;
  label: string;
  dot: string;
  bg: string;
  border: string;
  text: string;
  solid: string;
}

// Every class here is a literal Tailwind utility (not built dynamically), so
// it survives Tailwind's content-scanning/purge step. Keep entries in sync
// with the `.light` overrides already defined for these colors in index.css.
export const FOLDER_COLORS: FolderColorSwatch[] = [
  { key: 'emerald', label: 'Emerald', dot: 'bg-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', solid: 'bg-emerald-500' },
  { key: 'cyan', label: 'Cyan', dot: 'bg-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400', solid: 'bg-cyan-500' },
  { key: 'amber', label: 'Amber', dot: 'bg-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', solid: 'bg-amber-500' },
  { key: 'rose', label: 'Rose', dot: 'bg-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', text: 'text-rose-400', solid: 'bg-rose-500' },
  { key: 'violet', label: 'Violet', dot: 'bg-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20', text: 'text-violet-400', solid: 'bg-violet-500' },
  { key: 'sky', label: 'Sky', dot: 'bg-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20', text: 'text-sky-400', solid: 'bg-sky-500' },
  { key: 'fuchsia', label: 'Fuchsia', dot: 'bg-fuchsia-400', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/20', text: 'text-fuchsia-400', solid: 'bg-fuchsia-500' },
  { key: 'slate', label: 'Slate', dot: 'bg-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20', text: 'text-slate-400', solid: 'bg-slate-500' },
];

export const FOLDER_ICONS = ['📁', '📚', '⭐', '🎯', '🔥', '🌱', '🏆', '✒️', '🧠', '🀄'];

export function getFolderColor(key: string): FolderColorSwatch {
  return FOLDER_COLORS.find(c => c.key === key) || FOLDER_COLORS[0];
}
