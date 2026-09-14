import { sql } from 'drizzle-orm';
import { db } from './index';
import { notifications } from './schema';
import { listMembers } from './bands';
import { listEventsForReminders } from './events';
import { getReminderPrefsForUsers } from './event-reminders';
import { addDays } from '../event-dates';
import { categoryForEventType, wantsReminder } from '../reminder-prefs';
import type { ReminderKind, ReminderPrefs } from '../reminder-prefs';
import { dueReminders } from '../reminder-schedule';

/**
 * Rows per INSERT. Postgres caps the parameters in one statement at around
 * 65k and each row carries nine, so this sits well inside the limit while
 * still collapsing a whole sweep into a couple of round trips.
 */
const INSERT_CHUNK = 500;

/** A user with nothing stored is on the defaults — see `wantsReminder`. */
const NO_PREFS: ReminderPrefs = new Map();

/** What a reminder's push needs, held until we know the row was really new. */
interface PendingPush {
  bandId: string;
  actorId: string;
  kind: ReminderKind;
  subjectId: string;
  subjectLabel: string;
  recipientId: string;
  actorName: string | null;
  bandName: string;
}

/** The unique triple the partial index is built on. */
const pushKey = (subjectId: string, kind: string, recipientId: string) =>
  `${subjectId}|${kind}|${recipientId}`;

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
 * It works in three passes so the query count stays flat as bands grow: decide
 * what's due, load every member list and preference set in two batches, then
 * write the rows in chunks. It used to issue one INSERT per (event, member,
 * offset) plus a preferences query per person, which multiplied out fast.
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

  // Pass one: which events have an offset due, and therefore whose members
  // and preferences we need.
  const due = candidates
    .map((event) => ({ event, kinds: dueReminders(event, now) }))
    .filter((d) => d.kinds.length > 0);
  if (due.length === 0) return { scanned: candidates.length, created: 0 };

  // Pass two: one members query per band (in parallel), then every one of
  // those people's preferences in a single query.
  const bandIds = [...new Set(due.map((d) => d.event.bandId))];
  const memberLists = await Promise.all(bandIds.map((id) => listMembers(id)));
  const membersByBand = new Map(bandIds.map((id, i) => [id, memberLists[i]!]));
  const prefsByUser = await getReminderPrefsForUsers([
    ...new Set(memberLists.flat().map((m) => m.userId)),
  ]);

  const rows: (typeof notifications.$inferInsert)[] = [];
  const pushes = new Map<string, PendingPush>();

  for (const { event, kinds } of due) {
    const category = categoryForEventType(event.eventType);
    for (const member of membersByBand.get(event.bandId) ?? []) {
      const prefs = prefsByUser.get(member.userId) ?? NO_PREFS;
      for (const kind of kinds) {
        if (!wantsReminder(prefs, category, kind)) continue;

        rows.push({
          bandId: event.bandId,
          // Only because `actor_id` is NOT NULL and there is no system user.
          // Nothing in a reminder's wording names them, and push deliberately
          // does not skip them the way it does for real actions — see
          // `listPushTargets`.
          actorId: event.createdBy,
          actorName: event.actorName,
          bandName: event.bandName,
          kind,
          subjectType: 'event',
          subjectId: event.id,
          subjectLabel: event.title,
          recipientId: member.userId,
        });
        pushes.set(pushKey(event.id, kind, member.userId), {
          bandId: event.bandId,
          actorId: event.createdBy,
          kind,
          subjectId: event.id,
          subjectLabel: event.title,
          recipientId: member.userId,
          actorName: event.actorName,
          bandName: event.bandName,
        });
      }
    }
  }
  if (rows.length === 0) return { scanned: candidates.length, created: 0 };

  // Pass three: write. `returning` names only the rows that were really
  // inserted, so a reminder a previous run already sent comes back absent and
  // nobody's phone buzzes twice.
  const inserted: { subjectId: string | null; kind: string; recipientId: string | null }[] =
    [];
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const back = await db
      .insert(notifications)
      .values(rows.slice(i, i + INSERT_CHUNK))
      .onConflictDoNothing({
        target: [
          notifications.subjectId,
          notifications.kind,
          notifications.recipientId,
        ],
        // Narrows the conflict to the partial index; without it Postgres has
        // no unique index over these columns to infer. Note this is `where`,
        // not the `targetWhere` that `onConflictDoUpdate` takes (as the upload
        // rollup does) — same job, different spelling.
        where: sql`subject_type = 'event' and recipient_id is not null`,
      })
      .returning({
        subjectId: notifications.subjectId,
        kind: notifications.kind,
        recipientId: notifications.recipientId,
      });
    inserted.push(...back);
  }

  if (inserted.length > 0) {
    const { sendEventPush } = await import('../push');
    for (const row of inserted) {
      const p = pushes.get(
        pushKey(row.subjectId ?? '', row.kind, row.recipientId ?? ''),
      );
      if (!p) continue;
      void sendEventPush(
        {
          bandId: p.bandId,
          actorId: p.actorId,
          kind: p.kind,
          subjectType: 'event',
          subjectId: p.subjectId,
          subjectLabel: p.subjectLabel,
          recipientId: p.recipientId,
        },
        { actorName: p.actorName, bandName: p.bandName },
      ).catch((err) => console.error('[reminders] push failed', err));
    }
  }

  return { scanned: candidates.length, created: inserted.length };
}
