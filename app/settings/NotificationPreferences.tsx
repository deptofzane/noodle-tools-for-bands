'use client';

import { useState } from 'react';
import type { NotificationKind } from '@/lib/db/notifications';

/*
 * From the schema, not re-listed here — the same hand-written union in
 * NotificationList had already drifted once. Type-only, so the server module
 * doesn't reach the bundle.
 */
type Kind = NotificationKind;

type Channel = 'feed' | 'push';

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
  {
    kind: 'poll-closed',
    label: 'Closed polls',
    description: 'When a poll in one of your bands is closed.',
  },
  {
    kind: 'poll-cancelled',
    label: 'Cancelled polls',
    description: 'When a poll in one of your bands is cancelled.',
  },
  {
    kind: 'poll-auto-closed',
    label: 'Auto-closed polls',
    description: 'When a poll closes automatically because everyone voted.',
  },
  {
    kind: 'poll-updated',
    label: 'Poll updates',
    description: 'When a poll in one of your bands is edited (and re-opened).',
  },
  {
    kind: 'setlist-created',
    label: 'New setlists',
    description: 'When a setlist is created in one of your bands.',
  },
  {
    kind: 'album-created',
    label: 'New albums',
    description: 'When an album is created in one of your bands.',
  },
  {
    kind: 'audio-added',
    label: 'New audio',
    description: 'When audio is added to one of your bands.',
  },
  {
    kind: 'note-pinned',
    label: 'Pinned notes',
    description:
      'When someone pins a note to the top of your band’s shared notes. Never sent to your phone.',
  },
  {
    kind: 'note-unpinned',
    label: 'Unpinned notes',
    description:
      'When someone takes a pinned note back down. Never sent to your phone.',
  },
  {
    kind: 'song-created',
    label: 'New songs',
    description: 'When a song is created in one of your bands.',
  },
];

function Switch({
  on,
  disabled,
  label,
  onToggle,
}: {
  on: boolean;
  disabled: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-40 ' +
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
  );
}

/**
 * Per-user, per-channel notification toggles. "In app" controls the Home feed;
 * "Push" controls device notifications. They're independent, except turning a
 * kind off in the feed also disables its push (you can't push what you don't
 * want to see), so the Push switch is disabled while In app is off.
 */
export function NotificationPreferences({
  initialMuted,
  initialPushMuted,
}: {
  initialMuted: Kind[];
  initialPushMuted: Kind[];
}) {
  const [muted, setMuted] = useState<Set<Kind>>(new Set(initialMuted));
  const [pushMuted, setPushMuted] = useState<Set<Kind>>(
    new Set(initialPushMuted),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (kind: Kind, channel: Channel) => {
    const key = `${kind}:${channel}`;
    if (busy) return;
    const [set, setSet] =
      channel === 'feed'
        ? ([muted, setMuted] as const)
        : ([pushMuted, setPushMuted] as const);
    const enabling = set.has(kind); // currently muted → this toggle enables it
    setBusy(key);
    setError(null);
    // Optimistic.
    setSet((prev) => {
      const next = new Set(prev);
      if (enabling) next.delete(kind);
      else next.add(kind);
      return next;
    });
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, enabled: enabling, channel }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      // Roll back.
      setSet((prev) => {
        const next = new Set(prev);
        if (enabling) next.add(kind);
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
        Choose which activity from your bands reaches you, and how. “In app”
        shows it in your notification feed; “Push” sends it to your devices.
        These apply only to you.
      </p>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-end gap-5 px-4 py-2 text-[0.6875rem] font-medium minor-text-theme-colors">
          <span className="w-11 text-center">In app</span>
          <span className="w-11 text-center">Push</span>
        </div>
        <ul className="divide-y divide-neutral-200 border-t border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {KINDS.map(({ kind, label, description }) => {
            const feedOn = !muted.has(kind);
            const pushOn = feedOn && !pushMuted.has(kind);
            return (
              <li
                key={kind}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs minor-text-theme-colors dark:text-neutral-400">
                    {description}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-5">
                  <Switch
                    on={feedOn}
                    disabled={busy === `${kind}:feed`}
                    label={`${label} in app`}
                    onToggle={() => toggle(kind, 'feed')}
                  />
                  <Switch
                    on={pushOn}
                    disabled={!feedOn || busy === `${kind}:push`}
                    label={`${label} push`}
                    onToggle={() => toggle(kind, 'push')}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
