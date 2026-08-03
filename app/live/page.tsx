import { Suspense } from 'react';
import { SetlistLiveClient } from './SetlistLiveClient';

/**
 * Live mode for a setlist: `/live?setlist=<id>[&song=<n>]`. A shell with no
 * server data — see app/practice/page.tsx for why.
 */
export default function SetlistLivePage() {
  return (
    <Suspense fallback={null}>
      <SetlistLiveClient />
    </Suspense>
  );
}
