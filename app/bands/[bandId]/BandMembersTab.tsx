'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ensureOk } from '@/lib/api';
import { MinimizeToggle, type Member } from './bandDetailShared';
import { PollCard } from './PollCard';
import { usePersistedBoolean } from '../../usePersistedBoolean';
import { ActionMenu, ActionMenuItem } from '../../ActionMenu';
import { ConfirmModal } from '../../ConfirmModal';
import { useTrackPending } from '../../PendingActionProvider';
import { useToast } from '../../ToastProvider';
import { LoadingBlock } from '../../Spinner';

interface PollSummary {
  id: string;
  title: string;
  createdAt: string;
  closed: boolean;
}

/**
 * The Polls tab: a Polls section (create + list the band's open polls), the
 * band's members in a collapsible container, and — below that — a collapsible
 * "Closed polls" history (shown only when there are closed polls).
 */
export function BandMembersTab({
  bandId,
  members,
  canManage,
  onReload,
}: {
  bandId: string;
  members: Member[];
  /** True for owners — they can promote other members to owner. */
  canManage: boolean;
  onReload: () => Promise<void> | void;
}) {
  const [polls, setPolls] = useState<PollSummary[] | null>(null);
  const [pollsLoaded, setPollsLoaded] = useState(false);
  const [promoteTarget, setPromoteTarget] = useState<Member | null>(null);
  const [promoting, setPromoting] = useState(false);
  const trackPending = useTrackPending();
  const showToast = useToast();
  const [closedMinimized, setClosedMinimized] = usePersistedBoolean(
    'bandClosedPollsMinimized',
    true,
  );
  const [membersMinimized, setMembersMinimized] = usePersistedBoolean(
    'bandMembersMinimized',
    false,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/bands/${bandId}/polls`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as { polls: PollSummary[] };
        if (!cancelled) {
          setPolls(data.polls);
          setPollsLoaded(true);
        }
      } catch {
        // best-effort; the section just stays empty
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bandId]);

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
      await onReload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setPromoting(false);
    }
  };

  const openPolls = polls?.filter((p) => !p.closed) ?? null;
  const closedPolls = polls?.filter((p) => p.closed) ?? [];

  const renderPollList = (list: PollSummary[]) => (
    <ul className="divide-y divide-line rounded-lg border border-line">
      {list.map((p) => (
        <PollCard
          key={p.id}
          bandId={bandId}
          id={p.id}
          title={p.title}
          createdAt={p.createdAt}
        />
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Polls</h2>
          <Link href={`/bands/${bandId}/polls/new`} className="btn-outline">
            New poll
          </Link>
        </div>
        {!pollsLoaded && (
          <LoadingBlock
            label="Loading polls"
            className="rounded-md border border-line py-6"
          />
        )}
        {polls && polls.length === 0 && (
          <p className="rounded-md border border-line px-3 py-6 text-center text-sm minor-text-theme-colors">
            No polls yet. Use “New poll” to ask the band something.
          </p>
        )}
        {openPolls && openPolls.length > 0 && renderPollList(openPolls)}
        {polls && openPolls?.length === 0 && closedPolls.length > 0 && (
          <p className="rounded-md border border-line px-3 py-6 text-center text-sm minor-text-theme-colors">
            No open polls. Use “New poll” to ask the band something.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <MinimizeToggle
            minimized={membersMinimized}
            onToggle={() => setMembersMinimized((v) => !v)}
            label="Members"
          >
            <h2 className="text-sm font-medium">Members</h2>
          </MinimizeToggle>
          {membersMinimized && (
            <span className="text-xs minor-text-theme-colors">
              <span aria-hidden="true">·</span> {members.length}{' '}
              {members.length === 1 ? 'member' : 'members'}
            </span>
          )}
        </div>
        {!membersMinimized && (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {members.map((m) => (
              <li
                key={m.userId}
                className="flex items-center gap-3 px-4 py-3 md:py-1.5 md:px-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {m.name ?? m.email ?? 'Unknown'}
                  </div>
                  {m.email && m.name && (
                    <div className="truncate text-xs minor-text-theme-colors">
                      {m.email}
                    </div>
                  )}
                </div>
                <span className="shrink-0 rounded bg-fill-muted px-1.5 py-0.5 text-[0.625rem] font-medium text-fg-dim">
                  {m.role}
                </span>
                {canManage && m.role !== 'owner' && (
                  <ActionMenu label="Member actions">
                    <ActionMenuItem onClick={() => setPromoteTarget(m)}>
                      Make owner
                    </ActionMenuItem>
                  </ActionMenu>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {closedPolls.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <MinimizeToggle
              minimized={closedMinimized}
              onToggle={() => setClosedMinimized((v) => !v)}
              label="Closed polls"
            >
              <h2 className="text-sm font-medium minor-text-theme-colors">
                Closed polls
              </h2>
            </MinimizeToggle>
            <span className="text-xs minor-text-theme-colors">
              <span aria-hidden="true">·</span> {closedPolls.length}
            </span>
          </div>
          {!closedMinimized && renderPollList(closedPolls)}
        </section>
      )}

      <ConfirmModal
        open={promoteTarget !== null}
        title={`Make ${promoteTarget?.name ?? promoteTarget?.email ?? 'this member'} an owner?`}
        description="Owners can manage members, edit the band, and promote others."
        confirmLabel="Make owner"
        busyLabel="Promoting…"
        busy={promoting}
        onConfirm={handlePromote}
        onCancel={() => setPromoteTarget(null)}
      />
    </div>
  );
}
