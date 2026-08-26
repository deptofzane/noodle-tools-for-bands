import { permanentRedirect } from 'next/navigation';

/**
 * The old song screen, now a redirect to Practice.
 *
 * Practice did everything this page did and more — player, sheet music, and
 * (since the move) the notes panel — so keeping a lesser twin of it meant two
 * screens to change every time either grew. What stays is the URL: it is what
 * "Share song" copied for as long as that action has existed, what delivered
 * push notifications point at, and what note links stored before the change.
 * None of those can be edited after the fact, so this has to keep resolving.
 *
 * The query string comes along: `?thread=` names a note thread and `?from=`
 * names the list to go back to, and Practice reads both.
 */
export default async function SongPageRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { conversationId } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') query.set(key, value);
    else if (Array.isArray(value)) for (const v of value) query.append(key, v);
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  // 308, not 307: the move is permanent, and saying so lets browsers and
  // crawlers stop asking.
  permanentRedirect(`/notes/${conversationId}/practice${suffix}`);
}
