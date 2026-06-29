import { EventEmitter } from 'node:events';
import { Client } from 'pg';

/**
 * Postgres LISTEN/NOTIFY fan-out hub.
 *
 * One dedicated connection LISTENs on a single channel for the whole
 * process; the payload is the conversation id that changed. SSE routes
 * subscribe in-memory (via an EventEmitter) rather than each holding
 * their own DB connection — so N open notes pages cost one Postgres
 * connection, not N.
 *
 * Mutations emit `pg_notify('conversation_activity', <conversationId>)`
 * from inside their transaction (see `recordActivity`), so the signal
 * fires exactly when — and only if — the change commits.
 *
 * Best-effort: if the listener connection drops it reconnects with a
 * small backoff, and the notes panel keeps a periodic poll as a backstop,
 * so a briefly-missed notification self-heals.
 *
 * Node-only. The singleton is stashed on `globalThis` so dev hot-reload
 * doesn't open a new listener connection on every reload.
 */

export const CONVERSATION_CHANNEL = 'conversation_activity';

class NotifyHub {
  private emitter = new EventEmitter();
  private client: Client | null = null;
  private connecting: Promise<void> | null = null;

  constructor() {
    // Many conversations × many tabs → unbounded distinct listeners.
    this.emitter.setMaxListeners(0);
  }

  /** Ensure the dedicated LISTEN connection is up. Safe to call often. */
  async ensureListening(): Promise<void> {
    if (this.client) return;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      client.on('notification', (msg) => {
        if (msg.channel === CONVERSATION_CHANNEL && msg.payload) {
          this.emitter.emit(msg.payload);
        }
      });
      client.on('error', (err) => {
        console.error('[notify] listener error', err);
        this.handleDrop();
      });
      client.on('end', () => this.handleDrop());
      await client.connect();
      await client.query(`LISTEN ${CONVERSATION_CHANNEL}`);
      this.client = client;
    })();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private handleDrop() {
    this.client = null;
    // Reconnect shortly; subscribers persist on the emitter across drops.
    setTimeout(() => {
      this.ensureListening().catch((err) =>
        console.error('[notify] reconnect failed', err),
      );
    }, 1000);
  }

  /** Subscribe to changes for one conversation. Returns an unsubscribe fn. */
  subscribe(conversationId: string, onChange: () => void): () => void {
    this.emitter.on(conversationId, onChange);
    return () => this.emitter.off(conversationId, onChange);
  }
}

const globalForNotify = globalThis as unknown as { __notifyHub?: NotifyHub };

export function getNotifyHub(): NotifyHub {
  if (!globalForNotify.__notifyHub) {
    globalForNotify.__notifyHub = new NotifyHub();
  }
  return globalForNotify.__notifyHub;
}
