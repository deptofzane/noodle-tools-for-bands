import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from './index';
import { todoLinks, todos, users } from './schema';
import type { NoteLink, NoteLinkInput } from './user-notes';

/**
 * A band's todos.
 *
 * Private to their creator until shared. A shared todo is genuinely handed to
 * the band — anyone may edit, restatus, reassign or delete it — with one
 * exception: taking it back out of the band is the only action that removes
 * it from everyone else's view, so it belongs to the creator or the current
 * owner alone. See `setTodoShared`.
 *
 * Links are the same shape and the same kinds as a note's, and share all of
 * `lib/note-links.ts`; only the table differs.
 */

export type TodoStatus = 'active' | 'complete' | 'cancelled';
export const TODO_STATUSES: TodoStatus[] = ['active', 'complete', 'cancelled'];

export function isTodoStatus(v: unknown): v is TodoStatus {
  return typeof v === 'string' && TODO_STATUSES.includes(v as TodoStatus);
}

/**
 * Which slice of a band's todos to list.
 *
 *   all  — every shared todo. Deliberately not "everything": your own private
 *          todos are nobody else's business and stay out of the band's view.
 *   mine — your private ones, the shared ones assigned to you, and the shared
 *          ones you raised that nobody has claimed yet. That last clause is
 *          what stops a todo you raised vanishing from your list the moment
 *          you share it, since sharing leaves it unassigned.
 */
export type TodoScope = 'all' | 'mine';

export interface Todo {
  id: string;
  bandId: string;
  creatorId: string;
  creatorName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  title: string;
  description: string | null;
  status: TodoStatus;
  shared: boolean;
  /** YYYY-MM-DD, or null. */
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  links: NoteLink[];
}

const TODO_COLUMNS = {
  id: todos.id,
  bandId: todos.bandId,
  creatorId: todos.creatorId,
  ownerId: todos.ownerId,
  title: todos.title,
  description: todos.description,
  status: todos.status,
  shared: todos.shared,
  deadline: todos.deadline,
  createdAt: todos.createdAt,
  updatedAt: todos.updatedAt,
};

/** Attach each todo's links, in one query for the whole page. */
async function withLinks(rows: Omit<Todo, 'links'>[]): Promise<Todo[]> {
  if (rows.length === 0) return [];
  const links = await db
    .select()
    .from(todoLinks)
    .where(
      inArray(
        todoLinks.todoId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(todoLinks.position));

  const byTodo = new Map<string, NoteLink[]>();
  for (const l of links) {
    const list = byTodo.get(l.todoId) ?? [];
    list.push({
      id: l.id,
      kind: l.kind,
      targetId: l.targetId,
      url: l.url,
      label: l.label,
      practice: l.practice,
    });
    byTodo.set(l.todoId, list);
  }
  return rows.map((r) => ({ ...r, links: byTodo.get(r.id) ?? [] }));
}

function toTodo(row: {
  createdAt: Date;
  updatedAt: Date;
  [k: string]: unknown;
}): Omit<Todo, 'links'> {
  return {
    ...(row as unknown as Omit<Todo, 'links' | 'createdAt' | 'updatedAt'>),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * What a user may see at all: their own private todos, plus every shared one.
 *
 * Every scope below is a narrowing of this, so no scope can widen what a
 * member is allowed to read.
 */
function visible(userId: string) {
  return or(
    and(eq(todos.shared, false), eq(todos.creatorId, userId)),
    eq(todos.shared, true),
  );
}

function inScope(scope: TodoScope, userId: string) {
  if (scope === 'all') return eq(todos.shared, true);
  return or(
    // Private ones are mine by definition.
    and(eq(todos.shared, false), eq(todos.creatorId, userId)),
    // Shared and assigned to me.
    and(eq(todos.shared, true), eq(todos.ownerId, userId)),
    // Shared, raised by me, and still unclaimed.
    and(
      eq(todos.shared, true),
      isNull(todos.ownerId),
      eq(todos.creatorId, userId),
    ),
  );
}

/**
 * Ordering: soonest deadline first, undated last, then newest.
 *
 * `nulls last` is the point — a todo with no deadline isn't due today, and
 * Postgres sorts nulls first on ASC by default, which would put every undated
 * todo above everything that's actually due.
 */
const TODO_ORDER = [
  sql`${todos.deadline} asc nulls last`,
  desc(todos.createdAt),
];

/*
 * Creator and owner are both rows in `users`, so one of them has to be
 * aliased. Drizzle's `alias` rather than a hand-written `as`: the generated
 * SQL then references the alias everywhere it should, which a raw fragment
 * only appears to do until the query is actually run.
 */
const creators = alias(users, 'creator_user');
const owners = alias(users, 'owner_user');

export async function listTodos(
  bandId: string,
  userId: string,
  opts: {
    scope: TodoScope;
    status: TodoStatus;
    limit?: number;
    offset?: number;
  },
): Promise<Todo[]> {
  const rows = await db
    .select({
      ...TODO_COLUMNS,
      creatorName: creators.name,
      ownerName: owners.name,
    })
    .from(todos)
    .innerJoin(creators, eq(creators.id, todos.creatorId))
    .leftJoin(owners, eq(owners.id, todos.ownerId))
    .where(
      and(
        eq(todos.bandId, bandId),
        visible(userId),
        inScope(opts.scope, userId),
        eq(todos.status, opts.status),
      ),
    )
    .orderBy(...TODO_ORDER)
    .limit(opts.limit ?? Number.MAX_SAFE_INTEGER)
    .offset(opts.offset ?? 0);
  return withLinks(rows.map(toTodo));
}

/**
 * How many todos sit in each status for this scope, in one query.
 *
 * The three sections show a count in their headings, and two of them start
 * collapsed — so the count is the only thing telling you whether opening
 * them is worth it.
 */
export async function countTodosByStatus(
  bandId: string,
  userId: string,
  scope: TodoScope,
): Promise<Record<TodoStatus, number>> {
  const rows = await db
    .select({ status: todos.status, n: sql<number>`count(*)::int` })
    .from(todos)
    .where(
      and(eq(todos.bandId, bandId), visible(userId), inScope(scope, userId)),
    )
    .groupBy(todos.status);
  const out: Record<TodoStatus, number> = {
    active: 0,
    complete: 0,
    cancelled: 0,
  };
  for (const r of rows) out[r.status] = r.n;
  return out;
}

/** One todo, if `userId` may read it. Null when they may not, or it's gone. */
export async function getTodoForUser(
  todoId: string,
  userId: string,
): Promise<Todo | null> {
  const [row] = await db
    .select({
      ...TODO_COLUMNS,
      creatorName: creators.name,
      ownerName: owners.name,
    })
    .from(todos)
    .innerJoin(creators, eq(creators.id, todos.creatorId))
    .leftJoin(owners, eq(owners.id, todos.ownerId))
    .where(eq(todos.id, todoId))
    .limit(1);
  if (!row) return null;
  if (!row.shared && row.creatorId !== userId) return null;
  const [withIts] = await withLinks([toTodo(row)]);
  return withIts ?? null;
}

/** Band, creator and owner, for authorizing a write without loading it all. */
export async function getTodoOwnership(todoId: string): Promise<{
  bandId: string;
  creatorId: string;
  ownerId: string | null;
  shared: boolean;
  title: string;
  status: TodoStatus;
} | null> {
  const [row] = await db
    .select({
      bandId: todos.bandId,
      creatorId: todos.creatorId,
      ownerId: todos.ownerId,
      shared: todos.shared,
      title: todos.title,
      status: todos.status,
    })
    .from(todos)
    .where(eq(todos.id, todoId))
    .limit(1);
  return row ?? null;
}

async function replaceLinks(
  todoId: string,
  links: NoteLinkInput[],
  exec: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db,
): Promise<void> {
  await exec.delete(todoLinks).where(eq(todoLinks.todoId, todoId));
  if (links.length === 0) return;
  await exec.insert(todoLinks).values(
    links.map((l, i) => ({
      todoId,
      kind: l.kind,
      targetId: l.targetId,
      url: l.url,
      label: l.label,
      practice: l.practice,
      position: i,
    })),
  );
}

export async function createTodo(input: {
  bandId: string;
  creatorId: string;
  title: string;
  description: string | null;
  shared: boolean;
  /** Shared todos only; ignored otherwise (see the schema comment). */
  ownerId: string | null;
  deadline: string | null;
  links: NoteLinkInput[];
}): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(todos)
      .values({
        bandId: input.bandId,
        creatorId: input.creatorId,
        title: input.title,
        description: input.description,
        shared: input.shared,
        // An unshared todo is its creator's; a second column saying so could
        // only ever disagree with the first.
        ownerId: input.shared ? input.ownerId : null,
        deadline: input.deadline,
      })
      .returning({ id: todos.id });
    const id = row!.id;
    await replaceLinks(id, input.links, tx);
    return { id };
  });
}

export async function updateTodo(
  todoId: string,
  fields: {
    title: string;
    description: string | null;
    deadline: string | null;
    status: TodoStatus;
    ownerId: string | null;
    links: NoteLinkInput[];
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(todos)
      .set({
        title: fields.title,
        description: fields.description,
        deadline: fields.deadline,
        status: fields.status,
        // Sharing is changed through `setTodoShared`, which has rules of its
        // own; an ordinary edit can only move the owner within what it is.
        ownerId: fields.ownerId,
        updatedAt: sql`now()`,
      })
      .where(eq(todos.id, todoId));
    await replaceLinks(todoId, fields.links, tx);
  });
}

/**
 * Move a todo between statuses.
 *
 * Its own function rather than part of an edit: the list changes status from
 * a row's menu without opening a form, and doing it this way leaves the rest
 * of the todo — including its links — untouched.
 */
export async function setTodoStatus(
  todoId: string,
  status: TodoStatus,
): Promise<void> {
  await db
    .update(todos)
    .set({ status, updatedAt: sql`now()` })
    .where(eq(todos.id, todoId));
}

/** Assign a shared todo, or `null` to put it back up for grabs. */
export async function setTodoOwner(
  todoId: string,
  ownerId: string | null,
): Promise<void> {
  await db
    .update(todos)
    .set({ ownerId, updatedAt: sql`now()` })
    .where(and(eq(todos.id, todoId), eq(todos.shared, true)));
}

export interface TodoShareResult {
  /**
   * Set when an owner took a shared todo private and displaced its creator —
   * the id of the person who lost it. They are told, because otherwise a todo
   * they raised simply disappears.
   */
  takenFrom: string | null;
}

/**
 * Share a todo with the band, or take it back out.
 *
 * Sharing clears the owner: it goes up for grabs, which is usually why it's
 * being shared at all.
 *
 * Unsharing is the only action that removes a todo from everyone else's view,
 * so the caller must have already established that `actorId` is the creator
 * or the current owner. When it's the owner, they *become* the creator — a
 * private todo whose creator can't see it would be unreachable by anyone.
 */
export async function setTodoShared(
  todoId: string,
  shared: boolean,
  actorId: string,
): Promise<TodoShareResult> {
  if (shared) {
    await db
      .update(todos)
      .set({ shared: true, ownerId: null, updatedAt: sql`now()` })
      .where(eq(todos.id, todoId));
    return { takenFrom: null };
  }

  const before = await getTodoOwnership(todoId);
  if (!before) return { takenFrom: null };
  const takeover = before.creatorId !== actorId;
  await db
    .update(todos)
    .set({
      shared: false,
      ownerId: null,
      creatorId: takeover ? actorId : before.creatorId,
      updatedAt: sql`now()`,
    })
    .where(eq(todos.id, todoId));
  return { takenFrom: takeover ? before.creatorId : null };
}

export async function deleteTodo(todoId: string): Promise<void> {
  await db.delete(todos).where(eq(todos.id, todoId));
}
