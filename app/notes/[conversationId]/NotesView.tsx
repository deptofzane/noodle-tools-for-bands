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
 * timestamp is clicked and `getCurrentTime()` when the composer opens.
 *
 * `fileId` is the Drive audio file id (for streaming); `conversationId`
 * is the Postgres conversation the notes belong to.
 */
export function NotesView({
  conversationId,
  fileId,
  fileName,
  mimeType,
  currentUserId,
  initialThreadId = null,
}: {
  conversationId: string;
  fileId: string;
  fileName: string;
  mimeType: string;
  currentUserId: string;
  initialThreadId?: string | null;
}) {
  const engineRef = useRef<AudioEngine | null>(null);

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
        <NotesPanel
          conversationId={conversationId}
          currentUserId={currentUserId}
          initialThreadId={initialThreadId}
        />
      </div>
    </PlayerProvider>
  );
}
