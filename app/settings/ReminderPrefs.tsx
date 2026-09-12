'use client';

import { useState } from 'react';
import { useToast } from '../ToastProvider';
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
 * Which event types get which reminder offsets.
 *
 * Three blocks of checkboxes rather than a 6×3 grid: at phone width a matrix
 * that size needs either abbreviated headers or sideways scrolling, and
 * "Remind me the day of: Shows, Practice" reads as a sentence at any width.
 *
 * Boxes show the default until someone disagrees with it, and a toggle back to
 * the default clears the stored row rather than pinning it — see the route.
 *
 * This decides whether a reminder *happens*. Whether it also buzzes a phone is
 * the per-offset push switch above, which is kind-wide.
 */
export function ReminderPrefs({ initial }: { initial: [string, boolean][] }) {
  const showToast = useToast();
  const [prefs, setPrefs] = useState<PrefMap>(() => new Map(initial));
  const [busy, setBusy] = useState(false);

  const toggle = async (category: ReminderCategory, kind: ReminderKind) => {
    const next = !wantsReminder(prefs, category, kind);
    const before = prefs;
    setBusy(true);
    // Optimistic: the box moves now and goes back if the save fails, the same
    // way the notification switches above behave.
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
    <div className="flex flex-col gap-4 rounded-lg border border-line p-4">
      <div>
        <p className="font-medium">Event reminders</p>
        <p className="mt-1 text-xs minor-text-theme-colors dark:text-neutral-400">
          Which kinds of event remind you, and how far ahead. Reminders arrive
          in the morning, in the band’s timezone.
        </p>
      </div>

      {REMINDER_KINDS.map((kind) => (
        <fieldset key={kind} className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{OFFSET_LABEL[kind]}</legend>
          <div className="flex flex-col gap-1.5">
            {REMINDER_CATEGORIES.map((category) => (
              <label key={category} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={wantsReminder(prefs, category, kind)}
                  disabled={busy}
                  onChange={() => void toggle(category, kind)}
                  className="h-4 w-4 disabled:opacity-40"
                />
                <span>{CATEGORY_LABEL[category]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
