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
      DocsViewMode: { GRID: string; LIST: string };
      DocsView: new () => PickerDocsView;
      PickerBuilder: new () => PickerBuilder;
    };
  };
};

interface PickerDocsView {
  setIncludeFolders: (v: boolean) => PickerDocsView;
  setSelectFolderEnabled: (v: boolean) => PickerDocsView;
  setMimeTypes: (mimeTypes: string) => PickerDocsView;
  setMode: (mode: string) => PickerDocsView;
  /**
   * Optional because it's deprecated upstream — see `labelled` below for why
   * it's called anyway, and what happens if Google ever removes it.
   */
  setLabel?: (label: string) => PickerDocsView;
}

interface PickerBuilder {
  addView: (view: PickerDocsView) => PickerBuilder;
  setAppId: (appId: string) => PickerBuilder;
  enableFeature: (feature: string) => PickerBuilder;
  setSize: (width: number, height: number) => PickerBuilder;
  setTitle: (title: string) => PickerBuilder;
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

/**
 * Dialog size, and the knob to turn when the picker looks wrong.
 *
 * Google clamps this to a minimum of 566×350 and a **maximum of 1051×650** —
 * so the picker can never fill a tall desktop window, and asking for more just
 * gets you 1051×650. Sizing it explicitly is still worth doing because the
 * dialog is auto-centred when a size is set, which is what stops it sitting in
 * the upper part of the screen.
 *
 * Applied only when the viewport can actually hold it. On a phone the clamp
 * works against you: a 390px-wide screen asking for anything gets at least 566
 * back, and a dialog wider than the window pushes the Select button off the
 * right edge — which is what made multi-select unusable there. Below the
 * minimum we set nothing and let the picker's own responsive layout take over.
 */
const PICKER_SIZE = { width: 1051, height: 650 } as const;
/** Google's documented floor; under this, don't size the dialog at all. */
const PICKER_MIN = { width: 566, height: 350 } as const;

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

    /**
     * Name a view's tab.
     *
     * `View.setLabel` is marked deprecated by Google with no replacement
     * offered, and without it every DocsView is labelled "Google Drive" — so a
     * narrowed view and the unfiltered one beside it are two identical tabs.
     * That's worse than depending on a deprecated call, so it's called through
     * this guard: if the method is ever removed the tabs simply go back to
     * being unlabelled, instead of the picker failing to open.
     */
    const labelled = (view: PickerDocsView, label: string) =>
      typeof view.setLabel === 'function' ? view.setLabel(label) : view;

    const newView = () =>
      new w.google!.picker.DocsView()
        .setIncludeFolders(false)
        .setSelectFolderEnabled(false)
        // List, not the default grid: these are audio files and charts, where
        // the name is the only thing that identifies one. A grid of identical
        // generic file icons costs a row of vertical space per item and tells
        // you nothing.
        .setMode(w.google!.picker.DocsViewMode.LIST);

    let builder = new w.google.picker.PickerBuilder();
    if (filter) {
      // The narrowed view first, so the picker opens on it; the unfiltered one
      // sits beside it as a tab. That second view is the escape hatch for
      // files Drive mislabels or has no type for — without it, a filter turns
      // "Drive says this .mp3 is octet-stream" into a file the user can't
      // reach at all.
      builder = builder
        .addView(
          labelled(
            newView().setMimeTypes(filter.mimeTypes.join(',')),
            filter.viewLabel,
          ),
        )
        .addView(labelled(newView(), 'All files'));
      // Not deprecated, unlike setLabel — so even if the tab names stop
      // working, the dialog still says what it's for.
      builder = builder.setTitle(`Choose ${filter.viewLabel.toLowerCase()}`);
    } else {
      builder = builder.addView(newView());
    }
    if (multiple) {
      builder = builder.enableFeature(
        w.google.picker.Feature.MULTISELECT_ENABLED,
      );
    }
    // Size it only where it fits — see PICKER_SIZE for why both halves matter.
    // Sizing also auto-centres the dialog, which is what keeps it off the top
    // edge; leaving it unset is what left it sitting in the upper half.
    if (
      window.innerWidth >= PICKER_MIN.width &&
      window.innerHeight >= PICKER_MIN.height
    ) {
      builder = builder.setSize(
        Math.min(PICKER_SIZE.width, window.innerWidth),
        Math.min(PICKER_SIZE.height, window.innerHeight),
      );
    }
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
        className="rounded-md border border-line-strong px-4 py-3 md:py-1.5 md:px-3 md:py-1.5 md:px-3 text-sm font-medium hover:bg-surface-soft disabled:opacity-50"
      >
        {label}
      </button>
      {!apiKey && (
        <p className="text-[0.6875rem] text-warn">
          NEXT_PUBLIC_GOOGLE_API_KEY isn’t set; the Picker won’t open.
        </p>
      )}
      {error && <p className="text-[0.6875rem] text-danger">{error}</p>}
    </div>
  );
}
