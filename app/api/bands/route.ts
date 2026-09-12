import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { createBand, isValidTimezone, listMyBands } from '@/lib/db/bands';

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ bands: await listMyBands(user.id) });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 100)
    return NextResponse.json(
      { error: 'bad_name', message: 'Band name required (≤100 chars).' },
      { status: 400 },
    );
  // The creator's browser zone, when it sent one we recognise. A band is
  // almost always in its creator's timezone, so this is right by default and
  // nobody has to find the setting; an unknown value falls through to the
  // column's 'UTC' rather than being stored and quietly shifting reminders.
  const tz = typeof body?.timezone === 'string' ? body.timezone.trim() : '';
  const band = await createBand(
    user.id,
    name,
    tz && isValidTimezone(tz) ? tz : undefined,
  );
  return NextResponse.json({ band }, { status: 201 });
}
