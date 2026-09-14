import { and, eq, inArray } from 'drizzle-orm';
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

/**
 * The same, for many people at once — what the reminder sweep uses.
 *
 * A band's whole membership in one query rather than one per person: the sweep
 * asks about every member of every band with an event due, which was its
 * second-largest source of round trips after the inserts themselves.
 *
 * Users with no stored preferences are simply absent from the map; the caller
 * falls back to the defaults, exactly as it would for an empty result.
 */
export async function getReminderPrefsForUsers(
  userIds: string[],
): Promise<Map<string, ReminderPrefs>> {
  const byUser = new Map<string, ReminderPrefs>();
  // `inArray` with an empty list is not valid SQL, and there's nothing to ask.
  if (userIds.length === 0) return byUser;

  const rows = await db
    .select()
    .from(eventReminderPrefs)
    .where(inArray(eventReminderPrefs.userId, userIds));

  for (const r of rows) {
    let prefs = byUser.get(r.userId);
    if (!prefs) {
      prefs = new Map();
      byUser.set(r.userId, prefs);
    }
    prefs.set(prefKey(r.category, r.kind), r.enabled);
  }
  return byUser;
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
