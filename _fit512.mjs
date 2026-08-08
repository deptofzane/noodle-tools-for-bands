import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const RING = '#0891b2', BG = '#171717';
const SERIF = 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';
const SIZE = 512;
// Measured from the hand-corrected icon-192.png: ring 120/192, stroke 6/192,
// glyph height 53/192, glyph centred on the ring.
const RING_FRAC = 120 / 192, STROKE_FRAC = 6 / 192, GLYPH_FRAC = 53 / 192;

function markup(fontPx, nudgePx) {
  const ring = SIZE * RING_FRAC;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0}
body{width:${SIZE}px;height:${SIZE}px;background:${BG};display:flex;align-items:center;justify-content:center}
.ring{width:${ring}px;height:${ring}px;border:${SIZE * STROKE_FRAC}px solid ${RING};
 border-radius:9999px;display:flex;align-items:center;justify-content:center;box-sizing:border-box}
.n{font-family:${SERIF};font-size:${fontPx}px;line-height:1;color:#fafafa;
 display:block;transform:translateY(${nudgePx}px)}
</style></head><body><div class="ring"><span class="n">n</span></div></body></html>`;
}

const measure = (b64) => `(async () => {
  const img = new Image(); img.src = 'data:image/png;base64,${b64}'; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0,0,c.width,c.height).data;
  const at=(px,py)=>{const i=(py*c.width+px)*4;return [d[i],d[i+1],d[i+2]];};
  const cy=([r,g,b])=>b>110&&g>90&&r<110&&b>r+50, li=([r,g,b])=>r>190&&g>190&&b>190;
  let rMinY=1e9,rMaxY=-1,gMinY=1e9,gMaxY=-1,gMinX=1e9,gMaxX=-1;
  for(let y=0;y<c.height;y++)for(let px2=0;px2<c.width;px2++){const p=at(px2,y);
    if(cy(p)){if(y<rMinY)rMinY=y;if(y>rMaxY)rMaxY=y;}
    if(li(p)){if(y<gMinY)gMinY=y;if(y>gMaxY)gMaxY=y;if(px2<gMinX)gMinX=px2;if(px2>gMaxX)gMaxX=px2;}}
  return {ringC:(rMinY+rMaxY)/2, ringOuter:rMaxY-rMinY+1, glyphH:gMaxY-gMinY+1,
          glyphW:gMaxX-gMinX+1, glyphC:(gMinY+gMaxY)/2};
})()`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: SIZE, height: SIZE });

const targetGlyphH = SIZE * GLYPH_FRAC;
let font = SIZE * 0.55, nudge = 0, shot;

for (let i = 0; i < 6; i++) {
  await page.setContent(markup(font, nudge));
  shot = await page.screenshot();
  const m = await page.evaluate(measure(shot.toString('base64')));
  console.log(
    `iter ${i}: font=${font.toFixed(1)} nudge=${nudge.toFixed(1)} ` +
    `glyphH=${m.glyphH} (target ${targetGlyphH.toFixed(1)}) ` +
    `glyphC=${m.glyphC} ringC=${m.ringC}`,
  );
  const dh = targetGlyphH - m.glyphH;
  const dc = m.ringC - m.glyphC;
  if (Math.abs(dh) < 1 && Math.abs(dc) < 0.6) break;
  font *= targetGlyphH / m.glyphH;
  nudge += dc;
}

writeFileSync('public/icons/icon-512.png', shot);
console.log('wrote public/icons/icon-512.png');
await browser.close();
