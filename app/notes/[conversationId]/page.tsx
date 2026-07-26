import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getCurrentDbUser } from '@/lib/current-user';
import { getConversationMembership } from '@/lib/db/conversations';
import { getSongFileMeta, listAudioVersions } from '@/lib/db/song-files';
import { PlayerProvider } from './PlayerContext';
import { AudioPlayer } from './AudioPlayer';
import { SheetMusic } from './SheetMusic';
import { SongDetails } from './SongDetails';
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
  searchParams: Promise<{ thread?: string; from?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const { conversationId } = await params;
  const { thread: threadQuery, from } = await searchParams;

  const user = await getCurrentDbUser();
  if (!user) redirect('/login');

  const membership = await getConversationMembership(user.id, conversationId);
  if (!membership) notFound();
  const conversation = membership.conversation;

  // Back to the band page, reopening the tab the user came from (songs are
  // linked from the Audio tab) so the same tab appears on return.
  const bandTabs = ['overview', 'chat', 'polls', 'audio'];
  const backHref =
    from && bandTabs.includes(from)
      ? `/bands/${conversation.bandId}?tab=${from}`
      : `/bands/${conversation.bandId}`;

  // Player metadata from the stored audio file, falling back to the
  // conversation's name if the audio hasn't been imported yet. Sheet
  // music meta (if any) seeds the SheetMusic panel.
  const [audio, sheet, audioVersions] = await Promise.all([
    getSongFileMeta(conversationId, 'audio'),
    getSongFileMeta(conversationId, 'sheet_music'),
    listAudioVersions(conversationId),
  ]);
  const fileName = conversation.audioFileName ?? audio?.fileName ?? 'audio';
  const mimeType = audio?.mimeType ?? 'audio/mpeg';
  // Read the Picker API key server-side (runtime) and pass it to the client
  // pickers — NEXT_PUBLIC_* is inlined into client bundles at build time.
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? '';
  const sheetMusic = sheet
    ? {
        fileName: sheet.fileName,
        mimeType: sheet.mimeType,
        updatedAt: sheet.updatedAt,
      }
    : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 pb-4">
      <PageHeader defaultHref={backHref} defaultHrefName='Overview'>
        <Link
          href={`/notes/${conversationId}/edit`}
          className="hover:text-neutral-900 dark:hover:text-neutral-100 py-4"
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
            conversationId={conversationId}
            versions={audioVersions.map((v) => ({
              id: v.id,
              fileName: v.fileName,
              mimeType: v.mimeType,
              label: v.label,
              isDefault: v.isDefault,
            }))}
          />
          {(conversation.bpm != null || conversation.key || sheetMusic) && (
            <SongDetails>
              <span className="flex justify-around">
                {(conversation.bpm != null || conversation.key) && (
                  <div className="flex justify-center flex-col md:flex-row md:gap-3 gap-1 text-sm text-neutral-600 dark:text-neutral-400">
                    {conversation.bpm != null && (
                      <span>
                        <span className="font-medium">{conversation.bpm}</span>{' '}
                        BPM
                      </span>
                    )}
                    {conversation.key && (
                      <span>
                        Key of{' '}
                        <span className="font-medium">{conversation.key}</span>
                      </span>
                    )}
                  </div>
                )}
                {sheetMusic && (
                  <div className="flex gap-2 justify-center">
                    <Link
                      href={`/notes/${conversationId}/practice`}
                      className="rounded-md border h-12 md:h-9 flex items-center border-neutral-300 px-4 md:px-3 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
                    >
                      Practice
                    </Link>
                    <Link
                      href={`/notes/${conversationId}/live`}
                      className="rounded-md border h-12 md:h-9 flex items-center border-neutral-300 px-4 md:px-3 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
                    >
                      Live
                    </Link>
                  </div>
                )}
              </span>
              <SheetMusic
                conversationId={conversationId}
                apiKey={apiKey}
                initial={sheetMusic}
                startClosed={false}
              />
            </SongDetails>
          )}
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
