import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from './index';
import { bandInvites, bandMembers, bands } from './schema';
import { normalizeEmail } from './users';
import type { BandRole } from './bands';

/**
 * Band invites. The raw token is returned once (for the shareable link);
 * only its SHA-256 hash is stored. Invites are single-use, expire after 21
 * days, and can only be redeemed by a user whose email matches the invite.
 */
const TTL_MS = 21 * 24 * 60 * 60 * 1000; // 21 days

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export interface CreatedInvite {
  id: string;
  token: string; // raw — belongs only in the link, returned once
  email: string;
  expiresAt: Date;
}

/**
 * Create a pending invite for an email, refreshing (replacing) any existing
 * pending invite for the same (band, email). Returns the raw token.
 */
export async function createInvite(input: {
  bandId: string;
  email: string;
  invitedBy: string;
  role?: BandRole;
}): Promise<CreatedInvite> {
  const raw = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TTL_MS);
  return db.transaction(async (tx) => {
    await tx
      .delete(bandInvites)
      .where(
        and(
          eq(bandInvites.bandId, input.bandId),
          eq(bandInvites.email, input.email),
          isNull(bandInvites.acceptedAt),
        ),
      );
    const [row] = await tx
      .insert(bandInvites)
      .values({
        bandId: input.bandId,
        email: input.email,
        role: input.role ?? 'member',
        invitedBy: input.invitedBy,
        tokenHash: hashToken(raw),
        expiresAt,
      })
      .returning({
        id: bandInvites.id,
        email: bandInvites.email,
        expiresAt: bandInvites.expiresAt,
      });
    return {
      id: row!.id,
      token: raw,
      email: row!.email,
      expiresAt: row!.expiresAt,
    };
  });
}

export interface PendingInvite {
  id: string;
  email: string;
  role: BandRole;
  createdAt: Date;
  expiresAt: Date;
}

/** Pending (unaccepted) invites for a band, newest first. */
export async function listPendingInvites(
  bandId: string,
): Promise<PendingInvite[]> {
  return db
    .select({
      id: bandInvites.id,
      email: bandInvites.email,
      role: bandInvites.role,
      createdAt: bandInvites.createdAt,
      expiresAt: bandInvites.expiresAt,
    })
    .from(bandInvites)
    .where(and(eq(bandInvites.bandId, bandId), isNull(bandInvites.acceptedAt)))
    .orderBy(desc(bandInvites.createdAt));
}

/** Revoke a pending invite. Returns true if one was removed. */
export async function revokeInvite(
  bandId: string,
  inviteId: string,
): Promise<boolean> {
  const rows = await db
    .delete(bandInvites)
    .where(
      and(
        eq(bandInvites.id, inviteId),
        eq(bandInvites.bandId, bandId),
        isNull(bandInvites.acceptedAt),
      ),
    )
    .returning({ id: bandInvites.id });
  return rows.length > 0;
}

export interface InvitePreview {
  bandId: string;
  bandName: string;
  email: string;
  accepted: boolean;
  expired: boolean;
}

/** Look up an invite by its raw token, without consuming it. */
export async function getInviteByToken(
  raw: string,
): Promise<InvitePreview | null> {
  const [row] = await db
    .select({
      bandId: bandInvites.bandId,
      bandName: bands.name,
      email: bandInvites.email,
      expiresAt: bandInvites.expiresAt,
      acceptedAt: bandInvites.acceptedAt,
    })
    .from(bandInvites)
    .innerJoin(bands, eq(bands.id, bandInvites.bandId))
    .where(eq(bandInvites.tokenHash, hashToken(raw)))
    .limit(1);
  if (!row) return null;
  return {
    bandId: row.bandId,
    bandName: row.bandName,
    email: row.email,
    accepted: row.acceptedAt !== null,
    expired: row.expiresAt.getTime() < Date.now(),
  };
}

export type AcceptResult =
  | { status: 'accepted'; bandId: string; bandName: string }
  | { status: 'already_member'; bandId: string; bandName: string }
  | { status: 'email_mismatch'; email: string }
  | { status: 'invalid' }
  | { status: 'expired' };

/**
 * Redeem a token for a user: adds them to the band (unless already a member)
 * and marks the invite used. The user's email must match the invite's. Single
 * transaction so a token can't be replayed.
 */
export async function acceptInvite(
  raw: string,
  userId: string,
  userEmail: string | null,
): Promise<AcceptResult> {
  const normalizedUser = normalizeEmail(userEmail ?? '');
  return db.transaction(async (tx) => {
    const [inv] = await tx
      .select({
        id: bandInvites.id,
        bandId: bandInvites.bandId,
        email: bandInvites.email,
        role: bandInvites.role,
        expiresAt: bandInvites.expiresAt,
        acceptedAt: bandInvites.acceptedAt,
        bandName: bands.name,
      })
      .from(bandInvites)
      .innerJoin(bands, eq(bands.id, bandInvites.bandId))
      .where(eq(bandInvites.tokenHash, hashToken(raw)))
      .limit(1);
    if (!inv || inv.acceptedAt) return { status: 'invalid' };
    if (inv.expiresAt.getTime() < Date.now()) return { status: 'expired' };
    // The invite is bound to a specific email — only that account may redeem
    // it (so a forwarded link can't be claimed by someone else).
    if (!normalizedUser || normalizedUser !== inv.email)
      return { status: 'email_mismatch', email: inv.email };

    const [existing] = await tx
      .select({ userId: bandMembers.userId })
      .from(bandMembers)
      .where(
        and(eq(bandMembers.bandId, inv.bandId), eq(bandMembers.userId, userId)),
      )
      .limit(1);

    if (!existing) {
      await tx
        .insert(bandMembers)
        .values({ bandId: inv.bandId, userId, role: inv.role })
        .onConflictDoNothing();
    }
    await tx
      .update(bandInvites)
      .set({ acceptedAt: new Date(), acceptedBy: userId })
      .where(eq(bandInvites.id, inv.id));

    return {
      status: existing ? 'already_member' : 'accepted',
      bandId: inv.bandId,
      bandName: inv.bandName,
    };
  });
}
