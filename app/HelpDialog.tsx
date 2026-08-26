'use client';

import { useEffect, useRef } from 'react';
import { HelpContent } from './HelpContent';

/**
 * Help, over the top of whatever you were doing.
 *
 * A dialog rather than a navigation to `/help`, because help is read *about*
 * the thing you're stuck on: closing it must put you back exactly where you
 * were, mid-scroll, with the queue still playing. That also makes it work in
 * an installed app, where an in-scope link would open in the app window with
 * no address bar and no obvious way back — the manifest's `scope` can't
 * exclude a path, so `/help` can't be made to open in the browser instead.
 *
 * Modelled on the full-screen overlay in player/FullPlayer.tsx rather than
 * `Modal`, which caps out at `max-w-lg` and doesn't scroll — too small for a
 * page of prose.
 */
export function HelpDialog({ onClose }: { onClose: () => void }) {
  /**
   * The latest `onClose`, read through a ref.
   *
   * The parent renders `onClose={() => setHelpOpen(false)}`, a fresh function
   * every time it re-renders. An effect that depends on it therefore tears
   * down and re-runs on any parent render — which for the history effect
   * below means popping and re-pushing the entry, with the `popstate` from
   * that pop landing on the freshly-added listener and closing the dialog.
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  /** Set while the cleanup below pops its own entry — see the effect. */
  const poppingOwnEntry = useRef(false);

  // Escape closes, and the page underneath shouldn't scroll while it's open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  /**
   * Make the system back gesture close this instead of leaving the page.
   *
   * Counter-intuitively, "don't disturb the history" is achieved by touching
   * it: pushing one entry on open means Android's back has something of ours
   * to pop, so it dismisses the panel rather than navigating away from the
   * page the user was reading about. What we push we pop, so the stack ends
   * where it started.
   *
   * The cleanup only calls `back()` when our entry is still on top — closing
   * *via* back has already removed it, and popping again would take the user
   * off the page, which is the whole thing this exists to prevent.
   */
  useEffect(() => {
    window.history.pushState({ helpDialog: true }, '');
    const onPop = () => {
      // `back()` is asynchronous, so a pop this component asked for can
      // arrive *after* a re-run has re-subscribed — React Strict Mode's
      // mount/cleanup/mount does exactly that in development. Without this
      // guard the dialog reads its own pop as the user's and closes on open.
      if (poppingOwnEntry.current) {
        poppingOwnEntry.current = false;
        return;
      }
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (
        (window.history.state as { helpDialog?: boolean } | null)?.helpDialog
      ) {
        poppingOwnEntry.current = true;
        window.history.back();
      }
    };
    // Runs once per open. It must not key off `onClose` — see `onCloseRef`.
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-dialog-title"
      className="fixed inset-0 z-50 flex flex-col bg-surface"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-4 py-2 lg:px-6">
        <h2 id="help-dialog-title" className="text-base font-semibold">
          Help
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close help"
          title="Close help"
          className="flex h-9 w-9 items-center justify-center rounded-full text-fg-dim hover:bg-surface-hover"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Headings drop a level: the dialog's own "Help" is the h2 above. */}
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-6">
          <HelpContent level={3} />
        </div>
      </div>
    </div>
  );
}
