'use client';

import { useEffect, useRef } from 'react';

/**
 * Subscribe to a Server-Sent Events endpoint with automatic reconnect
 * (exponential backoff, reset to 1s on open). `handlers` maps event names to
 * callbacks and is read through a ref, so passing a fresh object each render
 * doesn't tear down the connection — only a changed `url` does.
 *
 * No-ops during SSR or where EventSource is unavailable.
 */
export function useEventSource(
  url: string,
  handlers: Record<string, (e: MessageEvent) => void>,
  { maxBackoffMs = 30_000 }: { maxBackoffMs?: number } = {},
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return;
    }
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let backoffMs = 1000;
    const events = Object.keys(handlersRef.current);

    const connect = () => {
      if (cancelled) return;
      try {
        es = new EventSource(url);
      } catch {
        scheduleReconnect();
        return;
      }
      es.addEventListener('open', () => {
        backoffMs = 1000;
      });
      for (const name of events) {
        es.addEventListener(name, (e: Event) =>
          handlersRef.current[name]?.(e as MessageEvent),
        );
      }
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
        backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
      }, backoffMs);
    };

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [url, maxBackoffMs]);
}
