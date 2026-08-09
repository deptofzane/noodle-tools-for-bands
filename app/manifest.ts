import type { MetadataRoute } from 'next';
import { appIcons } from '@/lib/app-icons';

type ManifestIcon = NonNullable<MetadataRoute.Manifest['icons']>[number];

/**
 * `purpose: "any maskable"` — one icon serving both roles.
 *
 * The art is drawn for masking already: a full-bleed backdrop with the motif
 * centered across 62.5% of the canvas, comfortably inside the 80% safe zone, so
 * no platform mask can clip it. The manifest spec makes `purpose` a
 * space-separated set precisely so one file can say this; Next's type predates
 * that and permits a single keyword, hence the cast.
 *
 * Listing the file once matters. It used to appear twice — the same `src` as
 * `any` and again as `maskable` — and a duplicate `src` leaves icon selection
 * up to how a given browser walks the list, which is not something to leave
 * ambiguous when Firefox on Android is one of the readers.
 */
const ANY_MASKABLE = 'any maskable' as ManifestIcon['purpose'];

/**
 * Web app manifest (served at /manifest.webmanifest; Next injects the <link>
 * automatically). Makes Noodle installable to the home screen on
 * tablets/phones and launches it chrome-free in `standalone` mode.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Noodle',
    short_name: 'Noodle',
    description:
      'Setlists, sheet music, and practice tools for your band — on stage and off.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#171717',
    theme_color: '#2563eb',
    orientation: 'any',
    icons: [
      {
        src: appIcons.icon192,
        sizes: '192x192',
        type: 'image/png',
        purpose: ANY_MASKABLE,
      },
      {
        src: appIcons.icon512,
        sizes: '512x512',
        type: 'image/png',
        purpose: ANY_MASKABLE,
      },
    ],
  };
}
