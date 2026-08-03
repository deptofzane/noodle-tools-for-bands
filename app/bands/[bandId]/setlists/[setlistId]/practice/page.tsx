import { redirect } from 'next/navigation';
import { practiceHref } from '@/lib/routes';

/**
 * The old path-based Practice URL. Kept permanently, not transitionally:
 * links to it are out in chat threads, calendar invites and bookmarks, and
 * they should keep landing in the right place. The screen itself now lives at
 * `/practice?setlist=…` (see lib/routes.ts).
 */
export default async function PracticeSetlistRedirect({
  params,
}: {
  params: Promise<{ bandId: string; setlistId: string }>;
}) {
  const { setlistId } = await params;
  redirect(practiceHref(setlistId));
}
