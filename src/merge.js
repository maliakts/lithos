// Birden çok kaynağı tek listede birleştirir. Liste sırası = öncelik (AFAD > Kandilli > USGS).
const RAD = Math.PI / 180;

export function km(a, b) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const MAX_DT_MS = 90 * 1000; // aynı depremin kaynaklardaki zaman farkı en fazla 90 sn
const MAX_KM = 75; // ve konum farkı en fazla 75 km kabul edilir
export const DISAGREE_MAG = 0.3; // AFAD ile Kandilli arasında bu kadar fark "fark var" sayılır

/** İki liste arasında en yakın zamanlı çiftleri açgözlü biçimde eşler. Dönüş: Map(aIndex -> bIndex) */
export function pairLists(a, b) {
  const cands = [];
  a.forEach((x, i) =>
    b.forEach((y, j) => {
      const dt = Math.abs(Date.parse(x.time) - Date.parse(y.time));
      if (dt <= MAX_DT_MS && km(x, y) <= MAX_KM) cands.push([dt, i, j]);
    }),
  );
  cands.sort((p, q) => p[0] - q[0]);
  const usedA = new Set();
  const usedB = new Set();
  const out = new Map();
  for (const [, i, j] of cands) {
    if (usedA.has(i) || usedB.has(j)) continue;
    usedA.add(i);
    usedB.add(j);
    out.set(i, j);
  }
  return out;
}

const view = (e) => ({
  name: e.source,
  id: e.id,
  time: e.time,
  mag: e.mag,
  magType: e.magType,
  depth: e.depth,
  lat: e.lat,
  lon: e.lon,
  place: e.place,
  updatedAt: e.updatedAt,
});

function build(members) {
  const p = members[0];
  const a = members.find((m) => m.source === 'AFAD');
  const k = members.find((m) => m.source === 'Kandilli');
  const magDiff = a && k ? Math.round(Math.abs(a.mag - k.mag) * 10) / 10 : null;
  return {
    id: p.id,
    time: p.time,
    lat: p.lat,
    lon: p.lon,
    depth: p.depth ?? members.find((m) => m.depth != null)?.depth ?? null,
    mag: p.mag,
    magType: p.magType,
    place: p.place,
    province: members.find((m) => m.province)?.province ?? '',
    primary: p.source,
    sources: members.map(view),
    magDiff,
    disagree: magDiff !== null && magDiff >= DISAGREE_MAG,
  };
}

/** @param lists öncelik sırasına göre kaynak listeleri, örn. [afad, kandilli, usgs] */
export function merge(lists, { now = Date.now(), windowMs = 24 * 3600 * 1000 } = {}) {
  const clusters = []; // her biri: öncelik sırasına göre üyeler
  lists.forEach((list) => {
    const head = clusters.map((c) => c[0]);
    const pairs = pairLists(list, head);
    const taken = new Set();
    list.forEach((ev, i) => {
      if (pairs.has(i)) {
        const ci = pairs.get(i);
        clusters[ci].push(ev);
        taken.add(ci);
      }
    });
    list.forEach((ev, i) => {
      if (!pairs.has(i)) clusters.push([ev]);
    });
  });
  const since = now - windowMs;
  return clusters
    .map(build)
    .filter((e) => {
      const t = Date.parse(e.time);
      return t >= since && t <= now + 10 * 60 * 1000;
    })
    .sort((x, y) => y.time.localeCompare(x.time));
}

/**
 * AFAD ve Kandilli birbiriyle tutarlı mı? Son 12 saatte ikisinde de yeterli kayıt varken hiç
 * eşleşme yoksa saat dilimi veya biçim sorunu vardır.
 */
export function crossCheck(afad, koeri, now = Date.now()) {
  const since = now - 12 * 3600 * 1000;
  const a = afad.filter((e) => Date.parse(e.time) >= since);
  const k = koeri.filter((e) => Date.parse(e.time) >= since);
  const matched = pairLists(a, k).size;
  const comparable = a.length >= 5 && k.length >= 5;
  return { afad: a.length, kandilli: k.length, matched, ok: !comparable || matched > 0 };
}
