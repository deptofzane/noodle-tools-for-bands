import { B, List, Section } from './legalSections';
import { CONTACT_EMAIL } from './legal';

/**
 * The help text itself, with no opinion about how it's presented.
 *
 * Rendered in two places — the `/help` page and the dialog the ☰ menu opens —
 * for the same reason the policy and terms are: one text, two ways to reach
 * it. `level` drops the headings a step when they sit under a heading the
 * surrounding surface already supplied.
 *
 * Deliberately a starting point: the sections below are the shape, not the
 * final wording.
 */
export function HelpContent({ level = 2 }: { level?: 2 | 3 }) {
  return (
    <>
      <Section title="Bands" level={level}>
        <p>
          Everything in Noodle belongs to a band. Create one, then add people by
          the email address they sign in with — membership is what grants access
          to that band&rsquo;s audio, charts, notes, and dates. Nothing is
          public. The band you&rsquo;re currently in is shown in the ☰ menu
          under <B>Band</B>.
        </p>
      </Section>

      <Section title="Audio and songs" level={level}>
        <List
          items={[
            <>
              <B>Upload audio file(s)</B> creates a song from each recording you
              add — from Google Drive, Dropbox, or this device.
            </>,
            <>
              <B>Create song without audio</B> starts a song from just a name.
            </>,
            <>
              A song can hold several <B>versions</B> of its audio and its sheet
              music. One of each is the default; the rest stay available.
            </>,
            <>
              Comments on a song are stamped with the point in the recording you
              were at, so clicking one jumps the player there. Mention someone
              with <B>@</B> to notify them.
            </>,
          ]}
        />
      </Section>

      <Section title="Setlists, Practice and Live" level={level}>
        <List
          items={[
            <>
              A <B>setlist</B> is an ordered list of songs, with set breaks if
              you want them.
            </>,
            <>
              <B>Practice</B> shows each chart with playback, speed control and
              skip. <B>Live</B> is the stripped-back version for a stage.
            </>,
            <>
              The <B>⋯</B> menu on a setlist opens with two rows of icons. The
              first is playback: <B>▶</B> plays the set in order, the crossed
              arrows play the same songs in a random order once without changing
              the set itself, and the list with a <B>+</B> adds them to the end
              of whatever is already playing instead of replacing it.
            </>,
            <>
              The second row is the setlist: an <B>eye</B> to open it, a{' '}
              <B>pencil</B> to change it, and <B>chain links</B> to copy a link
              you can send to the band.
            </>,
            <>
              <B>Download</B> keeps a setlist&rsquo;s charts and audio on the
              device, so it works with no connection. Downloads are per-device.
            </>,
          ]}
        />
      </Section>

      <Section title="Notifications" level={level}>
        <p>
          Activity in your bands shows on the Home screen. For a push to reach
          your phone when the app is closed, turn it on per-device in{' '}
          <B>Settings → Notifications</B>, where you can also mute the kinds you
          don&rsquo;t want. On iPhone and iPad this only works once Noodle has
          been added to the Home Screen and opened from there.
        </p>
      </Section>

      <Section title="Installing Noodle" level={level}>
        <p>
          Noodle installs to a phone or tablet home screen and runs without
          browser chrome. On iPhone/iPad use <B>Share → Add to Home Screen</B>;
          on Android your browser will offer to install it.
        </p>
      </Section>

      <Section title="Still stuck?" level={level}>
        <p>
          Write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
            {CONTACT_EMAIL}
          </a>
          . Say what you were doing and what happened instead — it saves a round
          trip.
        </p>
      </Section>
    </>
  );
}
