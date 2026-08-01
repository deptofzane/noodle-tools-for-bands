import { PageHeader } from '../../../../../PageHeader';
import { auth } from '@/auth';
import { UploadDayClient } from './UploadDayClient';

/**
 * The tracks uploaded on one day, in order, playable as a playlist. `day` is a
 * local calendar day (`YYYY-MM-DD`) as grouped by the Audio page's Uploads tab
 * — the filtering happens client-side for that reason: only the browser knows
 * which timezone those groupings were made in.
 */
export default async function UploadDayPage({
  params,
}: {
  params: Promise<{ bandId: string; day: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const { bandId, day } = await params;

  return (
    <main className="main-container">
      <PageHeader
        defaultHref={`/bands/${bandId}/audio?tab=uploads`}
        defaultHrefName="Uploads"
      />

      <UploadDayClient bandId={bandId} day={day} />
    </main>
  );
}
