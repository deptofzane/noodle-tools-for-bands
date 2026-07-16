'use client';

import { signIn } from 'next-auth/react';
import { REQUIRED_DRIVE_SCOPES } from '@/lib/google';

/**
 * Kicks off Google sign-in with the Drive scopes, returning to the current
 * page afterward. Shown in the audio / sheet-music source pickers when the
 * user hasn't connected Drive, so they can enable the Drive option inline
 * instead of hunting for it in Settings. `include_granted_scopes` keeps any
 * existing grants intact.
 */
export function ConnectDriveButton({
  label = 'Sign in with Google',
  className,
}: {
  label?: string;
  className?: string;
}) {
  const connect = () => {
    void signIn(
      'google',
      {
        callbackUrl:
          typeof window !== 'undefined' ? window.location.href : '/home',
      },
      {
        scope: ['openid', 'email', 'profile', ...REQUIRED_DRIVE_SCOPES].join(
          ' ',
        ),
        include_granted_scopes: 'true',
      },
    );
  };

  return (
    <button
      type="button"
      onClick={connect}
      className={
        className ??
        'rounded-md border border-neutral-300 px-4 py-3 md:py-1.5 md:px-3 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900'
      }
    >
      {label}
    </button>
  );
}
