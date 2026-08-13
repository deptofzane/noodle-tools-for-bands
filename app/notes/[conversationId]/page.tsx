import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getCurrentDbUser } from '@/lib/current-user';
import { getConversationMembership } from '@/lib/db/conversations';
import { getSongFileMeta, listAudioVersions } from '@/lib/db/song-files';
import { PlayerProvider } from './PlayerContext';
import { AudioPlayer } from './AudioPlayer';
import { SheetMusic } from './SheetMusic';
import { SongDetails } from './SongDetails';
import { SongActions } from './SongActions';
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

  // Back to where the user came from: the band's Audio page (songs are linked
  // from there), or the band page reopening the tab they came from.
  const bandTabs = ['overview', 'chat', 'polls'];
  const backHref =
    from === 'audio'
      ? `/bands/${conversation.bandId}/audio`
      : from && bandTabs.includes(from)
        ? `/bands/${conversation.bandId}?tab=${from}`
        : `/bands/${conversation.bandId}`;
  const backName = from === 'audio' ? 'Audio' : 'Overview';

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
    <main className="main-container">
      <PageHeader defaultHref={backHref} defaultHrefName={backName} />
      {/* The song, not the version being played — the player's own title
          shows which version that is. */}
      {audio && <p className="text-sm text-neutral-200 mx-auto">{fileName}</p>}

      <PlayerProvider>
        <div className="flex flex-col gap-6">
          {audio ? (
            <AudioPlayer
              src={`/api/conversations/${conversationId}/files/audio?name=${encodeURIComponent(
                fileName,
              )}`}
              fileName={fileName}
              mimeType={mimeType}
              bpm={conversation.bpm}
              songKey={conversation.key}
              conversationId={conversationId}
              versions={audioVersions.map((v) => ({
                id: v.id,
                fileName: v.fileName,
                mimeType: v.mimeType,
                label: v.label,
                isDefault: v.isDefault,
              }))}
            />
          ) : (
            <p className="rounded-md border border-neutral-200 px-3 py-6 text-center text-sm minor-text-theme-colors dark:border-neutral-800">
              No audio yet. Add audio from the Edit song page.
            </p>
          )}
          {/* Always rendered, unlike before: the header row now carries the
              song's kebab (Edit / Practice / Live), and a song with no tempo,
              key, or sheet music yet would otherwise have nowhere to edit it
              from. The body still shows only what exists. */}
          <SongDetails
            actions={
              <SongActions
                conversationId={conversationId}
                hasSheetMusic={Boolean(sheetMusic)}
              />
            }
          >
            <span className="flex justify-around items-center">
              {(conversation.originalBand ||
                conversation.bpm != null ||
                conversation.key) && (
                <div className="flex flex-col items-center gap-1 text-sm text-neutral-600 dark:text-neutral-400">
                    {conversation.originalBand && (
                      <span>
                        Originally by{' '}
                        <span className="font-medium">
                          {conversation.originalBand}
                        </span>
                      </span>
                    )}
                    {(conversation.bpm != null || conversation.key) && (
                      <div className="flex justify-center flex-col md:flex-row md:gap-3 gap-1">
                        {conversation.bpm != null && (
                          <span>
                            <span className="font-medium">
                              {conversation.bpm}
                            </span>{' '}
                            BPM
                          </span>
                        )}
                        {conversation.key && (
                          <span>
                            Key of{' '}
                            <span className="font-medium">
                              {conversation.key}
                            </span>
                          </span>
                        )}
                      </div>
                  )}
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
