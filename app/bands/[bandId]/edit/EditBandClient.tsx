'use client';

import { ensureOk } from '@/lib/api';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmModal } from '../../../ConfirmModal';
import { useTrackPending } from '../../../PendingActionProvider';
import { useToast } from '../../../ToastProvider';
import { LoadingBlock } from '../../../Spinner';

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

interface PendingInvite {
  id: string;
  email: string;
  role: 'owner' | 'member';
  createdAt: string;
  expiresAt: string;
}

/**
 * Band management (owner-only): add/remove members and delete the band.
 * The server shell already enforces owner access; the mutation APIs
 * re-check it, so this client only drives the forms and confirmations.
 */
export function EditBandClient({ bandId }: { bandId: string }) {
  const [data, setData] = useState<BandDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);
  const [promoteTarget, setPromoteTarget] = useState<Member | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitingBusy, setInvitingBusy] = useState(false);
  const [createdLink, setCreatedLink] = useState<{
    url: string;
    email: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [invites, setInvites] = useState<PendingInvite[] | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const trackPending = useTrackPending();
  const router = useRouter();
  const showToast = useToast();

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/bands/${bandId}`, { cache: 'no-store' });
      await ensureOk(res);
      const d = (await res.json()) as BandDetail;
      setData(d);
      setName(d.band.name);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [bandId]);

  const loadInvites = useCallback(async () => {
    try {
      const res = await fetch(`/api/bands/${bandId}/invites`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const d = (await res.json()) as { invites: PendingInvite[] };
      setInvites(d.invites);
    } catch {
      // best-effort — the section just stays empty
    }
  }, [bandId]);

  useEffect(() => {
    void trackPending(() => load());
    void loadInvites();
  }, [load, loadInvites, trackPending]);

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = name.trim();
    if (!data || !v || v === data.band.name || renaming) return;
    setRenaming(true);
    try {
      await trackPending(async () => {
        const r = await fetch(`/api/bands/${bandId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: v }),
        });
        await ensureOk(r);
      });
      // Refresh the header's band picker (it's mounted separately).
      window.dispatchEvent(new Event('bands:changed'));
      showToast('Band name updated.', 'success');
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setRenaming(false);
    }
  };

  const handlePromote = async () => {
    if (!promoteTarget || promoting) return;
    setPromoting(true);
    try {
      await trackPending(async () => {
        const r = await fetch(
          `/api/bands/${bandId}/members/${promoteTarget.userId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'owner' }),
          },
        );
        await ensureOk(r);
      });
      showToast(
        `${promoteTarget.name ?? promoteTarget.email ?? 'Member'} is now an owner.`,
        'success',
      );
      setPromoteTarget(null);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setPromoting(false);
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = inviteEmail.trim();
    if (!v || invitingBusy) return;
    setInvitingBusy(true);
    try {
      const invite = await trackPending(async () => {
        const r = await fetch(`/api/bands/${bandId}/invites`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: v }),
        });
        const d = (await r.json().catch(() => ({}))) as {
          invite?: { path: string; email: string };
          message?: string;
        };
        if (!r.ok) throw new Error(d.message || 'Could not create the invite.');
        return d.invite ?? null;
      });
      if (invite) {
        setCreatedLink({
          url: `${window.location.origin}${invite.path}`,
          email: invite.email,
        });
        setCopied(false);
      }
      setInviteEmail('');
      showToast('Invite link created.', 'success');
      await loadInvites();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setInvitingBusy(false);
    }
  };

  const handleCopyLink = async () => {
    if (!createdLink) return;
    try {
      await navigator.clipboard.writeText(createdLink.url);
      setCopied(true);
    } catch {
      showToast('Couldn’t copy — select the link and copy it manually.');
    }
  };

  const handleRevokeInvite = async (id: string) => {
    if (revokingId) return;
    setRevokingId(id);
    try {
      await trackPending(async () => {
        const r = await fetch(`/api/bands/${bandId}/invites/${id}`, {
          method: 'DELETE',
        });
        await ensureOk(r);
      });
      await loadInvites();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setRevokingId(null);
    }
  };

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
        await ensureOk(r);
      });
      setEmail('');
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget || removing) return;
    setRemoving(true);
    try {
      await trackPending(async () => {
        const r = await fetch(
          `/api/bands/${bandId}/members/${removeTarget.userId}`,
          { method: 'DELETE' },
        );
        await ensureOk(r);
      });
      setRemoveTarget(null);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoving(false);
    }
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await trackPending(async () => {
        const r = await fetch(`/api/bands/${bandId}`, { method: 'DELETE' });
        await ensureOk(r);
      });
      // Refresh the header's band picker (it's mounted separately).
      window.dispatchEvent(new Event('bands:changed'));
      // `replace`: Back must not return to an editor for something now deleted.
      router.replace('/bands');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  if (error) {
    return (
      <p className="rounded-md border border-danger-line bg-danger-fill px-3 py-2 text-sm text-danger-strong">
        {error}
      </p>
    );
  }

  if (!data) {
    return <LoadingBlock />;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="title-text">Edit {data.band.name}</h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Band name</h2>
        <form onSubmit={handleRename} className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="Band name"
            aria-label="Band name"
            className="flex-1 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={
              renaming || !name.trim() || name.trim() === data.band.name
            }
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {renaming ? 'Saving…' : 'Save'}
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Members</h2>
        <ul className="divide-y divide-line rounded-lg border border-line">
          {data.members.map((m) => (
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
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded bg-fill-muted px-1.5 py-0.5 text-[0.625rem] font-medium text-fg-dim">
                  {m.role}
                </span>
                {m.role === 'member' && (
                  <button
                    type="button"
                    onClick={() => setPromoteTarget(m)}
                    disabled={promoting}
                    className="text-xs minor-text-theme-colors hover:text-blue-600 disabled:opacity-50 dark:hover:text-blue-400"
                  >
                    Make owner
                  </button>
                )}
                {m.role === 'member' && (
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(m)}
                    disabled={removing}
                    className="text-xs minor-text-theme-colors hover:text-danger disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <form onSubmit={handleAdd} className="flex flex-col gap-1">
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Add member by email"
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
            They must have signed in to the app at least once — otherwise send
            an invite link below.
          </p>
        </form>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Invite by link</h2>
        <form onSubmit={handleCreateInvite} className="flex flex-col gap-1">
          <div className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="Invite by email"
              className="flex-1 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={!inviteEmail.trim() || invitingBusy}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {invitingBusy ? 'Creating…' : 'Create invite'}
            </button>
          </div>
          <p className="text-[0.6875rem] minor-text-theme-colors">
            They join {data.band.name} when they open the link and sign in with
            this email. Links expire in 21 days.
          </p>
        </form>

        {createdLink && (
          <div className="flex flex-col gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-900 dark:bg-blue-950/40">
            <p className="text-xs text-fg-dim">
              Invite link for{' '}
              <span className="font-medium">{createdLink.email}</span> — copy
              and share it:
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                value={createdLink.url}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-2 py-1.5 font-mono text-xs"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="shrink-0 rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium hover:bg-surface-hover"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {invites && invites.length > 0 && (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-3 px-4 py-2 md:px-3 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate">{inv.email}</div>
                  <div className="text-xs minor-text-theme-colors">
                    Pending · expires{' '}
                    {new Date(inv.expiresAt).toLocaleDateString()}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevokeInvite(inv.id)}
                  disabled={revokingId === inv.id}
                  className="shrink-0 text-xs minor-text-theme-colors hover:text-danger disabled:opacity-50"
                >
                  {revokingId === inv.id ? 'Revoking…' : 'Revoke'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 border-t border-line pt-4">
        <h2 className="text-sm font-medium text-red-700 dark:text-red-400">
          Danger zone
        </h2>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="self-start rounded-md border border-red-300 px-4 py-3 md:py-1.5 md:px-3 text-sm font-medium text-red-700 hover:bg-danger-fill dark:border-red-800 dark:text-red-400"
        >
          Delete band
        </button>
      </section>

      <ConfirmModal
        open={promoteTarget !== null}
        title={`Make ${
          promoteTarget?.name ?? promoteTarget?.email ?? 'this member'
        } an owner?`}
        description="Owners can manage members, rename or delete the band, and promote others."
        confirmLabel="Make owner"
        busyLabel="Promoting…"
        busy={promoting}
        onConfirm={handlePromote}
        onCancel={() => setPromoteTarget(null)}
      />

      <ConfirmModal
        open={removeTarget !== null}
        title="Remove member?"
        description={`Remove ${
          removeTarget?.name ?? removeTarget?.email ?? 'this member'
        } from ${data.band.name}? They’ll lose access to its audio and conversations. You can add them back later.`}
        confirmLabel="Remove member"
        busyLabel="Removing…"
        busy={removing}
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(null)}
      />

      <ConfirmModal
        open={deleteOpen}
        title={`Delete ${data.band.name}?`}
        description="This permanently deletes the band, its membership, and all of its audio conversations and notes. This can’t be undone."
        confirmLabel="Delete band"
        busyLabel="Deleting…"
        busy={deleting}
        confirmPhrase={data.band.name}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
