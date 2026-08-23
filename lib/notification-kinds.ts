import type { NotificationKind } from './db/notifications';

/**
 * Kinds that belong in the feed but never on a phone.
 *
 * Lives here rather than beside `notify()` because both sides need it: the
 * server to skip the push fan-out, and the Settings screen to disable a Push
 * switch that would otherwise write a preference nothing reads. Pure — the
 * only import is a type, which is erased, so a client component can import
 * this without pulling the database module into the bundle.
 */
export const FEED_ONLY_KINDS: ReadonlySet<NotificationKind> = new Set([
  'note-pinned',
  'note-unpinned',
  /*
   * Todo status goes to the whole band, so pushing it would mean a buzz per
   * member per tick — the loudest thing in the app by some way. Assignment
   * and takeover are addressed to one person and do push.
   */
  'todo-completed',
  'todo-cancelled',
]);

export function isFeedOnly(kind: NotificationKind): boolean {
  return FEED_ONLY_KINDS.has(kind);
}
