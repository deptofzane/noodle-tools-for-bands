import { auth } from '@/auth';
import { hasAllDriveScopes, isValidDriveId } from '@/lib/google';
import { getDriveClient } from '@/lib/drive';
import { findNotesSubfolder } from '@/lib/notes';

/**
 * GET /api/drive/changes?file=<audioFileId>&folder=<folderId>
 *
 * Server-Sent Events stream that pushes a `change` event whenever
 * something interesting happens to the notes for the given audio file.
 *
 * Mechanism:
 *   1. Resolve the watched notes subfolder for this audio (or null if
 *      no notes exist yet — we still watch for its creation).
 *   2. Get a Drive Changes API page token (drive.changes.getStartPageToken)
 *   3. Loop: every ~2 seconds, call drive.changes.list to fetch any
 *      changes since the last token. Filter to ones that affect this
 *      audio file's folder or notes subfolder. Emit `change` events.
 *   4. Heartbeat every ~25 seconds to keep the connection alive past
 *      common proxy idle timeouts.
 *   5. Tear down when the client disconnects (req.signal.aborted).
 *
 * Client falls back to its 30-second polling if SSE never connects or
 * disconnects unrecoverably. See NotesPanel.tsx.
 *
 * Note on cost: drive.changes.list scans every change in the user's
 * Drive, not just our folder. That's one Drive API call per ~2s per
 * connected client. For a single-user dev environment that's nothing;
 * for production, watch the per-user quota.
 */

const POLL_INTERVAL_MS = 2000;
const HEARTBEAT_INTERVAL_MS = 25_000;
const FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * Vercel / managed-host knobs for the streaming endpoint.
 *
 * - `runtime = 'nodejs'`: forces the Node runtime. We use `googleapis`,
 *   which is Node-only; an accidental Edge runtime would fail at
 *   build/runtime with `UnhandledSchemeError: node:*`.
 * - `dynamic = 'force-dynamic'`: opts out of any static caching. SSE
 *   responses must never be cached.
 * - `maxDuration = 300`: 5 minutes per connection. Vercel's default
 *   serverless timeout (10s on Hobby, 60s on Pro) would close the
 *   stream before the client noticed; 300s is the Pro / Fluid Compute
 *   ceiling without further escalation. The client (NotesPanel.tsx)
 *   already reconnects on disconnect with exponential backoff, so
 *   capping each connection at 5 minutes is intentional — it keeps the
 *   per-user Drive quota predictable and is invisible to the user.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return new Response('unauthenticated', { status: 401 });
  if (session.error === 'RefreshAccessTokenError')
    return new Response('refresh_failed', { status: 401 });
  if (!hasAllDriveScopes(session.scopes))
    return new Response('scope_missing', { status: 403 });
  if (!session.accessToken)
    return new Response('no_token', { status: 401 });

  const url = new URL(req.url);
  const fileId = url.searchParams.get('file');
  const folderId = url.searchParams.get('folder');
  if (
    !fileId ||
    !folderId ||
    !isValidDriveId(fileId) ||
    !isValidDriveId(folderId)
  ) {
    return new Response('invalid_params', { status: 400 });
  }

  const drive = getDriveClient(session.accessToken);

  // Resolve the audio file's name (we need the basename to recognize a
  // future creation of the `<basename>.notes/` subfolder).
  let audioFileName: string;
  try {
    const res = await drive.files.get({ fileId, fields: 'id, name' });
    if (!res.data?.name) return new Response('file_invalid', { status: 404 });
    audioFileName = res.data.name;
  } catch {
    return new Response('file_not_found', { status: 404 });
  }

  const expectedSubfolderName = `${audioFileName.replace(/\.[^.]+$/, '')}.notes`;

  // Try to find an existing subfolder. If it doesn't exist yet, we
  // continue without it and watch for its creation.
  let watchedSubfolderId: string | null = null;
  try {
    const existing = await findNotesSubfolder(drive, folderId, audioFileName);
    watchedSubfolderId = existing?.id ?? null;
  } catch {
    // not fatal
  }

  // Page token to start tracking changes from. Typed `string | undefined`
  // (not `... | null`) so it's directly assignable to Drive API params,
  // which use undefined for optional fields.
  let pageToken: string | undefined;
  try {
    const startRes = await drive.changes.getStartPageToken();
    pageToken = startRes.data.startPageToken ?? undefined;
  } catch {
    return new Response('changes_init_failed', { status: 500 });
  }
  if (!pageToken) {
    return new Response('changes_init_failed', { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let active = true;

      const send = (event: string, data: unknown) => {
        if (!active) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          active = false;
        }
      };

      // The client closed the connection (page navigated away,
      // EventSource.close(), etc.).
      const onAbort = () => {
        active = false;
      };
      req.signal.addEventListener('abort', onAbort);

      // Initial handshake so the client knows we're connected.
      send('open', { watchedSubfolderId });

      let nextHeartbeatAt = Date.now() + HEARTBEAT_INTERVAL_MS;

      while (active) {
        try {
          const changesRes = await drive.changes.list({
            pageToken,
            fields:
              'newStartPageToken, nextPageToken, changes(fileId, removed, file(id, name, parents, mimeType, trashed))',
            pageSize: 100,
          });

          const changes = changesRes.data.changes ?? [];

          // If we don't yet know the subfolder, watch for its creation.
          if (!watchedSubfolderId) {
            for (const c of changes) {
              const f = c.file;
              if (
                f?.id &&
                f.mimeType === FOLDER_MIME &&
                f.name === expectedSubfolderName &&
                f.parents?.includes(folderId)
              ) {
                watchedSubfolderId = f.id;
                break;
              }
            }
          }

          // Decide whether any change is relevant. We emit a single
          // 'change' event per poll cycle regardless of how many
          // changes matched — the client just refetches anyway.
          let relevant = false;
          for (const c of changes) {
            if (c.removed) {
              // Removed changes don't include the file's parents, so we
              // can't tell if they were in our folder. Conservatively
              // signal — refetching is cheap and idempotent.
              relevant = true;
              break;
            }
            const parents = c.file?.parents ?? [];
            if (
              watchedSubfolderId &&
              parents.includes(watchedSubfolderId)
            ) {
              relevant = true;
              break;
            }
            // Subfolder creation events live under the parent folder.
            if (
              c.file?.mimeType === FOLDER_MIME &&
              parents.includes(folderId)
            ) {
              relevant = true;
              break;
            }
          }

          if (relevant) send('change', {});

          if (changesRes.data.newStartPageToken) {
            pageToken = changesRes.data.newStartPageToken;
          } else if (changesRes.data.nextPageToken) {
            pageToken = changesRes.data.nextPageToken;
          }

          if (Date.now() >= nextHeartbeatAt) {
            send('ping', { t: Date.now() });
            nextHeartbeatAt = Date.now() + HEARTBEAT_INTERVAL_MS;
          }
        } catch (err) {
          console.error('[drive/changes] poll error', err);
          send('error', { message: 'poll_failed' });
          break;
        }

        // Sleep, but bail early if the client disconnects mid-sleep.
        await new Promise<void>((resolve) => {
          const id = setTimeout(resolve, POLL_INTERVAL_MS);
          req.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(id);
              resolve();
            },
            { once: true },
          );
        });
      }

      req.signal.removeEventListener('abort', onAbort);
      try {
        controller.close();
      } catch {
        // already closed
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disable any proxy buffering (notably nginx) so events flow
      // immediately instead of being held back in chunks.
      'X-Accel-Buffering': 'no',
    },
  });
}
