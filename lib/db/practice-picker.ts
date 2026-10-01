import { and, asc, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { db } from './index';
import {
  conversations,
  events,
  setlists,
  setlistSongs,
  songFiles,
  venues,
} from './schema';

/**
 * What the Practice screen's "Select" picker offers for one band: the songs,
 * setlists and upcoming events there is something to practise in. Trimmed to
 * what a row shows — the setlist and event APIs carry far more (every song of
 * every setlist), which a picker doesn't need. Caller gates on band
 * membership; band members see every band event.
 */
export type PickerSong = {
  id: string;
  title: string;
  originalArtist: string | null;
};
export type PickerSetlist = { id: string; name: string; songCount: number };
export type PickerEvent = {
  id: string;
  title: string;
  date: string;
  endDate: string | null;
  time: string | null;
  venueName: string | null;
  setlistId: string;
  setlistName: string;
};
export type PracticePicker = {
  songs: PickerSong[];
  setlists: PickerSetlist[];
  events: PickerEvent[];
};

/**
 * Songs in a setlist, not counting set-break markers (which have no
 * conversation). A setlist of only breaks has nothing to practise.
 *
 * The outer column is written out with its table, and the inner table
 * aliased: interpolated, `setlists.id` renders as a bare "id", which inside
 * this subquery resolves to setlist_songs' own id and counts nothing.
 */
const songCount = (outer: '"setlists"."id"' | '"events"."setlist_id"') =>
  sql<number>`(
    select count(*)::int from ${setlistSongs} ss
    where ss.setlist_id = ${sql.raw(outer)}
      and ss.conversation_id is not null
  )`;

/**
 * `today` is the band's local date (YYYY-MM-DD) — the caller resolves it in
 * the band's timezone. An event is upcoming until its last day has passed, so
 * one later today, or a festival already under way, still counts.
 */
export async function listPracticePicker(
  bandId: string,
  today: string,
): Promise<PracticePicker> {
  const [songRows, setlistRows, eventRows] = await Promise.all([
    db
      .select({
        id: conversations.id,
        title: sql<string>`coalesce(${conversations.audioFileName}, ${songFiles.fileName}, 'Untitled audio')`,
        originalArtist: conversations.originalArtist,
      })
      .from(conversations)
      // The default audio version only, for the fallback title — joining
      // every version would repeat the song once per version.
      .leftJoin(
        songFiles,
        and(
          eq(songFiles.conversationId, conversations.id),
          eq(songFiles.kind, 'audio'),
          eq(songFiles.isDefault, true),
        ),
      )
      .where(
        and(
          eq(conversations.bandId, bandId),
          eq(conversations.archived, false),
        ),
      )
      .orderBy(
        asc(
          sql`lower(coalesce(${conversations.audioFileName}, ${songFiles.fileName}, ''))`,
        ),
      ),

    db
      .select({
        id: setlists.id,
        name: setlists.name,
        songCount: songCount('"setlists"."id"'),
      })
      .from(setlists)
      .where(
        and(
          eq(setlists.bandId, bandId),
          eq(setlists.archived, false),
          sql`${songCount('"setlists"."id"')} > 0`,
        ),
      )
      .orderBy(desc(setlists.updatedAt)),

    db
      .select({
        id: events.id,
        title: events.title,
        date: events.date,
        endDate: events.endDate,
        time: events.time,
        venueName: venues.name,
        setlistId: events.setlistId,
        setlistName: setlists.name,
      })
      .from(events)
      .innerJoin(setlists, eq(setlists.id, events.setlistId))
      .leftJoin(venues, eq(venues.id, events.venueId))
      .where(
        and(
          eq(events.bandId, bandId),
          isNotNull(events.setlistId),
          // The real last day (see `lastDay` in events.ts): a multi-day event
          // isn't past until it ends.
          gte(sql`coalesce(${events.endDate}, ${events.date})`, today),
          sql`${songCount('"events"."setlist_id"')} > 0`,
        ),
      )
      .orderBy(asc(events.date), asc(events.time)),
  ]);

  return {
    songs: songRows,
    setlists: setlistRows,
    events: eventRows.map((e) => ({
      ...e,
      setlistId: e.setlistId!,
      setlistName: e.setlistName,
    })),
  };
}
