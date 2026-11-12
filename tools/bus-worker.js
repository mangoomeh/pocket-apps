// A tiny Cloudflare Worker that lets the Bus app read LTA DataMall bus arrivals. LTA's API
// needs an account key and doesn't answer browsers on other sites, so this holds the key and
// passes the arrivals through, for this site only.
//
// Set up (free):
// 1. Get an LTA DataMall account key: https://datamall.lta.gov.sg/content/datamall/en/request-for-api.html
// 2. In Cloudflare (dash.cloudflare.com): Workers & Pages → Create → Worker → paste this file → Deploy.
// 3. In the worker's Settings → Variables and Secrets, add a secret named LTA_KEY with your key.
// 4. In the Bus app, Settings → Your own server: paste the worker's address (https://….workers.dev).
//
// It answers GET /?id=<5-digit stop code> with LTA's BusArrival v3 JSON, cached for 15 seconds.

const ALLOWED = ['https://mangoomeh.github.io', 'http://localhost:8000'];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = { 'Access-Control-Allow-Origin': ALLOWED.includes(origin) ? origin : ALLOWED[0], Vary: 'Origin' };
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (request.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
    if (request.method !== 'GET') return json({ error: 'GET only' }, 405);
    if (origin && !ALLOWED.includes(origin)) return json({ error: 'Not allowed from this site' }, 403);
    const id = new URL(request.url).searchParams.get('id') || '';
    if (!/^\d{5}$/.test(id)) return json({ error: 'Give a 5-digit bus stop code as ?id=' }, 400);
    if (!env.LTA_KEY) return json({ error: 'The LTA_KEY secret is not set on this worker' }, 500);
    const res = await fetch(`https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival?BusStopCode=${id}`, {
      headers: { AccountKey: env.LTA_KEY, Accept: 'application/json' },
      cf: { cacheTtl: 15, cacheEverything: true },
    });
    if (!res.ok) return json({ error: `LTA answered ${res.status}` }, 502);
    return new Response(res.body, { headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'max-age=15' } });
  },
};
