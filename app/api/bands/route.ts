import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-guard';
import { createBand, listMyBands } from '@/lib/db/bands';

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
    return NextResponse.json({ error: 'bad_name', message: 'Band name required (≤100 chars).' }, { status: 400 });
  const band = await createBand(user.id, name);
  return NextResponse.json({ band }, { status: 201 });
}