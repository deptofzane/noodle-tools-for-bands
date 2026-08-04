'use client';

import { createContext, useContext } from 'react';

interface DriveCapability {
  /** Whether the Drive Picker can open for this user. */
  canUseDrive: boolean;
  /**
   * Cloud project number for `PickerBuilder.setAppId`. Empty when it couldn't
   * be derived, in which case the Picker still opens but the files it returns
   * aren't granted to the app — see `googlePickerAppId` in lib/google.ts.
   */
  pickerAppId: string;
}

/**
 * Whether the current user can pick files from Google Drive, and the app id
 * the Picker needs in order to hand those files over.
 *
 * `canUseDrive` is true only for users who signed in with Google AND granted
 * the Drive scope (see `hasAllDriveScopes`). Email/password ("credential")
 * users have no Google access token, so the Drive Picker can't open for
 * them — the UI hides the "Choose from Google Drive" option and falls back to
 * local upload. Both values are computed server-side in the root layout and
 * threaded down, so client components don't each probe `/api/drive/token`, and
 * the app id follows runtime config instead of being inlined at build time.
 */
const DriveCapabilityContext = createContext<DriveCapability>({
  canUseDrive: false,
  pickerAppId: '',
});

export function DriveCapabilityProvider({
  canUseDrive,
  pickerAppId,
  children,
}: {
  canUseDrive: boolean;
  pickerAppId: string;
  children: React.ReactNode;
}) {
  return (
    <DriveCapabilityContext.Provider value={{ canUseDrive, pickerAppId }}>
      {children}
    </DriveCapabilityContext.Provider>
  );
}

export function useCanUseDrive(): boolean {
  return useContext(DriveCapabilityContext).canUseDrive;
}

/** The Picker's app id — see `DriveCapability.pickerAppId`. */
export function usePickerAppId(): string {
  return useContext(DriveCapabilityContext).pickerAppId;
}
