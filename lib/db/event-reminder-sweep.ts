import { sql } from 'drizzle-orm';
import { db } from './index';
import { notifications } from './schema';
import { listMembers } from './bands';
import { listEventsForReminders } from './events';
import { getReminderPrefs } from './event-reminders';
import { addDays } from '../event-dates';
import { categoryForEventType, wantsReminder } from '../reminder-prefs';
import { dueReminders } from '../reminder-schedule';

/**
 * Create whatever event reminders are due as of `now`.
 *
 * Idempotent by construction rather than by bookkeeping: every row it writes
 * is one (event, offset, person), and a partial unique index refuses a second.
 * That's what lets a missed run catch up — the rule is "send anything whose
 * moment has passed", which would otherwise mean sending twice the moment the
 * schedule hiccuped.
 *
 * Deliberately per-recipient rather than one broadcast row per event. Who
 * wants which offset for which kind of event is a per-person preference, and a
 * shared row can't answer it — the alternative was filtering at read time,
 * which would put a join to `events` on the feed, the unread count and push
 * targeting alike.
 *
 * `now` is a parameter so the whole thing can be tested against a fixed clock.
 */
export async function createDueEventReminders(
  now: Date = new Date(),
): Promise<{ scanned: number; created: number }> {
  // The sweep's own day, in UTC. A day of slack on each end covers every
  // band's timezone; `dueReminders` then decides precisely, per band.
  const utcDay = now.toISOString().slice(0, 10);
  const candidates = await listEventsForReminders(
    addDays(utcDay, -1),
    addDays(utcDay, 8),
  );

  // One members query and one prefs query per band/person, not per event.
  const membersByBand = new Map<string, { userId: string }[]>();
  const prefsByUser = new Map<
    string,
    Awaited<ReturnType<typeof getReminderPrefs>>
  >();
  let created = 0;

  for (const event of candidates) {
    const kinds = dueReminders(event, now);
    if (kinds.length === 0) continue;

    if (!membersByBand.has(event.bandId))
      membersByBand.set(event.bandId, await listMembers(event.bandId));
    const members = membersByBand.get(event.bandId)!;
    const category = categoryForEventType(event.eventType);

    for (const member of members) {
      if (!prefsByUser.has(member.userId))
        prefsByUser.set(member.userId, await getReminderPrefs(member.userId));
      const prefs = prefsByUser.get(member.userId)!;

      for (const kind of kinds) {
        if (!wantsReminder(prefs, category, kind)) continue;

        const [row] = await db
          .insert(notifications)
          .values({
            bandId: event.bandId,
            // Only because `actor_id` is NOT NULL and there is no system
            // user. Nothing in a reminder's wording names them, and push
            // deliberately does not skip them the way it does for real
            // actions — see `listPushTargets`.
            actorId: event.createdBy,
            actorName: event.actorName,
            bandName: event.bandName,
            kind,
            subjectType: 'event',
            subjectId: event.id,
            subjectLabel: event.title,
            recipientId: member.userId,
          })
          .onConflictDoNothing({
            target: [
              notifications.subjectId,
              notifications.kind,
              notifications.recipientId,
            ],
            // Narrows the conflict to the partial index; without it Postgres
            // has no unique index over these columns to infer. Note this is
            // `where`, not the `targetWhere` that `onConflictDoUpdate` takes
            // (as the upload rollup does) — same job, different spelling.
            where: sql`subject_type = 'event' and recipient_id is not null`,
          })
          .returning({ id: notifications.id });

        // No row came back — this reminder already existed, so a previous run
        // has already interrupted them and this one must not.
        if (!row) continue;
        created += 1;

        const { sendEventPush } = await import('../push');
        void sendEventPush(
          {
            bandId: event.bandId,
            actorId: event.createdBy,
            kind,
            subjectType: 'event',
            subjectId: event.id,
            subjectLabel: event.title,
            recipientId: member.userId,
          },
          { actorName: event.actorName, bandName: event.bandName },
        ).catch((err) => console.error('[reminders] push failed', err));
      }
    }
  }

  return { scanned: candidates.length, created };
}
