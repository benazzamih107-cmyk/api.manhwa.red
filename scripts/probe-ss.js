import * as cheerio from 'cheerio';
import { get } from './http.js';
const src = JSON.parse(process.env.SOURCES_JSON || '{}');
const base = (typeof src.ss === 'string' ? src.ss : src.ss.base).replace(/\/+$/, '');
const slugs = t => new Set([...t.matchAll(/\/manga\/([a-z0-9][^"'\/\\?#<>\s]*)/gi)].map(m => m[1]));
const paths = ['/browse', '/browse?page=2', '/browse?page=3', '/browse?p=2', '/browse/2', '/browse?sort=latest&page=2', '/latest', '/latest?page=2', '/new', '/new?page=2', '/popular', '/series', '/manga', '/manga?page=2', '/sitemap.xml', '/sitemap-0.xml', '/robots.txt', '/api/series?page=2'];
for (const p of paths) {
  const r = await get(base + p, { referer: base + '/', tries: 1 });
  const s = r.ok ? [...slugs(r.text)] : [];
  console.log(p, r.status || r.error, (r.text || '').length, 'slugs', s.length, s.slice(0, 3).join(','));
  if (p === '/browse' && r.ok) {
    const $ = cheerio.load(r.text);
    console.log('  page links:', $('a[href*="page="]').map((_, a) => $(a).attr('href')).get().slice(0, 8).join(' | '));
    console.log('  buttons:', $('button').map((_, b) => $(b).text().trim()).get().filter(Boolean).slice(0, 12).join(' | '));
    console.log('  next-data:', /__NEXT_DATA__|self\.__next_f/.test(r.text));
    const m = r.text.match(/(?:page|cursor|offset|limit|total|hasMore)[^,;]{0,60}/gi); console.log('  hints:', (m || []).slice(0, 10).join(' || '));
  }
  if (p.includes('sitemap') && r.ok) console.log('  ', r.text.slice(0, 300).replace(/\n/g, ' '));
  if (p === '/robots.txt' && r.ok) console.log('  ', r.text.slice(0, 400).replace(/\n/g, ' '));
}
