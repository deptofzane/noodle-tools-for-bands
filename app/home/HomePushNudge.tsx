'use client';

import { usePush } from '../usePush';
import { usePersistedBoolean } from '../usePersistedBoolean';

/**
 * A dismissable "turn on notifications" banner on Home. Only appears when the
 * viewer's device can actually enable push (supported + currently off) and
 * they haven't dismissed it. Enabling here runs the same flow as the Settings
 * toggle; once on (or if unsupported / blocked) it renders nothing.
 */
export function HomePushNudge() {
  const { status, enable } = usePush();
  const [dismissed, setDismissed] = usePersistedBoolean(
    'homePushNudgeDismissed',
    false,
  );

  if (dismissed) return null;
  if (status !== 'off' && status !== 'working') return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-950">
      <div className="min-w-0">
        <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
          Turn on notifications
        </p>
        <p className="mt-0.5 text-xs text-blue-800/80 dark:text-blue-300/80">
          Get a push on this device for new activity in your bands — even when
          the app is closed.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => void enable()}
          disabled={status === 'working'}
          className="btn-primary"
        >
          {status === 'working' ? 'Enabling…' : 'Enable'}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="rounded-md p-2 text-blue-700/70 hover:bg-blue-100 dark:text-blue-300/70 dark:hover:bg-blue-900"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
  );
}
