'use client';

import { useState } from 'react';
import type { NotificationKind } from '@/lib/db/notifications';
import { useToast } from '../ToastProvider';
import { Switch } from './Switch';
import {
  REMINDER_CATEGORIES,
  REMINDER_KINDS,
  prefKey,
  wantsReminder,
  type ReminderCategory,
  type ReminderKind,
  type ReminderPrefs as PrefMap,
} from '@/lib/reminder-prefs';

/** How each offset is introduced. One block per offset, as a sentence. */
const OFFSET_LABEL: Record<ReminderKind, string> = {
  'event-week-before': 'Remind me a week before',
  'event-day-before': 'Remind me the day before',
  'event-day-of': 'Remind me the day of',
};

/** The calendar's categories, in the words people see elsewhere. */
const CATEGORY_LABEL: Record<ReminderCategory, string> = {
  show: 'Shows',
  practice: 'Practice',
  writing: 'Writing sessions',
  studio: 'Studio',
  'time-off': 'Time off',
  other: 'Other or untyped',
};

/**
 * The in-app/push state for one kind, lent by `NotificationPreferences`.
 *
 * Passed down rather than held here so there is exactly one copy of
 * `muted`/`pushMuted` on the screen: a second copy would let a switch here
 * disagree with the master switches above, which read the same kinds.
 */
export interface ChannelControls {
  feedOn: (k: NotificationKind) => boolean;
  pushOn: (k: NotificationKind) => boolean;
  busy: boolean;
  apply: (
    key: string,
    kinds: NotificationKind[],
    channel: 'feed' | 'push',
    enabled: boolean,
  ) => void;
}

/**
 * Event reminders: whether each offset reaches you, and for which event types.
 *
 * Both halves of one decision, so they sit together — the offset's own In app
 * and Push switches on its heading row, the event types it applies to directly
 * underneath. They used to be a section apart, which meant turning reminders on
 * and choosing what they covered were done in different places.
 *
 * Three blocks rather than a 6×3 grid: at phone width a matrix that size needs
 * either abbreviated headers or sideways scrolling, and "Remind me the day of:
 * Shows, Practice" reads as a sentence at any width.
 *
 * Boxes show the default until someone disagrees with it, and a toggle back to
 * the default clears the stored row rather than pinning it — see the route.
 */
export function ReminderPrefs({
  initial,
  channels,
}: {
  initial: [string, boolean][];
  channels: ChannelControls;
}) {
  const showToast = useToast();
  const [prefs, setPrefs] = useState<PrefMap>(() => new Map(initial));
  const [busy, setBusy] = useState(false);

  const toggle = async (category: ReminderCategory, kind: ReminderKind) => {
    const next = !wantsReminder(prefs, category, kind);
    const before = prefs;
    setBusy(true);
    // Optimistic: the box moves now and goes back if the save fails, the same
    // way the notification switches do.
    setPrefs(new Map(before).set(prefKey(category, kind), next));
    try {
      const res = await fetch('/api/notifications/reminder-prefs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, kind, enabled: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setPrefs(before);
      showToast('Could not save that reminder setting.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 rounded-lg border border-line p-4">
      <div>
        <p className="font-medium">Event reminders</p>
        <p className="mt-1 text-xs minor-text-theme-colors dark:text-neutral-400">
          Which kinds of event remind you, and how far ahead. Reminders arrive
          in the morning, in the band’s timezone.
        </p>
      </div>

      {REMINDER_KINDS.map((kind) => {
        // A reminder kind *is* a notification kind — the switches below write
        // the same preference the grouped rows do.
        const notifKind = kind as NotificationKind;
        const feed = channels.feedOn(notifKind);
        const push = channels.pushOn(notifKind);
        return (
          /*
           * `role="group"` rather than `fieldset`/`legend`: a legend only names
           * its fieldset while it's the *first* child, and the switches have to
           * share that line. Naming the group from the heading alone also keeps
           * the switches' own labels out of the group's name.
           */
          <div
            key={kind}
            role="group"
            aria-labelledby={`reminder-${kind}`}
            className="flex flex-col gap-2"
          >
            <div className="flex items-center justify-between gap-4">
              <h3 id={`reminder-${kind}`} className="text-sm font-medium">
                {OFFSET_LABEL[kind]}
              </h3>
              <div className="flex shrink-0 items-center gap-5">
                <Switch
                  on={feed}
                  disabled={channels.busy}
                  label={`${OFFSET_LABEL[kind]} in app`}
                  onToggle={() =>
                    channels.apply(`${kind}:feed`, [notifKind], 'feed', !feed)
                  }
                />
                <Switch
                  on={push}
                  // Push can't outlive the feed: you can't buzz a phone about
                  // something you've asked not to be told at all.
                  disabled={channels.busy || !feed}
                  title={feed ? undefined : 'Turn it on in app first'}
                  label={`${OFFSET_LABEL[kind]} push`}
                  onToggle={() =>
                    channels.apply(`${kind}:push`, [notifKind], 'push', !push)
                  }
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              {REMINDER_CATEGORIES.map((category) => (
                <label key={category} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={wantsReminder(prefs, category, kind)}
                    disabled={busy || channels.busy}
                    onChange={() => void toggle(category, kind)}
                    className="h-4 w-4 disabled:opacity-40"
                  />
                  <span>{CATEGORY_LABEL[category]}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
