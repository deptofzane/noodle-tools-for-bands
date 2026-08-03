import { Suspense } from 'react';
import { SetlistPracticeClient } from './SetlistPracticeClient';

/**
 * Practice a setlist: `/practice?setlist=<id>[&song=<n>]`.
 *
 * A shell with no server data of its own — the songs are fetched client-side
 * (and cached for offline use), so this one document serves every setlist and
 * can be precached and refreshed with each deploy. Authorization is on the
 * endpoint the client calls, not here.
 */
export default function SetlistPracticePage() {
  return (
    <main>
      {/* Reading the query string opts a subtree out of prerendering. */}
      <Suspense fallback={null}>
        <SetlistPracticeClient
          apiKey={process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? ''}
        />
      </Suspense>
    </main>
  );
}
