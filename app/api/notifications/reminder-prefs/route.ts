import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { clearReminderPref, setReminderPref } from '@/lib/db/event-reminders';
import {
  DEFAULT_REMINDERS,
  REMINDER_CATEGORIES,
  REMINDER_KINDS,
  type ReminderCategory,
  type ReminderKind,
} from '@/lib/reminder-prefs';

/**
 * Which event types get which reminder offsets, per user.
 *
 *   PATCH { category, kind, enabled } → record one choice
 *
 * Only disagreements with the default are stored: a choice that matches the
 * default deletes the row instead of writing one. That's what keeps "no row
 * means default" true, so changing a default later still reaches everybody who
 * never disagreed with it, and a new category arrives sensible without a
 * backfill.
 *
 * There is no GET — the Settings page loads the current state server-side.
 *
 * Separate from `/preferences` because that one is per-kind across two
 * channels, while this is per-kind *and* per event category. Folding them
 * together would make a single endpoint mean two different things.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const isCategory = (v: unknown): v is ReminderCategory =>
  typeof v === 'string' &&
  (REMINDER_CATEGORIES as readonly string[]).includes(v);

const isKind = (v: unknown): v is ReminderKind =>
  typeof v === 'string' && (REMINDER_KINDS as readonly string[]).includes(v);

export async function PATCH(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const body = await req.json().catch(() => null);
  // Both names checked against the closed sets. An unknown category would
  // store a row nothing ever reads, reporting success for a change the caller
  // believes it made.
  if (
    !isCategory(body?.category) ||
    !isKind(body?.kind) ||
    typeof body?.enabled !== 'boolean'
  ) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Provide { category, kind, enabled }.' },
      { status: 400 },
    );
  }

  // Re-stated as typed locals: `body` came back from `json()` as `any`, so the
  // guards above narrowed nothing that survives a property access.
  const category: ReminderCategory = body.category;
  const kind: ReminderKind = body.kind;
  const enabled: boolean = body.enabled;

  if (enabled === DEFAULT_REMINDERS[category][kind]) {
    await clearReminderPref(user.id, category, kind);
  } else {
    await setReminderPref(user.id, category, kind, enabled);
  }
  return NextResponse.json({ ok: true });
}
