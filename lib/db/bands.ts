import { and, eq } from 'drizzle-orm';
import { db } from './index';
import { bands, bandMembers, users } from './schema';

export type Band = typeof bands.$inferSelect;
export type BandRole = 'owner' | 'member';

export class BandAccessError extends Error {
  constructor(message = 'Not a member of this band') {
    super(message);
    this.name = 'BandAccessError';
  }
}

/** Create a band and make the creator its owner, atomically. */
export async function createBand(creatorUserId: string, name: string): Promise<Band> {
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
  const [row] = await db.select().from(bands).where(eq(bands.id, bandId)).limit(1);
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

export async function addMember(bandId: string, userId: string, role: BandRole = 'member') {
  await db.insert(bandMembers).values({ bandId, userId, role }).onConflictDoNothing();
}

export async function removeMember(bandId: string, userId: string) {
  await db
    .delete(bandMembers)
    .where(and(eq(bandMembers.bandId, bandId), eq(bandMembers.userId, userId)));
}