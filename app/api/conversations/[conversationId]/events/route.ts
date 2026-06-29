import { getCurrentDbUser } from '@/lib/current-user';
import { getConversationMembership } from '@/lib/db/conversations';
import { getNotifyHub } from '@/lib/db/notify';

/**
 * GET /api/conversations/[conversationId]/events
 *   → Server-Sent Events stream. Emits a `change` event whenever the
 *     conversation is mutated (via the Postgres LISTEN/NOTIFY hub), so
 *     the notes panel can refetch in near-real-time instead of waiting
 *     for its backstop poll. Requires band membership.
 *
 * Long-lived connection — intended for the persistent Node server, not
 * serverless. Subscribes in-memory to the shared listener (one DB
 * connection for the whole process), so each open page is cheap.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const user = await getCurrentDbUser();
  if (!user) return new Response('unauthenticated', { status: 401 });
  const { conversationId } = await params;

  if (!(await getConversationMembership(user.id, conversationId))) {
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
      unsubscribe = hub.subscribe(conversationId, () => {
        send('event: change\ndata: {}\n\n');
      });
      // Keep proxies/load balancers from idling the connection out.
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
