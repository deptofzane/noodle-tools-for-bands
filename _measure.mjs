import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
for (const f of files) {
  const b64 = readFileSync(f).toString('base64');
  const out = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    const px = (x, y) => { const i = (y * c.width + x) * 4; return [data[i], data[i+1], data[i+2]]; };
    // cyan-ish: blue high, green mid, red low
    const isCyan = ([r,g,b]) => b > 110 && g > 90 && r < 110 && b > r + 50;
    const isLight = ([r,g,b]) => r > 190 && g > 190 && b > 190;
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
    let gMinX = 1e9, gMaxX = -1, gMinY = 1e9, gMaxY = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const p = px(x, y);
      if (isCyan(p)) { if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; }
      if (isLight(p)) { if(x<gMinX)gMinX=x; if(x>gMaxX)gMaxX=x; if(y<gMinY)gMinY=y; if(y>gMaxY)gMaxY=y; }
    }
    // stroke: scan the middle row across the left edge of the ring
    const midY = Math.round((minY + maxY) / 2);
    let stroke = 0, counting = false;
    for (let x = minX; x < c.width; x++) {
      if (isCyan(px(x, midY))) { counting = true; stroke++; }
      else if (counting) break;
    }
    const bg = px(1, 1);
    return {
      size: c.width, bg,
      ringOuter: maxX - minX + 1, ringFrac: (maxX - minX + 1) / c.width,
      ringCenterX: (minX + maxX) / 2, ringCenterY: (minY + maxY) / 2,
      stroke, strokeFrac: stroke / c.width,
      glyphW: gMaxX - gMinX + 1, glyphH: gMaxY - gMinY + 1,
      glyphFracH: (gMaxY - gMinY + 1) / c.width,
      glyphCenterY: (gMinY + gMaxY) / 2,
    };
  }, b64);
  console.log(f, JSON.stringify(out, null, 1));
}
await browser.close();
