'use client';

import { usePathname } from 'next/navigation';
import { startGoogleConnect } from './account-actions';

/**
 * Connects a Google account to the *current* signed-in user (via the
 * link-aware server action) and enables Drive scopes in the same flow,
 * returning to the current page afterward. Shown in the audio / sheet-music
 * source pickers when Drive isn't available yet. Because it links to the
 * signed-in user, it won't switch them to a different account even if the
 * Google email differs.
 */
export function ConnectDriveButton({
  label = 'Sign in with Google',
  className,
}: {
  label?: string;
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <form action={startGoogleConnect} className="contents">
      <input type="hidden" name="next" value={pathname} />
      <button type="submit" className={className ?? 'btn-outline'}>
        {label}
      </button>
    </form>
  );
}
