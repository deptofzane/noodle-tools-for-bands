'use client';

import { formatDateLong } from '@/lib/format';
import type { Conversation } from '../bandDetailShared';

/**
 * Upload-day helpers shared by the Uploads tab and the per-day tracks page.
 *
 * Days are the viewer's *local* calendar days: a song added at 10pm belongs to
 * that evening, not to the next UTC date. The day key doubles as the URL
 * segment for the tracks page, so both sides must derive it the same way.
 */

/** Local calendar day ("2026-07-30") for an ISO timestamp. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "Today" / "Yesterday" for the two most recent days, else the full date. */
export function dayLabel(key: string): string {
  const today = dayKey(new Date().toISOString());
  if (key === today) return 'Today';
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  if (key === yesterday) return 'Yesterday';
  return formatDateLong(key);
}

/** "2:31 PM" — the clock time a song was added. */
export function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Songs added on `key`, in the order they were added. */
export function songsForDay(
  conversations: Conversation[],
  key: string,
): Conversation[] {
  return conversations
    .filter((c) => dayKey(c.createdAt) === key)
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
}

/**
 * Songs bucketed by the day they were added — newest day first, and within a
 * day in the order they were added.
 */
export function groupByDay(
  conversations: Conversation[],
): [string, Conversation[]][] {
  const keys = [...new Set(conversations.map((c) => dayKey(c.createdAt)))].sort(
    (a, b) => b.localeCompare(a),
  );
  return keys.map((key) => [key, songsForDay(conversations, key)]);
}
