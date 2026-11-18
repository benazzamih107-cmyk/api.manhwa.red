// يجمع القوائم والتفاصيل من المصادر ويحفظها في data/raw/<id>.json (مسارات نسبية فقط، بلا نطاقات).
// المتغيرات: SOURCES_JSON (سر)، IDS (مفصولة بفواصل)، PAGES (صفحات القائمة)، DETAIL_CAP (حد صفحات التفاصيل للتشغيل)، FRESH_H (ساعات الاعتبار "حديث")
import fs from 'node:fs';
import { get } from './http.js';
import { parseList, parseSeries, ref } from './madara.js';

const SRC = JSON.parse(process.env.SOURCES_JSON || '{}');
const TYPE = { ml: 'madara', mn: 'madara' }; // نضيف أنواعًا ومصادر تدريجيًا
const IDS = (process.env.IDS || Object.keys(TYPE).join(',')).split(',').filter(x => TYPE[x] && SRC[x]);
const PAGES = +process.env.PAGES || 3, CAP = +process.env.DETAIL_CAP || 100, FRESH = (+process.env.FRESH_H || 20) * 3600e3;
fs.mkdirSync('data/raw', { recursive: true });

for (const id of IDS) {
  const base = SRC[id].replace(/\/+$/, '');
  const file = `data/raw/${id}.json`;
  const db = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const seen = new Map();
  for (let p = 1; p <= PAGES; p++) {
    const r = await get(`${base}/manga/${p > 1 ? 'page/' + p + '/' : ''}`, { referer: base + '/' });
    if (!r.ok) { console.log(id, 'list page', p, 'failed', r.status, r.error || ''); break; }
    const items = parseList(r.text, base);
    console.log(id, 'list page', p, items.length, 'items');
    if (!items.length) break;
    for (const it of items) if (!seen.has(it.slug)) seen.set(it.slug, it);
  }
  let done = 0, fail = 0;
  const todo = [...seen.values()].sort((a, b) => ((db[a.slug] || {}).t || 0) - ((db[b.slug] || {}).t || 0));
  for (const it of todo) {
    const old = db[it.slug];
    if (old && Date.now() - old.t < FRESH) continue;
    if (done >= CAP) break;
    const d = await parseSeries(it.slug, base);
    if (d.error) { fail++; console.log(id, 'series failed', it.slug, d.error); if (fail > 10 && done === 0) break; continue; }
    done++;
    db[it.slug] = { t: Date.now(), title: d.title || it.title, cover: ref(id, base, d.cover || it.cover), desc: d.desc, type: d.type, status: d.status, genres: d.genres, chapters: d.chapters };
  }
  fs.writeFileSync(file, JSON.stringify(db));
  console.log(id, 'listed', seen.size, 'detailed', done, 'failed', fail, 'total', Object.keys(db).length);
}
