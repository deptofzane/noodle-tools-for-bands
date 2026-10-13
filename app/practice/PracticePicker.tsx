'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal } from '../Modal';
import { useTrackPending } from '../PendingActionProvider';
import { PillTabs } from '../PillTabs';
import { SongTitle } from '../SongTitle';
import { Spinner } from '../Spinner';
import { useToast } from '../ToastProvider';
import { useIsDesktop } from '../useIsDesktop';
import { useNavigate } from '../useNavigate';
import { ensureOk } from '@/lib/api';
import { formatDateRange, formatDateShort, formatTime12h } from '@/lib/format';
import { practiceHref, songHref } from '@/lib/routes';
import type {
  PickerEvent,
  PickerSetlist,
  PickerSong,
  PracticePicker as PickerData,
} from '@/lib/db/practice-picker';
import {
  loadPickerTab,
  loadRecent,
  resolveRecent,
  savePickerTab,
  type PickerTab,
  type RecentRef,
} from '@/lib/practice-recent';

const TABS = [
  { key: 'recent', label: 'Recent' },
  { key: 'songs', label: 'Songs' },
  { key: 'setlists', label: 'Setlists' },
  { key: 'events', label: 'Events' },
];

type Load =
  | { status: 'loading' }
  | { status: 'offline' }
  | { status: 'error' }
  | { status: 'ready'; data: PickerData };

/**
 * The Practice screen's "Select": jump to another song, setlist or upcoming
 * event of this band. Recent, then one pill per kind; typing a search shows
 * matches from all three kinds at once, and leaves the pills unselected while
 * it does. Choosing a row is an ordinary navigation, so Back returns here.
 * Songs and search results also offer starting a new song from just a name.
 *
 * A choice doesn't close the picker: it stays up, the chosen row spinning,
 * until the new screen arrives — closing at once would show the old screen
 * for however long the next one takes to load.
 */
export function PracticePicker({
  bandId,
  current,
  onClose,
}: {
  bandId: string;
  /** What this screen is showing, marked in the lists. */
  current: RecentRef | null;
  onClose: () => void;
}) {
  // Mounted only once opened, so localStorage is there to read now.
  const [tab, setTab] = useState<PickerTab>(loadPickerTab);
  const [query, setQuery] = useState('');
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  // The href of the row chosen, while its navigation is in flight.
  const [pending, setPending] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const isDesktop = useIsDesktop();

  // Close once the URL is no longer the one this opened on. Most choices
  // replace the page, and this with it; one that only changes the query
  // string (setlist to setlist) leaves the picker mounted, which is what
  // this is for.
  const url = `${usePathname()}?${useSearchParams()}`;
  const openedOn = useRef(url);
  useEffect(() => {
    if (url !== openedOn.current) onClose();
  }, [url, onClose]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(`/api/bands/${bandId}/practice-picker`, {
          cache: 'no-store',
        });
        if (cancelled) return;
        if (!r.ok) return setLoad({ status: 'error' });
        setLoad({ status: 'ready', data: (await r.json()) as PickerData });
      } catch {
        // A failed fetch is almost always no connection; say so plainly
        // rather than showing an empty list that looks like "no songs".
        if (!cancelled) {
          setLoad({ status: navigator.onLine ? 'error' : 'offline' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bandId]);

  // Desktop only: on a phone, focusing the field raises the keyboard over
  // the very list being opened to browse.
  useEffect(() => {
    if (isDesktop) searchRef.current?.focus();
  }, [isDesktop]);

  const chooseTab = (key: string) => {
    setQuery('');
    setTab(key as PickerTab);
    savePickerTab(key as PickerTab);
  };

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  return (
    <Modal onClose={onClose} labelledBy="practice-picker-title" size="sheet">
      <div className="flex items-center justify-between gap-2">
        <h2 id="practice-picker-title" className="text-base font-semibold">
          Select
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="btn-ghost px-2"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <div className="mt-3 flex justify-center">
        <PillTabs
          label="What to practise"
          idPrefix="practice-picker-tab"
          controls="practice-picker-panel"
          tabs={TABS}
          // No pill while searching: the results are from all of them.
          activeKey={searching ? '' : tab}
          onChange={chooseTab}
        />
      </div>

      <input
        ref={searchRef}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search songs, setlists and events"
        aria-label="Search songs, setlists and events"
        className="mt-3 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      <div
        id="practice-picker-panel"
        role="tabpanel"
        aria-labelledby={searching ? undefined : `practice-picker-tab-${tab}`}
        className={`mt-3 min-h-0 flex-1 overflow-y-auto${
          pending ? ' pointer-events-none' : ''
        }`}
      >
        {load.status === 'loading' && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}
        {load.status === 'offline' && (
          <Empty>You’re offline — the list needs a connection.</Empty>
        )}
        {load.status === 'error' && (
          <Empty>Couldn’t load the list. Try again in a moment.</Empty>
        )}
        {load.status === 'ready' &&
          (searching ? (
            <SearchResults
              data={load.data}
              q={q}
              typed={query.trim()}
              bandId={bandId}
              current={current}
              pending={pending}
              onChoose={setPending}
              onClose={onClose}
            />
          ) : (
            <TabList
              tab={tab}
              data={load.data}
              bandId={bandId}
              current={current}
              pending={pending}
              onChoose={setPending}
              onClose={onClose}
            />
          ))}
      </div>
    </Modal>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="py-8 text-center text-sm minor-text-theme-colors">
      {children}
    </p>
  );
}

type RowProps = {
  current: RecentRef | null;
  pending: string | null;
  onChoose: (href: string) => void;
  onClose: () => void;
};

function TabList({
  tab,
  data,
  bandId,
  ...row
}: RowProps & { tab: PickerTab; data: PickerData; bandId: string }) {
  if (tab === 'recent') {
    const recent = resolveRecent(loadRecent(bandId), data);
    if (recent.length === 0) {
      return (
        <Empty>
          Songs, setlists and events you practise will show up here.
        </Empty>
      );
    }
    return (
      <ul className="divide-y divide-line">
        {recent.map((r) =>
          r.kind === 'song' ? (
            <SongRow key={`song-${r.item.id}`} song={r.item} kind {...row} />
          ) : r.kind === 'setlist' ? (
            <SetlistRow
              key={`setlist-${r.item.id}`}
              setlist={r.item}
              kind
              {...row}
            />
          ) : (
            <EventRow key={`event-${r.item.id}`} event={r.item} kind {...row} />
          ),
        )}
      </ul>
    );
  }
  if (tab === 'songs') {
    return (
      <ul className="divide-y divide-line">
        <NewSong bandId={bandId} />
        {data.songs.map((s) => (
          <SongRow key={s.id} song={s} {...row} />
        ))}
      </ul>
    );
  }
  if (tab === 'setlists') {
    return (
      <ul className="divide-y divide-line">
        <Row href={`/bands/${bandId}/setlists/new`} isCurrent={false} {...row}>
          <span className="font-medium">+ New setlist</span>
        </Row>
        {data.setlists.map((s) => (
          <SetlistRow key={s.id} setlist={s} {...row} />
        ))}
      </ul>
    );
  }
  return data.events.length > 0 ? (
    <ul className="divide-y divide-line">
      {data.events.map((e) => (
        <EventRow key={e.id} event={e} {...row} />
      ))}
    </ul>
  ) : (
    <Empty>No upcoming events with a setlist.</Empty>
  );
}

function SearchResults({
  data,
  q,
  typed,
  bandId,
  ...row
}: RowProps & {
  data: PickerData;
  q: string;
  /** The search as typed, case kept: the name a new song is offered with. */
  typed: string;
  bandId: string;
}) {
  const has = (...fields: (string | null)[]) =>
    fields.some((f) => f?.toLowerCase().includes(q));
  const songs = data.songs.filter((s) => has(s.title, s.originalArtist));
  const setlists = data.setlists.filter((s) => has(s.name));
  const events = data.events.filter((e) =>
    has(e.title, e.venueName, e.setlistName),
  );

  const group = (title: string, items: ReactNode[]) =>
    items.length > 0 && (
      <section className="mb-3">
        <h3 className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide minor-text-theme-colors">
          {title}
        </h3>
        <ul className="divide-y divide-line">{items}</ul>
      </section>
    );
  return (
    <>
      {songs.length + setlists.length + events.length === 0 && (
        <Empty>Nothing matches “{q}”.</Empty>
      )}
      {group(
        'Songs',
        songs.map((s) => <SongRow key={s.id} song={s} {...row} />),
      )}
      {group(
        'Setlists',
        setlists.map((s) => <SetlistRow key={s.id} setlist={s} {...row} />),
      )}
      {group(
        'Events',
        events.map((e) => <EventRow key={e.id} event={e} {...row} />),
      )}
      <ul className="divide-y divide-line">
        <NewSong bandId={bandId} suggested={typed} />
      </ul>
    </>
  );
}

const ROW_CLS =
  'flex w-full items-center gap-3 px-1 py-2.5 text-left text-sm hover:bg-surface-hover';

/**
 * Start a song from just a name, then go practise it. The row turns into the
 * name field in place rather than opening a modal over this one. `suggested`
 * is the search as typed, offered as the name. Once created it stays on
 * "Creating…" until the song's screen replaces this one.
 */
function NewSong({
  bandId,
  suggested,
}: {
  bandId: string;
  suggested?: string;
}) {
  // Null until the row is chosen.
  const [name, setName] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const go = useNavigate();
  const showToast = useToast();
  const trackPending = useTrackPending();

  const create = async () => {
    const trimmed = name?.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const id = await trackPending(async () => {
        const r = await fetch(`/api/bands/${bandId}/conversations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmed }),
        });
        await ensureOk(r);
        const d = (await r.json()) as { conversation: { id: string } };
        return d.conversation.id;
      });
      go(songHref(id));
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
      setCreating(false);
    }
  };

  if (name === null) {
    return (
      <li>
        <button
          type="button"
          onClick={() => setName(suggested ?? '')}
          className={ROW_CLS}
        >
          <span className="min-w-0 flex-1 truncate font-medium">
            {suggested ? `+ Create “${suggested}”` : '+ New song'}
          </span>
        </button>
      </li>
    );
  }
  return (
    <li>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
        className="flex items-center gap-2 px-1 py-2"
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Song name"
          aria-label="Song name"
          autoFocus
          disabled={creating}
          className="min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="btn-primary"
        >
          {creating ? 'Creating…' : 'Create'}
        </button>
        <button
          type="button"
          onClick={() => setName(null)}
          disabled={creating}
          className="btn-outline"
        >
          Cancel
        </button>
      </form>
    </li>
  );
}

/**
 * One choosable row. The current item closes the picker rather than
 * navigating to where it already is. `kind` labels the row with what it is,
 * for Recent, where the three kinds share one list.
 */
function Row({
  href,
  isCurrent,
  kind,
  pending,
  onChoose,
  onClose,
  children,
}: Omit<RowProps, 'current'> & {
  href: string;
  isCurrent: boolean;
  kind?: string;
  children: ReactNode;
}) {
  const waiting = pending === href;
  const body = (
    <>
      <span className="min-w-0 flex-1">{children}</span>
      {kind && (
        <span className="shrink-0 text-[0.6875rem] minor-text-theme-colors">
          {kind}
        </span>
      )}
      {isCurrent && (
        <span className="shrink-0 rounded-full bg-accent-fill-strong px-2 py-0.5 text-[0.625rem] font-medium text-accent-strong">
          Current
        </span>
      )}
      {waiting && <Spinner size="sm" label="Opening" />}
    </>
  );
  return (
    <li>
      {isCurrent ? (
        <button
          type="button"
          onClick={onClose}
          aria-current="page"
          className={ROW_CLS}
        >
          {body}
        </button>
      ) : (
        <Link
          href={href}
          onClick={(e) => {
            // A modified click opens a tab; this one isn't going anywhere.
            if (!e.metaKey && !e.ctrlKey && !e.shiftKey) onChoose(href);
          }}
          className={`${ROW_CLS}${pending && !waiting ? ' opacity-50' : ''}`}
        >
          {body}
        </Link>
      )}
    </li>
  );
}

const isCurrent = (
  current: RecentRef | null,
  kind: RecentRef['kind'],
  id: string,
) => current?.kind === kind && current.id === id;

function SongRow({
  song,
  kind,
  current,
  ...row
}: RowProps & { song: PickerSong; kind?: boolean }) {
  return (
    <Row
      href={songHref(song.id)}
      isCurrent={isCurrent(current, 'song', song.id)}
      kind={kind ? 'Song' : undefined}
      {...row}
    >
      <SongTitle title={song.title} originalArtist={song.originalArtist} />
    </Row>
  );
}

function SetlistRow({
  setlist,
  kind,
  current,
  ...row
}: RowProps & { setlist: PickerSetlist; kind?: boolean }) {
  return (
    <Row
      href={practiceHref(setlist.id)}
      isCurrent={isCurrent(current, 'setlist', setlist.id)}
      kind={kind ? 'Setlist' : undefined}
      {...row}
    >
      <span className="block truncate">{setlist.name}</span>
      <span className="block truncate text-xs minor-text-theme-colors">
        {setlist.songCount === 1 ? '1 song' : `${setlist.songCount} songs`}
      </span>
    </Row>
  );
}

function EventRow({
  event,
  kind,
  current,
  ...row
}: RowProps & { event: PickerEvent; kind?: boolean }) {
  const when = [
    formatDateRange(event.date, event.endDate, formatDateShort),
    event.time && formatTime12h(event.time),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Row
      href={practiceHref(event.setlistId, undefined, event.id)}
      isCurrent={isCurrent(current, 'event', event.id)}
      kind={kind ? 'Event' : undefined}
      {...row}
    >
      <span className="block truncate">{event.title}</span>
      <span className="block truncate text-xs minor-text-theme-colors">
        {[when, event.venueName, event.setlistName].filter(Boolean).join(' · ')}
      </span>
    </Row>
  );
}
