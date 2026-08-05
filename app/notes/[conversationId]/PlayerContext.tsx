'use client';

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import type { AudioEngine } from '@/lib/audio';

/**
 * Player context.
 *
 * Owns the shared Howler engine ref and bridges the song-page components:
 * the AudioPlayer registers its engine via `setEngine`, and the NotesPanel
 * seeks the player on a note click / reads the current time when composing.
 *
 * Keeping the engine here (rather than in a parent that renders all the
 * children) lets the player, sheet music, and notes panel be rendered as
 * independent siblings.
 *
 * Intentionally imperative — `seek()` and `getCurrentTime()` go straight
 * to the engine via the ref. We don't expose reactive `isPlaying` /
 * `currentTime`; the notes UI doesn't need to re-render in step with
 * playback, only the player does.
 */
export interface PlayerControls {
  seek: (seconds: number) => void;
  getCurrentTime: () => number;
  /** AudioPlayer registers its engine here (and clears it on teardown). */
  setEngine: (engine: AudioEngine | null) => void;
}

const PlayerContext = createContext<PlayerControls | null>(null);

export function PlayerProvider({
  children,
  controls: external,
}: {
  children: ReactNode;
  /**
   * Drive the notes UI from an engine this provider doesn't own — the
   * full-screen player passes the playlist queue's transport, so a note can
   * still seek and stamp the right time there. Omitted, the provider owns its
   * engine as usual (`setEngine` from the song page's AudioPlayer).
   */
  controls?: PlayerControls;
}) {
  const engineRef = useRef<AudioEngine | null>(null);

  // Stable identity (empty deps) — the methods read the ref's current
  // value on each call.
  const controls = useMemo<PlayerControls>(
    () => ({
      seek: (seconds) => engineRef.current?.seek(seconds),
      getCurrentTime: () => engineRef.current?.getCurrentTime() ?? 0,
      setEngine: (engine) => {
        engineRef.current = engine;
      },
    }),
    [],
  );

  return (
    <PlayerContext.Provider value={external ?? controls}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerControls {
  const ctx = useContext(PlayerContext);
  if (!ctx) {
    throw new Error('usePlayer must be used inside <PlayerProvider>');
  }
  return ctx;
}
