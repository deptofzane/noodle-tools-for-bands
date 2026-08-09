/**
 * Generates the app icons from the header's monogram.
 *
 * The mark is the one in `app/Header.tsx`: a serif lowercase "n" inside a
 * cyan ring. Rendering it in a real browser rather than hand-drawing an SVG
 * keeps the icon and the header the same shape — same font stack, same
 * stroke, same optical centring — so they can't drift apart.
 *
 * Three variants, because they're cropped and scaled differently:
 *
 *   - **maskable** (`icon-192`, `icon-512`) — Android may crop these to a
 *     circle, a squircle, or a rounded square, so the ring stays inside the
 *     central 80% the spec guarantees. It looks small on its own; that's the
 *     cost of surviving every mask.
 *   - **bold** (apple-touch, 32px favicon) — nothing crops these, so the ring
 *     fills the tile and the stroke is heavier.
 *   - **tiny** (16px favicon) — no ring at all; see the variant's note.
 *
 * PNGs only — there's deliberately no `app/favicon.ico`. The 16 and 32 above
 * are declared explicitly in `app/layout.tsx`, which is what browsers pick
 * from; an .ico only ever answered bare `/favicon.ico` hits, and Next's file
 * convention gives it a fixed URL that can't carry the `?v=` the rest of the
 * icons use (see lib/app-icons.ts), so it was the one file guaranteed to go on
 * serving stale art out of the service worker's image cache.
 *
 * Run: `npx tsx scripts/make-icons.ts`
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

/** Tailwind's `cyan-600`, the ring colour the header uses. */
const RING = '#0891b2';
/** Asked-for backdrop. Full-bleed: iOS and Android both dislike transparency. */
const BACKGROUND = '#171717';
/** Tailwind's default `font-serif` stack, which is what the header renders. */
const SERIF = 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';

interface Variant {
  /** Ring diameter as a fraction of the icon; 0 draws no ring. */
  ring: number;
  /** Ring stroke as a fraction of the icon. */
  stroke: number;
  /** Cap height of the "n" as a fraction of the icon. */
  glyph: number;
}

const VARIANTS: Record<'maskable' | 'bold' | 'tiny', Variant> = {
  // 0.62 keeps the whole ring inside the 80% safe circle with room to spare.
  maskable: { ring: 0.62, stroke: 0.032, glyph: 0.3 },
  bold: { ring: 0.84, stroke: 0.045, glyph: 0.46 },
  // At 16px a 1px ring and the letter inside it merge into a smudge. The
  // ring is the part that goes: a tab is identified by its silhouette, and
  // a legible "n" is a better silhouette than a circle with something in it.
  tiny: { ring: 0, stroke: 0, glyph: 0.62 },
};

function markup(size: number, v: Variant): string {
  const ring = v.ring ? size * v.ring : 0;
  const ringStyle = v.ring
    ? `width: ${ring}px; height: ${ring}px;
       border: ${size * v.stroke}px solid ${RING};
       border-radius: 9999px;
       padding-bottom: ${ring * 0.08}px;`
    : '';
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; }
  body {
    width: ${size}px; height: ${size}px;
    background: ${BACKGROUND};
    display: flex; align-items: center; justify-content: center;
  }
  .ring {
    display: flex; align-items: center; justify-content: center;
    box-sizing: border-box;
    /* The ring nudges the glyph up off its optical centre; a serif "n" sits
       low in its line box without it. */
    ${ringStyle}
  }
  .n {
    font-family: ${SERIF};
    font-size: ${size * v.glyph * 1.9}px;
    line-height: 1;
    color: ${v.ring ? '#fafafa' : RING};
  }
</style></head>
<body><div class="ring"><span class="n">n</span></div></body></html>`;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  mkdirSync('public/icons', { recursive: true });

  const targets: [string, number, keyof typeof VARIANTS][] = [
    ['public/icons/icon-192.png', 192, 'maskable'],
    ['public/icons/icon-512.png', 512, 'maskable'],
    ['public/icons/apple-touch-icon.png', 180, 'bold'],
    ['public/icons/favicon-32.png', 32, 'bold'],
    ['public/icons/favicon-16.png', 16, 'tiny'],
  ];

  for (const [path, size, variant] of targets) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(markup(size, VARIANTS[variant]));
    const png = await page.screenshot({ omitBackground: false });
    writeFileSync(path, png);
    console.log(`${path}  ${size}×${size}  (${variant})`);
  }

  await browser.close();
}

void main();
