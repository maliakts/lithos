import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { merge, crossCheck } from './merge.js';
import { matches, formatMessage } from './notify.js';

const STALE_MS = 10 * 60 * 1000; // 10 dk güncellenmeyen kaynak "bayat" sayılır
const FRESH_NOTIFY_MS = 15 * 60 * 1000; // bildirim yalnızca son 15 dk içindeki depremler için
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

/**
 * @param sources [{ name: 'AFAD', fetchRecent }, { name: 'Kandilli', fetchRecent }]
 */
export function createApp({ sources, pollMs = 60000, publicDir, weather = null, bot = null, subs = null, channel = null, now = () => Date.now(), log = console }) {
  const health = {};
  const data = {};
  for (const s of sources) {
    health[s.name] = { name: s.name, ok: false, lastSuccess: null, lastError: null, count: 0, rawRows: 0, degraded: null };
    data[s.name] = [];
  }

  let merged = [];
  let cross = { afad: 0, kandilli: 0, matched: 0, ok: true };
  const seen = new Set();
  let seeded = false;
  const clients = new Set();
  let timer = null;
  let ping = null;
  let server = null;

  const keysOf = (e) => e.sources.map((s) => `${s.name}:${s.id}`);

  function snapshot() {
    return {
      serverTime: new Date(now()).toISOString(),
      items: merged.slice(0, 800),
      status: {
        sources: Object.values(health).map((h) => ({
          ...h,
          stale: !h.lastSuccess || now() - Date.parse(h.lastSuccess) > STALE_MS,
        })),
        crossCheck: cross,
      },
    };
  }

  function send(res, event, payload) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  }
  const broadcast = (event, payload) => clients.forEach((res) => send(res, event, payload));

  function rebuild() {
    merged = merge(sources.map((s) => data[s.name]), { now: now() }); // liste sırası = öncelik
    cross = crossCheck(data.AFAD ?? [], data.Kandilli ?? [], now());

    const fresh = merged.filter((e) => !keysOf(e).some((k) => seen.has(k)));
    merged.forEach((e) => keysOf(e).forEach((k) => seen.add(k)));
    if (seen.size > 50000) seen.clear();

    if (seeded) {
      for (const e of fresh) {
        if (now() - Date.parse(e.time) > FRESH_NOTIFY_MS) continue;
        log.log(`[yeni] M${e.mag.toFixed(1)} ${e.place} (${e.sources.map((s) => s.name).join('+')})`);
        broadcast('new', e);
        if (bot && subs) for (const s of subs.all()) if (matches(s, e)) bot.send(s.chatId, formatMessage(e));
        if (channel && e.mag >= channel.minMag) channel.post(formatMessage(e));
      }
    }
    if (Object.values(health).some((h) => h.ok)) seeded = true;
    broadcast('sync', snapshot());
  }

  async function poll() {
    const results = await Promise.allSettled(sources.map((s) => s.fetchRecent()));
    results.forEach((r, i) => {
      const s = sources[i];
      const h = health[s.name];
      if (r.status === 'fulfilled') {
        const { events, rawRows } = r.value;
        data[s.name] = events;
        Object.assign(h, { ok: true, lastSuccess: new Date(now()).toISOString(), lastError: null, count: events.length, rawRows });
        h.degraded =
          events.length === 0 && !s.allowEmpty
            ? 'Kaynak boş döndü'
            : rawRows > 0 && events.length / rawRows < 0.8
              ? `${rawRows - events.length}/${rawRows} kayıt okunamadı`
              : null;
      } else {
        h.ok = false;
        h.lastError = String(r.reason?.message ?? r.reason);
        log.error(`[${s.name}]`, h.lastError);
      }
    });
    rebuild();
  }

  const handler = (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/earthquakes') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(JSON.stringify(snapshot()));
    }
    if (url.pathname === '/api/weather') {
      const lat = Number(url.searchParams.get('lat'));
      const lon = Number(url.searchParams.get('lon'));
      const json = (code, body) => {
        res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify(body));
      };
      if (!weather) return json(503, { error: 'Hava durumu kapalı' });
      if (!url.searchParams.get('lat') || !url.searchParams.get('lon') || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        return json(400, { error: 'Geçersiz koordinat' });
      }
      weather(lat, lon).then(
        (w) => json(200, w),
        (e) => json(502, { error: String(e.message ?? e) }),
      );
      return;
    }
    if (url.pathname === '/api/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      clients.add(res);
      send(res, 'sync', snapshot());
      req.on('close', () => clients.delete(res));
      return;
    }
    const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = path.normalize(path.join(publicDir, rel));
    if (!file.startsWith(publicDir + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Bulunamadı');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  };

  return {
    poll,
    latest: (n = 100) => merged.slice(0, n),
    snapshot,
    async start(port) {
      server = http.createServer(handler);
      await new Promise((resolve) => server.listen(port, resolve));
      ping = setInterval(() => clients.forEach((r) => r.write(': ping\n\n')), 25000);
      await poll(); // sunucu önce dinler; ilk veri gelince bağlı tarayıcılara SSE ile iletilir
      timer = setInterval(poll, pollMs);
      return server.address().port;
    },
    async stop() {
      clearInterval(timer);
      clearInterval(ping);
      clients.forEach((r) => r.end());
      await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
    },
  };
}
