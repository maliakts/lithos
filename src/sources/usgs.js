// USGS Earthquake Catalog (FDSN Event Web Service): açık, anahtarsız, uluslararası bağımsız doğrulama kaynağı.
// Yanıt: GeoJSON FeatureCollection. properties.time ve properties.updated = UTC milisaniye,
// geometry.coordinates = [boylam, enlem, derinlik km].
export const NAME = 'USGS';
const BASE = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
// Türkiye ve yakın çevresi
const BBOX = { minlatitude: 34, maxlatitude: 43, minlongitude: 24, maxlongitude: 46 };

export function normalize(f) {
  if (!f || f.type !== 'Feature') return null;
  const p = f.properties ?? {};
  const c = f.geometry?.coordinates;
  if (p.type && p.type !== 'earthquake') return null; // patlatma, maden ocağı vb. hariç
  if (!Array.isArray(c) || c.length < 2) return null;
  const [lon, lat, depth] = c.map(Number);
  const mag = Number(p.mag);
  const t = new Date(Number(p.time));
  if (p.mag == null || p.time == null) return null;
  if (![lat, lon, mag].every(Number.isFinite) || Number.isNaN(t.getTime())) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || mag < -2 || mag > 10) return null;
  const upd = p.updated != null ? new Date(Number(p.updated)) : null;
  return {
    source: NAME,
    id: String(f.id ?? `${t.toISOString()}|${lat.toFixed(4)}|${lon.toFixed(4)}`),
    time: t.toISOString(),
    lat,
    lon,
    depth: Number.isFinite(depth) ? depth : null,
    mag,
    magType: p.magType ? String(p.magType) : '',
    place: String(p.place ?? '').trim() || 'Bilinmeyen konum',
    province: '',
    updatedAt: upd && !Number.isNaN(upd.getTime()) ? upd.toISOString() : null,
  };
}

export async function fetchRecent({ hours = 24, fetchImpl = fetch } = {}) {
  const start = new Date(Date.now() - hours * 3600 * 1000);
  const url = new URL(BASE);
  url.search = new URLSearchParams({
    format: 'geojson',
    starttime: start.toISOString().slice(0, 19),
    orderby: 'time',
    limit: '1000',
    ...Object.fromEntries(Object.entries(BBOX).map(([k, v]) => [k, String(v)])),
  });
  const res = await fetchImpl(url, {
    signal: AbortSignal.timeout(20000),
    headers: { 'user-agent': 'Lithos/1.0 (deprem haritasi)', accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`USGS HTTP ${res.status}`);
  const data = await res.json();
  if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('USGS beklenmeyen yanıt biçimi');
  // Deprem olmayan kayıtlar (patlatma vb.) ham satır sayısına dahil edilmez
  const quakes = data.features.filter((f) => !f?.properties?.type || f.properties.type === 'earthquake');
  const events = quakes.map(normalize).filter(Boolean);
  return { events, rawRows: quakes.length, rawSample: data.features[0] ?? null };
}
