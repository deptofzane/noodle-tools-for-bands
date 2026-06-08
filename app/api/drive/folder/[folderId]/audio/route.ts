import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { hasAllDriveScopes, isValidDriveId } from '@/lib/google';
import { getDriveClient } from '@/lib/drive';

/**
 * Lists audio files in the given Drive folder.
 *
 * Authorization is delegated to Drive itself: we just hand the user's
 * access token to the Drive API. If the user doesn't have read access
 * to the folder, Drive returns 403/404 and we proxy that back as 403.
 *
 * The `drive.file` scope only grants access to files the user has
 * opened with the Picker (or files the app created), so this listing
 * works only against folders the user has explicitly chosen.
 *
 * MIME-type detection: Drive's MIME labels for audio files are
 * inconsistent — an mp3 can come back as `audio/mpeg`, `audio/mp3`,
 * `audio/x-mpeg`, or even `application/octet-stream` (when the
 * original upload didn't carry MIME metadata). Filtering with
 * `mimeType contains 'audio/'` in the `q` query misses the
 * octet-stream case. We instead pull all non-folder files from the
 * folder and post-filter on the server with a combined check: MIME
 * type starts with `audio/` OR filename ends in a known audio
 * extension. That catches everything reasonable.
 */

const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'm4a',
  'mp4', // audio-only mp4 containers
  'wav',
  'wave',
  'ogg',
  'oga',
  'opus',
  'flac',
  'aac',
  'webm', // audio-only webm
  'aiff',
  'aif',
]);

function isAudio(file: {
  mimeType?: string | null;
  name?: string | null;
}): boolean {
  if (file.mimeType?.startsWith('audio/')) return true;
  const ext = file.name?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return ext ? AUDIO_EXTENSIONS.has(ext) : false;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ folderId: string }> },
) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  if (session.error === 'RefreshAccessTokenError') {
    return NextResponse.json({ error: 'refresh_failed' }, { status: 401 });
  }
  if (!hasAllDriveScopes(session.scopes)) {
    return NextResponse.json({ error: 'scope_missing' }, { status: 403 });
  }
  if (!session.accessToken) {
    return NextResponse.json({ error: 'no_token' }, { status: 401 });
  }

  const { folderId } = await params;
  if (!isValidDriveId(folderId)) {
    return NextResponse.json({ error: 'invalid_folder_id' }, { status: 400 });
  }

  const drive = getDriveClient(session.accessToken);

  try {
    const res = await drive.files.list({
      // List everything except subfolders. We do the audio filtering in
      // JS below so we can fall back on filename extension when Drive's
      // MIME type is wrong/missing.
      q: `'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
      fields:
        'files(id, name, mimeType, size, modifiedTime, parents, owners(displayName, emailAddress))',
      pageSize: 200,
      orderBy: 'name',
    });

    const audioFiles = (res.data.files ?? []).filter(isAudio);
    return NextResponse.json({ files: audioFiles });
  } catch (err) {
    const status =
      typeof err === 'object' && err !== null && 'code' in err
        ? Number((err as { code?: number }).code) || 500
        : 500;
    const message = err instanceof Error ? err.message : String(err);
    console.error('[drive] files.list failed', { folderId, status, message });
    return NextResponse.json(
      { error: 'drive_error', message },
      {
        status:
          status === 404
            ? 403
            : status >= 400 && status < 500
              ? status
              : 500,
      },
    );
  }
}
