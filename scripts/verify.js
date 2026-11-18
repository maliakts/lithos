// Gerçek verinin doğru okunduğunu kanıtlayan kontrol aracı:  npm run verify
// Hem AFAD hem Kandilli'yi canlı çeker, ayrıştırma oranını ve iki kaynağın birbiriyle uyumunu ölçer.
import * as afad from '../src/sources/afad.js';
import * as kandilli from '../src/sources/kandilli.js';
import * as usgs from '../src/sources/usgs.js';
import { fetchWeather } from '../src/weather.js';
import { km } from '../src/merge.js';

let failed = 0;
const ok = (m) => console.log(`  ✅ ${m}`);
const warn = (m) => console.log(`  ⚠️  ${m}`);
const fail = (m) => {
  failed++;
  console.log(`  ❌ ${m}`);
};
const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN);
const line = (e) =>
  `${e.time}  M${e.mag.toFixed(1)} ${e.magType || ''}  ${e.depth ?? '?'} km  ${e.lat.toFixed(3)},${e.lon.toFixed(3)}  ${e.place}`;

async function load(name, mod, { args = {}, note = '' } = {}) {
  console.log(`\n▶ ${name}${note}`);
  try {
    const r = await mod.fetchRecent(args);
    ok(`bağlantı başarılı: ${r.rawRows} ham satır, ${r.events.length} geçerli kayıt`);
    const ratio = r.rawRows ? r.events.length / r.rawRows : 0;
    if (ratio >= 0.95) ok(`ayrıştırma oranı %${(ratio * 100).toFixed(1)}`);
    else fail(`ayrıştırma oranı düşük: %${(ratio * 100).toFixed(1)} (biçim değişmiş olabilir)`);
    if (!r.events.length) fail('hiç geçerli kayıt yok');
    else {
      const newest = r.events.reduce((a, b) => (a.time > b.time ? a : b));
      const ageMin = (Date.now() - Date.parse(newest.time)) / 60000;
      if (ageMin < -10) fail(`en yeni kayıt gelecekte görünüyor (${ageMin.toFixed(0)} dk): saat dilimi hatalı olabilir`);
      else if (ageMin > 360) warn(`en yeni kayıt ${Math.round(ageMin)} dk önce; sakin bir gün olabilir ya da veri bayat`);
      else ok(`en yeni kayıt ${Math.max(0, Math.round(ageMin))} dk önce`);
      console.log('  örnek kayıtlar:');
      r.events.slice(0, 3).forEach((e) => console.log('    ' + line(e)));
    }
    console.log('  ham örnek:', typeof r.rawSample === 'string' ? r.rawSample.trim() : JSON.stringify(r.rawSample));
    return r.events;
  } catch (e) {
    fail(`erişilemedi: ${e.message}`);
    return [];
  }
}

const A = await load('AFAD', afad);
const K = await load('Kandilli', kandilli);
const U = await load('USGS (uluslararası doğrulama)', usgs, {
  args: { hours: 24 * 30 },
  note: ' — son 30 gün (USGS bu bölgede günde birkaç kayıt yayımlar; 0 olması hata değildir)',
});

console.log('\n▶ Çapraz kontrol (AFAD ↔ Kandilli, son 12 saat)');
if (!A.length || !K.length) {
  fail('çapraz kontrol için iki kaynak da gerekli');
} else {
  const since = Date.now() - 12 * 3600 * 1000;
  const a = A.filter((e) => Date.parse(e.time) >= since && e.mag >= 2.5);
  const k = K.filter((e) => Date.parse(e.time) >= since && e.mag >= 2.5);
  const dts = [];
  const dms = [];
  const dds = [];
  for (const x of a) {
    let best = null;
    for (const y of k) {
      const dt = Math.abs(Date.parse(x.time) - Date.parse(y.time));
      if (dt <= 120000 && km(x, y) <= 75 && (!best || dt < best.dt)) best = { y, dt };
    }
    if (best) {
      dts.push(best.dt / 1000);
      dms.push(Math.abs(x.mag - best.y.mag));
      dds.push(km(x, best.y));
    }
  }
  console.log(`  M2.5+ AFAD: ${a.length}, Kandilli: ${k.length}, eşleşen: ${dts.length}`);
  if (a.length >= 3 && k.length >= 3 && dts.length === 0) {
    fail('hiç eşleşme yok: iki kaynağın saatleri uyuşmuyor, saat dilimi varsayımı yanlış olabilir');
  } else if (dts.length) {
    ok(`ortanca zaman farkı ${median(dts).toFixed(0)} sn, konum farkı ${median(dds).toFixed(1)} km, büyüklük farkı ${median(dms).toFixed(2)}`);
    if (median(dts) > 30) warn('ortanca zaman farkı 30 sn üzerinde; saatleri kontrol et');
    if (median(dms) > 0.3) warn('ortanca büyüklük farkı 0.3 üzerinde; büyüklük türleri (ML/Mw) farklı olabilir');
  } else {
    warn('karşılaştırılacak yeterli deprem yok (sakin bir saat aralığı olabilir)');
  }
}

console.log('\n▶ Hava durumu (Open-Meteo, Ankara)');
try {
  const w = await fetchWeather(39.93, 32.86);
  ok(`${w.label}, ${w.temp}°C (hissedilen ${w.feelsLike}°C), nem %${w.humidity}, rüzgar ${w.windKmh} km/sa ${w.windDir}, saat ${w.time}`);
} catch (e) {
  fail(`hava durumu alınamadı: ${e.message}`);
}

if (U.length && A.length) {
  console.log('\n▶ USGS ile AFAD karşılaştırması (M4+, son 24 saat)');
  const big = A.filter((e) => e.mag >= 4);
  let m = 0;
  const diffs = [];
  for (const x of big) {
    const y = U.find((u) => Math.abs(Date.parse(u.time) - Date.parse(x.time)) <= 120000 && km(x, u) <= 100);
    if (y) { m++; diffs.push(Math.abs(x.mag - y.mag)); }
  }
  console.log(`  AFAD M4+: ${big.length}, USGS'de eşleşen: ${m}${diffs.length ? `, ortanca büyüklük farkı ${median(diffs).toFixed(2)}` : ''}`);
  if (big.length >= 2 && m === 0) warn('M4+ depremler USGS ile eşleşmedi; saat veya konum farkı olabilir');
  else ok('USGS karşılaştırması tamam');
}

console.log(failed ? `\n❌ ${failed} kontrol başarısız. Bu çıktıyı bana gönder, düzelteyim.` : '\n✅ Tüm kontroller geçti.');
process.exit(failed ? 1 : 0);
