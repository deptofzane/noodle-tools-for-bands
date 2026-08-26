import { Fragment } from 'react';
import { B, List, Section } from './legalSections';
import { CONTACT_EMAIL } from './legal';
import { MenuSectionLabel } from './ActionMenu';
import { AddToQueueIcon, EyeIcon, LinkIcon, PencilIcon } from './icons';
import { PlayIcon, ShuffleIcon } from './player/icons';

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
              In the Songs tab on the Audio page, there is a menu with upload
              music options. <B>Upload audio file(s)</B> creates a song from
              each recording you add — from Google Drive, Dropbox, or this
              device. <B>Create song without audio</B> starts a song from just a
              name.
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
              A setlist&rsquo;s <B>⋯</B> menu carries both icon rows — see{' '}
              <B>The ⋯ menu</B> below.
            </>,
            <>
              <B>Download</B> keeps a setlist&rsquo;s charts and audio on the
              device, so it works with no connection. Downloads are per-device.
            </>,
          ]}
        />
      </Section>

      <Section title="The ⋯ menu" level={level}>
        <p>
          Most things in Noodle carry a <B>⋯</B> menu. Actions that are
          variations on one another sit together as a row of icons rather than a
          stack of near-identical lines, under a label naming what they act on.
          A song&rsquo;s menu looks like this:
        </p>

        <MenuExample />

        <p>
          The top row is the thing itself; the row under it is playback, and
          only appears where there is something to play.
        </p>

        <List
          items={[
            <>
              <B>Eye</B> opens it, <B>pencil</B> opens it for editing, and{' '}
              <B>chain links</B> copies a link you can send to the band — a
              link, rather than a share sheet, because it&rsquo;s the address
              that travels.
            </>,
            <>
              <B>Play</B> starts the songs in order. <B>Crossed arrows</B> play
              the same songs once in a random order, without changing the saved
              order.
            </>,
            <>
              <B>List with a +</B> adds the songs to the end of whatever is
              already playing, instead of replacing it.
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

/**
 * An inert copy of a ⋯ menu, for the Help text to point at.
 *
 * Deliberately not `MenuIconRow`: that renders `role="menuitem"` buttons,
 * which outside a real menu would be focusable controls that do nothing and a
 * menu announced to screen readers that isn't one. This mirrors its look with
 * plain spans and is hidden from assistive tech altogether — the list under it
 * says the same thing in words, which is the version worth reading aloud.
 *
 * `MenuSectionLabel` is the real component, so the label can't drift from the
 * menus this is describing.
 */
function MenuExample() {
  const rows = [
    [
      <EyeIcon key="view" size={18} />,
      <PencilIcon key="edit" size={18} />,
      <LinkIcon key="share" size={18} />,
    ],
    [
      <PlayIcon key="play" size={18} />,
      <ShuffleIcon key="shuffle" size={18} />,
      <AddToQueueIcon key="queue" size={18} />,
    ],
  ];
  return (
    <div
      aria-hidden="true"
      className="my-1 w-full max-w-[14rem] select-none overflow-hidden rounded-md border border-neutral-200 bg-white py-1.5 shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
    >
      <MenuSectionLabel>Song</MenuSectionLabel>
      {rows.map((row, r) => (
        <div key={r} className="flex items-stretch">
          {row.map((icon, i) => (
            <Fragment key={i}>
              {i > 0 && (
                <span className="my-1 w-px shrink-0 bg-neutral-200 dark:bg-neutral-800" />
              )}
              <span className="flex flex-1 items-center justify-center px-4 py-1.5 text-neutral-700 dark:text-neutral-200">
                {icon}
              </span>
            </Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}
