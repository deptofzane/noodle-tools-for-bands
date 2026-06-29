'use client';

import { createContext, useContext } from 'react';

/**
 * Player context.
 *
 * Bridges the AudioPlayer (which owns the Howler instance) and the
 * NotesPanel (which needs to seek the player on note click, and read
 * the current time when composing a new note).
 *
 * Intentionally imperative — `seek()` and `getCurrentTime()` go
 * straight to the engine via a ref. We don't expose `isPlaying` or
 * `currentTime` as reactive values here because the notes UI doesn't
 * need to re-render in step with playback; only the player does.
 */
export interface PlayerControls {
  seek: (seconds: number) => void;
  getCurrentTime: () => number;
}

const PlayerContext = createContext<PlayerControls | null>(null);

export const PlayerProvider = PlayerContext.Provider;

export function usePlayer(): PlayerControls {
  const ctx = useContext(PlayerContext);
  if (!ctx) {
    throw new Error('usePlayer must be used inside <PlayerProvider>');
  }
  return ctx;
}
