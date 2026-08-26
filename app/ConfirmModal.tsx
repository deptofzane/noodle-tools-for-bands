'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { Modal } from './Modal';

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

  if (!open) return null;

  const phraseRequired = Boolean(confirmPhrase);
  const confirmDisabled =
    busy || (phraseRequired && text.trim() !== confirmPhrase);

  return (
    <Modal onClose={onCancel} busy={busy} labelledBy={titleId} size="sm">
      <h2 id={titleId} className="text-base font-semibold">
        {title}
      </h2>
      {description && (
        <p className="mt-2 text-sm text-fg-muted">{description}</p>
      )}

      {phraseRequired && (
        <>
          <label className="mt-3 block text-xs text-fg-muted">
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
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 border-line-strong bg-surface"
          />
        </>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="btn-ghost"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmDisabled}
          className="rounded-md bg-red-600 px-4 py-3 md:py-1.5 md:px-3 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
        >
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
