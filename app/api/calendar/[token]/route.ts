import { NextResponse } from 'next/server';
import { getUserIdByFeedToken } from '@/lib/db/calendarFeeds';
import { listEventsForFeed, type FeedEvent } from '@/lib/db/events';
import { buildCalendar, type IcsEvent } from '@/lib/ics';
import { rateLimitByIp } from '@/lib/rate-limit';

/**
 * GET /api/calendar/<token> — a read-only iCalendar feed of the events
 * visible to the token's owner. Unauthenticated by design: calendar apps
 * fetch it with no session, so the unguessable token IS the credential. An
 * unknown/revoked token 404s (never reveals whether a token existed).
 *
 * One-way only — the app never reads from the subscriber's calendar. Clients
 * re-poll on their own schedule (Google: hours; Apple: configurable), so
 * edits/deletes propagate eventually, not in real time.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Compose an event's DESCRIPTION from its details, setlist, and deep link. */
function describe(ev: FeedEvent, appUrl: string): string | null {
  const parts: string[] = [];
  if (ev.details) parts.push(ev.details);
  if (ev.setlistName) parts.push(`Setlist: ${ev.setlistName}`);
  parts.push(`${appUrl}/calendar/events/${ev.id}`);
  return parts.length ? parts.join('\n\n') : null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const limit = rateLimitByIp('calendar-feed', req, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!limit.allowed) {
    return new NextResponse('Too Many Requests', {
      status: 429,
      headers: { 'Retry-After': String(limit.retryAfterSec) },
    });
  }

  const { token } = await params;
  const userId = await getUserIdByFeedToken(token);
  if (!userId) return new NextResponse('Not Found', { status: 404 });

  const appUrl = process.env.AUTH_URL ?? new URL(req.url).origin;
  const events = await listEventsForFeed(userId);
  const icsEvents: IcsEvent[] = events.map((ev) => ({
    id: ev.id,
    title: `${ev.bandName}: ${ev.title}`,
    date: ev.date,
    time: ev.time,
    location: ev.location,
    description: describe(ev, appUrl),
    url: `${appUrl}/calendar/events/${ev.id}`,
    updatedAt: ev.updatedAt,
  }));

  const body = buildCalendar({ name: 'Sidestage', events: icsEvents });

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="sidestage.ics"',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
