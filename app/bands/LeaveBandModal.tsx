'use client';

import { useEffect, useState } from 'react';
import { Modal } from '../Modal';
import { useTrackPending } from '../PendingActionProvider';
import { useToast } from '../ToastProvider';
import { LoadingBlock } from '../Spinner';

interface Other {
  userId: string;
  name: string | null;
  email: string;
  role: string;
}

/**
 * Confirms leaving a band. A plain member gets a simple confirm. An owner can
 * leave freely if another owner remains; otherwise the *sole* owner must pick
 * which remaining member inherits ownership (members fetched on open), and one
 * who is also the only member is told to delete the band instead. Owns the
 * POST, toast, and `bands:changed` broadcast — the parent handles
 * navigation/reload via `onLeft`.
 */
export function LeaveBandModal({
  band,
  currentUserId,
  onCancel,
  onLeft,
}: {
  band: { id: string; name: string; role: 'owner' | 'member' };
  currentUserId: string;
  onCancel: () => void;
  onLeft: () => void;
}) {
  const isOwner = band.role === 'owner';
  // The other members (everyone but me). null = still loading; a plain member
  // never needs this, so it starts resolved.
  const [others, setOthers] = useState<Other[] | null>(isOwner ? null : []);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newOwnerId, setNewOwnerId] = useState('');
  const [leaving, setLeaving] = useState(false);
  const trackPending = useTrackPending();
  const showToast = useToast();

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/bands/${band.id}/members`, {
          cache: 'no-store',
        });
        if (!r.ok) throw new Error('Could not load members.');
        const data = (await r.json()) as { members: Other[] };
        if (cancelled) return;
        setOthers(data.members.filter((m) => m.userId !== currentUserId));
      } catch (e) {
        if (!cancelled)
          setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [band.id, isOwner, currentUserId]);

  // Another owner already covers the band → leave freely, no successor.
  const otherOwnerRemains =
    isOwner && others !== null && others.some((m) => m.role === 'owner');
  const soleOwner = isOwner && others !== null && others.length === 0;
  const needsChoice =
    isOwner && others !== null && !otherOwnerRemains && others.length > 0;
  const candidates = others ?? [];

  const submit = async () => {
    if (leaving || (needsChoice && !newOwnerId)) return;
    setLeaving(true);
    try {
      let result: { status?: string; newOwnerName?: string | null } = {};
      await trackPending(async () => {
        const r = await fetch(`/api/bands/${band.id}/leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(needsChoice ? { newOwnerId } : {}),
        });
        const data = (await r.json().catch(() => ({}))) as typeof result & {
          message?: string;
        };
        if (!r.ok) throw new Error(data.message || 'Could not leave the band.');
        result = data;
      });
      window.dispatchEvent(new Event('bands:changed'));
      showToast(
        result.status === 'transferred'
          ? `You left ${band.name}. ${result.newOwnerName ?? 'Another member'} is now the owner.`
          : `You left ${band.name}.`,
        'success',
      );
      onLeft();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setLeaving(false);
    }
  };

  const dangerBtn =
    'rounded-md bg-red-600 px-4 py-3 md:py-1.5 md:px-3 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50';

  const loadingOwner = isOwner && others === null && !loadError;

  return (
    <Modal
      onClose={onCancel}
      labelledBy="leave-band-title"
      busy={leaving}
      size="sm"
    >
      <h2 id="leave-band-title" className="text-base font-semibold">
        Leave {band.name}?
      </h2>

      {loadingOwner ? (
        <>
          <LoadingBlock className="mt-4 py-6" label="Loading members" />
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={onCancel} className="btn-ghost">
              Cancel
            </button>
          </div>
        </>
      ) : loadError ? (
        <>
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {loadError}
          </p>
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={onCancel} className="btn-ghost">
              Close
            </button>
          </div>
        </>
      ) : soleOwner ? (
        <>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            You’re the only member. To leave, delete the band from its Edit page
            instead.
          </p>
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={onCancel} className="btn-ghost">
              OK
            </button>
          </div>
        </>
      ) : needsChoice ? (
        <>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            You’re the only owner. Choose who becomes the new owner. You’ll lose
            access unless they add you back later.
          </p>
          <fieldset className="mt-4 flex max-h-60 flex-col gap-1 overflow-y-auto">
            <legend className="sr-only">New owner</legend>
            {candidates.map((c) => (
              <label
                key={c.userId}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <input
                  type="radio"
                  name="new-owner"
                  value={c.userId}
                  checked={newOwnerId === c.userId}
                  onChange={() => setNewOwnerId(c.userId)}
                  className="shrink-0"
                />
                <span className="min-w-0 truncate">
                  {c.name ?? c.email}
                  {c.name && (
                    <span className="text-neutral-400"> · {c.email}</span>
                  )}
                </span>
              </label>
            ))}
          </fieldset>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={leaving}
              className="btn-ghost"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={leaving || !newOwnerId}
              className={dangerBtn}
            >
              {leaving ? 'Leaving…' : 'Transfer & leave'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            {otherOwnerRemains
              ? 'Another owner will remain to manage the band. You’ll lose access unless an owner adds you back later.'
              : 'You’ll lose access to this band’s audio and conversations. An owner can add you back later.'}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={leaving}
              className="btn-ghost"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={leaving}
              className={dangerBtn}
            >
              {leaving ? 'Leaving…' : 'Leave band'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
