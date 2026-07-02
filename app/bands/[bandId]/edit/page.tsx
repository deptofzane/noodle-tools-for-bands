import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { EditBandClient } from './EditBandClient';

/**
 * Edit-band page. Server shell — owner-only: non-members 404, non-owners
 * are sent back to the band. The management APIs re-check ownership, so
 * this guard is UX, not the security boundary.
 */
export default async function EditBandPage({
  params,
}: {
  params: Promise<{ bandId: string }>;
}) {
  const { bandId } = await params;

  const user = await getCurrentDbUser();
  if (!user) redirect('/login');

  const membership = await getMembership(user.id, bandId);
  if (!membership) notFound();
  if (membership.role !== 'owner') redirect(`/bands/${bandId}`);

  return (
    <main className="mx-auto flex h-max max-w-3xl flex-col gap-4 px-6 py-4">
      <header className="flex items-center gap-2 text-xs text-neutral-500">
        <Link
          href={`/bands/${bandId}`}
          className="hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          ← Back to band
        </Link>
      </header>

      <EditBandClient bandId={bandId} />
    </main>
  );
}
