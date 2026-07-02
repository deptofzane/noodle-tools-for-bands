import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { getSetlist } from '@/lib/db/setlists';

/**
 * Edit a setlist. Scaffolding only for now — access-guarded shell with a
 * Cancel button back to the setlist. The editing UI comes next.
 */
export default async function EditSetlistPage({
  params,
}: {
  params: Promise<{ bandId: string; setlistId: string }>;
}) {
  const { bandId, setlistId } = await params;

  const user = await getCurrentDbUser();
  if (!user) redirect('/login');

  const setlist = await getSetlist(setlistId);
  if (!setlist || setlist.bandId !== bandId) notFound();
  if (!(await getMembership(user.id, bandId))) notFound();

  return (
    <main className="mx-auto flex h-max max-w-3xl flex-col gap-4 px-6 py-4">
      <header className="flex items-center justify-between gap-2 text-xs text-neutral-500">
        <Link
          href={`/bands/${bandId}/setlists/${setlistId}`}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
        >
          Cancel
        </Link>
      </header>

      <h1 className="text-2xl font-semibold tracking-tight">Edit setlist</h1>
    </main>
  );
}
