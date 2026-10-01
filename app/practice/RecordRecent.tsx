'use client';

import { useEffect } from 'react';
import { recordRecent, type RecentKind } from '@/lib/practice-recent';

/**
 * Notes a Practice-screen visit for the picker's "Recent" pill. A component
 * rather than a hook so a page can render it only once it knows what it's
 * showing — and so the single-song page, a server component, can use it.
 */
export function RecordRecent({
  bandId,
  kind,
  id,
}: {
  bandId: string;
  kind: RecentKind;
  id: string;
}) {
  useEffect(() => {
    recordRecent(bandId, { kind, id });
  }, [bandId, kind, id]);
  return null;
}
