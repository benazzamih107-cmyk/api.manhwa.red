// يجرب فتح المواقع المحجوبة بمتصفح Chromium عادي (بلا أي تمويه) وينتظر اجتياز تحقق Cloudflare التلقائي.
import { chromium } from 'playwright';
const src = JSON.parse(process.env.SOURCES_JSON || '{}');
const ids = (process.env.IDS || 'ol,md,mt,kt,mn,lv').split(',');
const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: 'ar', userAgent: undefined });
const rows = [];
for (const id of ids) {
  if (!src[id]) continue;
  const page = await ctx.newPage();
  let status = 0, title = '', len = 0;
  try {
    const r = await page.goto(src[id] + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    status = r ? r.status() : 0;
    for (let i = 0; i < 12; i++) {
      title = await page.title();
      if (!/just a moment|attention required|verify|moment/i.test(title)) break;
      await page.waitForTimeout(2500);
    }
    len = (await page.content()).length;
  } catch (e) { title = 'ERR ' + String(e.message).slice(0, 50); }
  rows.push({ id, status, passed: !/just a moment|attention required|verify|^ERR/i.test(title) && len > 20000, title: title.slice(0, 40), bytes: len });
  await page.close();
}
console.table(rows);
await browser.close();
