'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * A picked Dropbox file. `link` is a short-lived direct-download URL the
 * server fetches immediately; `bytes` lets us reject oversized files up front.
 */
export interface DropboxPickedFile {
  name: string;
  link: string;
  bytes: number;
}

interface DropboxChooserFile {
  name: string;
  link: string;
  bytes: number;
}

interface DropboxChooseOptions {
  success: (files: DropboxChooserFile[]) => void;
  cancel?: () => void;
  linkType?: 'direct' | 'preview';
  multiselect?: boolean;
  extensions?: string[];
}

declare global {
  interface Window {
    Dropbox?: { choose: (options: DropboxChooseOptions) => void };
  }
}

const SCRIPT_ID = 'dropboxjs';
const SCRIPT_SRC = 'https://www.dropbox.com/static/api/2/dropins.js';

/**
 * "Choose from Dropbox" button. Loads the Dropbox Chooser (dropins.js) with
 * the app key and returns the selected file(s) via `onPick`. Renders nothing
 * when `NEXT_PUBLIC_DROPBOX_APP_KEY` isn't configured, so Dropbox stays dormant
 * until a key is set. Mirrors PickerButton (Google Drive).
 */
export function DropboxChooserButton({
  onPick,
  label = 'Choose from Dropbox',
  multiple = true,
  extensions,
  disabled = false,
}: {
  onPick: (files: DropboxPickedFile[]) => void;
  label?: string;
  multiple?: boolean;
  /** Restrict to these extensions, e.g. ['.mp3', '.wav'] or ['.pdf', '.png']. */
  extensions?: string[];
  disabled?: boolean;
}) {
  const appKey = process.env.NEXT_PUBLIC_DROPBOX_APP_KEY ?? '';
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!appKey) return;
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      if (window.Dropbox) setReady(true);
      else
        existing.addEventListener('load', () => setReady(true), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.setAttribute('data-app-key', appKey);
    script.onload = () => setReady(true);
    document.body.appendChild(script);
  }, [appKey]);

  const choose = useCallback(() => {
    if (!window.Dropbox) return;
    window.Dropbox.choose({
      linkType: 'direct',
      multiselect: multiple,
      extensions,
      success: (files) =>
        onPick(
          files.map((f) => ({ name: f.name, link: f.link, bytes: f.bytes })),
        ),
      cancel: () => {},
    });
  }, [multiple, extensions, onPick]);

  // Not configured → don't render the option at all.
  if (!appKey) return null;

  return (
    <button
      type="button"
      onClick={choose}
      disabled={disabled || !ready}
      className="btn-outline"
    >
      {label}
    </button>
  );
}
