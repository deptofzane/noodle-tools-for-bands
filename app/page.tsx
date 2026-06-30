import { redirect } from 'next/navigation';

/**
 * Root path is now a pass-through to Open Conversations.
 *
 * Signed-in users land here from the post-sign-in default redirect
 * (when no `callbackUrl` was supplied) or from any old bookmark and
 * are sent straight to `/open-conversations`. Signed-out users are
 * intercepted earlier by middleware and routed to `/login`.
 *
 * The identity card + sign-out button that used to live here moved
 * to `/account`.
 */
export default function Home() {
  redirect('/open-conversations');
}
