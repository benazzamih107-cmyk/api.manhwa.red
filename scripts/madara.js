// محلل مواقع قالب Madara (قوائم + صفحة العمل + الفصول). لا يخزن أي نطاق: المسارات نسبية.
import * as cheerio from 'cheerio';
import { get } from './http.js';

const SKIP = /^(page|feed|ajax|comments?|amp|chapters?)$/i;
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
export const fmtNum = s => String(+String(s).replace('-', '.'));

export const slugOf = (href, base) => {
  try {
    const u = new URL(href, base + '/');
    if (u.host.replace(/^www\./, '') !== new URL(base).host.replace(/^www\./, '')) return null;
    const m = /^\/manga\/([^/?#]+)\/?$/.exec(decodeURIComponent(u.pathname));
    return m && !SKIP.test(m[1]) ? m[1] : null;
  } catch { return null; }
};
const chapOf = (href, base) => {
  try {
    const u = new URL(href, base + '/');
    const m = /^\/manga\/([^/]+)\/([^/]+)\/?$/.exec(decodeURIComponent(u.pathname));
    if (!m || SKIP.test(m[2])) return null;
    const n = /(\d+(?:[-.]\d+)?)/.exec(m[2]);
    return n ? { slug: m[1], ch: fmtNum(n[1]), path: u.pathname } : null;
  } catch { return null; }
};
const imgSrc = i => {
  for (const k of ['data-src', 'data-lazy-src', 'data-original', 'src']) {
    const v = (i.attr(k) || '').trim();
    if (v && !v.startsWith('data:')) return v;
  }
  return '';
};
// مرجع نسبي: "ml:/path" إن كان الرابط من نفس الموقع، وإلا الرابط كما هو
export const ref = (id, base, url) => {
  if (!url) return '';
  try { const u = new URL(url, base + '/'); const b = new URL(base);
    return u.host.replace(/^www\./, '') === b.host.replace(/^www\./, '') ? id + ':' + u.pathname + u.search : u.href; } catch { return ''; }
};

export function parseList(html, base) {
  const $ = cheerio.load(html), cards = new Map();
  $('a[href]').each((_, el) => {
    const a = $(el), slug = slugOf(a.attr('href'), base); if (!slug) return;
    const img = a.find('img').first();
    const txt = clean(a.text()), at = clean(a.attr('title')), alt = img.length ? clean(img.attr('alt')) : '';
    const inH = a.closest('h1,h2,h3,h4,h5,h6').length > 0;
    let t = '', rk = 0;
    if (inH && txt) { t = txt; rk = 4; } else if (at) { t = at; rk = 3; }
    else if (txt && txt.length <= 150 && !/^[\d\s.]+$/.test(txt)) { t = txt; rk = 2; }
    else if (alt && !/^[\w-]{20,}$/.test(alt)) { t = alt; rk = 1; }
    if (!cards.has(slug)) cards.set(slug, { slug, title: '', rank: 0, cover: '' });
    const c = cards.get(slug);
    if (t && rk > c.rank) { c.title = t; c.rank = rk; }
    const s = img.length ? imgSrc(img) : '';
    if (s && !c.cover) c.cover = s;
  });
  return [...cards.values()].filter(c => c.title).map(({ slug, title, cover }) => ({ slug, title, cover }));
}

function collectChapters($, slug, base, out) {
  const hs = [];
  $('a[href]').each((_, e) => hs.push($(e).attr('href')));
  $('option[value^="http"]').each((_, e) => hs.push($(e).attr('value')));
  for (const h of hs) { if (!h) continue; const c = chapOf(h, base); if (c && c.slug === slug && !out[c.ch]) out[c.ch] = c.path; }
}

export async function parseSeries(slug, base) {
  const url = `${base}/manga/${encodeURIComponent(slug)}/`;
  const r = await get(url, { referer: base + '/' });
  if (!r.ok) return { error: r.status || r.error };
  const $ = cheerio.load(r.text);
  let h1 = $('.post-title h1').first(); if (!h1.length) h1 = $('h1').first();
  let title = '';
  if (h1.length) { const c = h1.clone(); c.find('span,a,i').remove(); title = clean(c.text()) || clean(h1.text()); }
  if (!title) title = clean($('meta[property="og:title"]').attr('content'));
  let cover = imgSrc($('.summary_image img,.tab-summary img').first()) || clean($('meta[property="og:image"]').attr('content'));
  let desc = '';
  for (const sel of ['.description-summary .summary__content', '.summary__content', '.manga-excerpt', '[itemprop=description]']) { desc = clean($(sel).first().text()); if (desc) break; }
  if (!desc) desc = clean($('meta[property="og:description"]').attr('content'));
  let type = '', status = '';
  $('.post-content_item').each((_, it) => {
    const lab = clean($(it).find('.summary-heading').text()).toLowerCase(), val = clean($(it).find('.summary-content').text());
    if (!lab || !val || /^updating$/i.test(val)) return;
    if (lab.includes('النوع') || lab.includes('type')) type = type || val;
    else if (lab.includes('الحالة') || lab.includes('status')) status = status || val;
  });
  const genres = []; $('.genres-content a').each((_, g) => { const t = clean($(g).text()); if (t && !genres.includes(t)) genres.push(t); });
  const chapters = {};
  collectChapters($, slug, base, chapters);
  const esc = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const m of r.text.replace(/\\\//g, '/').matchAll(new RegExp('/manga/' + esc + '/(\\d+(?:-\\d+)?)/', 'g')))
    { const k = fmtNum(m[1]); if (!chapters[k]) chapters[k] = `/manga/${slug}/${m[1]}/`; }
  if (Object.keys(chapters).length <= 3) {
    try {
      const pr = await fetch(url + 'ajax/chapters/', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: url }, signal: AbortSignal.timeout(20000) });
      if (pr.status === 200) collectChapters(cheerio.load(await pr.text()), slug, base, chapters);
    } catch {}
  }
  return { title, cover, desc: desc.slice(0, 1500), type, status, genres: genres.slice(0, 8), chapters };
}
