'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BandFile } from '@/lib/db/song-files';
import { BAND_STORAGE_LIMIT_BYTES, usageLevel } from '@/lib/storage';
import { formatBytes } from '@/lib/format';
import { LoadingBlock } from '../../../Spinner';
import { TabStrip } from '../../../TabStrip';
import { useToast } from '../../../ToastProvider';
import { DownloadIcon } from '../../../icons';
import { DeleteFilesDialog } from './DeleteFilesDialog';

type Usage = { bytes: number; files: number };
type Tab = 'audio' | 'sheet_music' | 'all';
type SortKey = 'date' | 'name' | 'song' | 'size' | 'status';

const TABS: { id: Tab; label: string }[] = [
  { id: 'audio', label: 'Audio files' },
  { id: 'sheet_music', label: 'Sheet music' },
  { id: 'all', label: 'All' },
];

/** Where the bytes come from — `?download=1` makes the server say `attachment`. */
function downloadHref(file: BandFile): string {
  return `/api/conversations/${file.conversationId}/files/${file.kind}?version=${file.id}&download=1`;
}

export function FileManagerClient({ bandId }: { bandId: string }) {
  const showToast = useToast();
  const [files, setFiles] = useState<BandFile[] | null>(null);
  const [usage, setUsage] = useState<Usage>({ bytes: 0, files: 0 });
  const [canDelete, setCanDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'date',
    dir: 'desc',
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** The selection captured when Delete was pressed; `null` when no dialog
      is open. The dialog owns which of them are still going. */
  const [pending, setPending] = useState<BandFile[] | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/bands/${bandId}/files`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load this band’s files.');
        return res.json();
      })
      .then((data) => {
        if (!live) return;
        setFiles(data.files);
        setUsage(data.usage);
        setCanDelete(Boolean(data.canDelete));
      })
      .catch((err: Error) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, [bandId]);

  // Search and tab narrow the set; sorting orders what's left.
  const visible = useMemo(() => {
    if (!files) return [];
    const needle = query.trim().toLowerCase();
    const rows = files.filter(
      (f) =>
        (tab === 'all' || f.kind === tab) &&
        (needle === '' ||
          f.fileName.toLowerCase().includes(needle) ||
          f.songName.toLowerCase().includes(needle) ||
          (f.label ?? '').toLowerCase().includes(needle)),
    );
    const sign = sort.dir === 'asc' ? 1 : -1;
    return rows.sort((a, b) => {
      switch (sort.key) {
        case 'name':
          return sign * a.fileName.localeCompare(b.fileName);
        case 'song':
          return sign * a.songName.localeCompare(b.songName);
        case 'size':
          return sign * (a.sizeBytes - b.sizeBytes);
        case 'status':
          return sign * (Number(a.songArchived) - Number(b.songArchived));
        default:
          return (
            sign *
            (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
          );
      }
    });
  }, [files, tab, query, sort]);

  /*
   * Selection survives tab and search changes — someone can pick a few audio
   * files, switch to sheet music, pick more, and delete them together. The
   * count below the table is what tells them the hidden ones are still held.
   */
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const visibleIds = visible.map((f) => f.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (allVisibleSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  const sortBy = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : // Dates read newest-first; everything else reads A–Z / smallest-first.
          { key, dir: key === 'date' ? 'desc' : 'asc' },
    );

  if (error) {
    return (
      <p className="rounded-md border border-danger-line bg-danger-fill px-3 py-2 text-sm text-danger-strong">
        {error}
      </p>
    );
  }
  if (!files) return <LoadingBlock />;

  const level = usageLevel(usage.bytes);
  const pct = Math.min(100, (usage.bytes / BAND_STORAGE_LIMIT_BYTES) * 100);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="title-text">File management</h1>

      <section
        aria-label="Storage used"
        className="rounded-md border border-line bg-surface p-3"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm">
            <span className="font-medium">{formatBytes(usage.bytes)}</span> of{' '}
            {formatBytes(BAND_STORAGE_LIMIT_BYTES)} used
          </p>
          <p className="text-sm minor-text-theme-colors">
            {usage.files} file{usage.files === 1 ? '' : 's'}
          </p>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          aria-label="Storage used"
          className="mt-2 h-2 overflow-hidden rounded-full bg-surface-soft"
        >
          <div
            style={{ width: `${pct}%` }}
            className={
              'h-full rounded-full transition-[width] ' +
              (level === 'critical'
                ? 'bg-danger-strong'
                : level === 'warn'
                  ? 'bg-warn'
                  : 'bg-blue-600')
            }
          />
        </div>
        {level !== 'ok' && (
          <p className="mt-2 text-sm text-danger-strong">
            This band is using {Math.round(pct)}% of its storage. Deleting files
            you no longer need will free some up.
          </p>
        )}
      </section>

      <TabStrip label="File kinds" activeKey={tab}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            data-tab-key={t.id}
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={
              '-mb-px shrink-0 whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium transition ' +
              (tab === t.id
                ? 'text-accent'
                : 'minor-text-theme-colors hover:text-fg-strong')
            }
          >
            {t.label}
          </button>
        ))}
      </TabStrip>

      <label className="flex flex-col gap-1">
        <span className="sr-only">Search files</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by file, song, or label"
          className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </label>

      {canDelete && selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface-soft px-3 py-2">
          <p className="text-sm">
            {selected.size} selected ·{' '}
            {formatBytes(
              files
                .filter((f) => selected.has(f.id))
                .reduce((sum, f) => sum + f.sizeBytes, 0),
            )}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="btn-ghost"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() =>
                setPending(files.filter((f) => selected.has(f.id)))
              }
              className="rounded-md bg-red-600 px-4 py-3 text-sm font-medium text-white hover:bg-red-500 md:px-3 md:py-1.5"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {pending && (
        <DeleteFilesDialog
          bandId={bandId}
          files={pending}
          onCancel={() => setPending(null)}
          onDeleted={({ deleted, skipped, usage: fresh }) => {
            const gone = new Set(deleted);
            setFiles((prev) => (prev ?? []).filter((f) => !gone.has(f.id)));
            // The band's real total, rather than this page's arithmetic.
            setUsage(fresh);
            setSelected((prev) => {
              const next = new Set(prev);
              for (const id of gone) next.delete(id);
              return next;
            });
            setPending(null);
            showToast(
              `Deleted ${deleted.length} file${deleted.length === 1 ? '' : 's'}.` +
                (skipped.length > 0
                  ? ` ${skipped.length} could not be deleted.`
                  : ''),
              skipped.length > 0 ? 'error' : undefined,
            );
          }}
        />
      )}

      {visible.length === 0 ? (
        <p className="rounded-md border border-line px-3 py-6 text-center text-sm minor-text-theme-colors">
          {files.length === 0
            ? 'This band hasn’t uploaded any files yet.'
            : 'No files match that search.'}
        </p>
      ) : (
        <FileTable
          rows={visible}
          selected={selected}
          onToggle={toggle}
          allSelected={allVisibleSelected}
          onToggleAll={toggleAllVisible}
          sort={sort}
          onSort={sortBy}
          showKind={tab === 'all'}
          selectable={canDelete}
          onDownloadError={() =>
            showToast('That file could not be downloaded.', 'error')
          }
        />
      )}
    </div>
  );
}

const HEADER_CELL =
  'whitespace-nowrap px-2 py-2 text-left font-medium minor-text-theme-colors';

function FileTable({
  rows,
  selected,
  onToggle,
  allSelected,
  onToggleAll,
  sort,
  onSort,
  showKind,
  selectable,
  onDownloadError,
}: {
  rows: BandFile[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  allSelected: boolean;
  onToggleAll: () => void;
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  onSort: (key: SortKey) => void;
  showKind: boolean;
  selectable: boolean;
  onDownloadError: () => void;
}) {
  const SortButton = ({ id, label }: { id: SortKey; label: string }) => (
    <button
      type="button"
      onClick={() => onSort(id)}
      className="inline-flex items-center gap-1 hover:text-fg-strong"
    >
      {label}
      <span aria-hidden="true" className="text-xs">
        {sort.key === id ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
      </span>
    </button>
  );
  const ariaSort = (id: SortKey): 'ascending' | 'descending' | 'none' => {
    if (sort.key !== id) return 'none';
    return sort.dir === 'asc' ? 'ascending' : 'descending';
  };

  return (
    /*
     * The table's 32rem minimum is for `sm` and up, where the Song and Added
     * columns appear. Forcing it on a phone widens the mobile layout viewport
     * (Chrome grows it to fit content this wide) rather than scrolling inside
     * this box — which shifts every fixed overlay on the page. `min-w-0` is
     * the other half: as a flex item this box would otherwise refuse to
     * shrink below its content.
     */
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full border-collapse text-sm sm:min-w-[32rem]">
        <thead>
          <tr className="border-b border-line">
            {selectable && (
              <th scope="col" className="w-8 px-2 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  aria-label="Select all shown files"
                  className="h-4 w-4 accent-blue-600"
                />
              </th>
            )}
            <th
              scope="col"
              className={HEADER_CELL}
              aria-sort={ariaSort('name')}
            >
              <SortButton id="name" label="File" />
            </th>
            <th
              scope="col"
              className={HEADER_CELL + ' hidden sm:table-cell'}
              aria-sort={ariaSort('song')}
            >
              <SortButton id="song" label="Song" />
            </th>
            <th
              scope="col"
              className={HEADER_CELL}
              aria-sort={ariaSort('status')}
            >
              <SortButton id="status" label="Status" />
            </th>
            <th
              scope="col"
              className={HEADER_CELL}
              aria-sort={ariaSort('size')}
            >
              <SortButton id="size" label="Size" />
            </th>
            <th
              scope="col"
              className={HEADER_CELL + ' hidden sm:table-cell'}
              aria-sort={ariaSort('date')}
            >
              <SortButton id="date" label="Added" />
            </th>
            <th scope="col" className="w-10 px-2 py-2">
              <span className="sr-only">Download</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((file) => (
            <tr key={file.id} className="border-b border-line last:border-0">
              {selectable && (
                <td className="px-2 py-2 align-top">
                  <input
                    type="checkbox"
                    checked={selected.has(file.id)}
                    onChange={() => onToggle(file.id)}
                    aria-label={`Select ${file.fileName}`}
                    className="mt-0.5 h-4 w-4 accent-blue-600"
                  />
                </td>
              )}
              <td className="px-2 py-2 align-top">
                <span className="block break-all">{file.fileName}</span>
                {/* The song has no column on narrow screens, so it rides
                    along under the name rather than being dropped. */}
                <span className="block text-xs minor-text-theme-colors sm:hidden">
                  {file.songName}
                </span>
                {(file.label || showKind) && (
                  <span className="block text-xs minor-text-theme-colors">
                    {[showKind && KIND_LABELS[file.kind], file.label]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
              </td>
              <td className="hidden px-2 py-2 align-top sm:table-cell">
                {file.songName}
              </td>
              <td className="px-2 py-2 align-top">
                <span
                  className={
                    'whitespace-nowrap rounded-full px-2 py-0.5 text-xs ' +
                    (file.songArchived
                      ? 'bg-surface-soft minor-text-theme-colors'
                      : 'bg-surface-soft text-fg-strong')
                  }
                >
                  {file.songArchived ? 'Archived' : 'Active'}
                </span>
              </td>
              <td className="whitespace-nowrap px-2 py-2 align-top">
                {formatBytes(file.sizeBytes)}
              </td>
              <td className="hidden whitespace-nowrap px-2 py-2 align-top sm:table-cell">
                {new Date(file.createdAt).toLocaleDateString()}
              </td>
              <td className="px-2 py-2 align-top">
                <a
                  href={downloadHref(file)}
                  download={file.fileName}
                  onError={onDownloadError}
                  aria-label={`Download ${file.fileName}`}
                  title="Download"
                  className="inline-flex rounded-md p-1 hover:bg-surface-soft"
                >
                  <DownloadIcon />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const KIND_LABELS: Record<BandFile['kind'], string> = {
  audio: 'Audio',
  sheet_music: 'Sheet music',
};
