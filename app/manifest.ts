import type { MetadataRoute } from 'next';

/**
 * Web app manifest (served at /manifest.webmanifest; Next injects the <link>
 * automatically). Makes Sidestage installable to the home screen on
 * tablets/phones and launches it chrome-free in `standalone` mode.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sidestage',
    short_name: 'Sidestage',
    description:
      'Setlists, sheet music, and practice tools for your band — on stage and off.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2563eb',
    orientation: 'any',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      // Same art doubles as maskable: the backdrop is full-bleed and the motif
      // sits inside the safe zone, so platform masking won't clip it.
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
