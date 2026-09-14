'use client';

import { useCallback, useState } from 'react';
import type { NotificationKind } from '@/lib/db/notifications';
import { useToast } from '../ToastProvider';
import { usePersistedStringSet } from '../usePersistedStringSet';
import { Switch } from './Switch';
import { ReminderPrefs } from './ReminderPrefs';
import {
  ALL_PREF_KINDS,
  PREF_GROUPS,
  groupKinds,
  masterClickTurnsOn,
  masterState,
  pushableKinds,
  rowCanPush,
  type PrefGroup,
  type PrefRow,
} from './notificationGroups';

type Kind = NotificationKind;
type Channel = 'feed' | 'push';

/**
 * Per-user, per-channel notification toggles, in three layers.
 *
 * "In app" controls the Home feed; "Push" controls device notifications.
 * They're independent, except turning a kind off in the feed also disables its
 * push — you can't push what you don't want to see — so a Push switch is
 * disabled while its In app is off.
 *
 * Above the individual rows sit master switches: one per category, and one
 * pair governing everything. A master reads `on`, `off`, or `mixed`, and a
 * click always lands on a uniform result — off unless everything below is
 * already off. Half-on collapsing downward is deliberate: reaching for a
 * master is nearly always about silencing something.
 *
 * Groups start closed and remember what you leave open. Seventeen switches in
 * a flat list is a wall; five headings is a page you can read.
 */
export function NotificationPreferences({
  initialMuted,
  initialPushMuted,
  reminderPrefs,
}: {
  initialMuted: Kind[];
  initialPushMuted: Kind[];
  /** Forwarded to the Event reminders card, which renders below the groups. */
  reminderPrefs: [string, boolean][];
}) {
  const [muted, setMuted] = useState<Set<Kind>>(new Set(initialMuted));
  const [pushMuted, setPushMuted] = useState<Set<Kind>>(
    new Set(initialPushMuted),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, toggleOpen] = usePersistedStringSet('notifPrefGroups');
  const showToast = useToast();

  const feedOn = useCallback((k: Kind) => !muted.has(k), [muted]);
  // A kind pushes only when its feed is on *and* push isn't muted, which is
  // what makes the Push column read as "and also to my phone".
  const pushOn = useCallback(
    (k: Kind) => !muted.has(k) && !pushMuted.has(k),
    [muted, pushMuted],
  );

  /**
   * Apply one change to any number of kinds.
   *
   * Optimistic, then rolled back as a whole if the request fails — the server
   * takes the batch in a single statement, so there's no partial state to
   * reconcile against.
   */
  const apply = async (
    key: string,
    kinds: Kind[],
    channel: Channel,
    enabled: boolean,
    announce?: string,
  ) => {
    if (busy || kinds.length === 0) return;
    const [set, setSet] =
      channel === 'feed'
        ? ([muted, setMuted] as const)
        : ([pushMuted, setPushMuted] as const);
    const before = new Set(set);
    setBusy(key);
    setError(null);
    setSet(() => {
      const next = new Set(before);
      for (const k of kinds) {
        if (enabled) next.delete(k);
        else next.add(k);
      }
      return next;
    });
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kinds, enabled, channel }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (announce) showToast(announce, 'success');
    } catch {
      setSet(before);
      setError('Could not save that. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  const channelWord = (c: Channel) =>
    c === 'feed' ? 'in your feed' : 'on your devices';

  /**
   * A master switch: its state, and what one press does to everything below.
   *
   * `scope` is the whole noun phrase for the toast rather than a count, so the
   * global switch can say "all notifications" instead of naming a number of
   * *kinds* that wouldn't match what's on screen — two pairs are merged, so 17
   * kinds are drawn as 15 switches.
   */
  const master = (
    key: string,
    label: string,
    kinds: Kind[],
    channel: Channel,
    scope: string,
  ) => {
    const isOn = channel === 'feed' ? feedOn : pushOn;
    const state = masterState(kinds, isOn);
    // Push can't be turned on for kinds whose feed is off, so a category
    // that's entirely muted in the feed has nothing for this switch to do.
    const anyFeedOn = kinds.some(feedOn);
    const disabled =
      busy !== null || kinds.length === 0 || (channel === 'push' && !anyFeedOn);
    const turnOn = masterClickTurnsOn(state);
    // Turning push on can only reach kinds the feed already allows.
    const targets = channel === 'push' && turnOn ? kinds.filter(feedOn) : kinds;
    return (
      <Switch
        on={state === 'on'}
        mixed={state === 'mixed'}
        disabled={disabled}
        label={`${label} — ${channel === 'feed' ? 'in app' : 'push'}`}
        title={
          channel === 'push' && !anyFeedOn
            ? 'Turn something on in app first'
            : undefined
        }
        onToggle={() =>
          void apply(
            key,
            targets,
            channel,
            turnOn,
            `Turned ${turnOn ? 'on' : 'off'} ${scope} ${channelWord(channel)}.`,
          )
        }
      />
    );
  };

  const renderRow = (row: PrefRow) => {
    const key = row.kinds.join(',');
    const rowFeedOn = row.kinds.every(feedOn);
    const canPush = rowCanPush(row);
    const rowPushOn = canPush && row.kinds.some(pushOn);
    return (
      <li
        key={key}
        className="flex items-center justify-between gap-4 py-3 pl-8 pr-4"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium">{row.label}</p>
          <p className="text-xs minor-text-theme-colors dark:text-neutral-400">
            {row.description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-5">
          <Switch
            on={rowFeedOn}
            disabled={busy !== null}
            label={`${row.label} in app`}
            onToggle={() =>
              void apply(`${key}:feed`, row.kinds, 'feed', !rowFeedOn)
            }
          />
          <Switch
            on={rowPushOn}
            /* A row whose kinds never push gets a dead switch rather than one
               that writes a preference no code reads. */
            disabled={busy !== null || !rowFeedOn || !canPush}
            title={
              !canPush
                ? 'This one is never sent to your phone'
                : !rowFeedOn
                  ? 'Turn it on in app first'
                  : undefined
            }
            label={`${row.label} push`}
            onToggle={() =>
              void apply(`${key}:push`, row.kinds, 'push', !rowPushOn)
            }
          />
        </div>
      </li>
    );
  };

  const renderGroup = (g: PrefGroup) => {
    const kinds = groupKinds(g);
    const isOpen = open.has(g.id);
    return (
      <li key={g.id}>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <button
            type="button"
            onClick={() => toggleOpen(g.id)}
            aria-expanded={isOpen}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span aria-hidden="true" className="text-sm text-neutral-400">
              {isOpen ? '▾' : '▸'}
            </span>
            <span className="text-sm font-medium">{g.label}</span>
            <span className="text-xs minor-text-theme-colors">
              {g.rows.length}
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-5">
            {master(
              `${g.id}:feed`,
              g.label,
              kinds,
              'feed',
              `all ${g.rows.length} ${g.label} notifications`,
            )}
            {master(
              `${g.id}:push`,
              g.label,
              pushableKinds(g),
              'push',
              `all ${g.label} notifications`,
            )}
          </div>
        </div>
        {isOpen && (
          <ul className="border-t border-line bg-neutral-50/60 dark:bg-neutral-900/40">
            {g.rows.map(renderRow)}
          </ul>
        )}
      </li>
    );
  };

  const allPushable = PREF_GROUPS.flatMap(pushableKinds);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg-muted">
        Choose which activity from your bands reaches you, and how. “In app”
        shows it in your notification feed; “Push” sends it to your devices.
        These apply only to you.
      </p>
      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="rounded-lg border border-line">
        <div className="flex items-center justify-end gap-5 px-4 py-2 text-[0.6875rem] font-medium minor-text-theme-colors">
          <span className="w-11 text-center">In app</span>
          <span className="w-11 text-center">Push</span>
        </div>

        {/* Everything, in one gesture. Sits above the groups under the same
            two columns, so the layers read top-down. */}
        <div className="flex items-center justify-between gap-4 border-t border-line px-4 py-3">
          <p className="text-sm font-medium">All notifications</p>
          <div className="flex shrink-0 items-center gap-5">
            {master(
              'all:feed',
              'All notifications',
              ALL_PREF_KINDS,
              'feed',
              'all notifications',
            )}
            {master(
              'all:push',
              'All notifications',
              allPushable,
              'push',
              'all notifications',
            )}
          </div>
        </div>

        <ul className="divide-y divide-line border-t border-line">
          {PREF_GROUPS.map(renderGroup)}
        </ul>
      </div>

      {/* Rendered here rather than beside this component so its per-offset
          switches read the same `muted`/`pushMuted` the masters above do —
          two copies would drift apart the moment either was touched. */}
      <ReminderPrefs
        initial={reminderPrefs}
        channels={{
          feedOn,
          pushOn,
          busy: busy !== null,
          apply: (key, kinds, channel, enabled) =>
            void apply(key, kinds, channel, enabled),
        }}
      />
    </div>
  );
}
