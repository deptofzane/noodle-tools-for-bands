'use client';

import { ensureOk } from '@/lib/api';
import { useRef, useState } from 'react';
import { Modal } from '../../../Modal';
import { PickerButton, type PickedFile } from '../../../PickerButton';
import { AUDIO_PICKER_FILTER } from '@/lib/picker-filters';
import { MAX_AUDIO_BYTES, normalizeAudioMime } from '@/lib/audio-mime';
import {
  DropboxChooserButton,
  type DropboxPickedFile,
} from '../../../DropboxChooserButton';
import { ConnectDriveButton } from '../../../ConnectDriveButton';
import { useCanUseDrive } from '../../../DriveCapabilityProvider';
import { useTrackPending } from '../../../PendingActionProvider';
import { useToast } from '../../../ToastProvider';
import { todayKey } from '../../../bands/[bandId]/audio/uploadDays';

const AUDIO_EXTENSIONS = [
  '.mp3',
  '.m4a',
  '.wav',
  '.aac',
  '.ogg',
  '.oga',
  '.opus',
  '.flac',
  '.webm',
];

/**
 * Adding audio versions to a song — from Google Drive, Dropbox or this device
 * — and the "Add audio version" chooser that picks the source. Shared by the
 * Edit page's version list and the Practice page's "Add audio" button.
 *
 * Returns the chooser as an element for the caller to render (it carries the
 * hidden file input the "Upload a local file" choice clicks), a way to open
 * it, and `addLocalFiles` for callers that also take dropped files.
 * `onAdded` runs after any add that landed, inside the pending indicator.
 */
export function useAddAudio({
  conversationId,
  apiKey,
  makeDefault,
  onAdded,
}: {
  conversationId: string;
  /** Google Picker API key, passed from a server component. */
  apiKey: string;
  /** Whether an added version takes over as the song's default. */
  makeDefault: boolean;
  onAdded: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [chooseOpen, setChooseOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const canUseDrive = useCanUseDrive();
  const trackPending = useTrackPending();
  const showToast = useToast();

  // Uploads roll up per band per *local* day, and only the browser knows
  // which day that is (see lib/upload-day).
  const uploadEndpoint = () =>
    `/api/conversations/${conversationId}/audio-versions?day=${todayKey()}`;

  /**
   * Upload local files as versions — one from the file input, or several from
   * a drop.
   *
   * Sequential rather than parallel: the route buffers each upload in memory
   * under a concurrency limit, so firing a dropped folder's worth at once is
   * the case that limit exists to prevent. It also makes `makeDefault`
   * deterministic — the versions land in the order given, so the last file
   * ends up the default rather than whichever request happened to finish
   * last.
   */
  const addLocalFiles = async (files: File[]) => {
    if (busy || files.length === 0) return;

    /*
     * Screen with the same rule the route applies, so a wrong file costs a
     * rejection rather than a full upload. Dropping is easy to do carelessly
     * — a folder arrives as an extension-less entry and lands here too.
     */
    const problems: string[] = [];
    const accepted = files.filter((f) => {
      if (!normalizeAudioMime(f.type, f.name)) {
        problems.push(`${f.name} isn’t an audio file.`);
        return false;
      }
      if (f.size > MAX_AUDIO_BYTES) {
        problems.push(`${f.name} is over the 50 MB limit.`);
        return false;
      }
      return true;
    });

    let added = 0;
    if (accepted.length > 0) {
      setBusy(true);
      try {
        await trackPending(async () => {
          for (const file of accepted) {
            try {
              const form = new FormData();
              form.append('file', file);
              form.append('makeDefault', String(makeDefault));
              const res = await fetch(uploadEndpoint(), {
                method: 'POST',
                body: form,
              });
              await ensureOk(res);
              added += 1;
            } catch (e) {
              // Keep going: one bad file in a drop shouldn't strand the rest.
              problems.push(e instanceof Error ? e.message : String(e));
            }
          }
          // Outside the loop, and guarded, so files that did land still show
          // even when a later one failed.
          if (added > 0) await onAdded();
        });
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    }

    if (added > 0) {
      showToast(
        added === 1 ? 'Version added.' : `${added} versions added.`,
        'success',
      );
    }
    if (problems.length === 1) showToast(problems[0]!);
    else if (problems.length > 1)
      showToast(`${problems.length} files couldn’t be added.`);
  };

  const addFromJson = async (payload: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await trackPending(async () => {
        const res = await fetch(uploadEndpoint(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ makeDefault, ...payload }),
        });
        await ensureOk(res);
        await onAdded();
      });
      showToast('Version added.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const addDrive = (file: PickedFile) => addFromJson({ driveFileId: file.id });
  const addDropbox = (file: DropboxPickedFile) =>
    addFromJson({ dropboxUrl: file.link, name: file.name, bytes: file.bytes });

  const chooser = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.mp3,.m4a,.wav,.ogg,.oga,.opus,.webm,.flac,.aac"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) void addLocalFiles(files);
        }}
      />

      {chooseOpen && (
        <Modal
          onClose={() => setChooseOpen(false)}
          busy={busy}
          labelledBy="version-source-title"
          size="sm"
        >
          <h2 id="version-source-title" className="text-base font-semibold">
            Add audio version
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            {canUseDrive
              ? 'Choose a file from Google Drive or upload one from this device.'
              : 'Sign in with Google to import from Drive, or upload one from this device.'}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {canUseDrive ? (
              <PickerButton
                apiKey={apiKey}
                multiple={false}
                filter={AUDIO_PICKER_FILTER}
                label="Choose from Google Drive"
                onPick={(files) => {
                  setChooseOpen(false);
                  const file = files[0];
                  if (file) void addDrive(file);
                }}
              />
            ) : (
              <ConnectDriveButton label="Sign in with Google" />
            )}
            <DropboxChooserButton
              label="Choose from Dropbox"
              multiple={false}
              extensions={AUDIO_EXTENSIONS}
              onPick={(files) => {
                setChooseOpen(false);
                const file = files[0];
                if (file) void addDropbox(file);
              }}
            />
            <button
              type="button"
              onClick={() => {
                setChooseOpen(false);
                inputRef.current?.click();
              }}
              className="btn-outline"
            >
              Upload a local file
            </button>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setChooseOpen(false)}
              disabled={busy}
              className="btn-ghost"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </>
  );

  return {
    busy,
    addLocalFiles,
    openChooser: () => setChooseOpen(true),
    chooser,
  };
}
