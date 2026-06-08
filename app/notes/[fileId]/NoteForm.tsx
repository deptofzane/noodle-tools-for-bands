'use client';

import {
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

/**
 * Shared inline form used for: creating a top-level note, replying to a
 * note, and editing your own note/reply.
 *
 * Differences between those flows live in props (header, placeholder,
 * submit label) — the form itself just owns the textarea state and
 * submit/cancel handling.
 *
 * Cmd/Ctrl + Enter submits.
 */
export function NoteForm({
  initialBody = '',
  header,
  placeholder = 'Write a note…',
  submitLabel = 'Save',
  onSubmit,
  onCancel,
  autoFocus = true,
}: {
  initialBody?: string;
  header?: React.ReactNode;
  placeholder?: string;
  submitLabel?: string;
  onSubmit: (body: string) => Promise<void> | void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState(initialBody);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      setBody('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit();
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void submit();
    } else if (e.key === 'Escape' && onCancel) {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      {header && <div className="text-xs text-neutral-500">{header}</div>}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={3}
        className="w-full resize-y rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
      />
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-neutral-500">⌘ Enter to submit</span>
        <div className="flex gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={!body.trim() || submitting}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
