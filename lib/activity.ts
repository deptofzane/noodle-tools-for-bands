import type { drive_v3 } from 'googleapis';

/**
 * Per-conversation activity file.
 *
 * Lives alongside the per-user `user-<sub>.json` notes files inside a
 * conversation's `<basename>.notes/` subfolder, as a single shared
 * `_activity.json`. Tracks the most recent activity across all
 * collaborators (who did what, when) plus a capped log.
 *
 * Design intent (see the design discussion before this was built):
 *
 * - The per-user notes JSONs remain the **canonical** source of
 *   truth for note content. The activity file is a **denormalized
 *   read-cache** that's allowed to drift slightly. Writes to it are
 *   best-effort — if the activity write fails after a successful
 *   note write, the note write still wins and the activity file
 *   catches up on the next operation.
 *
 * - The Open Conversations / History views read the activity file
 *   to learn the latest cross-user activity. If no activity file
 *   exists (legacy conversations), they fall back to the per-user
 *   modifiedTime as before.
 *
 * Concurrency: last-write-wins. Two simultaneous writers may briefly
 * clobber each other's log entries. We accept this for simplicity
 * (the canonical per-user files are unaffected). If contention
 * becomes a real issue, the upgrade is etag-based optimistic locking
 * via Drive's `If-Match` header.
 *
 * This module uses `googleapis` and is Node-only. Don't import it
 * from the Edge runtime.
 */

const ACTIVITY_FILE_NAME = '_activity.json';
const JSON_MIME = 'application/json';
const MAX_LOG_ENTRIES = 50;

export type ActivityKind =
  | 'note-created'
  | 'note-updated'
  | 'note-deleted'
  | 'reply-created'
  | 'closed'
  | 'reopened'
  | 'resolved'
  | 'unresolved';

export interface ActivityActor {
  sub: string;
  name?: string | null;
  email?: string | null;
}

export interface ActivityLogEntry {
  /** ISO 8601 timestamp. */
  at: string;
  by: ActivityActor;
  kind: ActivityKind;
  /**
   * Subs @-mentioned by this entry's note/reply, if any. Lets the
   * "mentions of me" scan find conversations a user was tagged in
   * without reading every per-user notes file. Omitted when empty.
   */
  mentions?: string[];
}

export interface ConversationActivity {
  version: 1;
  audioFileId: string;
  audioFileName: string;
  closed: boolean;
  /** Most recent entry. Convenience copy of `log[0]`. */
  lastActivity: ActivityLogEntry;
  /** Capped log of recent activities, newest first. */
  log: ActivityLogEntry[];
}

function escapeForQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Find the activity file in a single subfolder. Returns the newest if
 * there are duplicates (from a creation race), or null if none exists.
 */
export async function findActivityFile(
  drive: drive_v3.Drive,
  subFolderId: string,
): Promise<{ id: string } | null> {
  const res = await drive.files.list({
    q: `'${escapeForQuery(subFolderId)}' in parents and name = '${ACTIVITY_FILE_NAME}' and mimeType = '${JSON_MIME}' and trashed = false`,
    fields: 'files(id, modifiedTime)',
    pageSize: 5,
    orderBy: 'modifiedTime desc',
  });
  const f = res.data.files?.[0];
  if (!f?.id) return null;
  return { id: f.id };
}

/** Fetch + parse the activity file by id. Returns null on any error. */
export async function fetchActivityFile(
  drive: drive_v3.Drive,
  fileId: string,
): Promise<ConversationActivity | null> {
  try {
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'json' },
    );
    const data = res.data as unknown;
    if (data && typeof data === 'object') return data as ConversationActivity;
    if (typeof data === 'string') return JSON.parse(data) as ConversationActivity;
    return null;
  } catch (err) {
    console.error('[activity] fetchActivityFile failed', { fileId, err });
    return null;
  }
}

/**
 * Best-effort record of a new activity entry.
 *
 * Find-or-create semantics: if no activity file exists, create one;
 * otherwise update the latest. If multiple activity files exist in
 * the same subfolder (rare — from a creation race), the newest wins
 * as canonical and stale duplicates are trashed.
 *
 * Throws are caught and logged; this function never propagates
 * failures upward. The note-write path that called it succeeded
 * already, and the activity file is allowed to be slightly behind.
 */
export async function recordActivity(
  drive: drive_v3.Drive,
  subFolderId: string,
  audioFile: { id: string; name: string },
  closed: boolean,
  actor: ActivityActor,
  kind: ActivityKind,
  mentions: string[] = [],
): Promise<void> {
  try {
    const entry: ActivityLogEntry = {
      at: new Date().toISOString(),
      by: { sub: actor.sub, name: actor.name, email: actor.email },
      kind,
      // Omit when empty to keep the log compact.
      ...(mentions.length > 0 ? { mentions } : {}),
    };

    const list = await drive.files.list({
      q: `'${escapeForQuery(subFolderId)}' in parents and name = '${ACTIVITY_FILE_NAME}' and mimeType = '${JSON_MIME}' and trashed = false`,
      fields: 'files(id, modifiedTime)',
      pageSize: 5,
      orderBy: 'modifiedTime desc',
    });
    const files = list.data.files ?? [];

    if (files.length === 0) {
      const snapshot: ConversationActivity = {
        version: 1,
        audioFileId: audioFile.id,
        audioFileName: audioFile.name,
        closed,
        lastActivity: entry,
        log: [entry],
      };
      await drive.files.create({
        requestBody: {
          name: ACTIVITY_FILE_NAME,
          parents: [subFolderId],
          mimeType: JSON_MIME,
        },
        media: {
          mimeType: JSON_MIME,
          body: JSON.stringify(snapshot, null, 2),
        },
      });
      return;
    }

    const canonical = files[0];
    if (!canonical?.id) return;

    const current = await fetchActivityFile(drive, canonical.id);
    const snapshot: ConversationActivity = {
      version: 1,
      audioFileId: audioFile.id,
      audioFileName: audioFile.name,
      closed,
      lastActivity: entry,
      log: [entry, ...(current?.log ?? [])].slice(0, MAX_LOG_ENTRIES),
    };

    await drive.files.update({
      fileId: canonical.id,
      media: {
        mimeType: JSON_MIME,
        body: JSON.stringify(snapshot, null, 2),
      },
    });

    // Best-effort cleanup of duplicate activity files left behind by
    // a creation race. Anyone with folder write access can delete.
    for (let i = 1; i < files.length; i++) {
      const dup = files[i];
      if (!dup?.id) continue;
      try {
        await drive.files.delete({ fileId: dup.id });
      } catch {
        // ignore — duplicate will just sit there until the next write
      }
    }
  } catch (err) {
    console.error('[activity] recordActivity failed', err);
    // Never propagate. Notes JSON is the source of truth.
  }
}

/**
 * Bulk lookup of activity files across many subfolders.
 *
 * Used by listAnnotatedFiles to avoid N round-trips for "find the
 * activity file in subfolder X." One broad query returns every
 * visible activity file; we filter client-side to the subfolders the
 * caller cares about. Returns a Map keyed by subfolder id.
 */
export async function listActivityFilesByParent(
  drive: drive_v3.Drive,
  subFolderIds: Iterable<string>,
): Promise<Map<string, string>> {
  const interestedIn = new Set(subFolderIds);
  if (interestedIn.size === 0) return new Map();

  const res = await drive.files.list({
    q: `name = '${ACTIVITY_FILE_NAME}' and mimeType = '${JSON_MIME}' and trashed = false`,
    fields: 'files(id, name, modifiedTime, parents)',
    pageSize: 200,
    orderBy: 'modifiedTime desc',
  });

  const result = new Map<string, string>();
  for (const f of res.data.files ?? []) {
    const pid = f.parents?.[0];
    if (!pid || !f.id || !interestedIn.has(pid)) continue;
    // First hit wins because the list is ordered modifiedTime desc.
    if (!result.has(pid)) result.set(pid, f.id);
  }
  return result;
}

/**
 * List every `_activity.json` file visible to the caller, regardless of
 * which folder it lives in. Used by the "mentions of me" scan, which
 * must reach conversations the user has never personally posted in (so
 * the participation-scoped `listAnnotatedFiles` query can't find them).
 *
 * Cost: a single broad list. Callers fetch each file's contents
 * separately. The page-size cap (200) bounds the scan to the most
 * recently modified conversations.
 */
export async function listAllActivityFiles(
  drive: drive_v3.Drive,
): Promise<Array<{ id: string }>> {
  const res = await drive.files.list({
    q: `name = '${ACTIVITY_FILE_NAME}' and mimeType = '${JSON_MIME}' and trashed = false`,
    fields: 'files(id, modifiedTime)',
    pageSize: 200,
    orderBy: 'modifiedTime desc',
  });
  return (res.data.files ?? [])
    .filter((f): f is { id: string } => Boolean(f.id))
    .map((f) => ({ id: f.id }));
}
