'use client';

import { useCallback } from 'react';
import {
  AudioPlayerView,
  useTransportKeys,
} from '../notes/[conversationId]/AudioPlayer';
import { usePlaylistPlayer } from './PlaylistPlayer';

/**
 * The song player's controls wired to the global queue instead of an engine of
 * their own. Looks and behaves like the player on a song page — play/pause,
 * seek, start over, ±10s, speed — but every control drives the track the queue
 * is already playing, so a view showing this bar shares one playback position
 * (and one audio element) with the mini player.
 *
 * With nothing queued (the player was dismissed) it renders as a play button
 * for `idleTitle` and hands the press to `onIdlePlay`, letting a page that
 * remembers its own songs put the queue back together.
 */
export function QueuePlayerBar({
  sticky = false,
  idleTitle,
  onIdlePlay,
}: {
  sticky?: boolean;
  /** Track name to show when the queue is empty. Omit to render nothing. */
  idleTitle?: string;
  /** Queue something up and start it. Required for the idle play button. */
  onIdlePlay?: () => void;
}) {
  const {
    track,
    isPlaying,
    isReady,
    currentTime,
    duration,
    error,
    toggle,
    seek,
    rate,
    setRate,
  } = usePlaylistPlayer();

  const back10 = useCallback(
    () => seek(Math.max(0, currentTime - 10)),
    [seek, currentTime],
  );
  const forward10 = useCallback(() => {
    const max = duration || currentTime + 10;
    seek(Math.min(max, currentTime + 10));
  }, [seek, currentTime, duration]);
  const startOver = useCallback(() => seek(0), [seek]);

  // Space plays whatever the bar is showing — the queued track, or the idle
  // one, which has to be queued up first.
  const togglePlay = useCallback(() => {
    if (track) toggle();
    else onIdlePlay?.();
  }, [track, toggle, onIdlePlay]);

  useTransportKeys({ togglePlay, forward10, back10 });

  if (!track) {
    if (!idleTitle || !onIdlePlay) return null;
    // Ready, not loading: there's no audio behind this yet, and the point of
    // the button is to change that.
    return (
      <AudioPlayerView
        fileName={idleTitle}
        currentTime={0}
        duration={0}
        isPlaying={false}
        isReady
        error={null}
        sticky={sticky}
        onTogglePlay={onIdlePlay}
        onSeek={() => {}}
      />
    );
  }

  return (
    <AudioPlayerView
      fileName={track.title}
      currentTime={currentTime}
      duration={duration}
      isPlaying={isPlaying}
      isReady={isReady}
      error={error}
      sticky={sticky}
      onTogglePlay={togglePlay}
      onSeek={seek}
      practice={{
        rate,
        onRateChange: setRate,
        onStartOver: startOver,
        onBack10: back10,
        onForward10: forward10,
      }}
    />
  );
}
