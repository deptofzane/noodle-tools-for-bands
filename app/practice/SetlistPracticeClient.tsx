'use client';

import { useSearchParams } from 'next/navigation';
import { Practice } from '../Practice';
import { practiceHref, songParamToIndex } from '@/lib/routes';
import { useSetlistPracticeSongs } from './useSetlistPracticeSongs';
import { SetlistScreenState } from './SetlistScreenState';
import { RecordRecent } from './RecordRecent';
import type { RecentRef } from '@/lib/practice-recent';

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
  // Set when this was opened as an event's setlist, so "Recent" lists the
  // event. Kept in the address Practice rewrites as you step through songs
  // (`shareHref` below) — dropping it would re-record the visit as the setlist.
  const eventId = params.get('event');
  const state = useSetlistPracticeSongs(setlistId);

  if (state.status !== 'ready') {
    return <SetlistScreenState state={state} backHref="/home" />;
  }

  // What this screen is, for "Recent" and the picker's "Current" mark.
  const here: RecentRef = eventId
    ? { kind: 'event', id: eventId }
    : { kind: 'setlist', id: state.setlist.id };

  return (
    <>
      <RecordRecent bandId={state.setlist.bandId} {...here} />
      <Practice
        songs={state.songs}
        bandId={state.setlist.bandId}
        apiKey={apiKey}
        persistKey={`practice:setlist:${state.setlist.id}`}
        startIndex={startIndex}
        shareHref={(i) => practiceHref(state.setlist.id, i, eventId)}
        pickerCurrent={here}
        back={{
          href: `/bands/${state.setlist.bandId}/setlists/${state.setlist.id}`,
          name: 'Setlist',
        }}
      />
    </>
  );
}
