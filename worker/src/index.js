// Visit beacon: the page POSTs a small JSON body; this Worker adds what only the
// server can see (IP, geo, network) and forwards a summary to Pushover.
// Secrets live in Cloudflare (`wrangler secret put`): PUSHOVER_TOKEN, PUSHOVER_USER.
const ALLOWED_ORIGIN = 'https://lampagj.github.io';

const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return new Response('ok', { headers: cors });
    if (request.headers.get('Origin') !== ALLOWED_ORIGIN) return new Response('forbidden', { status: 403 });

    let page = {};
    try { page = JSON.parse((await request.text()).slice(0, 4000)); } catch { /* keep server-side fields */ }
    const cf = request.cf ?? {};
    const place = [cf.city, cf.region, cf.country].filter(Boolean).join(', ') || '?';

    const lines = [
      `IP: ${request.headers.get('CF-Connecting-IP') ?? '?'}`,
      `Where: ${place}`,
      `Network: ${cf.asOrganization ?? '?'} (AS${cf.asn ?? '?'})`,
      `Referrer: ${page.ref || '(none)'}`,
      `Page: ${page.path ?? '?'}`,
      `UA: ${request.headers.get('User-Agent') ?? '?'}`,
      `Lang: ${page.lang ?? '?'}  TZ: ${page.tz ?? '?'}  Screen: ${page.screen ?? '?'}`,
    ];

    ctx.waitUntil(fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      body: new URLSearchParams({
        token: env.PUSHOVER_TOKEN,
        user: env.PUSHOVER_USER,
        title: `Visit: Reyes hearing timeline (${cf.country ?? '?'})`,
        message: lines.join('\n'),
        url: ALLOWED_ORIGIN + (page.path ?? '/'),
      }),
    }));
    return new Response(null, { status: 204, headers: cors });
  },
};
