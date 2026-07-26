'use client';

import { useEffect, useState } from 'react';
import { useToast } from './ToastProvider';

export type PushStatus =
  | 'checking'
  | 'unsupported'
  | 'denied'
  | 'off'
  | 'on'
  | 'working';

/** Convert a base64url VAPID key to the Uint8Array subscribe() expects. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) &&
    !/CriOS|FxiOS/.test(navigator.userAgent)
  );
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * Web Push state + controls for the current device. Shared by the Settings
 * toggle and the Home nudge so they always reflect the same subscription.
 * Push is per-device (a browser subscription), so `status` is about *this*
 * device only. `enable`/`disable` toast their own feedback.
 */
export function usePush(): {
  status: PushStatus;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
} {
  const showToast = useToast();
  const [status, setStatus] = useState<PushStatus>('checking');
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported =
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window &&
        vapidKey.length > 0;
      if (!supported) {
        if (!cancelled) setStatus('unsupported');
        return;
      }
      if (Notification.permission === 'denied') {
        if (!cancelled) setStatus('denied');
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        // No service worker (e.g. dev, where it's disabled).
        if (!cancelled) setStatus('unsupported');
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      if (!cancelled) setStatus(sub ? 'on' : 'off');
    })().catch(() => {
      if (!cancelled) setStatus('unsupported');
    });
    return () => {
      cancelled = true;
    };
  }, [vapidKey]);

  const enable = async () => {
    setStatus('working');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'off');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error('Could not register this device.');
      setStatus('on');
      showToast('Notifications enabled on this device.', 'success');
    } catch (e) {
      setStatus('off');
      showToast(e instanceof Error ? e.message : String(e));
    }
  };

  const disable = async () => {
    setStatus('working');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setStatus('off');
      showToast('Notifications turned off on this device.', 'success');
    } catch (e) {
      setStatus('on');
      showToast(e instanceof Error ? e.message : String(e));
    }
  };

  return { status, enable, disable };
}
