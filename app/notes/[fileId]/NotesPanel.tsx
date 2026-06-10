'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDuration } from '@/lib/audio';
import type { ThreadedNote } from '@/lib/notes';
import type { ActivityKind, ConversationActivity } from '@/lib/activity';
import { readCachedNotes, writeCachedNotes } from '@/lib/notes-cache';
import { useTrackPending } from '../../PendingActionProvider';
import { usePlayer } from './PlayerContext';
import { NoteForm } from './NoteForm';
import { NoteItem } from './NoteItem';

/**
 * The notes side panel.
 *
 * Data flow:
 *   1. On mount, read the IndexedDB cache and render it immediately
 *      so the panel doesn't show a loading spinner on revisit
 *      (cf. `lib/notes-cache.ts`).
 *   2. In parallel, fetch fresh notes from /api/files/[fileId]/notes.
 *      Replace the UI + update the cache.
 *   3. Subscribe to Server-Sent Events at /api/drive/changes — the
 *      server long-polls Drive's Changes API and pushes a `change`
 *      event when something in the watched notes subfolder moves.
 *      On every `change`, refetch.
 *   4. Backstop: a 30-second poll catches anything SSE missed (e.g.,
 *      transient disconnects). When SSE is healthy, this is mostly a
 *      no-op.
 *
 * In practice: collaborator changes propagate in ~1 second instead of
 * the ~15 seconds of pure polling.
 */

const POLL_INTERVAL_MS = 30_000;

export function NotesPanel({
  fileId,
  folderId,
  currentUserSub,
}: {
  fileId: string;
  folderId: string;
  currentUserSub: string;
}) {
  const [notes, setNotes] = useState<ThreadedNote[] | null>(null);
  const [closed, setClosed] = useState(false);
  const [conversationExists, setConversationExists] = useState(false);
  const [activity, setActivity] = useState<ConversationActivity | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [stateBusy, setStateBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerTime, setComposerTime] = useState(0);
  /**
   * Flips true for a few seconds right after an auto-reopen — i.e.,
   * the user submitted a note on a conversation that was closed, the
   * server quietly renamed the subfolder back to open, and we want to
   * surface that transition. The toast auto-dismisses on its own.
   */
  const [recentlyReopened, setRecentlyReopened] = useState(false);
  const inFlight = useRef(false);
  const reopenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const player = usePlayer();
  const trackPending = useTrackPending();

  // Make sure any pending auto-dismiss is cleared on unmount.
  useEffect(() => {
    return () => {
      if (reopenTimer.current) clearTimeout(reopenTimer.current);
    };
  }, []);

  useEffect(() => {
    console.log('check notes', notes)
  }, [notes])

  const fetchNotes = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(
        `/api/files/${fileId}/notes?folder=${folderId}`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        notes: ThreadedNote[];
        closed?: boolean;
        exists?: boolean;
        activity?: ConversationActivity;
      };
      const reorderedNotes = reorderNotes(data.notes);
      setNotes(reorderedNotes);
      setClosed(data.closed ?? false);
      setConversationExists(data.exists ?? reorderedNotes.length > 0);
      setActivity(data.activity ?? null);
      setError(null);
      // Best-effort cache update. Awaits inside but errors are swallowed.
      void writeCachedNotes(fileId, reorderedNotes);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inFlight.current = false;
    }
  }, [fileId, folderId]);

  // move resolved threads to the end of the conversation regardless of timestamp
  const reorderNotes = (notes: ThreadedNote[]): ThreadedNote[] => {
    const resolved = [];
    const unresolved = [];
    for(const note of notes) {
      if (note?.resolved && note?.resolved === true) {
        resolved.push(note)
      } else {
        unresolved.push(note)
      }
    }
    return [...unresolved, ...resolved];
  }

  const setConversationClosed = useCallback(
    async (next: boolean) => {
      setStateBusy(true);
      try {
        await trackPending(async () => {
          const res = await fetch(
            `/api/files/${fileId}/notes?folder=${folderId}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ closed: next }),
            },
          );
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.message ?? `HTTP ${res.status}`);
          }
        });
        // Optimistic: update local state immediately so the banner /
        // button label changes without waiting on the refetch.
        setClosed(next);
        await fetchNotes();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setStateBusy(false);
      }
    },
    [fileId, folderId, fetchNotes, trackPending],
  );

  // Initial render: hydrate from cache, then fetch fresh.
  //
  // The first fetch is wrapped in `trackPending` so the Header spinner
  // reflects the load. The same `fetchNotes` is also called by the SSE
  // change handler and the 30-second background poll below, but those
  // intentionally bypass `trackPending` — wrapping them would keep the
  // spinner on more or less continuously while collaborators are
  // active, which would defeat the "user-triggered action" signal.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = await readCachedNotes(fileId);
      if (!cancelled && cached) {
        setNotes(cached);
      }
      if (!cancelled) {
        await trackPending(() => fetchNotes());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId, fetchNotes, trackPending]);

  // SSE subscription for real-time updates from collaborators.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return;
    }

    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    // Cap reconnect attempts so a permanently-broken endpoint doesn't
    // hammer the server forever.
    let backoffMs = 1000;
    const MAX_BACKOFF_MS = 30_000;

    const connect = () => {
      if (cancelled) return;
      try {
        es = new EventSource(
          `/api/drive/changes?file=${encodeURIComponent(fileId)}&folder=${encodeURIComponent(folderId)}`,
        );
      } catch {
        scheduleReconnect();
        return;
      }

      es.addEventListener('open', () => {
        backoffMs = 1000;
      });

      es.addEventListener('change', () => {
        void fetchNotes();
      });

      es.addEventListener('error', () => {
        // EventSource will auto-reconnect, but sometimes it gets stuck.
        // Force a clean reconnect with our own backoff.
        es?.close();
        es = null;
        scheduleReconnect();
      });
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      reconnectTimer = setTimeout(() => {
        connect();
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      }, backoffMs);
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
      es = null;
    };
  }, [fileId, folderId, fetchNotes]);

  // Backstop polling. Quiet (30s) because SSE is doing the heavy lifting.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void fetchNotes();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchNotes]);

  const openComposer = () => {
    setComposerTime(player.getCurrentTime());
    setComposerOpen(true);
  };

  const handleCreate = async (body: string) => {
    const wasClosed = closed;
    await trackPending(async () => {
      const res = await fetch(`/api/files/${fileId}/notes?folder=${folderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestampMs: Math.floor(composerTime * 1000),
          body,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }
    });
    setComposerOpen(false);
    await fetchNotes();
    // If we just added a note to a closed conversation, the server
    // auto-reopened it. Surface that transition briefly so the user
    // knows what happened — the closed banner disappearing alone is
    // easy to miss.
    if (wasClosed) {
      setRecentlyReopened(true);
      if (reopenTimer.current) clearTimeout(reopenTimer.current);
      reopenTimer.current = setTimeout(
        () => setRecentlyReopened(false),
        4_000,
      );
    }
  };

  return (
    <section
      aria-label="Notes"
      className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Notes</h2>
        <div className="flex items-center gap-3 text-xs text-neutral-500">
          {notes && <span>{countAll(notes)} total</span>}
          {conversationExists && (
            <button
              type="button"
              onClick={() => setConversationClosed(!closed)}
              disabled={stateBusy}
              className="rounded-md border border-neutral-300 px-2 py-0.5 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
              title={
                closed
                  ? 'Reopen this conversation so it shows up in Open Conversations'
                  : 'Mark this conversation closed (moves it to History)'
              }
            >
              {stateBusy ? '…' : closed ? 'Reopen conversation' : 'Close conversation'}
            </button>
          )}
        </div>
      </header>

      {activity && (
        <ActivityHeader
          activity={activity}
          currentUserSub={currentUserSub}
          open={logOpen}
          onToggle={() => setLogOpen((v) => !v)}
        />
      )}

      {closed && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          This conversation is closed and lives in History. Adding a
          note will reopen it.
        </div>
      )}

      {recentlyReopened && !closed && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
        >
          Conversation reopened.
        </div>
      )}

      {composerOpen ? (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <NoteForm
            header={
              <>
                Adding note at{' '}
                <span className="font-mono">
                  {formatDuration(composerTime)}
                </span>
              </>
            }
            placeholder="What stood out at this moment?"
            submitLabel="Add note"
            onSubmit={handleCreate}
            onCancel={() => setComposerOpen(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={openComposer}
          className="rounded-md border border-dashed border-neutral-300 px-3 py-2 text-left text-sm text-neutral-600 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-blue-500 dark:hover:bg-blue-950 dark:hover:text-blue-300"
        >
          + Add note at current time
        </button>
      )}

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      {notes === null && !error && (
        <p className="text-sm text-neutral-500">Loading notes…</p>
      )}

      {notes && notes.length === 0 && (
        <p className="text-sm text-neutral-500">
          No notes yet. Add the first one.
        </p>
      )}

      {notes && notes.length > 0 && (
        <ul className="flex flex-col gap-3">
          {notes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              fileId={fileId}
              folderId={folderId}
              onMutated={fetchNotes}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function countAll(notes: ThreadedNote[]): number {
  let n = 0;
  for (const note of notes) {
    n += 1 + note.replies.length;
  }
  return n;
}

const MAX_LOG_ENTRIES_DISPLAYED = 20;

/**
 * Compact "last touched by X, Nm ago" line with an expand-to-log
 * toggle. Renders nothing if the conversation has no activity yet
 * (legacy conversations from before activity-tracking shipped).
 */
function ActivityHeader({
  activity,
  currentUserSub,
  open,
  onToggle,
}: {
  activity: ConversationActivity;
  currentUserSub: string;
  open: boolean;
  onToggle: () => void;
}) {
  const last = activity.lastActivity;
  const entries = (activity.log ?? []).slice(0, MAX_LOG_ENTRIES_DISPLAYED);

  return (
    <div className="rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate">
          Last activity by{' '}
          <span className="font-medium text-neutral-800 dark:text-neutral-200">
            {actorLabel(last.by, currentUserSub)}
          </span>{' '}
          · {formatRelativeTime(last.at)}
        </span>
        {entries.length > 1 && (
          <button
            type="button"
            onClick={onToggle}
            className="shrink-0 text-[11px] text-blue-600 hover:underline dark:text-blue-400"
          >
            {open ? 'hide log' : `show log (${entries.length})`}
          </button>
        )}
      </div>

      {open && entries.length > 1 && (
        <ul className="mt-2 space-y-1 border-t border-neutral-200 pt-2 dark:border-neutral-800">
          {entries.map((entry, i) => (
            <li
              key={`${entry.at}-${i}`}
              className="flex items-baseline justify-between gap-2"
            >
              <span className="truncate">
                <span className="font-medium text-neutral-800 dark:text-neutral-200">
                  {actorLabel(entry.by, currentUserSub)}
                </span>{' '}
                {describeKind(entry.kind)}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-neutral-500">
                {formatRelativeTime(entry.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function actorLabel(
  by: { sub: string; name?: string | null; email?: string | null },
  currentUserSub: string,
): string {
  if (by.sub === currentUserSub) return 'you';
  if (by.name) return by.name;
  if (by.email) return by.email;
  return 'someone';
}

function describeKind(kind: ActivityKind): string {
  switch (kind) {
    case 'note-created':
      return 'added a note';
    case 'note-updated':
      return 'edited a note';
    case 'note-deleted':
      return 'deleted a note';
    case 'reply-created':
      return 'replied';
    case 'closed':
      return 'closed the conversation';
    case 'reopened':
      return 'reopened the conversation';
    case 'resolved':
      return 'resolved a thread';
    case 'unresolved':
      return 'reopened a thread';
    default:
      // Exhaustiveness check — TypeScript will error here if a new
      // ActivityKind is added without updating this switch.
      return kind satisfies never;
  }
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}
