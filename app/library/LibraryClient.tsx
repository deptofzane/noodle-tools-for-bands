'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FolderActivitySummary } from '@/lib/notes';
import { useTrackPending } from '../PendingActionProvider';

/**
 * Library client component.
 *
 * Three responsibilities:
 *   1. Load the Google Picker SDK once on mount.
 *   2. On "Pick a folder", fetch a short-lived OAuth token from
 *      `/api/drive/token` and hand it to the Picker.
 *   3. When the user picks a folder, persist that choice in
 *      localStorage and fetch the folder's audio files from
 *      `/api/drive/folder/[id]/audio`.
 *
 * The token never lingers in component state longer than needed for
 * the Picker callback. The audio listing happens server-side (the API
 * route uses the user's session-bound token), so this component never
 * needs to handle tokens during normal navigation.
 */

// Minimal Picker SDK shapes we need; the SDK doesn't ship types we can
// import. Casting to `unknown` then narrowing where used.
type PickerWindow = {
  gapi?: { load: (lib: string, cb: () => void) => void };
  google?: {
    picker: {
      Action: { PICKED: string; CANCEL: string };
      DocsView: new () => PickerDocsView;
      PickerBuilder: new () => PickerBuilder;
    };
  };
};

interface PickerDocsView {
  setIncludeFolders: (v: boolean) => PickerDocsView;
  setSelectFolderEnabled: (v: boolean) => PickerDocsView;
  setMimeTypes: (mimeTypes: string) => PickerDocsView;
}

interface PickerBuilder {
  addView: (view: PickerDocsView) => PickerBuilder;
  setOAuthToken: (token: string) => PickerBuilder;
  setDeveloperKey: (key: string) => PickerBuilder;
  setCallback: (cb: (data: PickerCallbackData) => void) => PickerBuilder;
  build: () => { setVisible: (v: boolean) => void };
}

interface PickerCallbackData {
  action: string;
  docs?: Array<{
    id: string;
    name: string;
    mimeType?: string;
    parentId?: string;
  }>;
}

type Folder = { id: string; name: string };

interface AudioFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
}

const FOLDER_STORAGE_KEY = 'audio-notes:current-folder';
const PICKER_SCRIPT_SRC = 'https://apis.google.com/js/api.js';

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export function LibraryClient({ apiKey }: { apiKey: string }) {
  const trackPending = useTrackPending();
  const [pickerReady, setPickerReady] = useState(false);
  const [folder, setFolder] = useState<Folder | null>(null);
  const [files, setFiles] = useState<AudioFile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Lazy-loaded after the audio list arrives. `null` = not yet
  // requested / in flight; an array (possibly empty) = settled.
  const [activity, setActivity] = useState<FolderActivitySummary[] | null>(
    null,
  );

  // Restore the last picked folder (if any) on mount.
  useEffect(() => {
    const saved = localStorage.getItem(FOLDER_STORAGE_KEY);
    if (saved) {
      try {
        setFolder(JSON.parse(saved) as Folder);
      } catch {
        // Corrupt value — ignore.
      }
    }
  }, []);

  // Load the Picker SDK once.
  useEffect(() => {
    const w = window as unknown as PickerWindow;
    if (w.google?.picker) {
      setPickerReady(true);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${PICKER_SCRIPT_SRC}"]`,
    );
    const script = existing ?? document.createElement('script');
    if (!existing) {
      script.src = PICKER_SCRIPT_SRC;
      script.async = true;
      document.body.appendChild(script);
    }
    const onLoad = () => {
      (window as unknown as PickerWindow).gapi?.load('picker', () =>
        setPickerReady(true),
      );
    };
    if (existing) onLoad();
    else script.addEventListener('load', onLoad);
    return () => script.removeEventListener('load', onLoad);
  }, []);

  // When the selected folder changes, fetch its audio files.
  useEffect(() => {
    if (!folder) {
      setFiles(null);
      setActivity(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setActivity(null); // reset stale activity while the new list loads
    // Wrap fetch + parse + state update so the Header spinner stays on
    // until the file list actually renders, not just until the network
    // call returns.
    void trackPending(async () => {
      try {
        const r = await fetch(`/api/drive/folder/${folder.id}/audio`);
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.message ?? body.error ?? `HTTP ${r.status}`);
        }
        const data = (await r.json()) as { files: AudioFile[] };
        if (!cancelled) setFiles(data.files);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [folder, trackPending]);

  // Lazy-load per-conversation activity once the audio list has come
  // back. Decoupled from the audio fetch so the file list paints fast
  // and the "Updated 5m ago by X" footers stream in as a non-blocking
  // second wave. Activity errors are silently swallowed — the file
  // list is still useful without it.
  useEffect(() => {
    if (!folder || !files) return;
    if (files.length === 0) {
      setActivity([]);
      return;
    }
    let cancelled = false;
    void trackPending(async () => {
      try {
        const r = await fetch(`/api/drive/folder/${folder.id}/activity`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as {
          activity: FolderActivitySummary[];
        };
        if (!cancelled) setActivity(data.activity);
      } catch (e) {
        if (!cancelled) {
          console.error('[library] activity fetch failed', e);
          setActivity([]); // settle to empty so the UI stops "waiting"
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [folder, files, trackPending]);

  // O(1) lookup by audio file id while rendering the file list.
  const activityByFileId = useMemo(() => {
    const map = new Map<string, FolderActivitySummary>();
    for (const a of activity ?? []) map.set(a.audioFileId, a);
    return map;
  }, [activity]);

  const openPicker = useCallback(async () => {
    setError(null);
    const tokenRes = await trackPending(() => fetch('/api/drive/token'));
    if (!tokenRes.ok) {
      const body = await tokenRes.json().catch(() => ({}));
      setError(body.message ?? 'Could not retrieve Drive token.');
      return;
    }
    const { accessToken } = (await tokenRes.json()) as { accessToken: string };

    const w = window as unknown as PickerWindow;
    if (!w.google?.picker) {
      setError('Picker not loaded yet. Try again in a moment.');
      return;
    }

    // Show everything in the user's Drive. We deliberately don't set
    // mimeTypes here — Drive's MIME labels for audio are inconsistent
    // (mp3 can be audio/mpeg, audio/mp3, or audio/x-mpeg depending on
    // how the file was uploaded), so a hand-rolled enum reliably hides
    // the very files the user is looking for. The cleaner filter
    // happens server-side in /api/drive/folder/[id]/audio, which uses
    // `mimeType contains 'audio/'` — a substring match that picks up
    // every audio variant.
    //
    // Folders are selectable (setSelectFolderEnabled); audio files are
    // also individually selectable and the callback below handles that
    // case by resolving to the file's parent folder.
    const view = new w.google.picker.DocsView()
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true);

    const picker = new w.google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setCallback((data) => {
        if (data.action !== w.google!.picker.Action.PICKED) return;
        const doc = data.docs?.[0];
        if (!doc) return;

        let picked: Folder | null = null;
        if (doc.mimeType === FOLDER_MIME_TYPE) {
          picked = { id: doc.id, name: doc.name };
        } else if (doc.parentId) {
          // User picked an audio file directly. Use its parent folder
          // as the current folder so the rest of the app can list its
          // sibling audio files. We don't know the parent's display
          // name from the Picker response, so fall back to a generic
          // label — the audio listing makes the contents obvious.
          picked = { id: doc.parentId, name: 'Selected folder' };
        }

        if (picked) {
          setFolder(picked);
          localStorage.setItem(FOLDER_STORAGE_KEY, JSON.stringify(picked));
        }
      })
      .build();

    picker.setVisible(true);
  }, [apiKey]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Current folder
          </p>
          <p className="mt-0.5 truncate text-sm font-medium">
            {folder ? folder.name : 'None selected'}
          </p>
        </div>
        <button
          type="button"
          onClick={openPicker}
          disabled={!pickerReady || !apiKey}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          {folder ? 'Change folder' : 'Pick a folder'}
        </button>
      </div>

      {!apiKey && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <code>NEXT_PUBLIC_GOOGLE_API_KEY</code> isn&apos;t set. The
          Picker won&apos;t work without it. See the README for setup.
        </p>
      )}

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      {loading && (
        <p className="text-sm text-neutral-500">Loading audio files…</p>
      )}

      {files && files.length === 0 && !loading && (
        <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm text-neutral-500 dark:border-neutral-800">
          No audio files in this folder.
        </p>
      )}

      {files && files.length > 0 && (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {files.map((file) => {
            const fileActivity = activityByFileId.get(file.id);
            return (
              <li key={file.id}>
                <a
                  href={`/notes/${file.id}?folder=${folder?.id ?? ''}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{file.name}</div>
                    {fileActivity && (
                      <div className="mt-0.5 text-xs text-neutral-500">
                        {fileActivity.closed ? 'Closed · last activity ' : 'Updated '}
                        {formatRelativeTime(fileActivity.lastModifiedISO)}
                        {fileActivity.lastActivityBy && (
                          <> by {actorLabel(fileActivity.lastActivityBy)}</>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {formatBytes(file.size)}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatBytes(value: string | undefined): string {
  if (!value) return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function actorLabel(by: { name?: string | null; email?: string | null }): string {
  if (by.name) return by.name;
  if (by.email) return by.email;
  return 'someone';
}

/** Human-friendly "5m ago" / "2h ago" / etc. Mirrors AnnotatedList. */
function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}
