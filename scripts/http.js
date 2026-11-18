// طلبات HTTP مهذبة: مهلة، إعادة محاولة، تأخير بسيط بين الطلبات لكل موقع.
export const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const last = new Map();
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function get(url, { referer, tries = 2, timeout = 25000, gap = 400, headers = {} } = {}) {
  const host = new URL(url).host;
  for (let i = 0; i < tries; i++) {
    const wait = (last.get(host) || 0) + gap - Date.now();
    if (wait > 0) await sleep(wait);
    last.set(host, Date.now());
    try {
      const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeout),
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'ar,en;q=0.8', ...(referer ? { Referer: referer } : {}), ...headers } });
      const text = await r.text();
      const blocked = r.status === 403 || r.status === 429 || r.status === 503 || /<title>\s*(Just a moment|Attention Required)/i.test(text.slice(0, 3000));
      if (!blocked && r.status === 200) return { ok: true, status: r.status, text };
      if (i === tries - 1) return { ok: false, status: r.status, blocked, text: text.slice(0, 200) };
    } catch (e) {
      if (i === tries - 1) return { ok: false, status: 0, error: String(e.message || e) };
    }
    await sleep(1500);
  }
}
