'use client';

import { useSearchParams } from 'next/navigation';
import { Live } from '../Live';
import { liveHref, songParamToIndex } from '@/lib/routes';
import { SetlistScreenState } from '../practice/SetlistScreenState';
import { useSetlistPracticeSongs } from '../practice/useSetlistPracticeSongs';

/**
 * Live mode for a setlist, addressed by `?setlist=` (and optionally `?song=`).
 * Same data path as Practice — see app/practice/SetlistPracticeClient.tsx.
 */
export function SetlistLiveClient() {
  const params = useSearchParams();
  const setlistId = params.get('setlist');
  const startIndex = songParamToIndex(params.get('song'));
  const state = useSetlistPracticeSongs(setlistId);

  if (state.status !== 'ready') {
    return <SetlistScreenState state={state} backHref="/home" />;
  }

  return (
    <Live
      songs={state.songs}
      exitHref={`/bands/${state.setlist.bandId}/setlists/${state.setlist.id}`}
      persistKey={`live:setlist:${state.setlist.id}`}
      startIndex={startIndex}
      shareHref={(i) => liveHref(state.setlist.id, i)}
    />
  );
}
