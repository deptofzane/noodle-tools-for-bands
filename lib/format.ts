/**
 * Small presentation helpers shared across the listing/notes UIs. Pure and
 * client-safe — no server-only imports.
 */

/** Compact "time ago" label, falling back to a date past ~30 days. */
export function formatRelativeTime(iso: string): string {
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

/**
 * Human label for a user: their name, else email, else "someone". Pass
 * `currentUserId` to render the viewer's own actions as "you".
 */
export function actorLabel(
  by: { id?: string; name?: string | null; email?: string | null } | null | undefined,
  currentUserId?: string,
): string {
  if (!by) return 'someone';
  if (currentUserId && by.id === currentUserId) return 'you';
  if (by.name) return by.name;
  if (by.email) return by.email;
  return 'someone';
}

/** Format `seconds` as `m:ss` or `h:mm:ss`. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}
