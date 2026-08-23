import { NextResponse } from 'next/server';
import { requireBandMember } from '@/lib/api-guard';
import {
  deleteTodo,
  getTodoForUser,
  getTodoOwnership,
  isTodoStatus,
  updateTodo,
} from '@/lib/db/todos';
import { parseLinks } from '@/lib/note-links';
import { notify } from '@/lib/db/notifications';

const MAX_TITLE = 200;
const MAX_BODY = 20_000;

/**
 * GET    /api/bands/[bandId]/todos/[todoId]  → read it
 * PATCH  …  Body: { title, description?, deadline?, status?, ownerId?, links? }
 * DELETE …  → remove it (its links cascade)
 *
 * A shared todo is the band's: any member may edit, restatus, reassign or
 * delete it. A private one is its creator's alone, and to everyone else it
 * doesn't exist — so they get a 404 rather than a 403, which would confirm it
 * was there.
 *
 * Sharing is *not* changed here. It has rules of its own and lives at
 * ./share, so an ordinary edit can't quietly take a todo out of the band.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function authorize(
  bandId: string,
  todoId: string,
): Promise<
  | NextResponse
  | {
      userId: string;
      creatorId: string;
      ownerId: string | null;
      shared: boolean;
      title: string;
    }
> {
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;
  const own = await getTodoOwnership(todoId);
  if (!own || own.bandId !== bandId)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  // Someone else's private todo is indistinguishable from one that isn't there.
  if (!own.shared && own.creatorId !== guard.user.id)
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return {
    userId: guard.user.id,
    creatorId: own.creatorId,
    ownerId: own.ownerId,
    shared: own.shared,
    title: own.title,
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bandId: string; todoId: string }> },
) {
  const { bandId, todoId } = await params;
  const auth = await authorize(bandId, todoId);
  if (auth instanceof NextResponse) return auth;
  const todo = await getTodoForUser(todoId, auth.userId);
  if (!todo) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ todo });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ bandId: string; todoId: string }> },
) {
  const { bandId, todoId } = await params;
  const auth = await authorize(bandId, todoId);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!title || title.length > MAX_TITLE)
    return NextResponse.json(
      {
        error: 'bad_title',
        message: `Title must be 1–${MAX_TITLE} characters.`,
      },
      { status: 400 },
    );
  const description =
    typeof body?.description === 'string' ? body.description : '';
  if (description.length > MAX_BODY)
    return NextResponse.json(
      { error: 'too_long', message: 'That description is too long.' },
      { status: 413 },
    );

  const deadline =
    typeof body?.deadline === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(body.deadline)
      ? body.deadline
      : null;

  const ownerId =
    auth.shared && typeof body?.ownerId === 'string' ? body.ownerId : null;

  await updateTodo(todoId, {
    title,
    description: description.trim() ? description : null,
    deadline,
    status: isTodoStatus(body?.status) ? body.status : 'active',
    // An owner only means anything on a shared todo; on a private one the
    // creator is the owner and a stored value could only disagree.
    ownerId,
    links: parseLinks(body?.links),
  });

  // Only on a genuine change of hands, and never to yourself — re-saving a
  // todo shouldn't tell its owner again that it's theirs.
  if (ownerId && ownerId !== auth.ownerId && ownerId !== auth.userId) {
    await notify({
      bandId,
      actorId: auth.userId,
      kind: 'todo-assigned',
      subjectType: 'todo',
      subjectId: todoId,
      subjectLabel: title,
      recipientId: ownerId,
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ bandId: string; todoId: string }> },
) {
  const { bandId, todoId } = await params;
  const auth = await authorize(bandId, todoId);
  if (auth instanceof NextResponse) return auth;
  await deleteTodo(todoId);
  return new NextResponse(null, { status: 204 });
}
