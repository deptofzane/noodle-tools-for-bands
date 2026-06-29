'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PickerButton, type PickedFile } from '../../PickerButton';
import { useTrackPending } from '../../PendingActionProvider';

interface Member {
  userId: string;
  email: string | null;
  name: string | null;
  role: 'owner' | 'member';
}

interface BandDetail {
  band: { id: string; name: string };
  members: Member[];
  myRole: 'owner' | 'member';
}

interface Conversation {
  id: string;
  audioFileName: string | null;
  closed: boolean;
}

/**
 * Band detail: name, member list, and (for owners) add/remove controls.
 *
 * The add flow expects an email of someone who has already signed in to
 * the app at least once — the API resolves it to an existing user row.
 * Remove is offered only for non-owner members, which also keeps owners
 * (including the creator/self) from being removed through the UI.
 */
export function BandDetailClient({
  bandId,
  apiKey,
}: {
  bandId: string;
  apiKey: string;
}) {
  const [data, setData] = useState<BandDetail | null>(null);
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const trackPending = useTrackPending();

  const load = useCallback(async () => {
    try {
      const [detailRes, convRes] = await Promise.all([
        fetch(`/api/bands/${bandId}`, { cache: 'no-store' }),
        fetch(`/api/bands/${bandId}/conversations`, { cache: 'no-store' }),
      ]);
      if (!detailRes.ok) {
        const b = await detailRes.json().catch(() => ({}));
        throw new Error(b.message ?? b.error ?? `HTTP ${detailRes.status}`);
      }
      setData((await detailRes.json()) as BandDetail);
      if (convRes.ok) {
        const cd = (await convRes.json()) as { conversations: Conversation[] };
        setConversations(cd.conversations);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [bandId]);

  useEffect(() => {
    void trackPending(() => load());
  }, [load, trackPending]);

  const handleRegister = useCallback(
    async (files: PickedFile[]) => {
      try {
        await trackPending(async () => {
          // Register each picked audio file as a conversation under the band.
          for (const f of files) {
            const r = await fetch(`/api/bands/${bandId}/conversations`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                driveAudioFileId: f.id,
                audioFileName: f.name,
              }),
            });
            if (!r.ok) {
              const b = await r.json().catch(() => ({}));
              throw new Error(b.message ?? `HTTP ${r.status}`);
            }
          }
        });
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [bandId, load, trackPending],
  );

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    if (!v || busy) return;
    setBusy(true);
    try {
      await trackPending(async () => {
        const r = await fetch(`/api/bands/${bandId}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: v }),
        });
        if (!r.ok) {
          const b = await r.json().catch(() => ({}));
          throw new Error(b.message ?? `HTTP ${r.status}`);
        }
      });
      setEmail('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (userId: string) => {
    if (!confirm('Remove this member?')) return;
    try {
      await trackPending(async () => {
        const r = await fetch(`/api/bands/${bandId}/members/${userId}`, {
          method: 'DELETE',
        });
        if (!r.ok) {
          const b = await r.json().catch(() => ({}));
          throw new Error(b.message ?? `HTTP ${r.status}`);
        }
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (error) {
    return (
      <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
        {error}
      </p>
    );
  }

  if (!data) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }

  const isOwner = data.myRole === 'owner';

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{data.band.name}</h1>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Audio</h2>
          <PickerButton apiKey={apiKey} onPick={handleRegister} label="Add audio" />
        </div>
        {conversations && conversations.length === 0 && (
          <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
            No audio yet. Use “Add audio” to register a Drive file.
          </p>
        )}
        {conversations && conversations.length > 0 && (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/notes/${c.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <span className="truncate font-medium">
                    {c.audioFileName ?? 'Untitled audio'}
                  </span>
                  {c.closed && (
                    <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                      closed
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Members</h2>
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {data.members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {m.name ?? m.email ?? 'Unknown'}
                </div>
                {m.email && m.name && (
                  <div className="truncate text-xs text-neutral-500">
                    {m.email}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {m.role}
                </span>
                {isOwner && m.role === 'member' && (
                  <button
                    type="button"
                    onClick={() => handleRemove(m.userId)}
                    className="text-xs text-neutral-500 hover:text-red-600 dark:hover:text-red-400"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {isOwner && (
        <form onSubmit={handleAdd} className="flex flex-col gap-1">
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Add member by email"
              className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
            />
            <button
              type="submit"
              disabled={!email.trim() || busy}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {busy ? 'Adding…' : 'Add'}
            </button>
          </div>
          <p className="text-[11px] text-neutral-500">
            They must have signed in to the app at least once.
          </p>
        </form>
      )}
    </div>
  );
}
