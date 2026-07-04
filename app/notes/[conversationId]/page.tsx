import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getCurrentDbUser } from '@/lib/current-user';
import { getConversationMembership } from '@/lib/db/conversations';
import { getSongFileMeta } from '@/lib/db/song-files';
import { PlayerProvider } from './PlayerContext';
import { AudioPlayer } from './AudioPlayer';
import { SheetMusic } from './SheetMusic';
import { NotesPanel } from './NotesPanel';
import { PageHeader } from '../../PageHeader';

/**
 * Notes page (Postgres conversations).
 *
 * Server component:
 *   1. Verifies the session and resolves the conversation by id, checking
 *      band membership.
 *   2. Reads the stored audio's name + MIME from Postgres for the player.
 *   3. Renders the player, sheet music, and notes panel as siblings
 *      under <PlayerProvider> (which owns the shared audio engine).
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
  const fileName = conversation.audioFileName ?? audio?.fileName ?? 'audio';
  const mimeType = audio?.mimeType ?? 'audio/mpeg';
  const sheetMusic = sheet
    ? { fileName: sheet.fileName, mimeType: sheet.mimeType, updatedAt: sheet.updatedAt }
    : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-6 py-4">
      <PageHeader backHref={`/bands/${conversation.bandId}`}>
        <Link
          href={`/notes/${conversationId}/edit`}
          className="hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          Edit song
        </Link>
      </PageHeader>

      <PlayerProvider>
        <div className="flex flex-col gap-6">
          <AudioPlayer
            src={`/api/conversations/${conversationId}/files/audio?name=${encodeURIComponent(
              fileName,
            )}`}
            fileName={fileName}
            mimeType={mimeType}
          />
          <SheetMusic conversationId={conversationId} initial={sheetMusic} />
          <NotesPanel
            conversationId={conversationId}
            currentUserId={user.id}
            initialThreadId={threadQuery ?? null}
          />
        </div>
      </PlayerProvider>
    </main>
  );
}
