import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createDueEventReminders } from '@/lib/db/event-reminder-sweep';

/**
 * POST /api/cron/event-reminders
 *   Header: `Authorization: Bearer $CRON_SECRET`
 *   → create any event reminders now due. Returns what it scanned and wrote.
 *
 * The scheduler's whole entry point: everything it decides lives in
 * `createDueEventReminders`, so swapping how it's woken up — a different
 * scheduler, or a manual run — touches nothing but this file.
 *
 * Safe to call repeatedly and safe to miss: the sweep sends anything whose
 * moment has passed and a unique index refuses a second copy, so a run that
 * fires twice sends once and a run that never fires catches up next time.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  /*
   * Refuse outright when no secret is configured rather than defaulting to
   * open. This endpoint pushes to people's lock screens; an unauthenticated
   * trigger is worse than a scheduler that visibly fails.
   */
  if (!secret) {
    return NextResponse.json(
      { error: 'not_configured', message: 'CRON_SECRET is not set.' },
      { status: 503 },
    );
  }

  const offered = req.headers.get('authorization') ?? '';
  if (!safeEqual(offered, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const result = await createDueEventReminders(new Date());
  return NextResponse.json(result);
}

/**
 * Constant-time comparison, so a wrong token can't be narrowed down by how
 * long the answer takes. Lengths are compared first because `timingSafeEqual`
 * throws on a mismatch — that leak is the length alone, which the header's
 * own size already gives away.
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
