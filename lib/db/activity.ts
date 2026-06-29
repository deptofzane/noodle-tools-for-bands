import { desc, eq, sql } from 'drizzle-orm';
import { db, type DbExecutor } from './index';
import { activityLog, users } from './schema';
import { CONVERSATION_CHANNEL } from './notify';

/**
 * Activity log data layer (Postgres).
 *
 * Replaces the Drive `_activity.json` denormalized read-cache. Each note
 * mutation appends a row; the conversation panel reads the recent log.
 * Unlike the Drive version there's no cap to manage — we just query the
 * most recent N.
 */

export type ActivityKind = (typeof activityLog.kind.enumValues)[number];

const MAX_LOG_ENTRIES = 50;

export interface ActivityEntry {
  at: string; // ISO 8601
  by: { id: string; name: string | null; email: string | null };
  kind: ActivityKind;
}

export interface ConversationActivity {
  lastActivity: ActivityEntry;
  log: ActivityEntry[];
}

/** Append an activity entry. Accepts a tx so it can run inside note ops. */
export async function recordActivity(
  exec: DbExecutor,
  conversationId: string,
  actorId: string,
  kind: ActivityKind,
): Promise<void> {
  await exec.insert(activityLog).values({ conversationId, actorId, kind });
  // Real-time signal for the SSE hub. Inside the caller's transaction, so
  // it's delivered on commit and rolled back with a failed mutation.
  await exec.execute(
    sql`select pg_notify(${CONVERSATION_CHANNEL}, ${conversationId})`,
  );
}

/** Recent activity for a conversation (newest first), with actor info. */
export async function getConversationActivity(
  conversationId: string,
): Promise<ConversationActivity | null> {
  const rows = await db
    .select({
      at: activityLog.createdAt,
      kind: activityLog.kind,
      actorId: users.id,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(activityLog)
    .innerJoin(users, eq(users.id, activityLog.actorId))
    .where(eq(activityLog.conversationId, conversationId))
    .orderBy(desc(activityLog.createdAt))
    .limit(MAX_LOG_ENTRIES);

  if (rows.length === 0) return null;

  const log: ActivityEntry[] = rows.map((r) => ({
    at: r.at.toISOString(),
    by: { id: r.actorId, name: r.actorName, email: r.actorEmail },
    kind: r.kind,
  }));

  return { lastActivity: log[0]!, log };
}
