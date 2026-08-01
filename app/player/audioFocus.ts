'use client';

/**
 * One-playback-at-a-time coordination.
 *
 * The app has two independent players — the per-song `AudioPlayer` on the
 * notes/practice screens and the global playlist `MiniPlayer` — each owning
 * its own audio engine. Neither can see the other's state, so without this
 * they happily play over each other (start a playlist, open a song, hit play,
 * hear both).
 *
 * Whoever starts playing claims focus by name; everyone else pauses. Plain
 * window events, so no shared provider is needed and either player can be
 * mounted (or not) independently.
 */

const FOCUS_EVENT = 'sidestage:audio-focus';

/** Announce that `owner` just started playing; other players should pause. */
export function claimAudioFocus(owner: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(FOCUS_EVENT, { detail: owner }));
}

/**
 * Run `onLost` whenever a *different* owner claims playback. Returns an
 * unsubscribe function for effect cleanup.
 */
export function subscribeAudioFocus(owner: string, onLost: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const claimant = (e as CustomEvent<string>).detail;
    if (claimant !== owner) onLost();
  };
  window.addEventListener(FOCUS_EVENT, handler);
  return () => window.removeEventListener(FOCUS_EVENT, handler);
}
