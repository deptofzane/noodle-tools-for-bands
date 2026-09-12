import { PageHeader } from '../PageHeader';
import { auth } from '@/auth';
import { SchedulingClient } from './SchedulingClient';
import { DEFAULT_SCHEDULING_VIEW, isSchedulingView } from './schedulingViews';

/**
 * Scheduling. Server shell — verifies the session and resolves `?view=`, then
 * defers to the client, which owns the pills and the panel behind them.
 */
export default async function SchedulingPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const { view } = await searchParams;

  return (
    <main className="main-container">
      <PageHeader defaultHref="/home" />

      <SchedulingClient
        initialView={isSchedulingView(view) ? view : DEFAULT_SCHEDULING_VIEW}
      />
    </main>
  );
}
