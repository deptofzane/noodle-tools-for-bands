import Link from 'next/link';
import { CONTACT_EMAIL } from './legal';
import { B, Code, List, Section } from './legalSections';

/**
 * The privacy policy itself, without a page around it, so `/privacy` and the
 * About page show one text rather than two that can drift.
 *
 * Everything here describes what the code actually does. If a data flow
 * changes, this changes with it — and `POLICY_UPDATED` in `legal.ts` moves.
 */
export function PrivacyPolicy({ level = 2 }: { level?: 2 | 3 }) {
  return (
    <>
      <Section title="The short version" level={level}>
        <p>
          Noodle stores what a band needs to rehearse together: your account,
          the audio and sheet music you upload, and the notes you write about
          them. There is no advertising and no tracking, and nothing is sold or
          shared with anyone outside the services listed below.
        </p>
      </Section>

      <Section title="What we collect" level={level}>
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

      <Section title="What stays on your device" level={level}>
        <p>
          Setlists you download for offline use — their audio and sheet music —
          are stored by your browser on your own device. They are not copied
          anywhere else, and removing the offline copy, or uninstalling the app,
          removes them.
        </p>
      </Section>

      <Section title="Who else touches it" level={level}>
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

      <Section title="Who can see your content" level={level}>
        <p>
          Songs, notes, chat, and setlists are visible to the members of the
          band they belong to, and to nobody else. Moving a song to another band
          changes who can see it. Bands are private; there is no public or
          discoverable content.
        </p>
      </Section>

      <Section title="Deleting your account" level={level}>
        <p>
          You can delete your account at any time from Settings → Account, or
          see{' '}
          <Link href="/delete-account" className="underline">
            how to delete your account
          </Link>{' '}
          for the full detail of what is removed and what remains.
        </p>
      </Section>

      <Section title="Changes" level={level}>
        <p>
          If this policy changes in a way that affects what we collect or who
          receives it, the date at the top changes and the change is described
          here.
        </p>
      </Section>

      <Section title="Contact" level={level}>
        <p>
          Questions about this policy, or a request about your data:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </>
  );
}
