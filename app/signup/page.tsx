import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { SignupForm } from './SignupForm';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session) redirect('/');
  const { email, callbackUrl } = await searchParams;
  const loginHref = callbackUrl
    ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : '/login';

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <h3 className="mb-2 font-serif text-4xl">
        noo<span className="text-cyan-600">dle</span>
      </h3>
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 p-8 dark:border-neutral-800">
        <h1 className="title-text">Create account</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Sign up with an email and password.
        </p>

        <SignupForm
          initialEmail={email ?? ''}
          callbackUrl={callbackUrl ?? '/home'}
        />

        <p className="mt-4 text-xs minor-text-theme-colors">
          Already have an account?{' '}
          <Link href={loginHref} className="hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
