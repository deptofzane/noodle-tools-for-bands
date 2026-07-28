import Link from 'next/link';
import { getCurrentDbUser } from '@/lib/current-user';
import { getInviteByToken } from '@/lib/db/invites';
import { normalizeEmail } from '@/lib/db/users';
import { AcceptInvite } from './AcceptInvite';

/**
 * Invite landing. Public (see middleware) so a signed-out invitee can read it
 * and choose to sign up / log in — after which they return here (callbackUrl)
 * to redeem. Redeeming itself requires auth (the accept API is guarded).
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [user, invite] = await Promise.all([
    getCurrentDbUser(),
    getInviteByToken(token),
  ]);

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <h3 className="mb-2 font-serif text-4xl">
        side<span className="text-cyan-600">stage</span>
      </h3>
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 p-8 dark:border-neutral-800">
        {children}
      </div>
    </main>
  );

  if (!invite || invite.accepted || invite.expired) {
    return (
      <Shell>
        <h1 className="title-text">Invite unavailable</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          {invite?.accepted
            ? 'This invite has already been used.'
            : invite?.expired
              ? 'This invite has expired. Ask an owner for a new link.'
              : 'This invite link is invalid. Ask an owner for a new link.'}
        </p>
        <p className="mt-4 text-sm">
          <Link href="/home" className="text-blue-600 hover:underline dark:text-blue-400">
            Go to Sidestage
          </Link>
        </p>
      </Shell>
    );
  }

  const callbackUrl = `/invite/${token}`;
  const emailMismatch =
    user !== null && normalizeEmail(user.email ?? '') !== invite.email;

  return (
    <Shell>
      <h1 className="title-text">Join {invite.bandName}</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        You’ve been invited to join{' '}
        <span className="font-medium">{invite.bandName}</span> on Sidestage.
      </p>

      {user && emailMismatch ? (
        <p className="mt-5 text-sm text-neutral-600 dark:text-neutral-400">
          This invite is for <span className="font-medium">{invite.email}</span>
          , but you’re signed in as{' '}
          <span className="font-medium">{user.email}</span>. Sign out and sign
          back in with <span className="font-medium">{invite.email}</span> to
          accept it.
        </p>
      ) : user ? (
        <div className="mt-5">
          <AcceptInvite token={token} bandName={invite.bandName} />
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Sign up or log in to accept.
          </p>
          <div className="flex gap-2">
            <Link
              href={`/signup?email=${encodeURIComponent(invite.email)}&callbackUrl=${encodeURIComponent(callbackUrl)}`}
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-500"
            >
              Sign up
            </Link>
            <Link
              href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              className="flex-1 rounded-md border border-neutral-300 px-4 py-2 text-center text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
            >
              Log in
            </Link>
          </div>
          <p className="text-xs text-neutral-500">Invite sent to {invite.email}.</p>
        </div>
      )}
    </Shell>
  );
}
