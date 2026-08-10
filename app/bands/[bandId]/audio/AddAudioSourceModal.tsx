import { Modal } from '../../../Modal';
import { PickerButton, type PickedFile } from '../../../PickerButton';
import { AUDIO_PICKER_FILTER } from '@/lib/picker-filters';
import {
  DropboxChooserButton,
  type DropboxPickedFile,
} from '../../../DropboxChooserButton';
import { ConnectDriveButton } from '../../../ConnectDriveButton';

/**
 * "Add audio" source chooser: import one or more files from Google Drive (or
 * connect Drive), from Dropbox, or upload a local file. The hidden file input
 * itself lives in the parent (it must persist while this modal is closed), so
 * "Upload a local file" calls back via `onUploadLocal`. The Dropbox option
 * only appears when Dropbox is configured.
 */
export function AddAudioSourceModal({
  canUseDrive,
  apiKey,
  busy,
  onPickDrive,
  onPickDropbox,
  onUploadLocal,
  onClose,
}: {
  canUseDrive: boolean;
  apiKey: string;
  busy: boolean;
  onPickDrive: (files: PickedFile[]) => void;
  onPickDropbox: (files: DropboxPickedFile[]) => void;
  onUploadLocal: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      onClose={onClose}
      busy={busy}
      labelledBy="audio-source-title"
      size="sm"
    >
      <h2 id="audio-source-title" className="text-base font-semibold">
        Add audio
      </h2>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        {canUseDrive
          ? 'Choose one or more files from Google Drive, or upload one from this device.'
          : 'Sign in with Google to import from Drive, or upload one from this device.'}
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {canUseDrive ? (
          <PickerButton
            apiKey={apiKey}
            label="Choose from Google Drive"
            filter={AUDIO_PICKER_FILTER}
            onPick={onPickDrive}
          />
        ) : (
          <ConnectDriveButton label="Sign in with Google" />
        )}
        <DropboxChooserButton
          label="Choose from Dropbox"
          extensions={[
            '.mp3',
            '.m4a',
            '.wav',
            '.aac',
            '.ogg',
            '.oga',
            '.opus',
            '.flac',
            '.webm',
          ]}
          onPick={onPickDropbox}
        />
        <button type="button" onClick={onUploadLocal} className="btn-outline">
          Upload a local file
        </button>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="btn-ghost"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
