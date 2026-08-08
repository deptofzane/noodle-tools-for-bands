import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const RING='#0891b2', BG='#171717';
const SERIF='ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';
function markup(size, v){const ring=size*v.ring;return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0}body{width:${size}px;height:${size}px;background:${BG};display:flex;align-items:center;justify-content:center}
.ring{width:${ring}px;height:${ring}px;border:${size*v.stroke}px solid ${RING};border-radius:9999px;display:flex;align-items:center;justify-content:center;padding-bottom:${ring*0.08}px;box-sizing:border-box}
.n{font-family:${SERIF};font-size:${size*v.glyph*1.9}px;line-height:1;color:#fafafa}
</style></head><body><div class="ring"><span class="n">n</span></div></body></html>`;}
const b=await chromium.launch();const p=await b.newPage();
p.setViewportSize({width:192,height:192});
await p.setContent(markup(192,{ring:0.62,stroke:0.032,glyph:0.3}));
writeFileSync('/tmp/mine-192.png', await p.screenshot());
await b.close();
