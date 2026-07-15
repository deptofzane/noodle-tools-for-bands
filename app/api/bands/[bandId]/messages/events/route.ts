import { getCurrentDbUser } from '@/lib/current-user';
import { getMembership } from '@/lib/db/bands';
import { getNotifyHub } from '@/lib/db/notify';

/**
 * GET /api/bands/[bandId]/messages/events
 *   → Server-Sent Events stream. Emits a `change` event whenever the
 *     band's chat is mutated (post/delete), via the Postgres LISTEN/NOTIFY
 *     hub, so the chat refetches in near-real-time. Requires membership.
 *
 * Long-lived connection for the persistent Node server (not serverless).
 * Subscribes in-memory to the shared listener, so each open tab is cheap.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ bandId: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return new Response('unauthenticated', { status: 401 });
  const { bandId } = await params;

  if (!(await getMembership(user.id, bandId))) {
    return new Response('forbidden', { status: 403 });
  }

  const hub = getNotifyHub();
  await hub.ensureListening();

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Controller already closed — ignore.
        }
      };

      send(': connected\n\n');
      unsubscribe = hub.subscribeBand(bandId, () => {
        send('event: change\ndata: {}\n\n');
      });
      heartbeat = setInterval(() => send(': ping\n\n'), 25_000);

      const cleanup = () => {
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        unsubscribe?.();
        unsubscribe = null;
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      req.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
