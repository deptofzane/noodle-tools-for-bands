import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACT_EMAIL, POLICY_UPDATED } from '../legal';

export const metadata: Metadata = {
  title: 'Delete your account',
  description:
    'How to delete your Noodle account, what is removed, and what remains.',
};

/**
 * Public account-deletion instructions.
 *
 * Play policy wants a URL anyone can reach *without* installing the app or
 * signing in, which is why this is a page rather than only the button in
 * Settings. It describes the same operation `lib/db/account-deletion.ts`
 * performs — if that changes, so does this.
 */
export default function DeleteAccountPage() {
  return (
    <main className="main-container flex flex-col gap-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="title-text">Delete your account</h1>
        <p className="text-sm minor-text-theme-colors">
          Last updated {POLICY_UPDATED}
        </p>
      </div>

      <Section title="How">
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          <li>Sign in and open Settings.</li>
          <li>
            Go to the Account tab and choose <B>Delete account</B> at the
            bottom.
          </li>
          <li>
            Type the email address you signed in with to confirm. Deletion is
            immediate and cannot be undone.
          </li>
        </ol>
        <p>
          If you can no longer sign in, email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
            {CONTACT_EMAIL}
          </a>{' '}
          from the address on the account and we will delete it for you.
        </p>
      </Section>

      <Section title="What is deleted">
        <List
          items={[
            'Your email address, display name, and password.',
            'Your linked Google account, including any Drive access you granted.',
            'Your push notification subscriptions and your private calendar feed.',
            'Your personal notes.',
            <>
              Any band where you are the <B>only</B> owner — including that
              band&rsquo;s songs, audio, sheet music, setlists, events, and
              chat. This happens even if the band has other members, so hand
              over ownership first if the band should outlive your account.
            </>,
          ]}
        />
      </Section>

      <Section title="What remains">
        <p>
          Bands with another owner are left alone, apart from your own notes.
          Comments you wrote on shared songs, band chat messages, and entries in
          a song&rsquo;s activity history stay where they are, attributed to
          &ldquo;Deleted account&rdquo; — a band shouldn&rsquo;t lose the
          discussion about a song because one member left.
        </p>
        <p>
          What is kept carries nothing personal: an anonymous identifier and the
          date of deletion. Your email, name, password, and linked accounts are
          gone, so signing up again starts from scratch and is not connected to
          the old account.
        </p>
      </Section>

      <Section title="Downloaded copies">
        <p>
          Setlists you saved for offline use live on your own device. Deleting
          your account does not reach them — remove the offline copy in the app,
          or uninstall it, to clear them.
        </p>
      </Section>

      <Section title="More">
        <p>
          See the{' '}
          <Link href="/privacy" className="underline">
            privacy policy
          </Link>{' '}
          for what is collected in the first place.
        </p>
      </Section>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-medium">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
        {children}
      </div>
    </section>
  );
}

function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function B({ children }: { children: React.ReactNode }) {
  return <span className="font-medium">{children}</span>;
}
