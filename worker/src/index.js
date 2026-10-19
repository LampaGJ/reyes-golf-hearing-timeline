// Visit beacon: the page POSTs a small JSON body; this Worker adds what only the
// server can see (IP, geo, network) and stores one row per visit in D1 (binding DB).
// Read the log with: npx wrangler d1 execute reyes-visits --remote --command "SELECT * FROM visits ORDER BY id DESC LIMIT 20"
const ALLOWED_ORIGIN = 'https://lampagj.github.io';

const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const clip = (v, n = 500) => (v == null ? null : String(v).slice(0, n));

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return new Response('ok', { headers: cors });
    if (request.headers.get('Origin') !== ALLOWED_ORIGIN) return new Response('forbidden', { status: 403 });

    let page = {};
    try { page = JSON.parse((await request.text()).slice(0, 4000)); } catch { /* keep server-side fields */ }
    const cf = request.cf ?? {};

    ctx.waitUntil(env.DB.prepare(
      `INSERT INTO visits (ip, city, region, country, asn, network, referrer, path, user_agent, lang, tz, screen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      clip(request.headers.get('CF-Connecting-IP')), clip(cf.city), clip(cf.region), clip(cf.country),
      cf.asn ?? null, clip(cf.asOrganization),
      clip(page.ref), clip(page.path), clip(request.headers.get('User-Agent')),
      clip(page.lang, 50), clip(page.tz, 80), clip(page.screen, 30),
    ).run());

    return new Response(null, { status: 204, headers: cors });
  },
};
