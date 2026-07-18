'use client';

import { useState } from 'react';

type Kind =
  | 'song-comment'
  | 'chat-message'
  | 'event-added'
  | 'song-updated'
  | 'event-updated'
  | 'band-updated'
  | 'poll-created';

const KINDS: { kind: Kind; label: string; description: string }[] = [
  {
    kind: 'song-comment',
    label: 'Song comments',
    description: 'When someone comments on a song you have access to.',
  },
  {
    kind: 'chat-message',
    label: 'Band chat',
    description: 'New messages in a band’s chat.',
  },
  {
    kind: 'event-added',
    label: 'New events',
    description: 'When an event is added to one of your bands.',
  },
  {
    kind: 'song-updated',
    label: 'Song updates',
    description: 'When a song is renamed, moved, or archived.',
  },
  {
    kind: 'event-updated',
    label: 'Event updates',
    description: 'When an event’s details are edited.',
  },
  {
    kind: 'band-updated',
    label: 'Band updates',
    description: 'When a band’s members change.',
  },
  {
    kind: 'poll-created',
    label: 'Polls',
    description: 'When a new poll is started in one of your bands.',
  },
];

/**
 * Per-user toggles for which activity reaches the Home notification feed.
 * Muting is applied at read time server-side; this just flips the mute.
 */
export function NotificationPreferences({
  initialMuted,
}: {
  initialMuted: Kind[];
}) {
  const [muted, setMuted] = useState<Set<Kind>>(new Set(initialMuted));
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (kind: Kind) => {
    if (busy) return;
    const enabled = muted.has(kind); // currently muted → we're enabling it
    setBusy(kind);
    setError(null);
    // Optimistic update.
    setMuted((prev) => {
      const next = new Set(prev);
      if (enabled) next.delete(kind);
      else next.add(kind);
      return next;
    });
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, enabled }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      // Roll back on failure.
      setMuted((prev) => {
        const next = new Set(prev);
        if (enabled) next.add(kind);
        else next.delete(kind);
        return next;
      });
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Choose which activity from your bands shows up in your{' '}
        notifications. These apply only to you.
      </p>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
        {KINDS.map(({ kind, label, description }) => {
          const on = !muted.has(kind);
          return (
            <li
              key={kind}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {description}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={label}
                disabled={busy === kind}
                onClick={() => toggle(kind)}
                className={
                  'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ' +
                  (on ? 'bg-blue-600' : 'bg-neutral-300 dark:bg-neutral-700')
                }
              >
                <span
                  aria-hidden="true"
                  className={
                    'inline-block h-5 w-5 transform rounded-full bg-white shadow transition ' +
                    (on ? 'translate-x-5' : 'translate-x-0.5')
                  }
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
