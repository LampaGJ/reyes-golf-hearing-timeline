// Visit beacon for static sites: a page POSTs a small JSON body
// ({project, path, title, ref, lang, tz, screen}); this Worker adds what only the
// server can see (IP, geo, network) and stores one row per visit in D1 (binding DB).
// Sites allowed to log are listed in ALLOWED_ORIGINS (wrangler.toml [vars]).
// Read the log with worker/visits.sh [limit] [project].

const clip = (v, n = 500) => (v == null || v === '' ? null : String(v).slice(0, n));

export default {
  async fetch(request, env, ctx) {
    const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get('Origin');
    const ok = origin != null && allowed.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': ok ? origin : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      Vary: 'Origin',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return new Response('ok', { headers: cors });
    if (!ok) return new Response('forbidden', { status: 403 });

    let page = {};
    try { page = JSON.parse((await request.text()).slice(0, 4000)); } catch { /* keep server-side fields */ }
    const cf = request.cf ?? {};

    ctx.waitUntil(env.DB.prepare(
      `INSERT INTO visits (project, host, page_title, path, referrer, ip, city, region, country, asn, network,
                           user_agent, lang, tz, screen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      clip(page.project, 100), clip(new URL(origin).host, 200), clip(page.title, 300), clip(page.path), clip(page.ref),
      clip(request.headers.get('CF-Connecting-IP')), clip(cf.city), clip(cf.region), clip(cf.country),
      cf.asn ?? null, clip(cf.asOrganization),
      clip(request.headers.get('User-Agent')), clip(page.lang, 50), clip(page.tz, 80), clip(page.screen, 30),
    ).run());

    return new Response(null, { status: 204, headers: cors });
  },
};
