'use client';

import { useMemo, useRef } from 'react';
import type { AudioEngine } from '@/lib/audio';
import { AudioPlayer } from './AudioPlayer';
import { NotesPanel } from './NotesPanel';
import { PlayerProvider, type PlayerControls } from './PlayerContext';

/**
 * Top-level client wrapper for the notes page.
 *
 * Owns a ref to the AudioPlayer's engine and exposes it to descendants
 * via `PlayerProvider`. The notes panel calls `seek()` when a note's
 * timestamp is clicked, and `getCurrentTime()` when the user opens the
 * composer.
 *
 * If `folderId` is missing (someone hit /notes/[fileId] directly), we
 * render the player but not the notes panel, since the data layer
 * needs the parent folder to locate the `<basename>.notes/` subfolder.
 */
export function NotesView({
  fileId,
  fileName,
  mimeType,
  folderId,
  currentUserSub,
}: {
  fileId: string;
  fileName: string;
  mimeType: string;
  folderId: string | null;
  currentUserSub: string;
}) {
  const engineRef = useRef<AudioEngine | null>(null);

  // PlayerControls captures the engine through a closure over `engineRef`.
  // Stable identity (empty deps) — fine because methods read the ref's
  // current value each call.
  const controls = useMemo<PlayerControls>(
    () => ({
      seek: (seconds) => engineRef.current?.seek(seconds),
      getCurrentTime: () => engineRef.current?.getCurrentTime() ?? 0,
    }),
    [],
  );

  return (
    <PlayerProvider value={controls}>
      <div className="flex flex-col gap-6">
        <AudioPlayer
          fileId={fileId}
          fileName={fileName}
          mimeType={mimeType}
          externalEngineRef={engineRef}
        />

        {folderId ? (
          <NotesPanel
            fileId={fileId}
            folderId={folderId}
            currentUserSub={currentUserSub}
          />
        ) : (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            Notes are unavailable without a folder context. Open this file
            from the{' '}
            <a href="/library" className="underline">
              Library
            </a>{' '}
            to pick the folder it lives in.
          </div>
        )}
      </div>
    </PlayerProvider>
  );
}
