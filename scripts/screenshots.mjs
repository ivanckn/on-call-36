// Walks the demo path in a real browser and saves screenshots to docs/screens/.
// Needs the dev server on http://localhost:5173 and a local Google Chrome. The live steps also need
// python model/server.py on :8036; offline steps block that port to show the snapshot fallback.
import { chromium } from 'playwright-core';

const base = process.env.BASE ?? 'http://localhost:5173';
const CHERRIES = '160-77203615';
const GARMENTS = '160-77204982';
const BATTERIES = '160-77209090';
const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function session({ offline = false, zh = false, keepAlert = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  if (offline) await ctx.route('http://localhost:8036/**', (r) => r.abort());
  ctx.setDefaultTimeout(20000);
  const page = await ctx.newPage();
  await page.goto(`${base}/`);
  await page.evaluate((z) => { localStorage.clear(); if (z) localStorage.setItem('oncall36:v3', JSON.stringify({ locale: 'zh' })); }, zh);
  await page.reload();
  await settle(page);
  if (!keepAlert) {
    const ack = page.getByRole('alertdialog').getByRole('button').first();
    if (await ack.count()) { await ack.click(); await page.waitForTimeout(200); }
  }
  return { ctx, page };
}
async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
}
const shot = (page, name, opts = {}) => { console.log('shot', name); return page.screenshot({ path: `docs/screens/${name}.png`, ...opts }); };

// 0: the disruption alert at the start of the demo
{
  const { ctx, page } = await session({ keepAlert: true });
  await shot(page, '00-alert-dialog');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Acknowledge', exact: true }).click();
  await page.waitForTimeout(250);
  await shot(page, '00b-alert-banner');
  await ctx.close();
}
{
  const { ctx, page } = await session({ zh: true, keepAlert: true });
  await shot(page, 'zh-00-alert-dialog');
  await ctx.close();
}

// 1 to 6: the demo path, live service
{
  const { ctx, page } = await session();
  await shot(page, '01-monitor');
  const srcTop = () => page.getByRole('heading', { name: 'Where the disruption comes from' }).evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 120));
  await srcTop();
  await shot(page, '01e-source-simulated');
  await page.getByRole('button', { name: 'HKO weather' }).click();
  await page.getByText(/Read from HKO|HKO unreachable|unreachable and no earlier/).first().waitFor();
  await srcTop();
  await shot(page, '01f-source-hko');
  await page.getByRole('button', { name: 'OAG flight status' }).click();
  await page.locator('.src-verdict').first().waitFor({ timeout: 40000 });
  await srcTop();
  await shot(page, '01g-source-oag');
  await page.getByRole('button', { name: 'Simulated event' }).click();
  await page.getByRole('heading', { name: 'Back to normal' }).scrollIntoViewIfNeeded();
  await shot(page, '01c-back-to-normal');
  await page.getByRole('button', { name: 'Add a freighter' }).click();
  await page.waitForTimeout(200);
  await shot(page, '01d-back-to-normal-lever');
  await page.getByRole('button', { name: 'As scheduled' }).click();
  await shot(page, '01b-monitor-full', { fullPage: true });
  await page.goto(`${base}/recovery`); await settle(page);
  await shot(page, '02-recovery');
  await shot(page, '02b-recovery-full', { fullPage: true });
  await page.goto(`${base}/shipment/${CHERRIES}`); await settle(page);
  await shot(page, '03-cherries', { fullPage: true });
  await page.goto(`${base}/shipment/${GARMENTS}`); await settle(page);
  await shot(page, '04-garments', { fullPage: true });
  await page.goto(`${base}/shipment/${BATTERIES}`); await settle(page);
  await page.getByRole('heading', { name: 'Regulatory screen' }).scrollIntoViewIfNeeded();
  await shot(page, '04b-regulatory-batteries');
  await page.goto(`${base}/shipment/160-77233752`); await settle(page);
  await page.getByRole('heading', { name: 'Time sensitivity, neural model' }).scrollIntoViewIfNeeded();
  await shot(page, '04c-neural-risk');
  await page.goto(`${base}/recovery`); await settle(page);
  await page.getByRole('button', { name: 'Model card' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('heading', { name: 'Time sensitivity model' }).scrollIntoViewIfNeeded();
  await shot(page, '04d-model-card');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'With and without' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('heading', { name: 'With and without' }).scrollIntoViewIfNeeded();
  await shot(page, '05-with-and-without');
  await page.getByText('Which part does the work').scrollIntoViewIfNeeded();
  await shot(page, '05b-ablation');
  // SHAP waterfall on CX 380
  await page.getByRole('article', { name: 'CX 380' }).getByRole('button', { name: 'Why' }).click();
  await page.waitForTimeout(300);
  await shot(page, '06-shap-waterfall');
  await page.keyboard.press('Escape');
  // Live: CX 380 capacity minus 20 percent
  await page.getByRole('article', { name: 'CX 380' }).getByRole('button', { name: '−20%' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('heading', { name: 'Live controls' }).scrollIntoViewIfNeeded();
  await shot(page, '07-live-solving');
  await page.getByText('binary variables').first().waitFor({ timeout: 40000 });
  await page.waitForTimeout(300);
  await page.getByRole('heading', { name: 'Live controls' }).scrollIntoViewIfNeeded();
  await shot(page, '08-live-result');
  // Live: a forced move that the rules block
  await page.goto(`${base}/recovery`); await settle(page);
  await page.getByRole('heading', { name: 'What if I override?' }).scrollIntoViewIfNeeded();
  await page.getByRole('tab', { name: /lithium/ }).click();
  await page.waitForTimeout(200);
  await shot(page, '09-what-if-blocked');
  await page.getByRole('tab', { name: /garments/ }).click();
  await page.waitForTimeout(200);
  await shot(page, '10-what-if-allowed');
  await page.getByRole('button', { name: 'Back to the base plan' }).click().catch(() => {});
  // Forwarder notifications: no reply needed
  await page.goto(`${base}/forwarder/${CHERRIES}`); await settle(page);
  await shot(page, '11-forwarder');
  await page.goto(`${base}/forwarder/160-77211831`); await settle(page);
  await shot(page, '12-forwarder-late');
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, storageState: await ctx.storageState() });
  const p2 = await phone.newPage();
  await p2.goto(`${base}/forwarder/${CHERRIES}`); await settle(p2);
  await p2.screenshot({ path: 'docs/screens/13-forwarder-phone.png', fullPage: true });
  await phone.close();
  await ctx.close();
}

// Offline snapshot
{
  const { ctx, page } = await session({ offline: true });
  await page.goto(`${base}/recovery`); await settle(page);
  await page.getByRole('heading', { name: 'Live controls' }).scrollIntoViewIfNeeded();
  await shot(page, '14-offline-snapshot');
  await page.getByRole('button', { name: 'CX 360 delay grows from 9h to 14h' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('heading', { name: 'Live controls' }).scrollIntoViewIfNeeded();
  await shot(page, '15-offline-playback');
  await ctx.close();
}

// Traditional Chinese
{
  const { ctx, page } = await session({ zh: true });
  await shot(page, 'zh-01-monitor');
  await page.getByRole('heading', { name: '中斷從何而來' }).evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 120));
  await page.getByRole('button', { name: '天文台天氣' }).click();
  await page.locator('.src-verdict').first().waitFor();
  await shot(page, 'zh-01f-source-hko');
  await page.getByRole('button', { name: '模擬事件' }).click();
  await shot(page, 'zh-01e-source-simulated');
  await page.goto(`${base}/recovery`); await settle(page);
  await shot(page, 'zh-02-recovery');
  await page.goto(`${base}/shipment/${CHERRIES}`); await settle(page);
  await shot(page, 'zh-03-cherries', { fullPage: true });
  await page.goto(`${base}/forwarder/${CHERRIES}`); await settle(page);
  await shot(page, 'zh-04-forwarder');
  await page.goto(`${base}/shipment/${BATTERIES}`); await settle(page);
  await shot(page, 'zh-05-batteries', { fullPage: true });
  await ctx.close();
}

await browser.close();
console.log('screenshots written to docs/screens/');
