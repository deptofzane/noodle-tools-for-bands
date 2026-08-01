'use client';

import { ensureOk } from '@/lib/api';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ConfirmModal } from '../../ConfirmModal';
import {
  NoteForm,
  type Mentionable,
} from '../../notes/[conversationId]/NoteForm';
import { useTrackPending } from '../../PendingActionProvider';
import { useToast } from '../../ToastProvider';
import { formatRelativeTime } from '@/lib/format';
import { Spinner } from '../../Spinner';

interface Message {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  author: { id: string; name: string | null; email: string | null };
  mentions: string[];
}

const POLL_INTERVAL_MS = 30_000;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Highlight `@Name` tokens for known band members within a message body. */
function renderBody(text: string, memberLabels: string[]): ReactNode {
  const labels = memberLabels
    .filter(Boolean)
    .map(escapeRegExp)
    .sort((a, b) => b.length - a.length);
  if (labels.length === 0) return text;
  const re = new RegExp(`@(?:${labels.join('|')})`, 'g');
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <span
        key={key++}
        className="rounded bg-blue-100 px-0.5 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300"
      >
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * Band-wide chat. Loads the latest page, refetches whenever `changeSignal`
 * bumps (the parent owns the shared SSE stream) with a periodic poll
 * backstop, and lets members post / edit / delete with @-mentions.
 * Delete is offered for your own messages, plus any when you can moderate
 * (band owner); the API enforces it either way.
 */
export function BandChat({
  bandId,
  currentUserId,
  canModerate,
  mentionables,
  changeSignal,
}: {
  bandId: string;
  currentUserId: string;
  canModerate: boolean;
  mentionables: Mentionable[];
  changeSignal: number;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState(false);
  const trackPending = useTrackPending();
  const showToast = useToast();

  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // Whether the view is pinned to the bottom — controls autoscroll so we
  // don't yank a user who has scrolled up to read history.
  const atBottomRef = useRef(true);

  const base = `/api/bands/${bandId}/messages`;
  const memberLabels = mentionables.map((m) => m.name ?? m.email ?? '');

  // Refetch the latest page and merge: keep any older history already
  // loaded, refresh the latest window (new messages + edits, and drop ones
  // deleted within it).
  const fetchLatest = useCallback(async () => {
    const res = await fetch(base, { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as {
      messages: Message[];
      hasMore: boolean;
    };
    setMessages((prev) => {
      const earliest = data.messages[0]?.createdAt;
      const kept = earliest ? prev.filter((m) => m.createdAt < earliest) : prev;
      return [...kept, ...data.messages];
    });
    setLoaded((wasLoaded) => {
      if (!wasLoaded) setHasMore(data.hasMore);
      return true;
    });
  }, [base]);

  const loadOlder = async () => {
    if (loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(
        `${base}?before=${encodeURIComponent(messages[0]!.createdAt)}`,
        { cache: 'no-store' },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          messages: Message[];
          hasMore: boolean;
        };
        setMessages((prev) => [...data.messages, ...prev]);
        setHasMore(data.hasMore);
      }
    } finally {
      setLoadingOlder(false);
    }
  };

  // Initial load.
  useEffect(() => {
    void trackPending(() => fetchLatest());
  }, [fetchLatest, trackPending]);

  // Refetch when the parent signals band-chat activity (SSE) — skip the
  // very first render (changeSignal 0), which the initial load covers.
  const firstSignal = useRef(true);
  useEffect(() => {
    if (firstSignal.current) {
      firstSignal.current = false;
      return;
    }
    void fetchLatest();
  }, [changeSignal, fetchLatest]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  // Autoscroll to the newest message when pinned to the bottom.
  useEffect(() => {
    if (atBottomRef.current) endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  // Backstop poll — catches anything the SSE feed missed.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void fetchLatest();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchLatest]);

  const send = async (body: string, mentions: string[]) => {
    await trackPending(async () => {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, mentions }),
      });
      await ensureOk(res);
      atBottomRef.current = true; // sending jumps you to your message
      await fetchLatest();
    });
  };

  const saveEdit = async (id: string, body: string, mentions: string[]) => {
    await trackPending(async () => {
      const res = await fetch(`${base}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, mentions }),
      });
      await ensureOk(res);
      const data = (await res.json()) as { message: Message };
      setMessages((prev) => prev.map((m) => (m.id === id ? data.message : m)));
      setEditingId(null);
    });
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    const id = deleteTarget.id;
    setDeleting(true);
    try {
      await trackPending(async () => {
        const res = await fetch(`${base}/${id}`, { method: 'DELETE' });
        await ensureOk(res);
        setMessages((prev) => prev.filter((m) => m.id !== id));
      });
      setDeleteTarget(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex h-[50vh] md:h-[60vh] md:h-[50vh] flex-col gap-3 overflow-y-auto rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
      >
        {hasMore && (
          <button
            type="button"
            onClick={loadOlder}
            disabled={loadingOlder}
            // Fixed min-width so swapping the label for the spinner doesn't
            // make the button jump.
            className="mx-auto flex min-w-[10rem] items-center justify-center rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            {loadingOlder ? (
              <Spinner size="xs" label="Loading older messages" />
            ) : (
              'Load older messages'
            )}
          </button>
        )}

        {loaded && messages.length === 0 && (
          <p className="my-auto text-center text-sm text-neutral-500">
            No messages yet. Say hello 👋
          </p>
        )}

        {messages.map((m) => {
          const mine = m.author.id === currentUserId;
          const mentionsMe = m.mentions.includes(currentUserId);
          if (editingId === m.id) {
            return (
              <div
                key={m.id}
                className="rounded-md bg-neutral-50 p-2 dark:bg-neutral-900"
              >
                <NoteForm
                  initialBody={m.body}
                  mentionables={mentionables}
                  submitLabel="Save"
                  placeholder="Edit your message…"
                  onSubmit={(body, mentions) => saveEdit(m.id, body, mentions)}
                  onCancel={() => setEditingId(null)}
                />
              </div>
            );
          }
          return (
            <div
              key={m.id}
              className={
                'group flex flex-col gap-0.5 rounded-md px-2 py-1 ' +
                (mentionsMe
                  ? 'border-l-2 border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                  : '')
              }
            >
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-medium">
                  {m.author.name ?? m.author.email ?? 'Unknown'}
                  {mine && <span className="text-neutral-400"> (you)</span>}
                </span>
                <span className="text-[0.6875rem] text-neutral-400">
                  {formatRelativeTime(m.createdAt)}
                  {m.editedAt && <span title="Edited"> · edited</span>}
                </span>
                <span className="ml-auto flex gap-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  {mine && (
                    <button
                      type="button"
                      onClick={() => setEditingId(m.id)}
                      className="text-[0.6875rem] text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                    >
                      Edit
                    </button>
                  )}
                  {(mine || canModerate) && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(m)}
                      className="text-[0.6875rem] text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                      aria-label="Delete message"
                    >
                      Delete
                    </button>
                  )}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm">
                {renderBody(m.body, memberLabels)}
              </p>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <NoteForm
        mentionables={mentionables}
        submitLabel="Send"
        placeholder="Message your band…  (@ to mention, ⌘/Ctrl+Enter to send)"
        autoFocus={false}
        onSubmit={send}
      />

      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete comment?"
        description="Are you sure you want to delete this comment? This can’t be undone."
        confirmLabel="Delete"
        busyLabel="Deleting…"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
