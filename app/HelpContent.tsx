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

      <Section title="The ⋯ menu" level={level}>
        <p>
          Most things in Noodle carry a <B>⋯</B> menu. Related actions sit
          together as a row of icons under a label naming what they act on. As
          an example, a song&rsquo;s menu looks like this:
        </p>
        <span className="flex justify-center">
          <MenuExample />
        </span>

        <p>
          The top row is the View/Edit/Share row, while the second row is audio
          options for Play/Shuffle/Add to play queue. View/Edit/Share appear on
          most all items in Noodle, while audio options will only appear where
          there is something to play.
        </p>

        <List
          items={[
            <>
              <B>Top row</B>
            </>,
            <>
              The <B>Eye</B> icon (eyecon?) will view the item, the{' '}
              <B>pencil</B> will go to the edit screen, and <B>chain links</B>{' '}
              copies a link you can send to the band — a link, rather than a
              share sheet, because it&rsquo;s the address that travels. All
              links in Noodle can be copied and sent to other people, but they
              may need to have an account or be a band member depending on the
              page.
            </>,
            <>
              <B>Second row (audio options)</B>
            </>,
            <>
              <B>Play</B> starts the songs in order. <B>Crossed arrows</B> will
              shuffle the song, without changing the saved order.
            </>,
            <>
              <B>List with a +</B> adds the songs to the player queue after
              whatever is currently playing.
            </>,
          ]}
        />
      </Section>

      <Section title="Audio and songs" level={level}>
        <List
          items={[
            <>
              In the Songs tab on the Audio page, to the right of the Song/Album
              toggle is a menu with upload music options.{' '}
              <B>Upload audio file(s)</B> creates a song from each recording you
              add — from Google Drive, Dropbox, or this device.{' '}
              <B>Create song without audio</B> starts a song from just a name.
            </>,
            <>
              A song can hold several <B>versions</B> of its audio and its sheet
              music. A default is set, but all versions of both sheet music and
              audio can be accessed from the View song page.
            </>,
            <>
              At the bottom of the View song page is the comments section.
              Comments on a song are time stamped with the point in the
              recording you were at. When another user clicks the time stamp
              they will be jumped to that point in the song. Use an <B>@</B>{' '}
              sign before a username to notify other band members.
            </>,
          ]}
        />
      </Section>

      <Section title="Setlists, Practice and Live" level={level}>
        <List
          items={[
            <>
              <B>Setlists</B> can be created in the Setlist tab on the Audio
              page. Songs can be added, removed, reordered, and other markers
              for set break, encore, or whatever you like can be added.
            </>,
            <>
              The View song page is also the <B>Practice</B> page, and will show
              sheet music and audio playback with tools to slow down .{' '}
              <B>Live</B> is the stripped-back version for a stage.
            </>,
            <>
              A setlist&rsquo;s <B>⋯</B> menu carries both icon rows — see{' '}
              <B>The ⋯ menu</B> below.
            </>,
            <>
              <B>Download for offline</B> keeps a setlist&rsquo;s charts and
              audio on the device, and will work when internet is spotty or
              nonexistent. Downloads are per-device. When new audio or sheet
              music is added, or the setlist is modified an indicator to update
              the setlist will show. Setlists can be updated by clicking
              <B>Update offline copy</B> in the setlist menu.
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
          Noodle is a PWA (progressive web application), and can be installed on
          a phone or tablet home screen. On iPhone/iPad use{' '}
          <B>Share → Add to Home Screen</B>. On Android you can install it from 
          the browser's options. For Android, we recommend using Chrome to install 
          as it installs an independent version of the app rather than Firefox which 
          makes a shortcut to the browser and will lack some features.
        </p>
      </Section>

      <Section title="Still stuck?" level={level}>
        <p>
          Write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
            {CONTACT_EMAIL}
          </a>
          . This is a pretty brief help page, and I'm working on expanding it. In the
          meantime, if you have questions don't hesitate to reach out.  Also, suggestions
          for improvement or letting me know about any bugs you run into would be appreciated.
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
