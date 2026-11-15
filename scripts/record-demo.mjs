// Records the narrated demo: drives the app in Chrome on the narration's timeline and captures every repaint with the
// DevTools screencast, plus a visible cursor, click ripples and highlight boxes.
// Needs the dev server (npm run dev) and the live model service (model/.venv/bin/python model/server.py).
// Usage: node scripts/record-demo.mjs <framesDir>   then scripts/make-demo-video.sh assembles the video.
// SCALE=2 records at 3840 by 2160: the window is twice as large and the page and effects are zoomed twice as much,
// so the layout matches 1920 by 1080 with four times the pixels. LABELS=0 hides the callout labels.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
if (!OUT) throw new Error('Usage: node scripts/record-demo.mjs <framesDir>');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const base = 'http://localhost:5173';
const ZOOM = 0.8;
const SCALE = Number(process.env.SCALE ?? 2);
const LABELS = process.env.LABELS !== '0';
const END = 59.2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1920 * SCALE, height: 1080 * SCALE } });
await ctx.addInitScript(([zoom, K]) => {
  try {
    localStorage.setItem('oncall36:v3', JSON.stringify({ locale: 'zh', alertAck: new Date().toISOString(), holds: [], log: [], request: { forced: {}, capScale: {}, delays: {} } }));
  } catch { /* storage unavailable */ }
  addEventListener('DOMContentLoaded', () => {
    const css = document.createElement('style');
    css.textContent = `
      #root { zoom: ${zoom * K}; }
      .alert-backdrop { backdrop-filter: none !important; background: rgba(40, 10, 8, 0.55) !important; }
      .shell { min-height: calc(100vh / ${zoom * K}); }
      .sidebar { height: calc(100vh / ${zoom * K}); }
      .alert-dialog { max-height: calc(100vh / ${zoom * K} - 32px); }
      #demo-layer { position: fixed; inset: 0; zoom: ${K}; pointer-events: none; z-index: 2147483640; }
      #demo-layer > * { position: absolute !important; }
      html { scroll-behavior: auto !important; }
      #demo-cursor { position: fixed; left: 0; top: 0; width: 46px; height: 46px; z-index: 2147483647; pointer-events: none; filter: drop-shadow(0 3px 4px rgba(0,0,0,.45)); }
      #demo-halo { position: fixed; left: 0; top: 0; width: 64px; height: 64px; margin: -32px 0 0 -32px; z-index: 2147483646; pointer-events: none;
        border-radius: 50%; background: rgba(255,179,0,.28); border: 2px solid rgba(255,179,0,.85); }
      .demo-ripple { position: fixed; z-index: 2147483646; pointer-events: none; width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50%;
        border: 5px solid #ffb300; background: rgba(255,179,0,.25); animation: demo-ripple .75s ease-out forwards; }
      .demo-ripple--2 { animation-delay: .12s; border-color: #006564; background: none; }
      @keyframes demo-ripple { from { transform: scale(.5); opacity: 1; } to { transform: scale(4.6); opacity: 0; } }
      .demo-spot { position: fixed; z-index: 2147483640; pointer-events: none; border: 5px solid #ffb300; border-radius: 18px;
        box-shadow: 0 0 0 9999px rgba(12,20,28,.55), 0 0 0 10px rgba(255,179,0,.30), 0 0 34px 8px rgba(255,179,0,.55);
        opacity: 0; transition: opacity .3s ease; }
      .demo-spot--on { opacity: 1; animation: demo-pulse 1.1s ease-in-out infinite; }
      @keyframes demo-pulse { 0%, 100% { border-color: #ffb300; } 50% { border-color: #ffd54f; } }
      .demo-label { position: fixed; z-index: 2147483641; pointer-events: none; background: #ffb300; color: #1a1300; font: 800 30px/1.2 'PingFang HK', 'Figtree', sans-serif;
        padding: 12px 22px; border-radius: 14px; box-shadow: 0 10px 28px rgba(0,0,0,.35); white-space: nowrap; opacity: 0; transform: translateY(8px);
        transition: opacity .3s ease, transform .3s ease; }
      .demo-label--on { opacity: 1; transform: none; }`;
    document.head.appendChild(css);
    const cur = document.createElement('div');
    cur.id = 'demo-cursor';
    cur.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 2l15 11-6.5 1.2 3.8 7.2-2.9 1.5-3.8-7.3L4 20z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    const halo = document.createElement('div');
    halo.id = 'demo-halo';
    const layer = document.createElement('div');
    layer.id = 'demo-layer';
    document.body.appendChild(layer);
    layer.appendChild(halo);
    layer.appendChild(cur);
    addEventListener('mousemove', (e) => {
      cur.style.transform = `translate(${e.clientX / K - 6}px, ${e.clientY / K - 3}px)`;
      halo.style.transform = `translate(${e.clientX / K}px, ${e.clientY / K}px)`;
    }, true);
    addEventListener('mousedown', (e) => {
      for (const cls of ['demo-ripple', 'demo-ripple demo-ripple--2']) {
        const r = document.createElement('div');
        r.className = cls; r.style.left = `${e.clientX / K}px`; r.style.top = `${e.clientY / K}px`;
        layer.appendChild(r); setTimeout(() => r.remove(), 1000);
      }
    }, true);
    window.__spot = (x0, y0, w0, h0, ms, text) => {
      const [x, y, w, h] = [x0 / K, y0 / K, w0 / K, h0 / K];
      const W = innerWidth / K, H = innerHeight / K;
      const s = document.createElement('div');
      s.className = 'demo-spot';
      Object.assign(s.style, { left: `${x - 10}px`, top: `${y - 10}px`, width: `${w + 20}px`, height: `${h + 20}px` });
      layer.appendChild(s);
      const els = [s];
      if (text) {
        const l = document.createElement('div');
        l.className = 'demo-label'; l.textContent = text;
        layer.appendChild(l);
        const lw = l.offsetWidth, lh = l.offsetHeight;
        const below = y - 10 - lh - 18 < 90;
        const top = below ? y + h + 24 : y - 10 - lh - 16;
        l.style.left = `${Math.min(W - lw - 24, Math.max(24, x - 10))}px`;
        l.style.top = `${Math.min(H - lh - 24, top)}px`;
        els.push(l);
      }
      requestAnimationFrame(() => els.forEach((e, i) => e.classList.add(i ? 'demo-label--on' : 'demo-spot--on')));
      setTimeout(() => { els.forEach((e, i) => e.classList.remove(i ? 'demo-label--on' : 'demo-spot--on')); setTimeout(() => els.forEach((e) => e.remove()), 320); }, ms);
    };
    window.__scrollTo = (y, ms) => new Promise((done) => {
      const y0 = scrollY, t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / ms);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        scrollTo(0, y0 + (y - y0) * e);
        if (k < 1) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
  });
}, [ZOOM, SCALE]);

const page = await ctx.newPage();
page.setDefaultTimeout(20000);
await page.goto(`${base}/`);
await page.getByText('即時重新優化').first().waitFor();
await page.waitForTimeout(1500);

// Cursor helpers: smooth moves, clicks, highlight boxes, smooth scrolls.
let mx = 1500 * SCALE, my = 600 * SCALE;
await page.mouse.move(mx, my);
/** Moves by elapsed time, so a move takes about ms however slow each step is. */
async function moveTo(x, y, ms = 600) {
  const x0 = mx, y0 = my, t0 = Date.now();
  for (;;) {
    const k = Math.min(1, (Date.now() - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    await page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e);
    if (k >= 1) break;
    await sleep(12);
  }
  mx = x; my = y;
}
async function box(locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error(`No box for ${locator}`);
  return b;
}
async function moveOnto(locator, ms = 600, fx = 0.5, fy = 0.5) {
  const b = await box(locator);
  await moveTo(b.x + b.width * fx, b.y + b.height * fy, ms);
  return b;
}
async function click(locator, ms = 600) {
  await moveOnto(locator, ms);
  await page.mouse.down(); await sleep(90); await page.mouse.up();
}
async function spot(locator, ms, text = '') {
  const b = await box(locator);
  await page.evaluate(([x, y, w, h, d, l]) => window.__spot(x, y, w, h, d, l), [b.x, b.y, b.width, b.height, ms, LABELS ? text : '']);
  return b;
}
/** Scroll so the element's top sits just under the sticky top bar. */
async function scrollToEl(locator, ms = 800, offset = 78) {
  offset *= SCALE;
  const b = await box(locator);
  const y = await page.evaluate(() => scrollY);
  await page.evaluate(([to, d]) => window.__scrollTo(to, d), [Math.max(0, y + b.y - offset), ms]);
}

// Screencast: every repaint, stamped with the time it arrives.
const cdp = await ctx.newCDPSession(page);
const frames = [];
let T0 = 0;
cdp.on('Page.screencastFrame', (f) => {
  // Acknowledge first so Chrome keeps sending; stamp each frame with Chrome's own paint time, not arrival time.
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => { /* closing */ });
  const t = f.metadata.timestamp ? f.metadata.timestamp - T0 / 1000 : (Date.now() - T0) / 1000;
  const file = `f_${String(frames.length).padStart(5, '0')}.jpg`;
  fs.writeFile(path.join(OUT, file), Buffer.from(f.data, 'base64'), () => {});
  frames.push({ file, t });
});
T0 = Date.now();
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 94, maxWidth: 1920 * SCALE, maxHeight: 1080 * SCALE, everyNthFrame: 1 });
const log = [];
async function at(s, label) {
  const wait = T0 + s * 1000 - Date.now();
  if (wait > 0) await sleep(wait);
  log.push(`${s.toFixed(1)}s ${label}${wait < -250 ? ` (late ${(-wait / 1000).toFixed(2)}s)` : ''}`);
}

// 0 to 10s: the alert.
await at(0.3, 'cursor to Reset demo');
await moveOnto(page.getByRole('button', { name: '重設示範' }), 1900);
await at(2.6, 'reset: alert pops');
await page.mouse.down(); await sleep(90); await page.mouse.up();
const dialog = page.getByRole('alertdialog');
await dialog.waitFor();
await at(4.7, 'title');
await moveOnto(dialog.locator('h2'), 500, 0.15, 0.5);
await spot(dialog.locator('h2'), 3100, 'CX 360 延誤 9 小時');
await at(8.0, '30 affected');
await moveOnto(dialog.locator('.alert-fact').first(), 450);
await spot(dialog.locator('.alert-fact').first(), 1500, '30 票貨物受影響');
await at(9.4, 'acknowledge');
await click(dialog.getByRole('button', { name: '確認', exact: true }), 450);

// 10 to 16s: the ripple.
await at(10.0, 'scroll to ripple');
const ripple = page.locator('section', { has: page.getByRole('heading', { name: '連鎖影響' }) });
await scrollToEl(ripple, 800);
await at(11.0, 'return flight');
const nodes = ripple.locator('.ripple-node');
await moveOnto(nodes.nth(2), 500, 0.3, 0.35);
await spot(nodes.nth(2), 2400, '回程航班同樣延誤');
await at(13.4, 'connections');
await moveOnto(nodes.nth(3), 500, 0.3, 0.35);
await spot(nodes.nth(3), 2400, '轉機貨物接駁中斷');

// 16 to 24s: back to normal.
await at(16.0, 'scroll to back to normal');
const bk = page.locator('section', { has: page.getByRole('heading', { name: '恢復正常', exact: true }) });
await scrollToEl(bk, 900);
await at(17.2, 'fan chart');
await moveOnto(bk.locator('svg').first(), 700, 0.35, 0.6);
await spot(bk.locator('svg').first(), 3300, '按現有班次消化積壓');
await at(21.0, 'back to normal date');
await moveOnto(bk.locator('.bk-head .kpi').first(), 500, 0.3, 0.55);
await spot(bk.locator('.bk-head .kpi').first(), 2000, '預測何時恢復正常');

// 24 to 33s: Recovery.
await at(23.2, 'to Recovery');
await click(page.getByRole('link', { name: /^復運/ }).first(), 650);
await page.locator('.kpi--solid').waitFor();
await sleep(150);
await scrollToEl(page.locator('.kpi--solid'), 600, 70);
await at(25.3, '26 placed');
await moveOnto(page.locator('.kpi--solid'), 500, 0.25, 0.55);
await spot(page.locator('.kpi--solid'), 3200, '26 票自動安排');
const col380 = page.locator('article', { has: page.getByText('CX 380', { exact: true }) }).first();
const cherries = col380.locator('.col-item', { hasText: '車厘子' });
await at(28.6, 'open cherries reason');
await click(cherries.locator('.col-item-main'), 550);
await cherries.locator('.col-reason').waitFor();
await sleep(120);
await spot(cherries.locator('.col-reason p'), 1700, '每票都寫明原因');
await at(31.0, '3 need a person');
await moveOnto(page.locator('.kpi--rose'), 550, 0.25, 0.55);
await spot(page.locator('.kpi--rose'), 1900, '只有 3 票需要人手');

// 33 to 45s: capacity minus 20 percent, live.
await at(33.2, 'to minus 20');
await click(cherries.locator('.col-item-main'), 450); // close the reason so the column is tidy
await at(34.0, 'press minus 20');
await click(col380.getByRole('button', { name: '−20%' }), 700);
await at(35.2, 'watch the live panel');
await moveOnto(page.locator('.live'), 700, 0.5, 0.3);
await page.locator('.live .change').waitFor({ timeout: 15000 });
log.push(`${((Date.now() - T0) / 1000).toFixed(1)}s result arrived`);
await sleep(200);
await spot(page.locator('.live .deltas'), 1700, '幾秒內重新計算');
await at(39.0, 'what moved');
const list = page.locator('.live .change-list');
await spot(list, 5500, '列出調動的貨物、去向和原因');
const items = list.locator('li');
const n = Math.min(await items.count(), 4);
for (let i = 0; i < n && Date.now() - T0 < 43600; i++) await moveOnto(items.nth(i), 550, 0.2, 0.5);

// 45 to 54s: lithium batteries on a passenger flight.
await at(45.0, 'scroll to what if');
const wi = page.locator('section', { has: page.getByRole('heading', { name: '如果我手動更改？' }) });
await scrollToEl(wi, 900);
await at(46.4, 'lithium case');
await click(wi.getByRole('tab', { name: /鋰電池/ }), 900);
await wi.locator('.wi-detail .blocked').waitFor();
await at(49.0, 'not allowed');
await moveOnto(wi.locator('.wi-detail .blocked .status').first(), 500);
await spot(wi.locator('.wi-detail .blocked .status').first(), 1800, '鋰電池不准上客機');
await at(51.0, 'which rule');
await moveOnto(wi.locator('.wi-detail .blocked'), 600, 0.35, 0.65);
await spot(wi.locator('.wi-detail .blocked'), 2800, '指出違反哪條規則');

// 54 to 57s: what it cannot place goes to a person.
await at(54.0, 'scroll to queue');
await scrollToEl(page.locator('#queue'), 800);
await at(55.0, 'queue');
await moveOnto(page.locator('#queue'), 600, 0.4, 0.4);
await spot(page.locator('#queue'), 3900, '安排不到的交回同事');

await at(END, 'end');
await cdp.send('Page.stopScreencast');
await sleep(300);
await browser.close();

// Frame list for ffmpeg's concat demuxer: each frame lasts until the next one.
await sleep(500); // let pending frame writes finish
frames.sort((a, b) => a.t - b.t);
const lines = [];
const times = frames.map((f) => f.t);
times[0] = 0;
for (let i = 0; i < frames.length; i++) {
  const next = i + 1 < frames.length ? times[i + 1] : END;
  lines.push(`file '${frames[i].file}'`, `duration ${Math.max(0.001, next - times[i]).toFixed(3)}`);
}
lines.push(`file '${frames[frames.length - 1].file}'`);
fs.writeFileSync(path.join(OUT, 'frames.txt'), `${lines.join('\n')}\n`);
fs.writeFileSync(path.join(OUT, 'timeline.log'), `${log.join('\n')}\n`);
console.log(log.join('\n'));
console.log(`${frames.length} frames, ${END}s`);
