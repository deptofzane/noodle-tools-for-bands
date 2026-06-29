import { google, type drive_v3 } from 'googleapis';

/**
 * Service-account Drive access.
 *
 * Lets the app stream band-owned audio to any band member, regardless of
 * whether that member is personally shared on the Drive file. The flow:
 *
 *  1. When a user registers audio under a band, the app (using that
 *     user's token, since they can access the file via the Picker) shares
 *     the file with the service account as a reader — see
 *     `shareFileWithServiceAccount`.
 *  2. The stream route then fetches bytes with the service account, after
 *     authorizing the request by band membership in our own DB. The
 *     service account is NOT an access-control boundary — our membership
 *     check is. The SA can see every file ever shared with it, so the
 *     stream route MUST gate on `userCanAccessAudio` before using it.
 *
 * Configured via `GOOGLE_SERVICE_ACCOUNT_KEY` (the service account's JSON
 * key, as a single env string). Absent → the app falls back to streaming
 * with the user's personal Drive token (the pre-service-account
 * behavior), so this is an optional enhancement, not a hard dependency.
 *
 * Node-only (`googleapis`). Never import from the Edge runtime.
 */

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

function loadServiceAccountKey(): ServiceAccountKey | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;
  try {
    const json = JSON.parse(raw) as Partial<ServiceAccountKey>;
    if (typeof json.client_email !== 'string' || typeof json.private_key !== 'string') {
      console.error('[drive-service] key missing client_email/private_key');
      return null;
    }
    return {
      client_email: json.client_email,
      // Env-stored keys commonly have escaped newlines; restore them.
      private_key: json.private_key.replace(/\\n/g, '\n'),
    };
  } catch (err) {
    console.error('[drive-service] failed to parse GOOGLE_SERVICE_ACCOUNT_KEY', err);
    return null;
  }
}

const RETRY_CONFIG = {
  retry: 3,
  retryDelay: 250,
  noResponseRetries: 5,
  httpMethodsToRetry: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'POST', 'DELETE'],
  statusCodesToRetry: [
    [429, 429],
    [500, 599],
  ],
};

// `undefined` = not yet resolved, `null` = unavailable/unconfigured.
let cachedClient: drive_v3.Drive | null | undefined;

export function getServiceAccountEmail(): string | null {
  return loadServiceAccountKey()?.client_email ?? null;
}

export function isServiceAccountConfigured(): boolean {
  return getServiceDriveClient() !== null;
}

/**
 * Drive client authenticated as the service account (read-only), or null
 * if no service account is configured. Cached across requests.
 */
export function getServiceDriveClient(): drive_v3.Drive | null {
  if (cachedClient !== undefined) return cachedClient;
  const key = loadServiceAccountKey();
  if (!key) {
    cachedClient = null;
    return null;
  }
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  cachedClient = google.drive({
    version: 'v3',
    auth,
    retryConfig: RETRY_CONFIG,
  });
  return cachedClient;
}

/**
 * Grant the service account reader access to a Drive file, using a Drive
 * client authenticated as a user who can already share it (the registrant
 * who opened it via the Picker). Best-effort + idempotent: no-ops when no
 * service account is configured, and a failure (e.g. the user lacks
 * sharing rights) is swallowed — streaming then falls back to the user's
 * personal token.
 */
export async function shareFileWithServiceAccount(
  userDrive: drive_v3.Drive,
  fileId: string,
): Promise<void> {
  const email = getServiceAccountEmail();
  if (!email) return;
  try {
    await userDrive.permissions.create({
      fileId,
      sendNotificationEmail: false,
      requestBody: { type: 'user', role: 'reader', emailAddress: email },
    });
  } catch (err) {
    console.error('[drive-service] failed to share file with SA', {
      fileId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
