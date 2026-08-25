import type { TodoStatus } from '@/lib/db/todos';

/**
 * Which calendar colour a todo borrows.
 *
 * The palette lives in globals.css keyed by `data-event-type`, as an
 * accent/fill pair per event type. Todos have no event type, so they borrow
 * the pairs whose hues already mean the right thing here. Borrowing rather
 * than declaring todo-specific rules keeps one copy of each colour: retuning
 * the calendar retunes this with it.
 *
 *   complete         → the writing green
 *   active + shared  → the practice blue
 *   active + private → the studio purple
 *   cancelled        → no key, landing on the neutral grey that bare
 *                      `[data-event-type]` sets as its base
 *
 * Cancelled returns the empty string rather than a word like 'cancelled'
 * precisely *because* nothing matches it: a real word would start rendering
 * some other colour the day an event type is added by that name.
 */
export function todoTone(status: TodoStatus, shared: boolean): string {
  if (status === 'complete') return 'writing';
  if (status === 'cancelled') return '';
  return shared ? 'practice' : 'studio';
}
