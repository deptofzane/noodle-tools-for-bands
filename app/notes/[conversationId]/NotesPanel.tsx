'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDuration } from '@/lib/audio';
import type { ThreadedNote } from '@/lib/db/notes';
import type { ActivityKind, ConversationActivity } from '@/lib/db/activity';
import { useTrackPending } from '../../PendingActionProvider';
import { usePlayer } from './PlayerContext';
import { NoteForm, type Mentionable } from './NoteForm';
import { NoteItem } from './NoteItem';

/**
 * The notes side panel (Postgres conversations).
 *
 * Data flow:
 *   1. On mount, fetch the conversation (notes + closed + activity +
 *      members) from /api/conversations/[id], and mark it read so the
 *      Open Conversations badges clear.
 *   2. A periodic poll (DB-backed; no Drive Changes SSE anymore) keeps
 *      collaborator changes flowing in.
 *
 * Mentions target band members, by user id.
 */

const POLL_INTERVAL_MS = 30_000;

interface ConversationMember {
  userId: string;
  name: string | null;
  email: string | null;
}

export function NotesPanel({
  conversationId,
  currentUserId,
  initialThreadId = null,
}: {
  conversationId: string;
  currentUserId: string;
  initialThreadId?: string | null;
}) {
  const [notes, setNotes] = useState<ThreadedNote[] | null>(null);
  const [closed, setClosed] = useState(false);
  const [activity, setActivity] = useState<ConversationActivity | null>(null);
  const [members, setMembers] = useState<ConversationMember[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [stateBusy, setStateBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerTime, setComposerTime] = useState(0);
  const inFlight = useRef(false);
  const player = usePlayer();
  const trackPending = useTrackPending();

  // Mention roster = band members (minus yourself), by user id.
  const participants = useMemo<Mentionable[]>(
    () =>
      members
        .filter((m) => m.userId !== currentUserId)
        .map((m) => ({ id: m.userId, name: m.name, email: m.email })),
    [members, currentUserId],
  );
  const mentionLabels = useMemo(
    () => participants.map((p) => p.name ?? p.email ?? 'user'),
    [participants],
  );

  const fetchNotes = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        notes: ThreadedNote[];
        closed?: boolean;
        activity?: ConversationActivity | null;
        members?: ConversationMember[];
      };
      setNotes(reorderNotes(data.notes));
      setClosed(data.closed ?? false);
      setActivity(data.activity ?? null);
      setMembers(data.members ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inFlight.current = false;
    }
  }, [conversationId]);

  // Move resolved threads to the end regardless of timestamp.
  const reorderNotes = (list: ThreadedNote[]): ThreadedNote[] => {
    const resolved: ThreadedNote[] = [];
    const unresolved: ThreadedNote[] = [];
    for (const note of list) {
      if (note.resolved) resolved.push(note);
      else unresolved.push(note);
    }
    return [...unresolved, ...resolved];
  };

  const markRead = useCallback(async () => {
    try {
      await fetch(`/api/conversations/${conversationId}/read`, {
        method: 'POST',
      });
    } catch {
      // best-effort; badges will just clear on the next visit
    }
  }, [conversationId]);

  const setConversationClosed = useCallback(
    async (next: boolean) => {
      setStateBusy(true);
      try {
        await trackPending(async () => {
          const res = await fetch(`/api/conversations/${conversationId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ closed: next }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.message ?? `HTTP ${res.status}`);
          }
        });
        setClosed(next);
        await fetchNotes();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setStateBusy(false);
      }
    },
    [conversationId, fetchNotes, trackPending],
  );

  // Initial load + mark read.
  useEffect(() => {
    void (async () => {
      await trackPending(() => fetchNotes());
      void markRead();
    })();
  }, [fetchNotes, markRead, trackPending]);

  // Real-time updates via SSE (Postgres LISTEN/NOTIFY). On each change
  // event, refetch. Reconnects with backoff; the poll below is a backstop.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return;
    }
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let backoffMs = 1000;
    const MAX_BACKOFF_MS = 30_000;

    const connect = () => {
      if (cancelled) return;
      try {
        es = new EventSource(`/api/conversations/${conversationId}/events`);
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
  }, [conversationId, fetchNotes]);

  // Backstop polling — catches anything the SSE feed missed (transient
  // disconnects). Quiet, since SSE does the real-time work.
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

  const handleCreate = async (body: string, mentions: string[]) => {
    await trackPending(async () => {
      const res = await fetch(`/api/conversations/${conversationId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestampMs: Math.floor(composerTime * 1000),
          body,
          mentions,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }
    });
    setComposerOpen(false);
    await fetchNotes();
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
        </div>
      </header>

      {activity && (
        <ActivityHeader
          activity={activity}
          currentUserId={currentUserId}
          open={logOpen}
          onToggle={() => setLogOpen((v) => !v)}
        />
      )}

      {closed && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          This conversation is closed and lives in History.
        </div>
      )}

      {composerOpen ? (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <NoteForm
            header={
              <>
                Adding note at{' '}
                <span className="font-mono">{formatDuration(composerTime)}</span>
              </>
            }
            placeholder="What stood out at this moment? Use @ to tag someone."
            submitLabel="Add note"
            onSubmit={handleCreate}
            onCancel={() => setComposerOpen(false)}
            mentionables={participants}
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
        <p className="text-sm text-neutral-500">No notes yet. Add the first one.</p>
      )}

      {notes && notes.length > 0 && (
        <ul className="flex flex-col gap-3">
          {notes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              conversationId={conversationId}
              onMutated={fetchNotes}
              highlighted={note.id === initialThreadId}
              mentionables={participants}
              mentionLabels={mentionLabels}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function countAll(notes: ThreadedNote[]): number {
  let n = 0;
  for (const note of notes) n += 1 + note.replies.length;
  return n;
}

const MAX_LOG_ENTRIES_DISPLAYED = 20;

function ActivityHeader({
  activity,
  currentUserId,
  open,
  onToggle,
}: {
  activity: ConversationActivity;
  currentUserId: string;
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
            {actorLabel(last.by, currentUserId)}
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
                  {actorLabel(entry.by, currentUserId)}
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
  by: { id: string; name?: string | null; email?: string | null },
  currentUserId: string,
): string {
  if (by.id === currentUserId) return 'you';
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
