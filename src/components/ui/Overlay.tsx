import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';

/**
 * Reference-counted body scroll lock.
 *
 * Overlays can be nested (e.g. the document viewer opens on top of the
 * lesson editor), so a naive `overflow = hidden` would be reverted by the
 * first overlay that unmounts while another is still open. Counting keeps the
 * page locked until the last overlay closes.
 */
let lockCount = 0;
let savedOverflow = '';

function acquireLock() {
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  lockCount += 1;
}

function releaseLock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = savedOverflow;
  }
}

type OverlayProps = React.ComponentProps<typeof motion.div> & {
  /** Set false for non-blocking overlays that should not freeze the page. */
  lockScroll?: boolean;
};

/**
 * Full-screen overlay primitive — the single place full-screen dialogs,
 * editors and modals are mounted.
 *
 * Why this exists: the app shell renders `<main>` as a `relative z-10` box
 * while the header is `sticky z-40` and the footer is a later sibling at
 * `z-10`. A `fixed inset-0` overlay rendered inside `<main>` is trapped in
 * that stacking context, so its own z-index only competes *within* main — the
 * header and footer paint on top of it. That is what made long pages and
 * editors look "doubled/stacked" while scrolling (content sliding under the
 * toolbar, the footer bleeding across the panel).
 *
 * Portal-ing to <body> escapes the shell's stacking context and covers the
 * whole viewport. The default layer (`z-[70]`) sits above the header (`z-40`)
 * and footer, and later-mounted overlays stack above earlier ones.
 */
export default function Overlay({
  children,
  className = 'fixed inset-0 z-[70] bg-slate-950/95 backdrop-blur-xl overflow-y-auto',
  lockScroll = true,
  ...motionProps
}: OverlayProps) {
  useEffect(() => {
    if (!lockScroll) return;
    acquireLock();
    return releaseLock;
  }, [lockScroll]);

  // Portal preserves the React tree, so AnimatePresence exit animations and
  // context still work exactly as they did when rendered in place.
  return createPortal(
    <motion.div className={className} {...motionProps}>
      {children}
    </motion.div>,
    document.body,
  );
}
