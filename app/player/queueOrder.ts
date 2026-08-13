/**
 * Which track the queue moves to next, and which it came from.
 *
 * Pure, and separate from the player so the shuffle rules can be exercised
 * directly — "a pass reaches every track exactly once, then stops" is the kind
 * of invariant that's miserable to confirm through a UI.
 *
 * A shuffle pass is described by the ids it has already reached rather than by
 * a precomputed order. The queue can be reordered or have entries pulled out
 * of it mid-pass, and stored positions would quietly come to mean different
 * tracks; ids either still match something or don't.
 */

/** The only part of a track these need. */
export interface OrderedTrack {
  id: string;
}

/**
 * `all` starts the list (or the shuffle pass) again once it's spent; `one`
 * replays the current track instead of moving on.
 *
 * `one` is handled by the player, not here: it only applies when a track ends
 * on its own. Pressing Next under `one` moves on, which is what every player
 * does — otherwise the control appears broken.
 */
export type RepeatMode = 'off' | 'all' | 'one';

/**
 * Where the queue goes after `from`, or null when there's nowhere left —
 * the end of the list in order, or a spent pass under shuffle.
 *
 * `random` is injectable so a test can pin the choice; production passes
 * nothing and gets `Math.random`.
 */
export function nextIndex(
  queue: readonly OrderedTrack[],
  from: number,
  playedIds: readonly string[],
  shuffle: boolean,
  random: () => number = Math.random,
): number | null {
  if (!shuffle) return from + 1 < queue.length ? from + 1 : null;

  const played = new Set(playedIds);
  const candidates: number[] = [];
  queue.forEach((t, p) => {
    if (p !== from && !played.has(t.id)) candidates.push(p);
  });
  if (candidates.length === 0) return null;
  return candidates[Math.floor(random() * candidates.length)]!;
}

/**
 * Step back through a shuffle pass: the most recent entry still present in the
 * queue, and the history with everything from that point on dropped.
 *
 * Returns null when the pass has nothing to go back to — including the case
 * where every remembered track has since been removed from the queue, which is
 * why this walks rather than reading only the last entry.
 */
export function previousIndex(
  queue: readonly OrderedTrack[],
  history: readonly string[],
): { target: number; history: string[] } | null {
  const remaining = [...history];
  while (remaining.length > 0) {
    const id = remaining.pop()!;
    const target = queue.findIndex((t) => t.id === id);
    if (target >= 0) return { target, history: remaining };
  }
  return null;
}

/**
 * Where the queue goes, taking `wrap` (repeat-all) into account.
 *
 * `resetPass` says the shuffle history should be cleared: the pass was spent
 * and this is the first track of a new one. Without it the fresh pass would
 * still count every track as played and stop again immediately.
 */
export function advance(
  queue: readonly OrderedTrack[],
  from: number,
  playedIds: readonly string[],
  shuffle: boolean,
  wrap: boolean,
  random: () => number = Math.random,
): { target: number; resetPass: boolean } | null {
  const direct = nextIndex(queue, from, playedIds, shuffle, random);
  if (direct !== null) return { target: direct, resetPass: false };
  if (!wrap || queue.length === 0) return null;
  if (!shuffle) return { target: 0, resetPass: false };
  // A new shuffle pass. Everything is a candidate again except where we are —
  // and if that's the only track, replaying it is the honest answer.
  const fresh = nextIndex(queue, from, [], true, random);
  return { target: fresh ?? from, resetPass: true };
}

/**
 * A shuffled copy of `items` (Fisher–Yates), leaving the original alone.
 *
 * For scrambling a queue *once*, before it's handed to the player, rather than
 * switching the player into shuffle mode. That distinction matters for a
 * setlist: its order is a deliberate decision, and a mode that stays on after
 * the fact could quietly reorder a set someone meant to play straight through.
 * A one-off queue is spent the moment it's built.
 *
 * `random` is injectable so a test can pin the permutation.
 */
export function shuffledCopy<T>(
  items: readonly T[],
  random: () => number = Math.random,
): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = out[i]!;
    out[i] = out[j]!;
    out[j] = swap;
  }
  return out;
}

/**
 * Whether there's anywhere to go. Separate because it must be safe to call
 * while rendering — `nextIndex` picks at random, so asking it would give a
 * different answer each time.
 */
export function hasNextIndex(
  queue: readonly OrderedTrack[],
  from: number,
  playedIds: readonly string[],
  shuffle: boolean,
  wrap = false,
): boolean {
  // Repeat-all always has somewhere to go, including back to the only track.
  if (wrap) return queue.length > 0;
  if (!shuffle) return from + 1 < queue.length;
  const played = new Set(playedIds);
  return queue.some((t, p) => p !== from && !played.has(t.id));
}
