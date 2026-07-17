import { Modal } from '../../Modal';
import { PickerButton, type PickedFile } from '../../PickerButton';
import { ConnectDriveButton } from '../../ConnectDriveButton';

/**
 * "Add audio" source chooser: import one or more files from Google Drive (or
 * connect Drive), or upload a local file. The hidden file input itself lives
 * in the parent (it must persist while this modal is closed), so "Upload a
 * local file" calls back via `onUploadLocal`.
 */
export function AddAudioSourceModal({
  canUseDrive,
  apiKey,
  busy,
  onPickDrive,
  onUploadLocal,
  onClose,
}: {
  canUseDrive: boolean;
  apiKey: string;
  busy: boolean;
  onPickDrive: (files: PickedFile[]) => void;
  onUploadLocal: () => void;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose} busy={busy} labelledBy="audio-source-title" size="sm">
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
            onPick={onPickDrive}
          />
        ) : (
          <ConnectDriveButton label="Sign in with Google" />
        )}
        <button
          type="button"
          onClick={onUploadLocal}
          className="btn-outline"
        >
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
