import { PageHeader } from '../../../PageHeader';
import { notFound, redirect } from 'next/navigation';
import { getCurrentDbUser } from '@/lib/current-user';
import { listMyBands } from '@/lib/db/bands';
import { getConversationMembership } from '@/lib/db/conversations';
import { getSongFileMeta } from '@/lib/db/song-files';
import { EditSongClient } from './EditSongClient';

/**
 * Edit-song page. Server shell — checks band membership, then hands the
 * conversation, the user's bands (move targets), and any sheet-music
 * metadata to the client editor.
 */
export default async function EditSongPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;

  const user = await getCurrentDbUser();
  if (!user) redirect('/login');

  const membership = await getConversationMembership(user.id, conversationId);
  if (!membership) notFound();
  const conversation = membership.conversation;

  const [bands, sheet] = await Promise.all([
    listMyBands(user.id),
    getSongFileMeta(conversationId, 'sheet_music'),
  ]);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-6 py-4">
      <PageHeader backHref={`/notes/${conversationId}`} />

      <EditSongClient
        conversationId={conversationId}
        initialName={conversation.audioFileName ?? ''}
        initialBandId={conversation.bandId}
        initialArchived={conversation.archived}
        bands={bands.map((b) => ({ id: b.id, name: b.name }))}
        sheetMusic={
          sheet
            ? {
                fileName: sheet.fileName,
                mimeType: sheet.mimeType,
                updatedAt: sheet.updatedAt,
              }
            : null
        }
      />
    </main>
  );
}
