'use client';

import Link from 'next/link';
import { usePersistedBoolean } from '../usePersistedBoolean';

export interface OpenPoll {
  id: string;
  bandId: string;
  bandName: string;
  title: string;
  description: string | null;
}

/**
 * Collapsible list of polls across the user's bands they haven't voted in
 * yet. Shows each poll's question + description and links to it. The
 * open/closed state persists across reloads. Renders nothing when empty.
 */
export function OpenPolls({ polls }: { polls: OpenPoll[] }) {
  const [open, setOpen] = usePersistedBoolean('homeOpenPollsOpen', true);
  if (polls.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 self-start text-left"
      >
        <span
          aria-hidden="true"
          className="minor-text-theme-colors hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          {open ? '▾' : '▸'}
        </span>
        <h2 className="text-sm font-medium">Open polls</h2>
        <span className="text-xs minor-text-theme-colors">
          <span aria-hidden="true">·</span> {polls.length}
        </span>
      </button>

      {open && (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {polls.map((p) => (
            <li key={p.id}>
              <Link
                href={`/bands/${p.bandId}/polls/${p.id}`}
                className="flex flex-col gap-0.5 px-3 py-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <span className="text-sm font-medium">{p.title}</span>
                {p.description && (
                  <span className="whitespace-pre-wrap text-xs minor-text-theme-colors">
                    {p.description}
                  </span>
                )}
                <span className="text-[0.6875rem] minor-text-theme-colors">
                  {p.bandName}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
