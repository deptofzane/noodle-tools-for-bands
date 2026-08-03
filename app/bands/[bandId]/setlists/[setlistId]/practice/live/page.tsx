import { redirect } from 'next/navigation';
import { liveHref } from '@/lib/routes';

/** The old path-based Live URL — see the Practice redirect beside it. */
export default async function LiveSetlistRedirect({
  params,
}: {
  params: Promise<{ bandId: string; setlistId: string }>;
}) {
  const { setlistId } = await params;
  redirect(liveHref(setlistId));
}
