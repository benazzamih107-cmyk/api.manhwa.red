// يفحص كل مصدر: مباشرة من GitHub، وعبر الوسيط على Cloudflare. العناوين من السر SOURCES_JSON.
import { get, UA } from './http.js';
const WK = 'https://manhwa-sit.manhwared.workers.dev/api/fetch';
const src = JSON.parse(process.env.SOURCES_JSON || '{}');
const isBlock = (st, t) => st === 403 || st === 429 || st === 503 || st === 202 || /<title>\s*(Just a moment|Attention Required)/i.test((t || '').slice(0, 3000));
const rows = [];
for (const [id, s] of Object.entries(src)) {
  const base = (typeof s === 'string' ? s : s.base).replace(/\/+$/, '');
  const d = await get(base + '/', { tries: 1, timeout: 20000 });
  let w = { st: 0, bytes: 0, ok: false };
  try {
    const r = await fetch(WK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ url: base + '/', method: 'GET', headers: { 'User-Agent': UA, Accept: 'text/html,*/*;q=0.8', 'Accept-Language': 'ar,en;q=0.8' } }) });
    const j = await r.json();
    w = { st: j.st, bytes: (j.d || '').length, ok: j.st === 200 && !isBlock(j.st, j.d) };
  } catch (e) { w.err = String(e.message || e).slice(0, 60); }
  rows.push({ id, direct: d.ok ? 'OK' : 'blocked ' + d.status, viaWorker: w.ok ? 'OK' : 'fail ' + w.st + (w.err ? ' ' + w.err : ''), workerBytes: w.bytes });
}
console.table(rows);
