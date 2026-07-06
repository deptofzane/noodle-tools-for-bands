'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';

/**
 * Shared confirmation modal for destructive actions.
 *
 * Renders nothing when `open` is false. Dismisses via Cancel, backdrop
 * click, or Escape (all disabled while `busy`). The confirm button shows
 * `busyLabel` while in flight.
 *
 * Optional type-to-confirm: pass `confirmPhrase` (e.g. a band name) and
 * the confirm button stays disabled until the user types it exactly. The
 * typed text is owned here and resets whenever the modal closes.
 */
export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  busyLabel = 'Working…',
  busy = false,
  onConfirm,
  onCancel,
  confirmPhrase,
  confirmPhrasePrompt,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** When set, require typing this exact text to enable confirm. */
  confirmPhrase?: string;
  confirmPhrasePrompt?: ReactNode;
}) {
  const titleId = useId();
  const [text, setText] = useState('');

  // Clear the typed phrase whenever the modal closes.
  useEffect(() => {
    if (!open) setText('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const phraseRequired = Boolean(confirmPhrase);
  const confirmDisabled =
    busy || (phraseRequired && text.trim() !== confirmPhrase);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-base font-semibold">
          {title}
        </h2>
        {description && (
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            {description}
          </p>
        )}

        {phraseRequired && (
          <>
            <label className="mt-3 block text-xs text-neutral-600 dark:text-neutral-400">
              {confirmPhrasePrompt ?? (
                <>
                  Type <span className="font-semibold">{confirmPhrase}</span> to
                  confirm:
                </>
              )}
            </label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={confirmPhrase}
              autoFocus
              className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md px-4 py-3 md:py-1.5 md:px-3 md:py-1.5 md:px-3 text-sm text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            className="rounded-md bg-red-600 px-4 py-3 md:py-1.5 md:px-3 md:py-1.5 md:px-3 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
