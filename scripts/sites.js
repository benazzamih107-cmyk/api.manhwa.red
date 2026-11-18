// محللات المواقع غير Madara: شادو، أزورا، مانجا تايم. كل موقع: list(base,page) و series(base,slug). المسارات نسبية.
import * as cheerio from 'cheerio';
import { get, UA } from './http.js';

const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
const fmtNum = s => String(+String(s).replace('-', '.'));
const imgOf = i => {
  for (const k of ['data-src', 'data-lazy-src', 'src']) { const v = (i.attr(k) || '').trim(); if (v && !v.startsWith('data:')) return v; }
  const ss = (i.attr('srcset') || i.attr('data-srcset') || '').trim();
  if (ss) { const c = ss.split(',')[0].trim().split(/\s+/)[0]; if (c && !c.startsWith('data:')) return c; }
  return '';
};
const unNext = (u, base) => { try { if (u && u.includes('/_next/image')) { const q = new URL(u, base).searchParams.get('url'); if (q) return q; } } catch {} return u; };
const sameHost = (u, base) => { try { return new URL(u, base + '/').host.replace(/^www\./, '') === new URL(base).host.replace(/^www\./, ''); } catch { return false; } };
const pathOf = (href, base) => { try { const u = new URL(href, base + '/'); return sameHost(href, base) ? decodeURIComponent(u.pathname) : null; } catch { return null; } };

// بطاقات عامة: كل رابط يطابق slugRe يعطي عملًا (العنوان من title/alt/النص، والغلاف من img)
function cards($, base, slugRe) {
  const m = new Map();
  $('a[href]').each((_, el) => {
    const a = $(el), p = pathOf(a.attr('href'), base); if (!p) return;
    const mm = slugRe.exec(p); if (!mm) return;
    const slug = mm[1], img = a.find('img').first();
    let txt = clean(a.text()).replace(/فصل\s*\d+(?:\.\d+)?/g, '').replace(/\s*[·•]\s*(عربي|EN)/g, '').replace(/^(مانجا|رواية)\s*/, '').trim();
    const at = clean(a.attr('title')), alt = (img.length ? clean(img.attr('alt')) : '').replace(/^Cover of\s+/, '');
    const inH = a.closest('h1,h2,h3,h4,h5,h6').length > 0;
    let t = '', rk = 0;
    if (inH && txt) { t = txt; rk = 4; } else if (at) { t = at; rk = 3; } else if (alt) { t = alt; rk = 2; } else if (txt && txt.length <= 120 && !txt.includes('اقرأ الآن')) { t = txt; rk = 1; }
    if (!m.has(slug)) m.set(slug, { slug, title: '', rank: 0, cover: '' });
    const c = m.get(slug);
    if (t && rk > c.rank) { c.title = t; c.rank = rk; }
    if (!c.cover && img.length) { const s = unNext(imgOf(img), base); if (s) c.cover = s; }
  });
  return [...m.values()].filter(c => c.title).map(({ slug, title, cover }) => ({ slug, title, cover }));
}
const pretty = s => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
const metaOf = ($, p) => clean($(`meta[property="${p}"]`).attr('content'));

// ---------- شادو ----------
export const shadow = {
  async list(base, page) {
    const r = await get(`${base}/browse${page > 1 ? '?page=' + page : ''}`, { referer: base + '/' });
    if (!r.ok) return { error: r.status || r.error };
    return { items: cards(cheerio.load(r.text), base, /^\/manga\/([^/?#]+)\/?$/) };
  },
  async series(base, slug) {
    const r = await get(`${base}/manga/${encodeURIComponent(slug)}`, { referer: base + '/' });
    if (!r.ok) return { error: r.status || r.error };
    const $ = cheerio.load(r.text);
    let title = clean($('h1').first().text()) || metaOf($, 'og:title').replace(/\s*[·|\-]\s*ESHADOW.*$/i, '') || slug;
    let cover = '';
    $('img').each((_, i) => { const s = imgOf($(i)); let d = s; try { d = decodeURIComponent(s); } catch {} if (s && d.includes('/covers/')) { cover = s; return false; } });
    if (!cover) cover = metaOf($, 'og:image');
    let desc = '';
    const h1 = $('h1').first();
    const ps = h1.length ? h1.nextAll().find('p').addBack('p').toArray() : [];
    for (const p of (ps.length ? ps : $('p').toArray()).slice(0, 12)) { const t = clean($(p).text()); if (t.length > 40) { desc = t; break; } }
    if (!desc) desc = metaOf($, 'og:description') || clean($('meta[name=description]').attr('content'));
    const body = clean($('body').text()); let status = '';
    for (const w of ['مستمر', 'مكتمل', 'متوقف', 'منتهي']) if (body.includes(w)) { status = w; break; }
    const ch = {}, en = {};
    $('a[href]').each((_, el) => {
      const a = $(el), p = pathOf(a.attr('href'), base); if (!p) return;
      const m = /^\/read\/([^/]+)\/chapter-(\d+)(-en)?\/?$/.exec(p); if (!m || m[1] !== slug) return;
      // الأرقام بلا فاصلة في الرابط: نقرأ الرقم الحقيقي (قد يحوي كسرًا) من نص العنصر
      let k = fmtNum(m[2]);
      let n = el; for (let i = 0; i < 3 && n; i++) { const t = clean($(n).text()); const f = [...t.matchAll(/\d+(?:\.\d+)?/g)].map(x => x[0]).find(x => x.replace('.', '') === m[2]); if (f) { k = fmtNum(f); break; } n = n.parent; }
      (m[3] ? en : ch)[k] = p;
    });
    for (const k in en) if (!ch[k]) ch[k] = en[k];
    return { title, cover, desc: desc.slice(0, 1500), type: '', status, genres: [], chapters: ch };
  },
};

// ---------- أزورا ----------
const azPayload = (html, base) => {
  const raw = html.replace(/\\"/g, '"').replace(/\\\//g, '/'), out = new Map();
  for (const m of raw.matchAll(/"slug":"([^"\\]{1,120})"/g)) {
    const slug = m[1]; if (out.has(slug) || !raw.includes('/series/' + slug)) continue;
    const ctx = raw.slice(Math.max(0, m.index - 500), m.index + 700);
    const t = /"(?:title|name)":"([^"]{1,150})"/.exec(ctx), cv = /https?:\/\/[^"\s]+\/upload\/series\/featured\/[^"\s]+/.exec(ctx);
    if (t) out.set(slug, { slug, title: clean(t[1]), cover: cv ? cv[0] : '' });
  }
  return [...out.values()];
};
export const azora = {
  async list(base, page) {
    const r = await get(`${base}/series/?page=${page}`, { referer: base + '/' });
    if (!r.ok) return { error: r.status || r.error };
    const $ = cheerio.load(r.text);
    let items = cards($, base, /^\/series\/([^/?#]+)\/?$/);
    if (items.length < 6) { const have = new Set(items.map(i => i.slug)); for (const c of azPayload(r.text, base)) if (!have.has(c.slug)) items.push(c); }
    return { items };
  },
  async series(base, slug) {
    const r = await get(`${base}/series/${encodeURIComponent(slug).replace(/%27/g, "'").replace(/%21/g, '!')}`, { referer: base + '/' });
    if (!r.ok) return { error: r.status || r.error };
    const $ = cheerio.load(r.text);
    const title = clean($('h1').first().text()) || metaOf($, 'og:title') || pretty(slug);
    let cover = unNext(metaOf($, 'og:image'), base);
    if (!cover) $('img').each((_, i) => { const s = unNext(imgOf($(i)), base); if (/upload\/series|cover/i.test(s)) { cover = s; return false; } });
    let desc = metaOf($, 'og:description') || clean($('meta[name=description]').attr('content'));
    if (!desc) for (const p of $('p').toArray().slice(0, 15)) { const t = clean($(p).text()); if (t.length > 40) { desc = t; break; } }
    const ch = {};
    const add = h => { const p = pathOf(h, base); const m = p && /^\/series\/([^/]+)\/chapter-(\d+(?:\.\d+)?)\/?$/.exec(p); if (m && m[1] === slug && !ch[fmtNum(m[2])]) ch[fmtNum(m[2])] = p; };
    $('a[href]').each((_, el) => add($(el).attr('href')));
    const raw = r.text.replace(/\\"/g, '"').replace(/\\\//g, '/');
    for (const m of raw.matchAll(new RegExp('/series/' + slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/chapter-(\\d+(?:\\.\\d+)?)', 'g'))) { const k = fmtNum(m[1]); if (!ch[k]) ch[k] = `/series/${slug}/chapter-${m[1]}`; }
    let status = ''; const body = clean($('body').text());
    for (const w of ['مستمر', 'مكتمل', 'متوقف']) if (body.includes(w)) { status = w; break; }
    return { title, cover, desc: desc.slice(0, 1500), type: '', status, genres: [], chapters: ch };
  },
};

// ---------- مانجا تايم (tRPC) ----------
async function trpc(base, name, input) {
  const u = `${base}/api/trpc/${name}?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: { json: input } }))}`;
  const r = await get(u, { referer: base + '/', headers: { Accept: 'application/json' } });
  if (!r.ok) return { error: r.status || r.error };
  try {
    const j = JSON.parse(r.text); const x = Array.isArray(j) ? j[0] : j;
    if (x.error) return { error: 'trpc' };
    const d = x.result && x.result.data; return { data: d && d.json !== undefined ? d.json : d };
  } catch { return { error: 'json' }; }
}
const okSlug = s => typeof s === 'string' && /^[^\s/?#]{1,150}$/.test(s);
function mgItems(v, d = 0) {
  if (!v || d > 4) return [];
  const ok = x => x && typeof x === 'object' && okSlug(x.slug) && (x.nameEn || x.title || x.nameAr) && x.seriesCount === undefined;
  if (Array.isArray(v)) { if (v.some(ok)) return v.filter(ok); for (const x of v) { const r = mgItems(x, d + 1); if (r.length) return r; } return []; }
  if (typeof v === 'object') {
    for (const k of ['items', 'works', 'results', 'series', 'data']) if (Array.isArray(v[k])) { const r = mgItems(v[k], d + 1); if (r.length) return r; }
    for (const k of Object.keys(v)) { if (['genres', 'filters', 'meta'].includes(k)) continue; const r = mgItems(v[k], d + 1); if (r.length) return r; }
  }
  return [];
}
const mgCard = m => (!m || !okSlug(m.slug) || m.type === 'novel' || m.kind === 'novel') ? null : { slug: m.slug, title: clean(m.nameEn || m.title || m.nameAr || ''), cover: m.coverUrl || '' };
export const mangatime = {
  async list(base, page) {
    const r = await trpc(base, 'homepage.getLatestReleases', { page, limit: 24 });
    if (r.error) return { error: r.error };
    return { items: mgItems(r.data).map(mgCard).filter(c => c && c.title) };
  },
  async series(base, slug) {
    const s = await trpc(base, 'content.getSeriesBySlug', { slug });
    if (s.error || !s.data || !s.data.id) return { error: s.error || 404 };
    const c = await trpc(base, 'content.getChapters', { seriesId: s.data.id, limit: -1, includeUnavailable: true });
    let chs = c.error ? [] : (Array.isArray(c.data && c.data.chapters) ? c.data.chapters : (Array.isArray(c.data) ? c.data : []));
    chs = chs.filter(x => x && x.id && x.number != null && !isNaN(+x.number) && !x.isBlocked && (!x.format || x.format === 'images'));
    const ar = chs.filter(x => !x.language || x.language === 'ar'); if (ar.length) chs = ar;
    const ch = {}; for (const x of chs) ch[fmtNum(x.number)] = '';
    const d = s.data, st = d.status === 'ongoing' ? 'مستمر' : d.status === 'completed' ? 'مكتمل' : (d.status === 'hiatus' || d.status === 'paused') ? 'متوقف' : '';
    const tp = { manga: 'مانجا', manhwa: 'مانهوا', manhua: 'مانها', webtoon: 'ويبتون' }[d.type] || '';
    return { title: clean(d.nameEn || d.title || d.nameAr || slug), cover: d.coverUrl || '', desc: clean(d.description || '').slice(0, 1500), type: tp, status: st,
      genres: (d.genres || []).map(g => clean(typeof g === 'string' ? g : (g && g.name) || '')).filter(Boolean).slice(0, 8), chapters: ch };
  },
};
