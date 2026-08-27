import { PageHeader } from '../../../PageHeader';
import { auth } from '@/auth';
import { FileManagerClient } from './FileManagerClient';

/**
 * A band's stored files: what they add up to, and what can go.
 *
 * Server shell only — membership and the owners-only delete are enforced by
 * `/api/bands/[bandId]/files`, so this page just guards the session.
 */
export default async function BandFilesPage({
  params,
}: {
  params: Promise<{ bandId: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const { bandId } = await params;

  return (
    <main className="main-container">
      <PageHeader defaultHref={`/bands/${bandId}`} defaultHrefName="Overview" />

      <FileManagerClient bandId={bandId} />
    </main>
  );
}
