import { asc, eq } from 'drizzle-orm';
import { db } from './index';
import { venues } from './schema';

/**
 * Venues — places a band saves for later (where they play). A name plus
 * optional contact details and free-form notes. Band-scoped; access is
 * enforced by the routes (band membership).
 */

/** A venue as the client consumes it (no createdBy / timestamps). */
export interface Venue {
  id: string;
  bandId: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  contactName: string | null;
  notes: string | null;
}

/** The editable fields shared by create and update. */
export interface VenueInput {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  contactName: string | null;
  notes: string | null;
}

const VENUE_COLUMNS = {
  id: venues.id,
  bandId: venues.bandId,
  name: venues.name,
  address: venues.address,
  phone: venues.phone,
  email: venues.email,
  contactName: venues.contactName,
  notes: venues.notes,
} as const;

/** A band's venues, alphabetical by name. */
export async function listBandVenues(bandId: string): Promise<Venue[]> {
  return db
    .select(VENUE_COLUMNS)
    .from(venues)
    .where(eq(venues.bandId, bandId))
    .orderBy(asc(venues.name));
}

/** A single venue, or null if it doesn't exist. */
export async function getVenue(venueId: string): Promise<Venue | null> {
  const [row] = await db
    .select(VENUE_COLUMNS)
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  return row ?? null;
}

/** Create a venue for a band. */
export async function createVenue(input: {
  bandId: string;
  createdBy: string;
  fields: VenueInput;
}): Promise<Venue> {
  const [row] = await db
    .insert(venues)
    .values({
      bandId: input.bandId,
      createdBy: input.createdBy,
      ...input.fields,
    })
    .returning(VENUE_COLUMNS);
  return row!;
}

/** Update a venue's fields. Bumps updatedAt. */
export async function updateVenue(
  venueId: string,
  fields: VenueInput,
): Promise<void> {
  await db
    .update(venues)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(venues.id, venueId));
}

/** Permanently delete a venue. */
export async function deleteVenue(venueId: string): Promise<void> {
  await db.delete(venues).where(eq(venues.id, venueId));
}
