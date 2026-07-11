'use client';

import { createContext, useContext } from 'react';

/**
 * Whether the current user can pick files from Google Drive.
 *
 * True only for users who signed in with Google AND granted the Drive
 * scopes (see `hasAllDriveScopes`). Email/password ("credential") users
 * have no Google access token, so the Drive Picker can't open for them —
 * the UI hides the "Choose from Google Drive" option and falls back to
 * local upload. Computed server-side in the root layout from the session
 * and threaded down so client components don't each probe `/api/drive/token`.
 */
const DriveCapabilityContext = createContext(false);

export function DriveCapabilityProvider({
  canUseDrive,
  children,
}: {
  canUseDrive: boolean;
  children: React.ReactNode;
}) {
  return (
    <DriveCapabilityContext.Provider value={canUseDrive}>
      {children}
    </DriveCapabilityContext.Provider>
  );
}

export function useCanUseDrive(): boolean {
  return useContext(DriveCapabilityContext);
}
