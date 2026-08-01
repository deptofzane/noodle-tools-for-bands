import { OfflineClient } from './OfflineClient';

/**
 * The offline screen. Deliberately has no server data of its own: the service
 * worker precaches this route and serves it whenever a navigation fails, so it
 * has to render from the cache alone, for whoever is holding the device.
 * What's actually available comes from IndexedDB, on the client.
 */
export default function OfflinePage() {
  return (
    <main className="main-container">
      <OfflineClient />
    </main>
  );
}
