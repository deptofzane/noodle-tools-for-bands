'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal } from '../Modal';
import { PillTabs } from '../PillTabs';
import { SongTitle } from '../SongTitle';
import { Spinner } from '../Spinner';
import { useIsDesktop } from '../useIsDesktop';
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
  const searchRef = useRef<HTMLInputElement>(null);
  const isDesktop = useIsDesktop();

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
        className="mt-3 min-h-0 flex-1 overflow-y-auto"
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
              current={current}
              onClose={onClose}
            />
          ) : (
            <TabList
              tab={tab}
              data={load.data}
              bandId={bandId}
              current={current}
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

type RowProps = { current: RecentRef | null; onClose: () => void };

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
  const [items, empty] =
    tab === 'songs'
      ? [
          data.songs.map((s) => <SongRow key={s.id} song={s} {...row} />),
          'No songs yet.',
        ]
      : tab === 'setlists'
        ? [
            data.setlists.map((s) => (
              <SetlistRow key={s.id} setlist={s} {...row} />
            )),
            'No setlists with songs yet.',
          ]
        : [
            data.events.map((e) => <EventRow key={e.id} event={e} {...row} />),
            'No upcoming events with a setlist.',
          ];
  return items.length > 0 ? (
    <ul className="divide-y divide-line">{items}</ul>
  ) : (
    <Empty>{empty}</Empty>
  );
}

function SearchResults({
  data,
  q,
  ...row
}: RowProps & { data: PickerData; q: string }) {
  const has = (...fields: (string | null)[]) =>
    fields.some((f) => f?.toLowerCase().includes(q));
  const songs = data.songs.filter((s) => has(s.title, s.originalArtist));
  const setlists = data.setlists.filter((s) => has(s.name));
  const events = data.events.filter((e) =>
    has(e.title, e.venueName, e.setlistName),
  );

  if (songs.length + setlists.length + events.length === 0) {
    return <Empty>Nothing matches “{q}”.</Empty>;
  }
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
    </>
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
  onClose,
  children,
}: {
  href: string;
  isCurrent: boolean;
  kind?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const cls =
    'flex w-full items-center gap-3 px-1 py-2.5 text-left text-sm hover:bg-surface-hover';
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
    </>
  );
  return (
    <li>
      {isCurrent ? (
        <button
          type="button"
          onClick={onClose}
          aria-current="page"
          className={cls}
        >
          {body}
        </button>
      ) : (
        <Link href={href} onClick={onClose} className={cls}>
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
  onClose,
}: RowProps & { song: PickerSong; kind?: boolean }) {
  return (
    <Row
      href={songHref(song.id)}
      isCurrent={isCurrent(current, 'song', song.id)}
      kind={kind ? 'Song' : undefined}
      onClose={onClose}
    >
      <SongTitle title={song.title} originalArtist={song.originalArtist} />
    </Row>
  );
}

function SetlistRow({
  setlist,
  kind,
  current,
  onClose,
}: RowProps & { setlist: PickerSetlist; kind?: boolean }) {
  return (
    <Row
      href={practiceHref(setlist.id)}
      isCurrent={isCurrent(current, 'setlist', setlist.id)}
      kind={kind ? 'Setlist' : undefined}
      onClose={onClose}
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
  onClose,
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
      onClose={onClose}
    >
      <span className="block truncate">{event.title}</span>
      <span className="block truncate text-xs minor-text-theme-colors">
        {[when, event.venueName, event.setlistName].filter(Boolean).join(' · ')}
      </span>
    </Row>
  );
}
