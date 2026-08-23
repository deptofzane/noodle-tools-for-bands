import { NextResponse } from 'next/server';
import { requireBandMember } from '@/lib/api-guard';
import {
  countTodosByStatus,
  createTodo,
  isTodoStatus,
  listTodos,
  type TodoScope,
} from '@/lib/db/todos';
import { parseLinks } from '@/lib/note-links';
import { notify } from '@/lib/db/notifications';
import { readWindow, splitPage } from '@/lib/paging';

const MAX_TITLE = 200;
const MAX_BODY = 20_000;

/**
 * GET  /api/bands/[bandId]/todos?scope=&status=&limit=&offset=
 *   → one page of todos in that status, plus `counts` for all three so the
 *     collapsed sections can show a number without being opened.
 *
 * POST /api/bands/[bandId]/todos
 *   Body: { title, description?, shared?, ownerId?, deadline?, links? }
 *
 * Both require band membership; visibility inside the band is enforced by the
 * query, which never returns another member's private todo.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** YYYY-MM-DD, or null. Anything else is dropped rather than guessed at. */
function parseDeadline(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : v;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const { bandId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;

  const url = new URL(req.url);
  const scope: TodoScope =
    url.searchParams.get('scope') === 'mine' ? 'mine' : 'all';
  const raw = url.searchParams.get('status');
  const status = isTodoStatus(raw) ? raw : 'active';
  const { limit, offset } = readWindow(url);

  const [rows, counts] = await Promise.all([
    listTodos(bandId, guard.user.id, {
      scope,
      status,
      limit: limit + 1,
      offset,
    }),
    countTodosByStatus(bandId, guard.user.id, scope),
  ]);
  const { items, hasMore } = splitPage(rows, limit);
  return NextResponse.json({ todos: items, hasMore, counts });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const { bandId } = await params;
  const guard = await requireBandMember(bandId);
  if (guard instanceof NextResponse) return guard;

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

  const shared = body?.shared === true;
  const ownerId =
    shared && typeof body?.ownerId === 'string' ? body.ownerId : null;
  const { id } = await createTodo({
    bandId,
    creatorId: guard.user.id,
    title,
    description: description.trim() ? description : null,
    shared,
    // Only a shared todo can name an owner; the data layer drops it otherwise,
    // but not sending it makes the intent explicit here too.
    ownerId,
    deadline: parseDeadline(body?.deadline),
    links: parseLinks(body?.links),
  });
  /*
   * Only when it lands on someone *else*: assigning yourself something is not
   * news to you, and the notification is addressed to one person rather than
   * broadcast, so there is nobody else it would inform.
   */
  if (ownerId && ownerId !== guard.user.id) {
    await notify({
      bandId,
      actorId: guard.user.id,
      kind: 'todo-assigned',
      subjectType: 'todo',
      subjectId: id,
      subjectLabel: title,
      recipientId: ownerId,
    });
  }

  return NextResponse.json({ id }, { status: 201 });
}
