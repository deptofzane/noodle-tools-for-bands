import { and, eq, ne } from 'drizzle-orm';
import { db } from './index';
import { bands, bandMembers, users } from './schema';
import { deleteObjects, storageKeysForBand } from './song-files';

export type Band = typeof bands.$inferSelect;
export type BandRole = 'owner' | 'member';

export class BandAccessError extends Error {
  constructor(message = 'Not a member of this band') {
    super(message);
    this.name = 'BandAccessError';
  }
}

/** Create a band and make the creator its owner, atomically. */
export async function createBand(
  creatorUserId: string,
  name: string,
): Promise<Band> {
  return db.transaction(async (tx) => {
    const [band] = await tx
      .insert(bands)
      .values({ name, createdBy: creatorUserId })
      .returning();
    await tx
      .insert(bandMembers)
      .values({ bandId: band!.id, userId: creatorUserId, role: 'owner' });
    return band!;
  });
}

export async function listMyBands(userId: string) {
  return db
    .select({
      id: bands.id,
      name: bands.name,
      role: bandMembers.role,
      createdAt: bands.createdAt,
    })
    .from(bandMembers)
    .innerJoin(bands, eq(bands.id, bandMembers.bandId))
    .where(eq(bandMembers.userId, userId))
    .orderBy(bands.createdAt);
}

export async function getBandById(bandId: string): Promise<Band | null> {
  const [row] = await db
    .select()
    .from(bands)
    .where(eq(bands.id, bandId))
    .limit(1);
  return row ?? null;
}

/** Rename a band. Returns the updated row, or null if the band doesn't exist. */
export async function renameBand(
  bandId: string,
  name: string,
): Promise<Band | null> {
  const [row] = await db
    .update(bands)
    .set({ name })
    .where(eq(bands.id, bandId))
    .returning();
  return row ?? null;
}

export async function getMembership(userId: string, bandId: string) {
  const [row] = await db
    .select()
    .from(bandMembers)
    .where(and(eq(bandMembers.bandId, bandId), eq(bandMembers.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** Authorization primitive — throws BandAccessError if not a member. */
export async function assertBandMember(userId: string, bandId: string) {
  const m = await getMembership(userId, bandId);
  if (!m) throw new BandAccessError();
  return m;
}

export async function listMembers(bandId: string) {
  return db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: bandMembers.role,
    })
    .from(bandMembers)
    .innerJoin(users, eq(users.id, bandMembers.userId))
    .where(eq(bandMembers.bandId, bandId))
    .orderBy(bandMembers.createdAt);
}

export async function addMember(
  bandId: string,
  userId: string,
  role: BandRole = 'member',
) {
  await db
    .insert(bandMembers)
    .values({ bandId, userId, role })
    .onConflictDoNothing();
}

export async function removeMember(bandId: string, userId: string) {
  await db
    .delete(bandMembers)
    .where(and(eq(bandMembers.bandId, bandId), eq(bandMembers.userId, userId)));
}

/** Set a member's role (e.g. promote a member to owner). No-op if not a member. */
export async function setMemberRole(
  bandId: string,
  userId: string,
  role: BandRole,
) {
  await db
    .update(bandMembers)
    .set({ role })
    .where(and(eq(bandMembers.bandId, bandId), eq(bandMembers.userId, userId)));
}

export type LeaveBandResult =
  | { status: 'left' }
  | { status: 'transferred'; newOwnerName: string | null }
  | { status: 'sole_owner' }
  | { status: 'needs_new_owner' }
  | { status: 'invalid_new_owner' }
  | { status: 'not_a_member' };

/**
 * The user leaves the band. A plain member is simply removed. An owner may
 * leave freely if another owner remains; a *sole* owner must name a successor
 * (`newOwnerId`, another member) so the band is never orphaned, and one who is
 * also the only member can't leave (told to delete instead). Runs in one
 * transaction so ownership can never be lost or doubled.
 */
export async function leaveBand(
  userId: string,
  bandId: string,
  newOwnerId?: string,
): Promise<LeaveBandResult> {
  return db.transaction(async (tx) => {
    const [me] = await tx
      .select()
      .from(bandMembers)
      .where(
        and(eq(bandMembers.bandId, bandId), eq(bandMembers.userId, userId)),
      )
      .limit(1);
    if (!me) return { status: 'not_a_member' };

    const remove = () =>
      tx
        .delete(bandMembers)
        .where(
          and(eq(bandMembers.bandId, bandId), eq(bandMembers.userId, userId)),
        );

    if (me.role === 'owner') {
      // If another owner remains, ownership is covered — just leave.
      const [otherOwner] = await tx
        .select({ userId: bandMembers.userId })
        .from(bandMembers)
        .where(
          and(
            eq(bandMembers.bandId, bandId),
            eq(bandMembers.role, 'owner'),
            ne(bandMembers.userId, userId),
          ),
        )
        .limit(1);
      if (otherOwner) {
        await remove();
        return { status: 'left' };
      }

      // Sole owner: must hand off to a remaining member (if there is one).
      const [anyOther] = await tx
        .select({ userId: bandMembers.userId })
        .from(bandMembers)
        .where(
          and(eq(bandMembers.bandId, bandId), ne(bandMembers.userId, userId)),
        )
        .limit(1);
      if (!anyOther) return { status: 'sole_owner' };
      if (!newOwnerId) return { status: 'needs_new_owner' };

      // The named successor must be a different, existing member.
      const [next] = await tx
        .select({ userId: bandMembers.userId, name: users.name })
        .from(bandMembers)
        .innerJoin(users, eq(users.id, bandMembers.userId))
        .where(
          and(
            eq(bandMembers.bandId, bandId),
            eq(bandMembers.userId, newOwnerId),
            ne(bandMembers.userId, userId),
          ),
        )
        .limit(1);
      if (!next) return { status: 'invalid_new_owner' };

      await tx
        .update(bandMembers)
        .set({ role: 'owner' })
        .where(
          and(
            eq(bandMembers.bandId, bandId),
            eq(bandMembers.userId, next.userId),
          ),
        );
      await remove();
      return { status: 'transferred', newOwnerName: next.name };
    }

    await remove();
    return { status: 'left' };
  });
}

/**
 * Delete a band and everything it owns. FK cascades remove its members,
 * conversations, and (through conversations) notes, mentions, activity,
 * and read state. Irreversible.
 */
export async function deleteBand(bandId: string): Promise<void> {
  // Collect object-storage keys before the cascade removes the file rows.
  const keys = await storageKeysForBand(bandId);
  await db.delete(bands).where(eq(bands.id, bandId));
  await deleteObjects(keys);
}
