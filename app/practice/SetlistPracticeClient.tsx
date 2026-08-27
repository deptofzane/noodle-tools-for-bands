'use client';

import { useSearchParams } from 'next/navigation';
import { Practice } from '../Practice';
import { practiceHref, songParamToIndex } from '@/lib/routes';
import { useSetlistPracticeSongs } from './useSetlistPracticeSongs';
import { SetlistScreenState } from './SetlistScreenState';

/**
 * Practice a setlist, addressed by `?setlist=` (and optionally `?song=`).
 *
 * All the data arrives client-side, which is what lets one cached document
 * serve every setlist offline — see lib/routes.ts for why the ids live in the
 * query string.
 */
export function SetlistPracticeClient({ apiKey }: { apiKey: string }) {
  const params = useSearchParams();
  const setlistId = params.get('setlist');
  const startIndex = songParamToIndex(params.get('song'));
  const state = useSetlistPracticeSongs(setlistId);

  if (state.status !== 'ready') {
    return <SetlistScreenState state={state} backHref="/home" />;
  }

  return (
    <Practice
      songs={state.songs}
      bandId={state.setlist.bandId}
      apiKey={apiKey}
      persistKey={`practice:setlist:${state.setlist.id}`}
      startIndex={startIndex}
      shareHref={(i) => practiceHref(state.setlist.id, i)}
      back={{
        href: `/bands/${state.setlist.bandId}/setlists/${state.setlist.id}`,
        name: 'Setlist',
      }}
    />
  );
}
