// Boğaziçi Üniversitesi Kandilli Rasathanesi ve Deprem Araştırma Enstitüsü (KRDAE) "son depremler" listesi.
// Sayfa, <pre> içinde sabit sütunlu metin döndürür. Tarih/saat Türkiye saatindedir (UTC+3, "TS").
export const NAME = 'Kandilli';
const URL_LIST = 'http://www.koeri.boun.edu.tr/scripts/lst0.asp';

const ROW =
  /^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(-?\d+(?:\.\d+)?)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+?)\s*$/;
const QUALITY = /\s+(İlksel|Ilksel|REVIZE\d*)(\s.*)?$/i;

// Kandilli yer adlarını büyük harfli ASCII yazar ("YESILYURT"); Türkçe kurallı küçültme "ı" üretip bozar.
// Bu yüzden harf eşlemesi bilerek Türkçe-dışı yapılır: "Yesilyurt". Arama için notify.fold() zaten sadeleştirir.
const trTitle = (s) =>
  s
    .replace(/İ/g, 'i')
    .toLowerCase()
    .replace(/(^|[\s(\-\/])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

const num = (s) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

/** Metni ayrıştırır. rawRows = tarih ile başlayan aday satır sayısı; events = başarıyla okunanlar. */
export function parse(text) {
  const events = [];
  let rawRows = 0;
  for (const line0 of String(text).split(/\r?\n/)) {
    const line = line0.replace(/<[^>]*>/g, '').trim();
    if (!/^\d{4}\.\d{2}\.\d{2}\s/.test(line)) continue;
    rawRows++;
    const m = line.match(ROW);
    if (!m) continue;
    const [, Y, Mo, D, h, mi, s, latS, lonS, depS, mdS, mlS, mwS, rest] = m;
    const lat = num(latS);
    const lon = num(lonS);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;

    // Büyüklük: ML öncelikli, yoksa Mw, yoksa MD ("-.-" = yok)
    const cands = [['ML', num(mlS)], ['Mw', num(mwS)], ['MD', num(mdS)]].filter(([, v]) => Number.isFinite(v));
    if (!cands.length) continue;
    const [magType, mag] = cands[0];
    if (mag < -2 || mag > 10) continue;

    // Kandilli saatleri UTC+3
    const t = new Date(`${Y}-${Mo}-${D}T${h}:${mi}:${s}+03:00`);
    if (Number.isNaN(t.getTime())) continue;

    const placeRaw = rest.replace(QUALITY, '').trim();
    const prov = placeRaw.match(/\(([^)]+)\)\s*$/);
    const depth = num(depS);
    events.push({
      source: NAME,
      id: `${t.toISOString()}|${lat.toFixed(4)}|${lon.toFixed(4)}`,
      time: t.toISOString(),
      lat,
      lon,
      depth: Number.isFinite(depth) ? depth : null,
      mag,
      magType,
      place: trTitle(placeRaw) || 'Bilinmeyen konum',
      province: prov ? trTitle(prov[1]) : '',
      updatedAt: null,
    });
  }
  return { events, rawRows };
}

export async function fetchRecent({ fetchImpl = fetch } = {}) {
  const res = await fetchImpl(URL_LIST, {
    signal: AbortSignal.timeout(20000),
    headers: { 'user-agent': 'Lithos/1.0 (deprem haritasi)' },
  });
  if (!res.ok) throw new Error(`Kandilli HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  let text;
  try {
    text = new TextDecoder('windows-1254').decode(buf);
  } catch {
    text = new TextDecoder('latin1').decode(buf);
  }
  const out = parse(text);
  if (out.rawRows === 0) throw new Error('Kandilli sayfasında deprem satırı bulunamadı (biçim değişmiş olabilir)');
  return { ...out, rawSample: text.split(/\r?\n/).find((l) => /^\s*\d{4}\.\d{2}\.\d{2}\s/.test(l)) ?? null };
}
