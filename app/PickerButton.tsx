'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePickerAppId } from './DriveCapabilityProvider';
import { rejectionMessage, type PickerFilter } from '@/lib/picker-filters';

/**
 * Reusable Google Picker button.
 *
 * Loads the Picker SDK once, fetches a short-lived OAuth token from
 * `/api/drive/token` on click, and invokes `onPick` with the selected
 * file(s). Folders are never selectable; multi-select is opt-out.
 *
 * Given a `filter`, the picker opens on a view narrowed to those MIME types
 * and offers an unfiltered view beside it, and anything picked is re-checked
 * locally before `onPick` sees it — see lib/picker-filters.ts for why one
 * layer isn't enough.
 */

type PickerWindow = {
  gapi?: { load: (lib: string, cb: () => void) => void };
  google?: {
    picker: {
      Action: { PICKED: string; CANCEL: string };
      Feature: { MULTISELECT_ENABLED: string };
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
  setAppId: (appId: string) => PickerBuilder;
  enableFeature: (feature: string) => PickerBuilder;
  setSize: (width: number, height: number) => PickerBuilder;
  setOAuthToken: (token: string) => PickerBuilder;
  setDeveloperKey: (key: string) => PickerBuilder;
  setCallback: (cb: (data: PickerCallbackData) => void) => PickerBuilder;
  build: () => { setVisible: (v: boolean) => void };
}

interface PickerCallbackData {
  action: string;
  docs?: Array<{ id: string; name: string; mimeType?: string }>;
}

export interface PickedFile {
  id: string;
  name: string;
  mimeType?: string;
}

const PICKER_SCRIPT_SRC = 'https://apis.google.com/js/api.js';

export function PickerButton({
  apiKey,
  onPick,
  label = 'Add audio',
  disabled = false,
  multiple = true,
  filter,
}: {
  apiKey: string;
  onPick: (files: PickedFile[]) => void;
  label?: string;
  disabled?: boolean;
  /** Allow selecting more than one file. */
  multiple?: boolean;
  /** What to list, and what to accept back. Unfiltered when omitted. */
  filter?: PickerFilter;
}) {
  const appId = usePickerAppId();
  const [pickerReady, setPickerReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const ensureScript = () => {
      if (document.querySelector(`script[src="${PICKER_SCRIPT_SRC}"]`)) return;
      const script = document.createElement('script');
      script.src = PICKER_SCRIPT_SRC;
      script.async = true;
      document.body.appendChild(script);
    };

    // Poll until gapi loads, then load the picker module. Polling (rather
    // than a one-shot `load` listener) survives React Strict Mode's
    // mount→unmount→mount cycle, which otherwise drops the listener and
    // leaves the button permanently disabled.
    const tick = () => {
      if (cancelled) return;
      const w = window as unknown as PickerWindow;
      if (w.google?.picker) {
        setPickerReady(true);
        return;
      }
      if (w.gapi) {
        w.gapi.load('picker', () => {
          if (!cancelled) setPickerReady(true);
        });
        return;
      }
      ensureScript();
      setTimeout(tick, 100);
    };

    tick();
    return () => {
      cancelled = true;
    };
  }, []);

  const openPicker = useCallback(async () => {
    setError(null);
    const tokenRes = await fetch('/api/drive/token');
    if (!tokenRes.ok) {
      setError('Could not retrieve Drive token.');
      return;
    }
    const { accessToken } = (await tokenRes.json()) as { accessToken: string };

    const w = window as unknown as PickerWindow;
    if (!w.google?.picker) {
      setError('Picker not loaded yet. Try again in a moment.');
      return;
    }

    const newView = () =>
      new w.google!.picker.DocsView()
        .setIncludeFolders(false)
        .setSelectFolderEnabled(false);

    let builder = new w.google.picker.PickerBuilder();
    if (filter) {
      // The narrowed view first, so the picker opens on it; the unfiltered one
      // sits beside it as a tab. That second view is the escape hatch for
      // files Drive mislabels or has no type for — without it, a filter turns
      // "Drive says this .mp3 is octet-stream" into a file the user can't
      // reach at all. Labels are left to the picker: View.setLabel is
      // deprecated.
      builder = builder
        .addView(newView().setMimeTypes(filter.mimeTypes.join(',')))
        .addView(newView());
    } else {
      builder = builder.addView(newView());
    }
    if (multiple) {
      builder = builder.enableFeature(
        w.google.picker.Feature.MULTISELECT_ENABLED,
      );
    }
    // No setSize: the picker's documented bounds are a minimum of 566×350 and
    // a maximum of 1051×650, so asking for a phone's viewport (typically
    // 390–430 CSS px wide) was clamped *up* to 566 and rendered a dialog wider
    // than the screen — pushing the selection controls and the Select button
    // off the right edge, which is what made multi-select unusable on a phone.
    // The picker's own responsive layout handles narrow viewports.
    // `setAppId` is what makes Drive grant the picked files to this app under
    // the narrow `drive.file` scope. Without it the Picker still works, but
    // every later files.get on the result 404s.
    if (appId) builder = builder.setAppId(appId);

    const picker = builder
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setCallback((data) => {
        if (data.action !== w.google!.picker.Action.PICKED) return;
        const files = (data.docs ?? []).map((d) => ({
          id: d.id,
          name: d.name,
          mimeType: d.mimeType,
        }));
        if (files.length === 0) return;
        if (!filter) {
          onPick(files);
          return;
        }
        // Partial acceptance: importing the valid files and naming the ones
        // skipped beats discarding a good multi-file selection over one stray
        // jpg. With `multiple` off there's only ever one, so this reads as a
        // plain rejection.
        const accepted = files.filter((f) => filter.accepts(f));
        if (accepted.length < files.length) {
          setError(
            rejectionMessage(
              files.filter((f) => !filter.accepts(f)),
              filter,
            ),
          );
        }
        if (accepted.length > 0) onPick(accepted);
      })
      .build();

    picker.setVisible(true);
  }, [apiKey, appId, onPick, multiple, filter]);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={openPicker}
        disabled={!pickerReady || !apiKey || disabled}
        className="rounded-md border border-neutral-300 px-4 py-3 md:py-1.5 md:px-3 md:py-1.5 md:px-3 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        {label}
      </button>
      {!apiKey && (
        <p className="text-[0.6875rem] text-amber-700 dark:text-amber-400">
          NEXT_PUBLIC_GOOGLE_API_KEY isn’t set; the Picker won’t open.
        </p>
      )}
      {error && (
        <p className="text-[0.6875rem] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
