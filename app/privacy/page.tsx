import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACT_EMAIL, POLICY_UPDATED } from '../legal';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'What Sidestage collects, why, and how to get rid of it.',
};

/**
 * Public privacy policy.
 *
 * Required twice over: the Play listing needs a reachable URL, and so does
 * Google OAuth verification. Signed out on purpose — a reviewer, or someone
 * deciding whether to sign up, has to be able to read it.
 *
 * Everything here describes what the code actually does. If a data flow
 * changes, this page changes with it.
 */
export default function PrivacyPage() {
  return (
    <main className="main-container flex flex-col gap-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="title-text">Privacy policy</h1>
        <p className="text-sm minor-text-theme-colors">
          Last updated {POLICY_UPDATED}
        </p>
      </div>

      <Section title="The short version">
        <p>
          Sidestage stores what a band needs to rehearse together: your account,
          the audio and sheet music you upload, and the notes you write about
          them. There is no advertising and no tracking, and nothing is sold or
          shared with anyone outside the services listed below.
        </p>
      </Section>

      <Section title="What we collect">
        <List
          items={[
            <>
              <B>Your account.</B> Your email address and display name. If you
              sign up with a password, a hash of it — never the password.
            </>,
            <>
              <B>Google sign-in.</B> If you sign in with Google, your Google
              account id and the email on it. If you connect Google Drive to
              import audio, we keep access and refresh tokens so imports work.
              Those tokens use the <Code>drive.file</Code> scope, which grants
              access only to the specific files you pick — never the rest of
              your Drive.
            </>,
            <>
              <B>What you put in.</B> Songs, audio files, sheet music, notes and
              comments, band chat, setlists, events, venues, and polls, along
              with who created them and when.
            </>,
            <>
              <B>Notifications.</B> If you turn on push notifications, the
              subscription your browser issues, plus a record of when you last
              read your feed so it can show what is new.
            </>,
          ]}
        />
      </Section>

      <Section title="What stays on your device">
        <p>
          Setlists you download for offline use — their audio and sheet music —
          are stored by your browser on your own device. They are not copied
          anywhere else, and removing the offline copy, or uninstalling the app,
          removes them.
        </p>
      </Section>

      <Section title="Who else touches it">
        <List
          items={[
            <>
              <B>Google.</B> Sign-in, and reading the Drive files you choose to
              import.
            </>,
            <>
              <B>Dropbox.</B> Only if you import audio from Dropbox, and only
              the files you pick.
            </>,
            <>
              <B>Cloudflare R2.</B> Stores uploaded audio and sheet music.
            </>,
            <>
              <B>Resend.</B> Sends transactional email — password resets and
              band invitations. Nothing else, and no marketing.
            </>,
            <>
              <B>Sentry.</B> Receives a report when something in the app fails,
              so it can be fixed. Reports carry the error and where it happened
              — not your account, your files, or anything you have written.
            </>,
          ]}
        />
        <p>
          Each receives only what its job requires. None of them is given your
          data for their own purposes.
        </p>
      </Section>

      <Section title="Who can see your content">
        <p>
          Songs, notes, chat, and setlists are visible to the members of the
          band they belong to, and to nobody else. Moving a song to another band
          changes who can see it. Bands are private; there is no public or
          discoverable content.
        </p>
      </Section>

      <Section title="Deleting your account">
        <p>
          You can delete your account at any time from Settings → Account, or
          see{' '}
          <Link href="/delete-account" className="underline">
            how to delete your account
          </Link>{' '}
          for the full detail of what is removed and what remains.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If this policy changes in a way that affects what we collect or who
          receives it, the date at the top changes and the change is described
          here.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy, or a request about your data:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
            {CONTACT_EMAIL}
          </a>
          .
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

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-neutral-100 px-1 py-0.5 text-[0.8125rem] dark:bg-neutral-900">
      {children}
    </code>
  );
}
