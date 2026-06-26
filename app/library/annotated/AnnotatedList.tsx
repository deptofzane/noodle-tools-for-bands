'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AnnotatedFileSummary } from '@/lib/notes';
import { markConversationSeen, readAllSeen } from '@/lib/seen-cache';
import { useTrackPending } from '../../PendingActionProvider';

/**
 * Renders the user's annotated-files list.
 *
 * Fetches on mount; no polling (this view is much more expensive
 * per-call than the notes panel — see /api/notes/annotated). The user
 * can refresh manually if they suspect new data; for typical use,
 * one fetch per page visit is plenty.
 *
 * Badges: each row compares its latest activity / mention timestamp
 * against a client-side per-conversation "seen" marker
 * (`lib/seen-cache.ts`). A conversation touched since you last opened it
 * shows "New"; one you were @-mentioned in since then shows "Mentioned".
 * Opening the row marks it seen, clearing the badge.
 */
export function AnnotatedList({ currentUserSub }: { currentUserSub: string }) {
  const [files, setFiles] = useState<AnnotatedFileSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState<Record<string, number>>({});
  const trackPending = useTrackPending();

  useEffect(() => {
    let cancelled = false;
    setError(null);
    // Read the local seen markers in parallel with the network fetch.
    void readAllSeen().then((s) => {
      if (!cancelled) setSeen(s);
    });
    // Wrap the full pipeline (fetch + parse + state update) so the
    // Header spinner stays on until the list is actually rendered, not
    // just until the network round-trip returns.
    void trackPending(async () => {
      try {
        const r = await fetch('/api/notes/annotated', { cache: 'no-store' });
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.message ?? body.error ?? `HTTP ${r.status}`);
        }
        const data = (await r.json()) as { files: AnnotatedFileSummary[] };
        if (!cancelled) setFiles(data.files);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [trackPending]);

  // Mark a conversation seen on open: clears its badge immediately
  // (local state) and persists the marker for next time.
  const handleOpen = (audioFileId: string) => {
    setSeen((prev) => ({ ...prev, [audioFileId]: Date.now() }));
    void markConversationSeen(audioFileId);
  };

  if (error) {
    return (
      <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
        {error}
      </p>
    );
  }

  if (files === null) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }

  if (files.length === 0) {
    return (
      <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
        No annotated files yet. Open a folder from the{' '}
        <Link href="/library" className="text-blue-600 underline">
          Library
        </Link>{' '}
        and add a note to any audio file.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
      {files.map((file) => {
        const badge = computeBadge(file, seen[file.audioFileId] ?? 0, currentUserSub);
        return (
          <li key={file.audioFileId}>
            <Link
              href={`/notes/${file.audioFileId}`}
              onClick={() => handleOpen(file.audioFileId)}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">
                    {file.audioFileName}
                  </span>
                  {badge === 'mentioned' && (
                    <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      @ Mentioned
                    </span>
                  )}
                  {badge === 'new' && (
                    <span className="shrink-0 rounded bg-cyan-100 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300">
                      New
                    </span>
                  )}
                </div>
                {file.lastModifiedISO && (
                  <div className="mt-0.5 text-xs text-neutral-500">
                    Updated {formatRelativeTime(file.lastModifiedISO)}
                    {file.lastActivityBy && (
                      <> by {actorLabel(file.lastActivityBy)}</>
                    )}
                  </div>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Decide which badge (if any) a row shows.
 *
 * - "mentioned" wins: you were @-tagged since you last opened it.
 * - "new" otherwise: cross-user activity since you last opened it.
 *
 * Activity authored by you never counts as "new" — you already know
 * about your own edits.
 */
function computeBadge(
  file: AnnotatedFileSummary,
  seenMs: number,
  currentUserSub: string,
): 'mentioned' | 'new' | null {
  const mentionMs = file.mentionedAt ? Date.parse(file.mentionedAt) : NaN;
  if (!Number.isNaN(mentionMs) && mentionMs > seenMs) return 'mentioned';

  const activityMs = file.lastModifiedISO
    ? Date.parse(file.lastModifiedISO)
    : NaN;
  const byMe = file.lastActivityBy?.sub === currentUserSub;
  if (!Number.isNaN(activityMs) && activityMs > seenMs && !byMe) return 'new';

  return null;
}

function actorLabel(by: { name?: string | null; email?: string | null }): string {
  if (by.name) return by.name;
  if (by.email) return by.email;
  return 'someone';
}

/** Human-friendly "5m ago" / "2h ago" / etc. */
function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}
