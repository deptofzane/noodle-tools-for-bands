import { redirect } from 'next/navigation';

/**
 * Root path is now a pass-through to Home.
 *
 * Signed-in users land here from the post-sign-in default redirect
 * (when no `callbackUrl` was supplied) or from any old bookmark and
 * are sent straight to `/home`. Signed-out users are intercepted
 * earlier by middleware and routed to `/login`.
 *
 * The identity card + sign-out button that used to live here moved
 * to the Settings page (`/settings`).
 */
export default function Home() {
  redirect('/home');
}
