'use client';

import { useCallback, useEffect, useState, type SetStateAction } from 'react';
import Link from 'next/link';
import { PageHeader } from '../../PageHeader';
import { Practice, type PracticeSong } from '../../Practice';
import { LoadingBlock } from '../../Spinner';
import { usePlaylistPlayer, type PlaylistTrack } from '../PlaylistPlayer';
import { QueuePlayerBar } from '../QueuePlayerBar';

/** Where back goes from here — the queue can be reached from anywhere. */
const BACK = { href: '/home', name: 'Home' };

/** The header for the states Practice isn't rendering (loading / nothing queued). */
function PracticeHeader() {
  return (
    <div className="px-4 py-0">
      <PageHeader defaultHref={BACK.href} defaultHrefName={BACK.name} />
    </div>
  );
}

/**
 * Practice whatever is in the player's queue: the same songs in the same
 * order, stepped one at a time with their sheet music. While a queue is live
 * its engine does the playing (via `QueuePlayerBar`), so this page, the mini
 * player, and the full-screen player are all one player — arriving here never
 * interrupts what was already playing, and back/forward moves the queue.
 *
 * The songs outlive the queue, though: dismissing the player is about getting
 * the bar off the screen, not about abandoning the set you came here to work
 * on. So the list stays put, and pressing play queues it up again from
 * wherever you'd got to.
 */
export function QueuePracticeClient({ apiKey }: { apiKey: string }) {
  const { queue, index, goTo, play, hydrated } = usePlaylistPlayer();

  // Our copy of the last live queue, kept for after it's dismissed.
  const [saved, setSaved] = useState<PlaylistTrack[]>([]);
  const [savedIndex, setSavedIndex] = useState(0);

  useEffect(() => {
    if (queue.length === 0) return;
    setSaved(queue);
    setSavedIndex(index);
  }, [queue, index]);

  // A live queue is the source of truth; our copy takes over once it's gone.
  const live = queue.length > 0;
  const tracks = live ? queue : saved;
  const position = Math.min(
    live ? index : savedIndex,
    Math.max(0, tracks.length - 1),
  );

  const stepTo = useCallback(
    (value: SetStateAction<number>) => {
      const target = typeof value === 'function' ? value(position) : value;
      if (live) goTo(target);
      else setSavedIndex(Math.max(0, Math.min(target, tracks.length - 1)));
    },
    [live, goTo, position, tracks.length],
  );

  // Play with no queue behind us: rebuild it from what's on screen.
  const requeue = useCallback(
    () => play(tracks, position),
    [play, tracks, position],
  );

  // On a cold load the queue arrives from localStorage a beat after mount —
  // wait for it rather than flashing "nothing queued" at someone who has a set
  // waiting. Practice renders the header once it takes over, so these two
  // states carry their own — the page has none of its own to show.
  if (!hydrated) {
    return (
      <>
        <PracticeHeader />
        <LoadingBlock />
      </>
    );
  }

  if (tracks.length === 0) {
    return (
      <>
        <PracticeHeader />
        <div className="mx-4 flex flex-col items-center gap-3 rounded-md border border-neutral-200 px-3 py-10 text-center dark:border-neutral-800">
          <p className="text-sm text-neutral-500">
            Nothing is queued to practice.
          </p>
          <Link href="/home" className="btn-outline">
            Find something to play
          </Link>
        </div>
      </>
    );
  }

  // The queue, as Practice steps: same songs, same order, same audio.
  const songs: PracticeSong[] = tracks.map((t) => ({
    conversationId: t.id,
    title: t.title,
    mimeType: t.mimeType,
    bpm: t.bpm,
    songKey: t.songKey,
    src: t.src,
  }));

  return (
    <Practice
      songs={songs}
      apiKey={apiKey}
      index={position}
      onIndexChange={stepTo}
      playerSlot={
        <QueuePlayerBar
          sticky
          idleTitle={tracks[position]?.title}
          onIdlePlay={requeue}
        />
      }
      back={BACK}
    />
  );
}
