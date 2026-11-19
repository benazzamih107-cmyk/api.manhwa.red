// ينسخ غلاف كل عمل مرة واحدة بحجم صغير (240px، WebP) إلى data/covers/<id>.webp ليخدمه خادمنا بدل المواقع.
import fs from 'node:fs';
import sharp from 'sharp';
import { UA } from './http.js';

const SRC = JSON.parse(process.env.SOURCES_JSON || '{}');
const CAP = +process.env.COVER_CAP || 400;
fs.mkdirSync('data/covers', { recursive: true });
const cat = JSON.parse(fs.readFileSync('data/catalog.json', 'utf8')).items;

const resolve = (ref, id) => {
  if (/^https?:\/\//i.test(ref)) return ref;
  const m = /^([a-z]{2})(?:\+([a-z0-9.-]+))?:(\/.*)$/.exec(ref); if (!m || !SRC[m[1]]) return '';
  const b = new URL(SRC[m[1]]); const host = b.host.replace(/^www\./, '');
  return `https://${m[2] ? m[2] + '.' + host : b.host}${m[3]}`;
};
let done = 0, fail = 0;
for (const it of cat) {
  if (done >= CAP) break;
  const out = `data/covers/${it.id}.webp`;
  if (fs.existsSync(out)) continue;
  const raw = JSON.parse(fs.readFileSync(`data/series/${it.id}.json`, 'utf8'));
  const ref = raw.c && raw.c !== 'cv' ? raw.c : '';
  const url = ref ? resolve(ref) : '';
  if (!url) continue;
  try {
    const origin = new URL(SRC[(/^([a-z]{2})/.exec(ref) || [])[1]] || url).origin;
    const r = await fetch(url, { headers: { 'User-Agent': UA, Referer: origin + '/', Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) { fail++; continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    await sharp(buf).resize({ width: 240, withoutEnlargement: true }).webp({ quality: 70 }).toFile(out);
    done++;
  } catch { fail++; }
}
console.log('covers saved', done, 'failed', fail);
