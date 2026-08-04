'use client';

import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

/**
 * Shared inline form for creating a note, replying, and editing.
 *
 * @-mentions: when `mentionables` is provided, typing `@` opens an
 * autocomplete of band members. Picking one inserts `@Display Name `
 * and records the member's user id. On submit only mentions whose
 * `@label` text is still present in the body are emitted.
 */

export interface Mentionable {
  id: string; // user id
  name?: string | null;
  email?: string | null;
}

function mentionLabel(m: Mentionable): string {
  return m.name ?? m.email ?? 'user';
}

const MAX_MENU_ITEMS = 6;

export function NoteForm({
  initialBody = '',
  header,
  placeholder = 'Write a note…',
  submitLabel = 'Save',
  onSubmit,
  onCancel,
  autoFocus = true,
  mentionables = [],
}: {
  initialBody?: string;
  header?: React.ReactNode;
  placeholder?: string;
  submitLabel?: string;
  onSubmit: (body: string, mentions: string[]) => Promise<void> | void;
  onCancel?: () => void;
  autoFocus?: boolean;
  mentionables?: Mentionable[];
}) {
  const [body, setBody] = useState(initialBody);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mentions the user picked: { id, label }. Resolved against the body
  // text at submit time.
  const pickedRef = useRef<Array<{ id: string; label: string }>>([]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const atIndexRef = useRef<number | null>(null);

  const matches = useMemo(() => {
    if (!menuOpen || mentionables.length === 0) return [];
    const q = query.toLowerCase();
    return mentionables
      .filter((m) => {
        if (!q) return true;
        return (
          (m.name ?? '').toLowerCase().includes(q) ||
          (m.email ?? '').toLowerCase().includes(q)
        );
      })
      .slice(0, MAX_MENU_ITEMS);
  }, [menuOpen, mentionables, query]);

  const closeMenu = () => {
    setMenuOpen(false);
    setQuery('');
    atIndexRef.current = null;
  };

  const syncMenu = (value: string, cursor: number) => {
    if (mentionables.length === 0) return;
    const upto = value.slice(0, cursor);
    const m = upto.match(/(?:^|\s)@([^\s@]{0,30})$/);
    if (!m) {
      if (menuOpen) closeMenu();
      return;
    }
    setQuery(m[1] ?? '');
    setActiveIndex(0);
    atIndexRef.current = cursor - (m[1]?.length ?? 0) - 1;
    setMenuOpen(true);
  };

  const handleChange = (value: string, cursor: number) => {
    setBody(value);
    syncMenu(value, cursor);
  };

  const selectMention = (m: Mentionable) => {
    const at = atIndexRef.current;
    const el = textareaRef.current;
    if (at === null || !el) return;
    const cursor = el.selectionStart ?? body.length;
    const label = mentionLabel(m);
    const before = body.slice(0, at);
    const after = body.slice(cursor);
    const insert = `@${label} `;
    const next = before + insert + after;
    setBody(next);
    pickedRef.current.push({ id: m.id, label });
    closeMenu();
    requestAnimationFrame(() => {
      el.focus();
      const pos = before.length + insert.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const resolveMentions = (text: string): string[] => {
    const ids = new Set<string>();
    for (const { id, label } of pickedRef.current) {
      if (text.includes(`@${label}`)) ids.add(id);
    }
    return [...ids];
  };

  const submit = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(trimmed, resolveMentions(trimmed));
      setBody('');
      pickedRef.current = [];
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
    if (menuOpen && matches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % matches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const pick = matches[activeIndex];
        if (pick) selectMention(pick);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu();
        return;
      }
    }

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
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) =>
            handleChange(e.target.value, e.target.selectionStart)
          }
          onKeyDown={handleKey}
          onBlur={() => setTimeout(closeMenu, 120)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          rows={3}
          className="w-full resize-y rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
        />
        {menuOpen && matches.length > 0 && (
          <ul className="absolute left-2 right-2 top-full z-10 mt-1 max-h-48 overflow-auto rounded-md border border-neutral-200 bg-white py-1 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            {matches.map((m, i) => (
              <li key={m.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectMention(m);
                  }}
                  className={
                    'flex w-full flex-col items-start px-4 py-3 md:py-1.5 md:px-3 text-left ' +
                    (i === activeIndex
                      ? 'bg-blue-50 dark:bg-blue-950'
                      : 'hover:bg-neutral-50 dark:hover:bg-neutral-800')
                  }
                >
                  <span className="font-medium">{mentionLabel(m)}</span>
                  {m.email && m.email !== mentionLabel(m) && (
                    <span className="text-[0.6875rem] text-neutral-500">
                      {m.email}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.625rem] text-neutral-500">
          ⌘ Enter to submit
        </span>
        <div className="flex gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-4 py-3 md:py-1.5 md:px-3 text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={!body.trim() || submitting}
            className="rounded-md bg-blue-600 px-4 py-3 md:py-1.5 md:px-3 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
