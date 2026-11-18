// يدمج data/raw/*.json في كتالوج واحد بلا مكرر: data/catalog.json + data/series/<id>.json
// المطابقة: توحيد العنوان (حروف عربية/إنجليزية، حذف الرموز والتشكيل)، ثم overrides.json للدمج اليدوي.
import fs from 'node:fs';
import crypto from 'node:crypto';

export const norm = t => String(t || '').toLowerCase()
  .replace(/[ً-ٰٟـ]/g, '')
  .replace(/[إأآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
  .replace(/\b(manhwa|manga|manhua|مانهوا|مانجا|مانها)\b/g, ' ')
  .replace(/[^\p{L}\p{N}]+/gu, '');
const idOf = n => crypto.createHash('sha1').update(n).digest('hex').slice(0, 10);

const dir = 'data/raw';
const ov = fs.existsSync('overrides.json') ? JSON.parse(fs.readFileSync('overrides.json', 'utf8')) : { merge: {}, hide: [] };
const groups = new Map();
for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
  if (!f.endsWith('.json')) continue;
  const src = f.slice(0, -5), db = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'));
  for (const [slug, d] of Object.entries(db)) {
    let n = norm(d.title); if (!n) continue;
    n = ov.merge[n] ? norm(ov.merge[n]) : n;
    if (!groups.has(n)) groups.set(n, []);
    groups.get(n).push({ src, slug, ...d });
  }
}
fs.rmSync('data/series', { recursive: true, force: true }); fs.mkdirSync('data/series', { recursive: true });
const cat = [];
for (const [n, items] of groups) {
  const id = idOf(n); if (ov.hide.includes(id)) continue;
  items.sort((a, b) => Object.keys(b.chapters).length - Object.keys(a.chapters).length);
  const best = items[0], chapters = {};
  for (const it of items) for (const [num, path] of Object.entries(it.chapters)) (chapters[num] ||= {})[it.src] = `${it.slug}|${path}`;
  const nums = Object.keys(chapters).map(Number).sort((a, b) => a - b);
  const pick = k => items.map(i => i[k]).find(v => v && (!Array.isArray(v) || v.length)) || (k === 'genres' ? [] : '');
  const row = { id, t: best.title, c: pick('cover'), n: nums.length, l: nums.length ? nums[nums.length - 1] : 0, s: items.map(i => i.src), k: Object.fromEntries(items.map(i => [i.src, i.slug])), u: Math.max(...items.map(i => i.t || 0)) };
  cat.push(row);
  fs.writeFileSync(`data/series/${id}.json`, JSON.stringify({ ...row, desc: pick('desc'), type: pick('type'), status: pick('status'), genres: pick('genres'),
    src: Object.fromEntries(items.map(i => [i.src, i.slug])), chapters }));
}
cat.sort((a, b) => b.u - a.u);
fs.writeFileSync('data/catalog.json', JSON.stringify({ v: 1, updated: new Date().toISOString(), count: cat.length, items: cat }));
console.log('catalog', cat.length, 'series; merged groups with >1 source:', cat.filter(x => x.s.length > 1).length);
