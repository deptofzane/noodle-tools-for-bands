import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getCurrentDbUser } from '@/lib/current-user';
import { getConversationMembership } from '@/lib/db/conversations';
import { getSongFileMeta } from '@/lib/db/song-files';
import { NotesView } from './NotesView';

/**
 * Notes page (Postgres conversations).
 *
 * Server component:
 *   1. Verifies the session and resolves the conversation by id, checking
 *      band membership.
 *   2. Reads the stored audio's name + MIME from Postgres for the player.
 *   3. Renders <NotesView>, which wires the player + notes panel.
 *
 * Audio streams from `/api/conversations/[id]/audio` (Postgres); notes
 * flow through `/api/conversations/[conversationId]/*`. No Drive scopes
 * are needed here — audio is owned by us now.
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

  const { conversationId } = await params;
  const { thread: threadQuery } = await searchParams;

  const user = await getCurrentDbUser();
  if (!user) redirect('/login');

  const membership = await getConversationMembership(user.id, conversationId);
  if (!membership) notFound();
  const conversation = membership.conversation;

  // Player metadata from the stored audio file, falling back to the
  // conversation's name if the audio hasn't been imported yet. Sheet
  // music meta (if any) seeds the SheetMusic panel.
  const [audio, sheet] = await Promise.all([
    getSongFileMeta(conversationId, 'audio'),
    getSongFileMeta(conversationId, 'sheet_music'),
  ]);
  const fileName = audio?.fileName ?? conversation.audioFileName ?? 'audio';
  const mimeType = audio?.mimeType ?? 'audio/mpeg';
  const sheetMusic = sheet
    ? { fileName: sheet.fileName, mimeType: sheet.mimeType }
    : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-6 py-4">
      <header className="flex items-center gap-2 text-xs text-neutral-500">
        <Link
          href="/open-conversations"
          className="hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          ← Open Conversations
        </Link>
      </header>

      <NotesView
        conversationId={conversationId}
        fileName={fileName}
        mimeType={mimeType}
        currentUserId={user.id}
        initialThreadId={threadQuery ?? null}
        sheetMusic={sheetMusic}
      />
    </main>
  );
}
