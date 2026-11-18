// AFAD (Afet ve Acil Durum Yönetimi Başkanlığı) deprem verisi.
// Not: AFAD'ın "eventDate" alanı saat dilimi içermez ve UTC olarak yorumlanır.
// Bu varsayım çalışma anında Kandilli ile çapraz kontrol edilir (bkz. merge.js → crossCheck).
export const NAME = 'AFAD';
const BASE = 'https://deprem.afad.gov.tr/apiv2/event/filter';

const pad = (n) => String(n).padStart(2, '0');
const fmt = (d) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
  `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;

/** Ham AFAD kaydını ortak biçime çevirir; geçersiz/eksik kayıtta null döner. */
export function normalize(r) {
  if (!r || typeof r !== 'object') return null;
  const rawTime = r.eventDate ?? r.date;
  if (!rawTime) return null;
  const iso = /([zZ]|[+-]\d\d:?\d\d)$/.test(rawTime) ? rawTime : String(rawTime).replace(' ', 'T') + 'Z';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;

  const lat = Number(r.latitude);
  const lon = Number(r.longitude);
  const mag = Number(r.magnitude);
  if (![lat, lon, mag].every(Number.isFinite)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  if (mag < -2 || mag > 10) return null;
  const depth = Number(r.depth);

  const province = String(r.province ?? '').trim();
  const place =
    String(r.location ?? '').trim() ||
    [r.district, province].filter(Boolean).join(', ') ||
    'Bilinmeyen konum';
  const updated = r.lastUpdateDate ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(r.lastUpdateDate) ? r.lastUpdateDate : String(r.lastUpdateDate).replace(' ', 'T') + 'Z') : null;

  return {
    source: NAME,
    id: String(r.eventID ?? r.id ?? `${t.toISOString()}|${lat.toFixed(4)}|${lon.toFixed(4)}`),
    time: t.toISOString(),
    lat,
    lon,
    depth: Number.isFinite(depth) ? depth : null,
    mag,
    magType: r.type ? String(r.type) : '',
    place,
    province,
    updatedAt: updated && !Number.isNaN(updated.getTime()) ? updated.toISOString() : null,
  };
}

export async function fetchRecent({ hours = 24, minMag = 0, fetchImpl = fetch } = {}) {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 3600 * 1000);
  const url = new URL(BASE);
  url.search = new URLSearchParams({
    start: fmt(start),
    end: fmt(end),
    minmag: String(minMag),
    orderby: 'timedesc',
    limit: '2000',
    format: 'json',
  });
  const res = await fetchImpl(url, {
    signal: AbortSignal.timeout(20000),
    headers: { 'user-agent': 'Lithos/1.0 (deprem haritasi)', accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`AFAD HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('AFAD beklenmeyen yanıt biçimi (dizi değil)');
  const events = data.map(normalize).filter(Boolean);
  return { events, rawRows: data.length, rawSample: data[0] ?? null };
}
