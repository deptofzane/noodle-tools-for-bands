import { NextResponse } from 'next/server';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { getConversationMembership } from '@/lib/db/conversations';

type DbUser = NonNullable<Awaited<ReturnType<typeof getCurrentDbUser>>>;
type BandMembership = NonNullable<Awaited<ReturnType<typeof getMembership>>>;
type ConversationMembership = NonNullable<
  Awaited<ReturnType<typeof getConversationMembership>>
>;

const unauthenticated = () =>
  NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
const forbidden = () =>
  NextResponse.json({ error: 'forbidden' }, { status: 403 });

/**
 * Route guards for API handlers. Each returns the resolved value on success,
 * or a `NextResponse` (401/403) to return directly:
 *
 *   const guard = await requireBandMember(bandId);
 *   if (guard instanceof NextResponse) return guard;
 *   const { user } = guard;
 */

/** The signed-in DB user, or a 401 response. */
export async function requireUser(): Promise<DbUser | NextResponse> {
  const user = await getCurrentDbUser();
  return user ?? unauthenticated();
}

/**
 * The signed-in user and their band membership (which carries their role),
 * requiring membership in `bandId` (else 401/403).
 */
export async function requireBandMember(
  bandId: string,
): Promise<{ user: DbUser; membership: BandMembership } | NextResponse> {
  const user = await getCurrentDbUser();
  if (!user) return unauthenticated();
  const membership = await getMembership(user.id, bandId);
  if (!membership) return forbidden();
  return { user, membership };
}

/**
 * As `requireBandMember`, but the member must own the band.
 *
 * For actions that are destructive and *shared*: one person removing a chart
 * the whole band plays from is not the same as removing their own note. The
 * check is here rather than only in the UI — hiding a button is a courtesy,
 * not authorization.
 */
export async function requireBandOwner(
  bandId: string,
): Promise<{ user: DbUser } | NextResponse> {
  const user = await getCurrentDbUser();
  if (!user) return unauthenticated();
  const membership = await getMembership(user.id, bandId);
  if (!membership || membership.role !== 'owner') return forbidden();
  return { user };
}

/**
 * The signed-in user and their conversation membership (which carries the
 * conversation + band), requiring access to `conversationId` (else 401/403).
 */
export async function requireConversationMember(
  conversationId: string,
): Promise<
  { user: DbUser; membership: ConversationMembership } | NextResponse
> {
  const user = await getCurrentDbUser();
  if (!user) return unauthenticated();
  const membership = await getConversationMembership(user.id, conversationId);
  if (!membership) return forbidden();
  return { user, membership };
}
