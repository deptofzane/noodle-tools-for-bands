'use client';

import { isIosSafari, isStandalone, usePush } from '../usePush';

/**
 * Enable/disable Web Push on this device (Settings › Notifications). Push is
 * per-device, so this reflects and controls only the current one. On iOS it
 * requires the app be installed to the Home Screen, so we surface that hint
 * when the browser reports no support.
 */
export function PushNotificationToggle() {
  const { status, enable, disable } = usePush();

  const description = (() => {
    switch (status) {
      case 'denied':
        return 'Notifications are blocked for this site. Re-enable them in your browser or OS settings, then reload.';
      case 'unsupported':
        return isIosSafari() && !isStandalone()
          ? 'To get notifications on iPhone/iPad, install Sidestage to your Home Screen first (Share → Add to Home Screen), then open it from there.'
          : 'This device or browser doesn’t support push notifications.';
      case 'on':
        return 'You’ll get a push on this device for new activity in your bands (respecting your muted types below).';
      default:
        return 'Get a push on this device for new activity in your bands — even when the app is closed.';
    }
  })();

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="min-w-0">
        <p className="font-medium">Push notifications</p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          {description}
        </p>
      </div>
      {status === 'on' ? (
        <button
          type="button"
          onClick={() => void disable()}
          className="shrink-0 rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Turn off
        </button>
      ) : status === 'off' ? (
        <button
          type="button"
          onClick={() => void enable()}
          className="btn-primary shrink-0"
        >
          Enable
        </button>
      ) : status === 'working' ? (
        <span className="shrink-0 text-xs text-neutral-500">Working…</span>
      ) : status === 'checking' ? (
        <span className="shrink-0 text-xs text-neutral-400">…</span>
      ) : null}
    </div>
  );
}
