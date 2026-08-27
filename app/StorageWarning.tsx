'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BAND_STORAGE_LIMIT_BYTES, usageLevel } from '@/lib/storage';
import { formatBytes } from '@/lib/format';

/**
 * Shown above an upload control once a band's storage is getting full: a
 * nudge at 80%, a firmer one at 90%. Renders nothing below that, so it can
 * sit unconditionally in every upload surface.
 *
 * There's no cap yet — uploads past this still succeed. The point is that the
 * band finds out before the number is someone's emergency.
 */
export function StorageWarning({ bandId }: { bandId?: string }) {
  const [bytes, setBytes] = useState<number | null>(null);

  useEffect(() => {
    if (!bandId) return;
    let live = true;
    fetch(`/api/bands/${bandId}/storage`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (live && data) setBytes(data.usage.bytes);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [bandId]);

  if (bytes === null || !bandId) return null;
  const level = usageLevel(bytes);
  if (level === 'ok') return null;

  const pct = Math.round((bytes / BAND_STORAGE_LIMIT_BYTES) * 100);

  return (
    <p
      role="status"
      className="rounded-md border border-warn-line bg-warn-fill px-3 py-2 text-sm text-warn-strong"
    >
      This band has used {pct}% of its {formatBytes(BAND_STORAGE_LIMIT_BYTES)}{' '}
      of storage
      {level === 'critical' ? ' — very little room is left' : ''}.{' '}
      <Link href={`/bands/${bandId}/files`} className="underline">
        Manage files
      </Link>{' '}
      to free some up.
    </p>
  );
}
