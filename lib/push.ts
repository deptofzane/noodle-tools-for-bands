import webpush from 'web-push';
import { eq } from 'drizzle-orm';
import { db } from './db/index';
import { bands, users } from './db/schema';
import {
  type CreateNotificationInput,
  type NotificationKind,
  type NotificationSubject,
} from './db/notifications';
import {
  deletePushSubscription,
  listPushTargets,
} from './db/push-subscriptions';

/**
 * Web Push fan-out for notifications. Mirrors the in-app feed's phrasing and
 * deep links (see app/home/NotificationList.tsx) so a push reads the same as
 * the activity item it accompanies. Best-effort: no VAPID keys → no-op;
 * expired endpoints are pruned on send.
 */

let configured: boolean | null = null;

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject =
    process.env.VAPID_SUBJECT || 'mailto:notifications@noodle.band';
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

/** The push body — the same wording as the in-app feed, always third-person. */
function pushBody(
  kind: NotificationKind,
  who: string,
  band: string,
  subjectLabel: string | null,
): string {
  switch (kind) {
    case 'song-comment':
      return `${who} commented on ${subjectLabel ?? 'a song'}`;
    case 'chat-message':
      return `${who} posted in ${band} chat`;
    case 'event-added':
      return `${who} added an event: ${subjectLabel ?? 'Untitled'}`;
    case 'song-updated':
      return `${who} updated ${subjectLabel ?? 'a song'}`;
    case 'event-updated':
      return `${who} updated the event: ${subjectLabel ?? 'Untitled'}`;
    case 'band-updated':
      return `${who} updated ${band}${subjectLabel ? ` (${subjectLabel})` : ''}`;
    case 'poll-created':
      return `${who} started a poll: ${subjectLabel ?? 'Untitled'}`;
    case 'poll-closed':
      return `${who} closed the poll: ${subjectLabel ?? 'Untitled'}`;
    case 'poll-cancelled':
      return `${who} cancelled the poll: ${subjectLabel ?? 'Untitled'}`;
    case 'poll-auto-closed':
      return `Everyone voted — the poll closed automatically: ${subjectLabel ?? 'Untitled'}`;
    case 'poll-updated':
      return `${who} updated the poll: ${subjectLabel ?? 'Untitled'}`;
    case 'setlist-created':
      return `${who} created a setlist: ${subjectLabel ?? 'Untitled'}`;
    case 'audio-added':
      return `${who} added audio: ${subjectLabel ?? 'Untitled'}`;
    case 'song-created':
      return `${who} created a song: ${subjectLabel ?? 'Untitled'}`;
    case 'album-created':
      return `${who} created an album: ${subjectLabel ?? 'Untitled'}`;
  }
}

/** Where tapping the notification lands (relative; resolved against origin). */
function pushUrl(
  subjectType: NotificationSubject,
  subjectId: string | null,
  bandId: string,
  kind: NotificationKind,
): string {
  switch (subjectType) {
    case 'conversation':
      return subjectId ? `/notes/${subjectId}` : `/bands/${bandId}`;
    case 'event':
      return `/bands/${bandId}`;
    case 'band':
      return kind === 'chat-message'
        ? `/bands/${bandId}?tab=chat`
        : `/bands/${bandId}`;
    case 'poll':
      return subjectId
        ? `/bands/${bandId}/polls/${subjectId}`
        : `/bands/${bandId}`;
    case 'setlist':
      return subjectId
        ? `/bands/${bandId}/setlists/${subjectId}`
        : `/bands/${bandId}`;
    case 'album':
      return subjectId
        ? `/bands/${bandId}/albums/${subjectId}`
        // No album to point at: the Songs tab in album view is the nearest
        // useful place, and it's where albums are browsed from.
        : `/bands/${bandId}/audio?tab=songs`;
  }
}

/**
 * Send a mobile push to every device that should hear about `input` (band
 * members' subscriptions, minus the actor and anyone who feed-/push-muted the
 * kind — resolved in one query). Fire-and-forget from `notify()`; never throws.
 * `names` (the actor + band names) are passed through from the notification
 * insert so this path doesn't re-query them; falls back to a lookup if absent.
 */
export async function sendEventPush(
  input: CreateNotificationInput,
  names?: { actorName: string | null; bandName: string | null },
): Promise<void> {
  if (!ensureConfigured()) return;

  const targets = await listPushTargets({
    bandId: input.bandId,
    actorId: input.actorId,
    kind: input.kind,
  });
  if (targets.length === 0) return;

  let actorName = names?.actorName ?? null;
  let bandName = names?.bandName ?? null;
  if (!names) {
    const [[actor], [band]] = await Promise.all([
      db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, input.actorId))
        .limit(1),
      db
        .select({ name: bands.name })
        .from(bands)
        .where(eq(bands.id, input.bandId))
        .limit(1),
    ]);
    actorName = actor?.name ?? null;
    bandName = band?.name ?? null;
  }

  const payload = JSON.stringify({
    title: bandName ?? 'Noodle',
    body: pushBody(
      input.kind,
      actorName ?? 'Someone',
      bandName ?? 'the band',
      input.subjectLabel ?? null,
    ),
    url: pushUrl(
      input.subjectType,
      input.subjectId ?? null,
      input.bandId,
      input.kind,
    ),
    // Collapse repeat pushes about the same subject into one on the device.
    tag: `${input.bandId}:${input.subjectType}:${input.subjectId ?? ''}`,
  });

  await Promise.all(
    targets.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // Gone / not found → the subscription is dead; drop it.
        if (status === 404 || status === 410) {
          await deletePushSubscription(s.endpoint).catch(() => {});
        } else {
          console.error('[push] send failed', status ?? err);
        }
      }
    }),
  );
}
