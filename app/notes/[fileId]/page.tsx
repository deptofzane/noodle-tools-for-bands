import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasAllDriveScopes, isValidDriveId } from '@/lib/google';
import { getDriveClient } from '@/lib/drive';
import { NotesView } from './NotesView';

/**
 * Notes page (Phases 3 + 5).
 *
 * Server component:
 *   1. Verifies the session and Drive scopes
 *   2. Fetches the file's metadata (name + mimeType + parents) from Drive
 *   3. Resolves the folder context: prefer the `?folder=` query param;
 *      fall back to the file's first parent in Drive
 *   4. Renders the client `<NotesView>` which wires player + notes panel
 *
 * The audio bytes stream through `/api/drive/file/[fileId]/stream`; the
 * notes flow through `/api/files/[fileId]/notes` (+ subroutes).
 */
export default async function NotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ fileId: string }>;
  searchParams: Promise<{ folder?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  if (session.error === 'RefreshAccessTokenError') redirect('/library');
  if (!hasAllDriveScopes(session.scopes)) redirect('/library');
  if (!session.accessToken) redirect('/login');

  const { fileId } = await params;
  const { folder: folderQuery } = await searchParams;

  if (!isValidDriveId(fileId)) notFound();

  const drive = getDriveClient(session.accessToken);

  let file: {
    id?: string | null;
    name?: string | null;
    mimeType?: string | null;
    parents?: string[] | null;
  };
  try {
    const res = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size, parents',
    });
    file = res.data;
  } catch (err) {
    console.error('[notes] files.get failed', { fileId, err });
    notFound();
  }

  if (!file.id || !file.name || !file.mimeType) {
    notFound();
  }

  // Prefer the explicit query param; fall back to Drive's view of the
  // file's first parent. Either way, the notes panel needs a folder to
  // find the `<basename>.notes/` subfolder.
  const folderId =
    (folderQuery && isValidDriveId(folderQuery) ? folderQuery : null) ??
    file.parents?.[0] ??
    null;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-6 py-4">
      <header className="flex items-center gap-2 text-xs text-neutral-500">
        <Link
          href="/library/annotated"
          className="hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          ← Open Conversations
        </Link>
      </header>

      <NotesView
        fileId={file.id}
        fileName={file.name}
        mimeType={file.mimeType}
        folderId={folderId}
        currentUserSub={session.user.sub}
      />
    </main>
  );
}
