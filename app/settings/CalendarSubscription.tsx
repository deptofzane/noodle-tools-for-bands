'use client';

import { useEffect, useState } from 'react';

/**
 * Calendar subscription card. Shows the user's private iCalendar feed URL
 * (a bearer-token capability) with copy + subscribe instructions, and a
 * two-step Reset that regenerates the token to revoke the old URL.
 */
export function CalendarSubscription({ token }: { token: string }) {
  const [current, setCurrent] = useState(token);
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const url = `${origin}/api/calendar/${current}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Couldn’t copy — select the URL and copy it manually.');
    }
  };

  const reset = async () => {
    if (resetting) return;
    setResetting(true);
    setError(null);
    try {
      const res = await fetch('/api/calendar/feed/reset', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { token: string };
      setCurrent(data.token);
      setConfirmingReset(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div>
        <p className="font-medium">Calendar subscription</p>
        <p className="mt-1 text-xs minor-text-theme-colors dark:text-neutral-400">
          Subscribe to your Noodle events in Google Calendar, Apple Calendar, or
          Outlook. The feed is read-only and updates on your calendar app’s own
          schedule (Google can take a few hours). Keep this URL private — anyone
          with it can see your events.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Calendar feed URL"
          className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-neutral-50 px-3 py-2 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button type="button" onClick={copy} className="btn-outline shrink-0">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <details className="text-xs minor-text-theme-colors dark:text-neutral-400">
        <summary className="cursor-pointer">How to subscribe</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <span className="font-medium">Google Calendar:</span> Other
            calendars → <em>+</em> → From URL → paste → Add calendar.
          </li>
          <li>
            <span className="font-medium">Apple Calendar:</span> File → New
            Calendar Subscription → paste the URL.
          </li>
          <li>
            <span className="font-medium">Outlook:</span> Add calendar →
            Subscribe from web → paste the URL.
          </li>
        </ul>
      </details>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex items-center gap-2">
        {confirmingReset ? (
          <>
            <span className="text-xs minor-text-theme-colors dark:text-neutral-400">
              This invalidates the current link. Continue?
            </span>
            <button
              type="button"
              onClick={reset}
              disabled={resetting}
              className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
            >
              {resetting ? 'Resetting…' : 'Reset link'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingReset(false)}
              disabled={resetting}
              className="text-xs minor-text-theme-colors hover:underline"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingReset(true)}
            className="text-xs minor-text-theme-colors hover:underline"
          >
            Reset link
          </button>
        )}
      </div>
    </div>
  );
}
