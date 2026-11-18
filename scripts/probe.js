// يفحص هل تصل خوادم GitHub إلى كل مصدر (بلا تحقق Cloudflare). العناوين تأتي من السر SOURCES_JSON.
import { get } from './http.js';
const src = JSON.parse(process.env.SOURCES_JSON || '{}');
const rows = [];
for (const [id, s] of Object.entries(src)) {
  const base = typeof s === 'string' ? s : s.base;
  const r = await get(base + '/', { tries: 1, timeout: 20000 });
  rows.push({ id, status: r.status, ok: r.ok, blocked: !!r.blocked, bytes: r.text ? r.text.length : 0, error: r.error || '' });
}
console.table(rows);
