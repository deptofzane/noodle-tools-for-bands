import { NextResponse } from 'next/server';
import { requireBandMember } from '@/lib/api-guard';
import { getTodoOwnership, isTodoStatus, setTodoStatus } from '@/lib/db/todos';
import { notify } from '@/lib/db/notifications';

/**
 * POST /api/bands/[bandId]/todos/[todoId]/status
 *   Body: { status: 'active' | 'complete' | 'cancelled' }
 *
 * Its own route rather than a field on PATCH, because moving a todo between
 * columns is the commonest thing anyone does to one and PATCH replaces the
 * whole record — including its links. Ticking something off a list would
 * otherwise mean resending every field from whatever the screen last read,
 * which is how a stale row quietly overwrites someone else's edit.
 *
 * Any band member may restatus a shared todo; a private one is its creator's,
 * and to anyone else it doesn't exist.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bandId: string; todoId: string }> },
) {
  const { bandId, todoId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;

  const own = await getTodoOwnership(todoId);
  if (!own || own.bandId !== bandId)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!own.shared && own.creatorId !== guard.user.id)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!isTodoStatus(body?.status))
    return NextResponse.json(
      {
        error: 'bad_request',
        message: 'Expected { status: active | complete | cancelled }.',
      },
      { status: 400 },
    );

  const changed = body.status !== own.status;
  await setTodoStatus(todoId, body.status);

  /*
   * Broadcast, not addressed: a shared todo was shared so the band could see
   * where it stands, and finishing one is the answer they were waiting for.
   * Feed-only all the same — see FEED_ONLY_KINDS — because a buzz per member
   * per tick is the loudest thing this app could do.
   *
   * Nothing fires for a private todo (nobody else can see it), for a move
   * back to active, or when the status didn't actually change.
   */
  if (own.shared && changed && body.status !== 'active') {
    await notify({
      bandId,
      actorId: guard.user.id,
      kind: body.status === 'complete' ? 'todo-completed' : 'todo-cancelled',
      subjectType: 'todo',
      subjectId: todoId,
      subjectLabel: own.title,
    });
  }

  return NextResponse.json({ ok: true });
}
