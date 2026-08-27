import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { db } from './index';
import {
  bandMembers,
  bands,
  eventMembers,
  events,
  setlistSongs,
  setlists,
  users,
  venues,
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
  /** Drives the calendar's colour coding — see app/calendar/eventColors.ts. */
  eventType: string | null;
  /**
   * Playable songs in the event's setlist — markers (set breaks) don't count,
   * and it's 0 when there's no setlist. What Practice and Live need to have
   * anything to show.
   */
  setlistSongCount: number;
  date: string; // YYYY-MM-DD start
  /** Last day, inclusive; null when it ends the day it starts. */
  endDate: string | null;
  time: string | null;
  endTime: string | null;
  location: string | null;
  setlistId: string | null;
  /** Display name of whoever created it — see `eventLabel`. */
  createdByName: string | null;
  venueName: string | null;
  venueAddress: string | null;
}

export interface BandEvent {
  id: string;
  title: string;
  /** Drives the colour coding — see app/calendar/eventColors.ts. */
  eventType: string | null;
  date: string; // YYYY-MM-DD start
  /** Last day, inclusive; null when it ends the day it starts. */
  endDate: string | null;
  time: string | null;
  endTime: string | null;
  location: string | null;
  details: string | null;
  notes: string | null;
  setlistId: string | null;
  setlistName: string | null;
  venueId: string | null;
  /** Display name of whoever created it — see `eventLabel`. */
  createdByName: string | null;
  venueName: string | null;
}

export interface EventDetail extends EventListItem {
  /** Free-text kind ("Show", "Practice", …); null when unset. */
  eventType: string | null;
  details: string | null;
  notes: string | null;
  setlistId: string | null;
  setlistName: string | null;
  venueId: string | null;
  venueName: string | null;
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

/**
 * The event's real last day, in SQL: `coalesce(end_date, date)`.
 *
 * Every "is this in range / past / upcoming" question compares against this
 * and never against `date` alone — a festival that started on Friday is not
 * a past event on Saturday. Matches `events_end_date_idx`, which indexes the
 * same expression, so the filters stay index-backed.
 */
const lastDay = sql`coalesce(${events.endDate}, ${events.date})`;

/**
 * Store null rather than a same-day end date.
 *
 * "Ends the day it starts" already had a representation before this column
 * existed — null — and every row written back then means exactly that.
 * Keeping one spelling means a single-day event reads the same whether it
 * was made before or after multi-day events existed, so nothing has to ask
 * which era a row is from. An end before the start is nonsense and is
 * treated the same way; the API rejects it before we get here.
 */
function normalizeEndDate(date: string, endDate: string | null): string | null {
  if (!endDate || endDate <= date) return null;
  return endDate;
}

export async function createEvent(input: {
  bandId: string;
  title: string;
  eventType: string | null;
  date: string;
  /** Last day, inclusive. Null (or equal to `date`) means a single day. */
  endDate: string | null;
  time: string | null;
  endTime: string | null;
  location: string | null;
  details: string | null;
  notes: string | null;
  setlistId: string | null;
  venueId: string | null;
  createdBy: string;
}): Promise<{ id: string }> {
  const [row] = await db
    .insert(events)
    .values({
      bandId: input.bandId,
      title: input.title,
      eventType: input.eventType,
      date: input.date,
      endDate: normalizeEndDate(input.date, input.endDate),
      time: input.time,
      endTime: input.endTime,
      location: input.location,
      details: input.details,
      notes: input.notes,
      setlistId: input.setlistId,
      venueId: input.venueId,
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
      eventType: events.eventType,
      date: events.date,
      endDate: events.endDate,
      time: events.time,
      endTime: events.endTime,
      location: events.location,
      setlistId: events.setlistId,
      // Counted here rather than joined: a join would multiply the event
      // row by its setlist length. Markers have no conversation, so a
      // setlist of set breaks correctly counts zero.
      setlistSongCount: sql<number>`(
        select count(*)::int from ${setlistSongs}
        where ${setlistSongs.setlistId} = ${events.setlistId}
          and ${setlistSongs.conversationId} is not null
      )`,
      createdByName: users.name,
      venueName: venues.name,
      venueAddress: venues.address,
    })
    .from(events)
    .innerJoin(bands, eq(bands.id, events.bandId))
    // Filtered to this user, so at most one match per event — no dupes.
    .leftJoin(
      eventMembers,
      and(eq(eventMembers.eventId, events.id), eq(eventMembers.userId, userId)),
    )
    .leftJoin(users, eq(users.id, events.createdBy))
    .leftJoin(venues, eq(venues.id, events.venueId))
    // Overlap, not containment: a multi-day event belongs to every
    // window it touches, including the months its middle falls in.
    .where(and(lte(events.date, to), gte(lastDay, from), visible))
    .orderBy(asc(events.date), asc(events.time));

  return rows;
}

/**
 * Events visible to the user that have already happened — dated before
 * `before` (YYYY-MM-DD, the viewer's today), most recent first. Same
 * visibility union as the range query: their bands' events plus any they were
 * added to. Paged, since this grows without bound.
 */
export async function listPastEventsForUser(
  userId: string,
  before: string,
  window?: { limit: number; offset: number },
  /**
   * Narrow to one band. `visible` below also admits events the user was
   * invited to personally outside their bands; asking for a band excludes
   * those, which is what "this band's history" means.
   */
  bandId?: string,
): Promise<EventListItem[]> {
  const bandIds = await userBandIds(userId);
  const visible =
    bandIds.length > 0
      ? or(inArray(events.bandId, bandIds), eq(eventMembers.userId, userId))
      : eq(eventMembers.userId, userId);

  return (
    db
      .select({
        id: events.id,
        bandId: events.bandId,
        bandName: bands.name,
        title: events.title,
        eventType: events.eventType,
        date: events.date,
        endDate: events.endDate,
        time: events.time,
        endTime: events.endTime,
        location: events.location,
        setlistId: events.setlistId,
        // Counted here rather than joined: a join would multiply the event
        // row by its setlist length. Markers have no conversation, so a
        // setlist of set breaks correctly counts zero.
        setlistSongCount: sql<number>`(
          select count(*)::int from ${setlistSongs}
          where ${setlistSongs.setlistId} = ${events.setlistId}
            and ${setlistSongs.conversationId} is not null
        )`,
        createdByName: users.name,
        venueName: venues.name,
        venueAddress: venues.address,
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
      .leftJoin(users, eq(users.id, events.createdBy))
      .leftJoin(venues, eq(venues.id, events.venueId))
      .where(
        and(
          lt(lastDay, before),
          visible,
          bandId ? eq(events.bandId, bandId) : undefined,
        ),
      )
      .orderBy(desc(events.date), desc(events.time))
      .limit(window ? window.limit : Number.MAX_SAFE_INTEGER)
      .offset(window ? window.offset : 0)
  );
}

/**
 * The single soonest event visible to the user with a date on or after `from`
 * (YYYY-MM-DD), or null — no upper bound. Used as a Home fallback to surface
 * the next event when nothing falls in the next 7 days.
 */
export async function getNextEventForUser(
  userId: string,
  from: string,
): Promise<EventListItem | null> {
  const bandIds = await userBandIds(userId);
  const visible =
    bandIds.length > 0
      ? or(inArray(events.bandId, bandIds), eq(eventMembers.userId, userId))
      : eq(eventMembers.userId, userId);

  const [row] = await db
    .select({
      id: events.id,
      bandId: events.bandId,
      bandName: bands.name,
      title: events.title,
      eventType: events.eventType,
      date: events.date,
      endDate: events.endDate,
      time: events.time,
      endTime: events.endTime,
      location: events.location,
      setlistId: events.setlistId,
      // Counted here rather than joined: a join would multiply the event
      // row by its setlist length. Markers have no conversation, so a
      // setlist of set breaks correctly counts zero.
      setlistSongCount: sql<number>`(
        select count(*)::int from ${setlistSongs}
        where ${setlistSongs.setlistId} = ${events.setlistId}
          and ${setlistSongs.conversationId} is not null
      )`,
      createdByName: users.name,
      venueName: venues.name,
      venueAddress: venues.address,
    })
    .from(events)
    .innerJoin(bands, eq(bands.id, events.bandId))
    .leftJoin(
      eventMembers,
      and(eq(eventMembers.eventId, events.id), eq(eventMembers.userId, userId)),
    )
    .leftJoin(users, eq(users.id, events.createdBy))
    .leftJoin(venues, eq(venues.id, events.venueId))
    // An event running right now is still ahead of you, not behind.
    .where(and(gte(lastDay, from), visible))
    .orderBy(asc(events.date), asc(events.time))
    .limit(1);
  return row ?? null;
}

export interface FeedEvent {
  id: string;
  bandName: string;
  title: string;
  /** Drives the colour coding and the time-off label. */
  eventType: string | null;
  date: string; // YYYY-MM-DD start
  /** Last day, inclusive; null when it ends the day it starts. */
  endDate: string | null;
  time: string | null;
  endTime: string | null;
  location: string | null;
  details: string | null;
  setlistName: string | null;
  /** Display name of whoever created it — see `eventLabel`. */
  createdByName: string | null;
  venueName: string | null;
  venueAddress: string | null;
  updatedAt: Date;
}

/** `base` shifted by `days`, as a UTC YYYY-MM-DD string. */
function isoDateOffset(base: Date, days: number): string {
  return new Date(base.getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Events for a user's calendar subscription feed — the same visibility union
 * as listEventsForUserInRange, but windowed (default: the past year through
 * two years out) to keep the feed finite, and carrying the fields the ICS
 * document needs (details, setlist name, updatedAt).
 */
export async function listEventsForFeed(
  userId: string,
  window?: { from?: string; to?: string },
): Promise<FeedEvent[]> {
  const now = new Date();
  const from = window?.from ?? isoDateOffset(now, -365);
  const to = window?.to ?? isoDateOffset(now, 365 * 2);

  const bandIds = await userBandIds(userId);
  const visible =
    bandIds.length > 0
      ? or(inArray(events.bandId, bandIds), eq(eventMembers.userId, userId))
      : eq(eventMembers.userId, userId);

  return (
    db
      .select({
        id: events.id,
        bandName: bands.name,
        title: events.title,
        eventType: events.eventType,
        date: events.date,
        endDate: events.endDate,
        time: events.time,
        endTime: events.endTime,
        location: events.location,
        details: events.details,
        setlistName: setlists.name,
        createdByName: users.name,
        venueName: venues.name,
        venueAddress: venues.address,
        updatedAt: events.updatedAt,
      })
      .from(events)
      .innerJoin(bands, eq(bands.id, events.bandId))
      .leftJoin(
        eventMembers,
        and(
          eq(eventMembers.eventId, events.id),
          eq(eventMembers.userId, userId),
        ),
      )
      .leftJoin(setlists, eq(setlists.id, events.setlistId))
      .leftJoin(users, eq(users.id, events.createdBy))
      .leftJoin(venues, eq(venues.id, events.venueId))
      // Overlap, not containment: a multi-day event belongs to every
      // window it touches, including the months its middle falls in.
      .where(and(lte(events.date, to), gte(lastDay, from), visible))
      .orderBy(asc(events.date), asc(events.time))
  );
}

/**
 * All of a band's events (its "shows"), newest date first, each with its
 * associated setlist name if any. Caller gates on band membership.
 */
export async function listBandEvents(bandId: string): Promise<BandEvent[]> {
  return db
    .select({
      id: events.id,
      title: events.title,
      eventType: events.eventType,
      date: events.date,
      endDate: events.endDate,
      time: events.time,
      endTime: events.endTime,
      location: events.location,
      details: events.details,
      notes: events.notes,
      setlistId: events.setlistId,
      // Counted here rather than joined: a join would multiply the event
      // row by its setlist length. Markers have no conversation, so a
      // setlist of set breaks correctly counts zero.
      setlistSongCount: sql<number>`(
        select count(*)::int from ${setlistSongs}
        where ${setlistSongs.setlistId} = ${events.setlistId}
          and ${setlistSongs.conversationId} is not null
      )`,
      setlistName: setlists.name,
      venueId: events.venueId,
      createdByName: users.name,
      venueName: venues.name,
    })
    .from(events)
    .leftJoin(setlists, eq(setlists.id, events.setlistId))
    .leftJoin(users, eq(users.id, events.createdBy))
    .leftJoin(venues, eq(venues.id, events.venueId))
    .where(eq(events.bandId, bandId))
    .orderBy(desc(events.date), asc(events.time));
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
      eventType: events.eventType,
      date: events.date,
      endDate: events.endDate,
      time: events.time,
      endTime: events.endTime,
      location: events.location,
      details: events.details,
      notes: events.notes,
      setlistId: events.setlistId,
      // Counted here rather than joined: a join would multiply the event
      // row by its setlist length. Markers have no conversation, so a
      // setlist of set breaks correctly counts zero.
      setlistSongCount: sql<number>`(
        select count(*)::int from ${setlistSongs}
        where ${setlistSongs.setlistId} = ${events.setlistId}
          and ${setlistSongs.conversationId} is not null
      )`,
      setlistName: setlists.name,
      venueId: events.venueId,
      createdByName: users.name,
      venueName: venues.name,
      venueAddress: venues.address,
    })
    .from(events)
    .innerJoin(bands, eq(bands.id, events.bandId))
    .leftJoin(setlists, eq(setlists.id, events.setlistId))
    .leftJoin(users, eq(users.id, events.createdBy))
    .leftJoin(venues, eq(venues.id, events.venueId))
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
    eventType: string | null;
    date: string;
    endDate: string | null;
    time: string | null;
    endTime: string | null;
    location: string | null;
    details: string | null;
    notes: string | null;
    setlistId: string | null;
    venueId: string | null;
  },
): Promise<void> {
  await db
    .update(events)
    .set({
      ...fields,
      endDate: normalizeEndDate(fields.date, fields.endDate),
      updatedAt: sql`now()`,
    })
    .where(eq(events.id, eventId));
}

/** Delete an event (its added-member rows cascade). */
export async function deleteEvent(eventId: string): Promise<void> {
  await db.delete(events).where(eq(events.id, eventId));
}

/**
 * An event's owning band + its private notes — for the standalone notes
 * editor, which gates on band membership (the band id) before revealing or
 * updating the notes.
 */
export async function getEventBandAndNotes(
  eventId: string,
): Promise<{ bandId: string; notes: string | null } | null> {
  const [row] = await db
    .select({ bandId: events.bandId, notes: events.notes })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  return row ?? null;
}

/** Update only an event's notes (the band's private observations). */
export async function updateEventNotes(
  eventId: string,
  notes: string | null,
): Promise<void> {
  await db
    .update(events)
    .set({ notes, updatedAt: sql`now()` })
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
    .where(
      and(eq(eventMembers.eventId, eventId), eq(eventMembers.userId, userId)),
    )
    .limit(1);
  return Boolean(member);
}

export async function listEventMembers(
  eventId: string,
): Promise<EventMember[]> {
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
  await db
    .insert(eventMembers)
    .values({ eventId, userId })
    .onConflictDoNothing();
}

export async function removeEventMember(
  eventId: string,
  userId: string,
): Promise<void> {
  await db
    .delete(eventMembers)
    .where(
      and(eq(eventMembers.eventId, eventId), eq(eventMembers.userId, userId)),
    );
}
