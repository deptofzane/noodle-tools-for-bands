import { and, eq } from 'drizzle-orm';
import { db } from './index';
import { eventReminderPrefs } from './schema';
import {
  prefKey,
  type ReminderCategory,
  type ReminderKind,
} from '../reminder-prefs';
import type { ReminderPrefs } from '../reminder-prefs';

/*
 * The reading and writing of reminder preferences. The vocabulary and the
 * defaults live in `lib/reminder-prefs.ts` instead, because importing this
 * file opens a connection pool — anything that only needs to know what "a
 * week before" means should not pay for that.
 */

export async function getReminderPrefs(userId: string): Promise<ReminderPrefs> {
  const rows = await db
    .select()
    .from(eventReminderPrefs)
    .where(eq(eventReminderPrefs.userId, userId));
  return new Map(rows.map((r) => [prefKey(r.category, r.kind), r.enabled]));
}

/** Record an explicit choice, replacing any previous one. */
export async function setReminderPref(
  userId: string,
  category: ReminderCategory,
  kind: ReminderKind,
  enabled: boolean,
): Promise<void> {
  await db
    .insert(eventReminderPrefs)
    .values({ userId, category, kind, enabled })
    .onConflictDoUpdate({
      target: [
        eventReminderPrefs.userId,
        eventReminderPrefs.category,
        eventReminderPrefs.kind,
      ],
      set: { enabled },
    });
}

/** Drop an explicit choice, putting that cell back on the default. */
export async function clearReminderPref(
  userId: string,
  category: ReminderCategory,
  kind: ReminderKind,
): Promise<void> {
  await db
    .delete(eventReminderPrefs)
    .where(
      and(
        eq(eventReminderPrefs.userId, userId),
        eq(eventReminderPrefs.category, category),
        eq(eventReminderPrefs.kind, kind),
      ),
    );
}
