'use client';

import { BandChat } from '../BandChat';
import { useBandChatData, useBandChatStream } from '../bandDetailHooks';
import { LoadingBlock } from '../../../Spinner';

/**
 * Chat page coordinator: loads the band (for @-mention targets and the
 * moderation check), holds the live signal, and renders the chat itself.
 */
export function BandChatClient({
  bandId,
  currentUserId,
}: {
  bandId: string;
  currentUserId: string;
}) {
  const { data, error } = useBandChatData(bandId);
  const chatChange = useBandChatStream(bandId);

  if (error) {
    return (
      <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
        {error}
      </p>
    );
  }

  if (!data) return <LoadingBlock />;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="title-text">{data.band.name} chat</h1>

      <BandChat
        bandId={bandId}
        currentUserId={currentUserId}
        canModerate={data.myRole === 'owner'}
        changeSignal={chatChange}
        mentionables={data.members.map((m) => ({
          id: m.userId,
          name: m.name,
          email: m.email,
        }))}
      />
    </div>
  );
}
