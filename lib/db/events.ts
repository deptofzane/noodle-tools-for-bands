import { and, asc, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import { db } from './index';
import {
  bandMembers,
  bands,
  eventMembers,
  events,
  setlists,
  users,
} from './schema';

/**
 * Calendar events (Postgres).
 *
 * An event is owned by a band, chosen at creation. It's visible to the
 * band's members, plus any users explicitly added to it (`event_members`),
 * mirroring how people are added to bands. All access flows through that
 * union — there's no per-event role.
 */

export interface EventListItem {
  id: string;
  bandId: string;
  bandName: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string | null;
  location: string | null;
}

export interface EventDetail extends EventListItem {
  details: string | null;
  setlistId: string | null;
  setlistName: string | null;
}

export interface EventMember {
  userId: string;
  name: string | null;
  email: string | null;
}

/** The band ids a user belongs to (their event-visibility scope). */
async function userBandIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ bandId: bandMembers.bandId })
    .from(bandMembers)
    .where(eq(bandMembers.userId, userId));
  return rows.map((r) => r.bandId);
}

export async function createEvent(input: {
  bandId: string;
  title: string;
  date: string;
  time: string | null;
  location: string | null;
  details: string | null;
  createdBy: string;
}): Promise<{ id: string }> {
  const [row] = await db
    .insert(events)
    .values({
      bandId: input.bandId,
      title: input.title,
      date: input.date,
      time: input.time,
      location: input.location,
      details: input.details,
      createdBy: input.createdBy,
    })
    .returning({ id: events.id });
  return row!;
}

/**
 * Events visible to the user with a date in [from, to] (inclusive,
 * YYYY-MM-DD). Union of the user's bands' events + events they're added to.
 */
export async function listEventsForUserInRange(
  userId: string,
  from: string,
  to: string,
): Promise<EventListItem[]> {
  const bandIds = await userBandIds(userId);
  const visible =
    bandIds.length > 0
      ? or(inArray(events.bandId, bandIds), eq(eventMembers.userId, userId))
      : eq(eventMembers.userId, userId);

  const rows = await db
    .select({
      id: events.id,
      bandId: events.bandId,
      bandName: bands.name,
      title: events.title,
      date: events.date,
      time: events.time,
      location: events.location,
    })
    .from(events)
    .innerJoin(bands, eq(bands.id, events.bandId))
    // Filtered to this user, so at most one match per event — no dupes.
    .leftJoin(
      eventMembers,
      and(
        eq(eventMembers.eventId, events.id),
        eq(eventMembers.userId, userId),
      ),
    )
    .where(and(gte(events.date, from), lte(events.date, to), visible))
    .orderBy(asc(events.date), asc(events.time));

  return rows;
}

/** An event with access check, or null if it doesn't exist / isn't visible. */
export async function getEventForUser(
  userId: string,
  eventId: string,
): Promise<EventDetail | null> {
  const [row] = await db
    .select({
      id: events.id,
      bandId: events.bandId,
      bandName: bands.name,
      title: events.title,
      date: events.date,
      time: events.time,
      location: events.location,
      details: events.details,
      setlistId: events.setlistId,
      setlistName: setlists.name,
    })
    .from(events)
    .innerJoin(bands, eq(bands.id, events.bandId))
    .leftJoin(setlists, eq(setlists.id, events.setlistId))
    .where(eq(events.id, eventId))
    .limit(1);
  if (!row) return null;

  if (await canAccessEvent(userId, row.id, row.bandId)) return row;
  return null;
}

/** Update an event's fields (caller has validated band membership + setlist). */
export async function updateEvent(
  eventId: string,
  fields: {
    title: string;
    date: string;
    time: string | null;
    location: string | null;
    details: string | null;
    setlistId: string | null;
  },
): Promise<void> {
  await db
    .update(events)
    .set({ ...fields, updatedAt: sql`now()` })
    .where(eq(events.id, eventId));
}

/** True if the user is in the event's owning band or is an added member. */
export async function canAccessEvent(
  userId: string,
  eventId: string,
  bandId: string,
): Promise<boolean> {
  const [band] = await db
    .select({ x: bandMembers.userId })
    .from(bandMembers)
    .where(and(eq(bandMembers.bandId, bandId), eq(bandMembers.userId, userId)))
    .limit(1);
  if (band) return true;
  const [member] = await db
    .select({ x: eventMembers.userId })
    .from(eventMembers)
    .where(and(eq(eventMembers.eventId, eventId), eq(eventMembers.userId, userId)))
    .limit(1);
  return Boolean(member);
}

export async function listEventMembers(eventId: string): Promise<EventMember[]> {
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
    })
    .from(eventMembers)
    .innerJoin(users, eq(users.id, eventMembers.userId))
    .where(eq(eventMembers.eventId, eventId))
    .orderBy(asc(eventMembers.createdAt));
}

export async function addEventMember(
  eventId: string,
  userId: string,
): Promise<void> {
  await db.insert(eventMembers).values({ eventId, userId }).onConflictDoNothing();
}

export async function removeEventMember(
  eventId: string,
  userId: string,
): Promise<void> {
  await db
    .delete(eventMembers)
    .where(and(eq(eventMembers.eventId, eventId), eq(eventMembers.userId, userId)));
}
