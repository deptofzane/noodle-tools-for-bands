import { NextResponse } from 'next/server';
import { requireBandMember } from '@/lib/api-guard';
import { getTodoOwnership, setTodoShared } from '@/lib/db/todos';
import { notify } from '@/lib/db/notifications';

/**
 * POST /api/bands/[bandId]/todos/[todoId]/share
 *   Body: { shared: boolean }
 *
 * Its own route because sharing is the one part of a todo that isn't the
 * band's to change. Anyone may edit a shared todo; only its creator or its
 * current owner may take it back out, because unsharing is the single action
 * that removes it from everyone else's view.
 *
 * When the owner does it they become the creator — a private todo whose
 * creator can't see it would belong to nobody. The displaced creator is
 * reported back so the caller can tell them, since otherwise a todo they
 * raised simply disappears.
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
  if (typeof body?.shared !== 'boolean')
    return NextResponse.json(
      { error: 'bad_request', message: 'Expected { shared: boolean }.' },
      { status: 400 },
    );

  /*
   * The rule the greyed-out menu item describes, enforced where it counts.
   * The UI also disables it, and the edit form has no Shared control at all —
   * but both of those are conveniences, and this is the one that holds.
   */
  if (
    own.shared &&
    !body.shared &&
    guard.user.id !== own.creatorId &&
    guard.user.id !== own.ownerId
  ) {
    return NextResponse.json(
      {
        error: 'not_owner',
        message: 'Make yourself the owner to take this out of the band.',
      },
      { status: 403 },
    );
  }

  const result = await setTodoShared(todoId, body.shared, guard.user.id);

  /*
   * The owner took it, and its creator has just lost it — it's gone from
   * their list and they no longer own it. Addressed to them alone: nobody
   * else needs telling, and without it the todo simply disappears, which
   * reads as a bug rather than as something someone did.
   */
  if (result.takenFrom) {
    await notify({
      bandId,
      actorId: guard.user.id,
      kind: 'todo-taken-private',
      subjectType: 'todo',
      // No subjectId: it's private to the actor now, so a link would only
      // ever 404 for the person being told.
      subjectLabel: own.title,
      recipientId: result.takenFrom,
    });
  }

  return NextResponse.json({ ok: true, takenFrom: result.takenFrom });
}
