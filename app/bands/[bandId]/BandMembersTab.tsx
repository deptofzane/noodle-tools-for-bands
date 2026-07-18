import Link from 'next/link';
import type { Member } from './bandDetailShared';

/** The Members tab: a "New poll" action plus the band's members and roles. */
export function BandMembersTab({
  bandId,
  members,
}: {
  bandId: string;
  members: Member[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Members</h2>
        <Link href={`/bands/${bandId}/polls/new`} className="btn-outline">
          New poll
        </Link>
      </div>

      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
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
                <div className="truncate text-xs text-neutral-500">
                  {m.email}
                </div>
              )}
            </div>
            <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {m.role}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
