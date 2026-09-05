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
          the email address they use to sign in or creating and an invite link.
          Membership is what grants access to that band&rsquo;s audio, charts,
          notes, and dates. Nothing is public.
        </p>
        <p>
          The band you&rsquo;re currently viewing is shown in the top left
          corner of the screen and in the ☰ menu under <b>Band</b>. Clicking
          the <b>Band</b> option in the ☰ menu will show all the groups
          you&rsquo;re currently a part of.
        </p>
      </Section>

      <Section title="The ⋯ menu" level={level}>
        <p>
          Most things in Noodle carry a <b>⋯</b> menu. Related actions sit
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
              <b>Top row</b>
            </>,
            <span key="view" className="flex gap-1">
              The <b>eye</b> icon <EyeIcon size={18} /> will view the item.
            </span>,
            <span key="edit" className="flex gap-1">
              The pencil icon <PencilIcon size={18} /> will go to the edit
              screen.
            </span>,
            <span key="share" className="flex gap-1">
              The chain links icon <LinkIcon size={18} /> will copy a link to that
              asset.
            </span>,
          ]}
        />
        <span>
          <b>
            All links in Noodle can be copied and sent to other people, but they
            may need to have an account or be a band member depending on the
            page.
          </b>
        </span>
        <List
          items={[
            <>
              <b>Second row (audio options)</b>
            </>,
            <span key="play" className="flex gap-1">
              Play <PlayIcon size={18} /> starts the songs in order.
            </span>,
            <span key="shuffle" className="flex gap-1">
              The crossed arrows <ShuffleIcon size={18} /> will shuffle the songs.
            </span>,
            <span key="queue" className="flex gap-1">
              The list add icon <AddToQueueIcon size={18} /> adds the songs to the player queue
              after whatever is currently playing.
            </span>,
          ]}
        />
      </Section>

      <Section title="Audio and songs" level={level}>
        <List
          items={[
            <>
              In the <b>Songs</b> tab on the <b>Audio</b> page, to the right of
              the Song/Album toggle is a menu with upload music options.{' '}
              <b>Upload audio file(s)</b> creates a song from each recording you
              add — from Google Drive, Dropbox, or this device.{' '}
              <b>Create song without audio</b> starts a song from just a name.
            </>,
            <>
              A song can hold several versions of its audio and its sheet music.
              A default is set, but all versions of both sheet music and audio
              can be accessed from the <b>View song/Practice</b> page. New audio
              and sheet music can be added in the <b>Edit song</b> page.
            </>,
            <>
              At the bottom of the <b>View song/Practice</b>. page is the
              comments section. Comments on a song are time stamped with the
              point in the recording you were at. When another user clicks the
              time stamp they will be jumped to that point in the song. Use an{' '}
              <b>@</b> sign before a username to notify other band members.
            </>,
          ]}
        />
      </Section>

      <Section title="Setlists, Practice and Live" level={level}>
        <List
          items={[
            <>
              <b>Setlists</b> can be created in the <b>Setlist</b> tab on the
              Audio page. Songs can be added, removed, reordered, and other
              markers for set break, encore, or whatever you like can be added.
            </>,
            <>
              The <b>View song</b> page is also the <b>Practice</b> page, and
              will show sheet music and audio playback with tools to slow down .{' '}
              <b>Live</b> is the stripped-back version for a stage showing only
              sheet music.
            </>,
            <>
              A setlist&rsquo;s <b>⋯</b> menu carries both icon rows — see{' '}
              <b>The ⋯ menu</b> near the top of this page.
            </>,
            <>
              <b>Download for offline</b> keeps a setlist&rsquo;s charts and
              audio on the device, and will work when internet is spotty or
              nonexistent. Downloads are per-device. When new audio or sheet
              music is added, or the setlist is modified, an indicator will show
              signaling it&rsquo;s out of sync. Setlists can be updated by
              clicking <b>Update offline copy</b> in the setlist menu.
            </>,
          ]}
        />
      </Section>

      <Section title="Notifications" level={level}>
        <p>
          Activity in your bands shows on the <b>Home</b> screen. For a push to
          reach your phone when the app is closed, turn it on per-device in{' '}
          <b>Settings → Notifications</b>, where you can also mute the kinds you
          don&rsquo;t want. On iPhone and iPad this only works once Noodle has
          been added to the Home Screen and opened from there.
        </p>
      </Section>

      <Section title="Installing Noodle" level={level}>
        <p>
          Noodle is a PWA (progressive web application), and can be installed on
          a phone or tablet home screen. On iPhone/iPad use{' '}
          <b>Share → Add to Home Screen</b>. On Android you can install it from
          the browser&rsquo;s options. For Android, we recommend using Chrome to
          install as it installs an independent version of the app rather than
          Firefox which makes a shortcut to the browser and will lack some
          features.
        </p>
      </Section>

      <Section title="Still stuck?" level={level}>
        <p>
          Write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
            {CONTACT_EMAIL}
          </a>
          . This is a pretty brief help page, and I&rsquo;m working on expanding
          it. In the meantime, if you have questions don&rsquo;t hesitate to
          reach out. Also, suggestions for improvement or letting me know about
          any bugs you run into would be appreciated.
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
      className="my-1 w-full max-w-[14rem] select-none overflow-hidden rounded-md border border-line bg-surface py-1.5 shadow-lg"
    >
      <MenuSectionLabel>Song</MenuSectionLabel>
      {rows.map((row, r) => (
        <div key={r} className="flex items-stretch">
          {row.map((icon, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="my-1 w-px shrink-0 bg-fill-strong" />}
              <span className="flex flex-1 items-center justify-center px-4 py-1.5 text-fg-body">
                {icon}
              </span>
            </Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}
