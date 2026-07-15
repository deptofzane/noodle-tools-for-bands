'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useTrackPending } from '../../PendingActionProvider';
import { useToast } from '../../ToastProvider';
import { formatRelativeTime } from '@/lib/format';

interface Message {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string | null; email: string | null };
}

const POLL_INTERVAL_MS = 30_000;

/**
 * Band-wide chat. Loads the latest page, streams new activity over SSE
 * (Postgres LISTEN/NOTIFY) with a periodic poll backstop, and lets members
 * post / delete messages. Deleting is offered for your own messages, plus
 * any message when you can moderate (band owner) — the API enforces it.
 */
export function BandChat({
  bandId,
  currentUserId,
  canModerate,
}: {
  bandId: string;
  currentUserId: string;
  canModerate: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const trackPending = useTrackPending();
  const showToast = useToast();

  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // Whether the view is pinned to the bottom — controls autoscroll so we
  // don't yank a user who has scrolled up to read history.
  const atBottomRef = useRef(true);

  const base = `/api/bands/${bandId}/messages`;

  // Refetch the latest page and merge: keep any older history already
  // loaded, refresh the latest window (picking up new messages and dropping
  // ones deleted within it).
  const fetchLatest = useCallback(async () => {
    const res = await fetch(base, { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as { messages: Message[]; hasMore: boolean };
    setMessages((prev) => {
      const earliest = data.messages[0]?.createdAt;
      const kept = earliest ? prev.filter((m) => m.createdAt < earliest) : prev;
      return [...kept, ...data.messages];
    });
    setLoaded((wasLoaded) => {
      // hasMore is only authoritative for the very first load; later merges
      // keep whatever pagination state older-loads established.
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
        const data = (await res.json()) as { messages: Message[]; hasMore: boolean };
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

  // Track whether we're pinned to the bottom before each render commits.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  // Autoscroll to the newest message when pinned to the bottom.
  useEffect(() => {
    if (atBottomRef.current) {
      endRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [messages]);

  // Real-time via SSE, with backoff reconnect; the poll below is a backstop.
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
        es = new EventSource(`${base}/events`);
      } catch {
        scheduleReconnect();
        return;
      }
      es.addEventListener('open', () => {
        backoffMs = 1000;
      });
      es.addEventListener('change', () => {
        void fetchLatest();
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
  }, [base, fetchLatest]);

  // Backstop poll — catches anything SSE missed on a transient disconnect.
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void fetchLatest();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchLatest]);

  const send = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await trackPending(async () => {
        const res = await fetch(base, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: text }),
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          throw new Error(b.message ?? `HTTP ${res.status}`);
        }
        setBody('');
        atBottomRef.current = true; // sending jumps you to your message
        await fetchLatest();
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const remove = async (id: string) => {
    try {
      await trackPending(async () => {
        const res = await fetch(`${base}/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          throw new Error(b.message ?? `HTTP ${res.status}`);
        }
        setMessages((prev) => prev.filter((m) => m.id !== id));
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex max-h-[60vh] min-h-[16rem] flex-col gap-3 overflow-y-auto rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
      >
        {hasMore && (
          <button
            type="button"
            onClick={loadOlder}
            disabled={loadingOlder}
            className="mx-auto rounded-md border border-neutral-300 px-3 py-1 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            {loadingOlder ? 'Loading…' : 'Load older messages'}
          </button>
        )}

        {loaded && messages.length === 0 && (
          <p className="my-auto text-center text-sm text-neutral-500">
            No messages yet. Say hello 👋
          </p>
        )}

        {messages.map((m) => {
          const mine = m.author.id === currentUserId;
          return (
            <div key={m.id} className="group flex flex-col gap-0.5">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-medium">
                  {m.author.name ?? m.author.email ?? 'Unknown'}
                  {mine && (
                    <span className="text-neutral-400"> (you)</span>
                  )}
                </span>
                <span className="text-[11px] text-neutral-400">
                  {formatRelativeTime(m.createdAt)}
                </span>
                {(mine || canModerate) && (
                  <button
                    type="button"
                    onClick={() => remove(m.id)}
                    className="ml-auto text-[11px] text-neutral-400 opacity-0 transition hover:text-red-600 group-hover:opacity-100 focus:opacity-100 dark:hover:text-red-400"
                    aria-label="Delete message"
                  >
                    Delete
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words text-sm">
                {m.body}
              </p>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="Message your band…  (Enter to send, Shift+Enter for a new line)"
          maxLength={4000}
          className="flex-1 resize-none rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !body.trim()}
          className="shrink-0 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </section>
  );
}
