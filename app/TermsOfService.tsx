import Link from 'next/link';
import { CONTACT_EMAIL } from './legal';
import { B, List, Section } from './legalSections';

/**
 * The terms of service, without a page around it — same arrangement as
 * `PrivacyPolicy`, so a standalone `/terms` route can be added later without
 * a second copy of the text.
 *
 * NOT reviewed by a lawyer. This is a plain-language description of how the
 * app is meant to be used, written to match what the code actually does; it
 * has not been checked against the requirements of any jurisdiction. Have it
 * reviewed before the Play listing goes out — see docs/session-notes.md.
 */
export function TermsOfService({ level = 2 }: { level?: 2 | 3 }) {
  return (
    <>
      <Section title="The short version" level={level}>
        <p>
          Noodle is a tool for bands to keep their audio, sheet music, notes,
          and schedule in one place. Your recordings and writing stay yours. Use
          it for material you have the right to use, don’t use it to harm the
          other people in your band, and understand that it is a small service
          offered as-is.
        </p>
      </Section>

      <Section title="Your account" level={level}>
        <List
          items={[
            <>
              You need an account to use Noodle, and you are responsible for
              what happens under it. Keep your sign-in details to yourself.
            </>,
            <>
              Give a real email address. It is how password resets, band
              invitations, and anything we have to tell you get to you.
            </>,
            <>
              One person per account. Sharing a single login across a band means
              notes, uploads, and chat are all credited to the same person,
              which defeats most of what the app is for.
            </>,
          ]}
        />
      </Section>

      <Section title="Your content stays yours" level={level}>
        <p>
          You keep every right you already had in what you upload — recordings,
          sheet music, notes, chat. Uploading something gives us permission to
          do only what running the service requires: store it, process it (for
          example, reading an audio file’s length), back it up, and show it to
          the members of the band you put it in. Nothing more. We don’t use your
          material to advertise, and we don’t give it to anyone else except the
          service providers named in the{' '}
          <Link href="/privacy" className="underline">
            privacy policy
          </Link>
          , each of which only receives what its job requires.
        </p>
      </Section>

      <Section title="What you upload has to be yours to upload" level={level}>
        <p>
          Bands work with other people’s music, so this one matters. Only upload
          audio, sheet music, or lyrics that you wrote, that you have permission
          to use, or that you are otherwise allowed to copy. A purchased chart
          usually does not come with the right to distribute it — putting it in
          a band everyone can read is distribution.
        </p>
        <p>
          If you believe something on Noodle infringes your copyright, write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
            {CONTACT_EMAIL}
          </a>{' '}
          with enough detail to identify the material and we will remove it.
        </p>
      </Section>

      <Section title="Bands are shared spaces" level={level}>
        <p>
          Anything you put in a band is visible to that band’s members, and they
          can act on it — edit a setlist, add a version of a song, delete
          something. A band’s owner can remove members and delete the band along
          with its contents. Choose who you invite accordingly; the app enforces
          who is in a band, not whether they behave well.
        </p>
      </Section>

      <Section title="Using it reasonably" level={level}>
        <List
          items={[
            <>
              <B>Don’t use it against other people.</B> No harassment,
              impersonation, or uploading material you know a bandmate does not
              want shared.
            </>,
            <>
              <B>Don’t use it to break the law</B>, and don’t upload anything
              illegal.
            </>,
            <>
              <B>Don’t attack the service.</B> No attempts to break into other
              accounts or bands, no scraping, no deliberately overloading it.
            </>,
            <>
              <B>It is for bands, not bulk storage.</B> Storage and upload sizes
              are limited, and those limits may change as the service finds its
              footing.
            </>,
          ]}
        />
      </Section>

      <Section title="Availability, and what we don’t promise" level={level}>
        <p>
          Noodle is provided as-is, with no warranty of any kind. It may be
          unavailable, may lose data, and may change or remove features. It is
          not a backup service — keep your own copies of recordings and charts
          that matter to you. Offline downloads live on your device and can be
          cleared by the browser or the operating system at any time.
        </p>
        <p>
          To the extent the law allows, we aren’t liable for indirect or
          consequential losses arising from your use of the service — including
          lost recordings, a setlist that didn’t load at a show, or a
          notification that didn’t arrive.
        </p>
      </Section>

      <Section title="Ending it" level={level}>
        <p>
          You can stop using Noodle whenever you like and delete your account
          from Settings → Account; see{' '}
          <Link href="/delete-account" className="underline">
            how to delete your account
          </Link>{' '}
          for what that removes. We may suspend or close an account that breaks
          these terms, or that puts the service or its other users at risk. If
          the service itself shuts down, we’ll give what notice we reasonably
          can so you can get your material out.
        </p>
      </Section>

      <Section title="Changes" level={level}>
        <p>
          These terms may change as the app does. The date at the top changes
          with them, and continuing to use Noodle after that means the new terms
          apply.
        </p>
      </Section>

      <Section title="Contact" level={level}>
        <p>
          Questions about these terms:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </>
  );
}
