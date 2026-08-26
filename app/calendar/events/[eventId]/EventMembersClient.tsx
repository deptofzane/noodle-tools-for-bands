'use client';

import { ensureOk } from '@/lib/api';
import { useState } from 'react';
import { useTrackPending } from '../../../PendingActionProvider';
import { useToast } from '../../../ToastProvider';

interface Member {
  userId: string;
  name: string | null;
  email: string | null;
}

/**
 * The event's people. Members of the owning band (canManage) can add users
 * by email — the same flow as adding to a band — and remove them. Everyone
 * else sees a read-only list.
 */
export function EventMembersClient({
  eventId,
  initialMembers,
  canManage,
}: {
  eventId: string;
  initialMembers: Member[];
  canManage: boolean;
}) {
  const trackPending = useTrackPending();
  const showToast = useToast();

  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const r = await fetch(`/api/events/${eventId}/members`, {
      cache: 'no-store',
    });
    if (r.ok) {
      const d = (await r.json()) as { members: Member[] };
      setMembers(d.members);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    if (!v || busy) return;
    setBusy(true);
    try {
      await trackPending(async () => {
        const r = await fetch(`/api/events/${eventId}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: v }),
        });
        await ensureOk(r);
      });
      setEmail('');
      await reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (userId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await trackPending(async () => {
        const r = await fetch(`/api/events/${eventId}/members/${userId}`, {
          method: 'DELETE',
        });
        await ensureOk(r, [204]);
      });
      await reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">People</h2>
      {members.length === 0 ? (
        <p className="rounded-md border border-line px-3 py-4 text-center text-sm minor-text-theme-colors">
          The owning band’s members can already see this. No one else has been
          added.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between gap-3 px-4 py-3 md:py-1.5 md:px-3 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {m.name ?? m.email ?? 'Unknown'}
                </div>
                {m.email && m.name && (
                  <div className="truncate text-xs minor-text-theme-colors">
                    {m.email}
                  </div>
                )}
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={() => handleRemove(m.userId)}
                  disabled={busy}
                  className="shrink-0 text-xs minor-text-theme-colors hover:text-danger disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <form onSubmit={handleAdd} className="flex flex-col gap-1">
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Add someone by email"
              className="flex-1 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={!email.trim() || busy}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {busy ? 'Adding…' : 'Add'}
            </button>
          </div>
          <p className="text-[0.6875rem] minor-text-theme-colors">
            They must have signed in to the app at least once.
          </p>
        </form>
      )}
    </section>
  );
}
