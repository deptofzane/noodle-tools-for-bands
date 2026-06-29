import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { hasAllDriveScopes } from '@/lib/google';
import { getDriveClient } from '@/lib/drive';
import { getCurrentDbUser } from '@/lib/current-user';
import { getConversationMembership } from '@/lib/db/conversations';
import { NotesView } from './NotesView';

/**
 * Notes page (Postgres conversations).
 *
 * Server component:
 *   1. Verifies session + Drive scopes (audio still streams from Drive)
 *   2. Resolves the conversation by id and checks band membership
 *   3. Best-effort fetches the audio file's name + mimeType from Drive
 *      (via the user's personal token) for the player
 *   4. Renders <NotesView>, which wires the player + notes panel
 *
 * Audio bytes stream through `/api/drive/file/[fileId]/stream`; notes
 * flow through `/api/conversations/[conversationId]/*`.
 */
export default async function NotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ thread?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  if (session.error === 'RefreshAccessTokenError') redirect('/library');
  if (!hasAllDriveScopes(session.scopes)) redirect('/library');
  if (!session.accessToken) redirect('/login');

  const { conversationId } = await params;
  const { thread: threadQuery } = await searchParams;

  const user = await getCurrentDbUser();
  if (!user) redirect('/login');

  const membership = await getConversationMembership(user.id, conversationId);
  if (!membership) notFound();
  const conversation = membership.conversation;

  // Audio metadata for the player. Best-effort — fall back to the stored
  // name and a generic audio MIME if the Drive lookup fails.
  let fileName = conversation.audioFileName ?? 'audio';
  let mimeType = 'audio/mpeg';
  try {
    const drive = getDriveClient(session.accessToken);
    const res = await drive.files.get({
      fileId: conversation.driveAudioFileId,
      fields: 'name, mimeType',
    });
    if (res.data.name) fileName = res.data.name;
    if (res.data.mimeType) mimeType = res.data.mimeType;
  } catch (err) {
    console.error('[notes] audio metadata fetch failed', err);
  }

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
        conversationId={conversationId}
        fileId={conversation.driveAudioFileId}
        fileName={fileName}
        mimeType={mimeType}
        currentUserId={user.id}
        initialThreadId={threadQuery ?? null}
      />
    </main>
  );
}
