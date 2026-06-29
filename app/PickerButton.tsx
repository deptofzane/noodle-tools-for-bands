'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Reusable Google Picker button.
 *
 * Loads the Picker SDK once, fetches a short-lived OAuth token from
 * `/api/drive/token` on click, and invokes `onPick` with the selected
 * file(s). Used to register audio under a band. Audio files only
 * (folders disabled); multi-select enabled.
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
  enableFeature: (feature: string) => PickerBuilder;
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
}: {
  apiKey: string;
  onPick: (files: PickedFile[]) => void;
  label?: string;
  disabled?: boolean;
}) {
  const [pickerReady, setPickerReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    // Audio only. Drive's audio MIME labels are inconsistent, so we don't
    // constrain mimeTypes here and instead let the user pick; the band
    // registration accepts whatever they choose.
    const view = new w.google.picker.DocsView()
      .setIncludeFolders(false)
      .setSelectFolderEnabled(false);

    const picker = new w.google.picker.PickerBuilder()
      .addView(view)
      .enableFeature(w.google.picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(accessToken)
      .setDeveloperKey(apiKey)
      .setCallback((data) => {
        if (data.action !== w.google!.picker.Action.PICKED) return;
        const files = (data.docs ?? []).map((d) => ({
          id: d.id,
          name: d.name,
          mimeType: d.mimeType,
        }));
        if (files.length > 0) onPick(files);
      })
      .build();

    picker.setVisible(true);
  }, [apiKey, onPick]);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={openPicker}
        disabled={!pickerReady || !apiKey || disabled}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        {label}
      </button>
      {!apiKey && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          NEXT_PUBLIC_GOOGLE_API_KEY isn’t set; the Picker won’t open.
        </p>
      )}
      {error && (
        <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
