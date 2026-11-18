import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const now = Date.now();
const ev = (source, minAgo, mag, id) => ({ source, id, time: new Date(now - minAgo * 60000).toISOString(), lat: 38.3, lon: 38.3, mag, depth: 7, magType: 'ML', place: `${source} yeri`, province: 'Malatya', updatedAt: null });
const silent = { log() {}, error() {} };

async function boot(sources, weather) {
  const app = createApp({ sources, publicDir: PUBLIC, weather, log: silent, pollMs: 3600e3 });
  const port = await app.start(0);
  return { app, base: `http://127.0.0.1:${port}` };
}

test('API: birleştirilmiş liste, kaynak sağlığı ve statik dosyalar', async () => {
  const { app, base } = await boot(
    [
      { name: 'AFAD', fetchRecent: async () => ({ events: [ev('AFAD', 10, 4.2, 'a1')], rawRows: 1 }) },
      { name: 'Kandilli', fetchRecent: async () => ({ events: [ev('Kandilli', 10, 4.0, 'k1')], rawRows: 1 }) },
      { name: 'USGS', allowEmpty: true, fetchRecent: async () => { throw new Error('ağ yok'); } },
    ],
    async () => ({ temp: 5 }),
  );
  try {
    const j = await (await fetch(`${base}/api/earthquakes`)).json();
    assert.equal(j.items.length, 1);
    assert.equal(j.items[0].sources.length, 2);
    const usgs = j.status.sources.find((s) => s.name === 'USGS');
    assert.equal(usgs.ok, false);
    assert.match(usgs.lastError, /ağ yok/);
    assert.equal(j.status.sources.find((s) => s.name === 'AFAD').ok, true);
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/app.js`)).status, 200);
    assert.equal((await fetch(`${base}/..%2fpackage.json`)).status, 404);
    assert.equal((await fetch(`${base}/yok.html`)).status, 404);
  } finally {
    await app.stop();
  }
});

test('Bir kaynak çökse de diğerleri çalışır; çöken kaynağın son iyi verisi korunur', async () => {
  let afadFail = false;
  const { app, base } = await boot([
    { name: 'AFAD', fetchRecent: async () => { if (afadFail) throw new Error('503'); return { events: [ev('AFAD', 5, 3.1, 'a1')], rawRows: 1 }; } },
    { name: 'Kandilli', fetchRecent: async () => ({ events: [ev('Kandilli', 25, 2.9, 'k1')], rawRows: 1 }) },
  ]);
  try {
    afadFail = true;
    await app.poll();
    const j = await (await fetch(`${base}/api/earthquakes`)).json();
    assert.equal(j.items.length, 2);
    assert.equal(j.status.sources[0].ok, false);
    assert.ok(j.status.sources[0].lastSuccess);
  } finally {
    await app.stop();
  }
});

test('Ayrıştırma oranı düşükse "degraded" işaretlenir', async () => {
  const { app, base } = await boot([{ name: 'AFAD', fetchRecent: async () => ({ events: [ev('AFAD', 5, 3, 'a1')], rawRows: 10 }) }]);
  try {
    const j = await (await fetch(`${base}/api/earthquakes`)).json();
    assert.match(j.status.sources[0].degraded, /9\/10/);
  } finally {
    await app.stop();
  }
});

test('Yeni deprem SSE ile "new" olarak yayınlanır, eski kayıtlar bildirim üretmez', async () => {
  let list = [ev('AFAD', 30, 3.0, 'old')];
  const { app, base } = await boot([{ name: 'AFAD', fetchRecent: async () => ({ events: [...list], rawRows: list.length }) }]);
  const ctl = new AbortController();
  try {
    const res = await fetch(`${base}/api/stream`, { signal: ctl.signal });
    const rd = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const waitFor = async (needle) => {
      while (!buf.includes(needle)) buf += dec.decode((await rd.read()).value);
    };
    await waitFor('event: sync');
    list = [ev('AFAD', 0, 4.4, 'fresh'), ev('AFAD', 200, 2.0, 'ancient'), ...list];
    await app.poll();
    await waitFor('event: new');
    assert.match(buf, /"id":"fresh"/);
    assert.doesNotMatch(buf, /event: new\ndata: [^\n]*"id":"ancient"/);
  } finally {
    ctl.abort();
    await app.stop();
  }
});

test('/api/weather: doğrulama ve hata yönetimi', async () => {
  const { app, base } = await boot(
    [{ name: 'AFAD', fetchRecent: async () => ({ events: [], rawRows: 0 }) }],
    async (lat) => { if (lat > 50) throw new Error('kaynak hatası'); return { temp: 7, label: 'Açık' }; },
  );
  try {
    assert.equal((await fetch(`${base}/api/weather`)).status, 400);
    assert.equal((await fetch(`${base}/api/weather?lat=abc&lon=3`)).status, 400);
    assert.equal((await fetch(`${base}/api/weather?lat=95&lon=3`)).status, 400);
    const ok = await fetch(`${base}/api/weather?lat=39.9&lon=32.8`);
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).temp, 7);
    const bad = await fetch(`${base}/api/weather?lat=60&lon=3`);
    assert.equal(bad.status, 502);
    assert.match((await bad.json()).error, /kaynak hatası/);
  } finally {
    await app.stop();
  }
});

test('Kanal: eşik üstü yeni depremler kanala gönderilir, altı ve eski olanlar gönderilmez', async () => {
  let list = [ev('AFAD', 40, 5.0, 'old')];
  const posts = [];
  const app = createApp({
    sources: [{ name: 'AFAD', fetchRecent: async () => ({ events: [...list], rawRows: list.length }) }],
    publicDir: PUBLIC, log: silent, pollMs: 3600e3,
    channel: { minMag: 3, post: (t) => posts.push(t) },
  });
  await app.start(0);
  try {
    list = [ev('AFAD', 0, 4.1, 'big'), ev('AFAD', 1, 2.0, 'small'), ev('AFAD', 120, 5.5, 'ancient'), ...list];
    await app.poll();
    assert.equal(posts.length, 1);
    assert.match(posts[0], /M4\.1/);
    await app.poll(); // aynı kayıtlar tekrar gönderilmez
    assert.equal(posts.length, 1);
  } finally {
    await app.stop();
  }
});
