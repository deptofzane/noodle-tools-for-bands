'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The join button on an invite landing (signed-in visitors). Redeems the
 * token, then lands the user on the band. Errors (expired/revoked/already
 * used) surface inline.
 */
export function AcceptInvite({
  token,
  bandName,
}: {
  token: string;
  bandName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        bandId?: string;
        message?: string;
      };
      if (!r.ok)
        throw new Error(data.message || 'Could not accept the invite.');
      // Refresh the header's band picker (it's mounted separately).
      window.dispatchEvent(new Event('bands:changed'));
      router.push(data.bandId ? `/bands/${data.bandId}` : '/bands');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={accept}
        disabled={busy}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {busy ? 'Joining…' : `Join ${bandName}`}
      </button>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
