// Hava durumu: Open-Meteo (açık kaynak, anahtarsız). https://open-meteo.com
// Saat için timeformat=unixtime kullanılır, böylece saat dilimi belirsizliği olmaz.
const BASE = 'https://api.open-meteo.com/v1/forecast';
const CURRENT = [
  'temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day',
  'precipitation', 'weather_code', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m',
].join(',');

// WMO hava durumu kodları
const WMO = {
  0: ['Açık', '☀️', '🌙'], 1: ['Çoğunlukla açık', '🌤️', '🌙'], 2: ['Parçalı bulutlu', '⛅', '☁️'], 3: ['Kapalı', '☁️', '☁️'],
  45: ['Sisli', '🌫️', '🌫️'], 48: ['Kırağılı sis', '🌫️', '🌫️'],
  51: ['Hafif çiseleme', '🌦️', '🌦️'], 53: ['Çiseleme', '🌦️', '🌦️'], 55: ['Yoğun çiseleme', '🌧️', '🌧️'],
  56: ['Dondurucu çiseleme', '🌧️', '🌧️'], 57: ['Yoğun dondurucu çiseleme', '🌧️', '🌧️'],
  61: ['Hafif yağmur', '🌦️', '🌧️'], 63: ['Yağmur', '🌧️', '🌧️'], 65: ['Şiddetli yağmur', '🌧️', '🌧️'],
  66: ['Dondurucu yağmur', '🌧️', '🌧️'], 67: ['Şiddetli dondurucu yağmur', '🌧️', '🌧️'],
  71: ['Hafif kar', '🌨️', '🌨️'], 73: ['Kar', '🌨️', '🌨️'], 75: ['Yoğun kar', '❄️', '❄️'], 77: ['Kar taneleri', '❄️', '❄️'],
  80: ['Hafif sağanak', '🌦️', '🌧️'], 81: ['Sağanak', '🌧️', '🌧️'], 82: ['Şiddetli sağanak', '⛈️', '⛈️'],
  85: ['Kar sağanağı', '🌨️', '🌨️'], 86: ['Yoğun kar sağanağı', '❄️', '❄️'],
  95: ['Gök gürültülü fırtına', '⛈️', '⛈️'], 96: ['Dolulu fırtına', '⛈️', '⛈️'], 99: ['Şiddetli dolulu fırtına', '⛈️', '⛈️'],
};

const DIRS = ['K', 'KKD', 'KD', 'DKD', 'D', 'DGD', 'GD', 'GGD', 'G', 'GGB', 'GB', 'BGB', 'B', 'BKB', 'KB', 'KKB'];
export const windDir = (deg) => DIRS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];

const inRange = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;

/** Open-Meteo yanıtını doğrular ve sadeleştirir; mantıksız değerde hata fırlatır. */
export function normalize(json, now = Date.now()) {
  const c = json?.current;
  if (!c || typeof c !== 'object') throw new Error('Open-Meteo yanıtında "current" yok');
  const temp = Number(c.temperature_2m);
  const feels = Number(c.apparent_temperature);
  const hum = Number(c.relative_humidity_2m);
  const wind = Number(c.wind_speed_10m);
  const dir = Number(c.wind_direction_10m);
  const gust = c.wind_gusts_10m == null ? null : Number(c.wind_gusts_10m);
  const precip = Number(c.precipitation ?? 0);
  const code = Number(c.weather_code);
  const tMs = Number(c.time) * 1000;
  if (!inRange(temp, -90, 65)) throw new Error('Sıcaklık değeri mantıksız');
  if (!inRange(hum, 0, 100)) throw new Error('Nem değeri mantıksız');
  if (!inRange(wind, 0, 400)) throw new Error('Rüzgar değeri mantıksız');
  if (!inRange(code, 0, 99) || !(code in WMO)) throw new Error(`Bilinmeyen hava kodu: ${c.weather_code}`);
  if (!Number.isFinite(tMs) || Math.abs(now - tMs) > 3 * 3600 * 1000) throw new Error('Hava verisinin saati güncel değil');
  const day = Number(c.is_day) === 1;
  const [label, iconDay, iconNight] = WMO[code];
  return {
    source: 'Open-Meteo',
    time: new Date(tMs).toISOString(),
    temp: Math.round(temp * 10) / 10,
    feelsLike: Number.isFinite(feels) ? Math.round(feels * 10) / 10 : null,
    humidity: Math.round(hum),
    windKmh: Math.round(wind),
    windGustKmh: Number.isFinite(gust) ? Math.round(gust) : null,
    windDir: Number.isFinite(dir) ? windDir(dir) : '',
    precipMm: Number.isFinite(precip) ? Math.round(precip * 10) / 10 : 0,
    code,
    label,
    icon: day ? iconDay : iconNight,
    isDay: day,
  };
}

export async function fetchWeather(lat, lon, { fetchImpl = fetch } = {}) {
  if (!inRange(lat, -90, 90) || !inRange(lon, -180, 180)) throw new Error('Geçersiz koordinat');
  const url = new URL(BASE);
  url.search = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    current: CURRENT,
    timeformat: 'unixtime',
    timezone: 'auto',
  });
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(15000), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  return normalize(await res.json());
}

/** 10 dakikalık önbellek + aynı anda gelen aynı istekleri tek istekte birleştirme (hız sınırını korur) */
export function createWeatherService({ fetchImpl = fetch, now = () => Date.now(), ttlMs = 10 * 60 * 1000 } = {}) {
  const cache = new Map();
  const inflight = new Map();
  return async function get(lat, lon) {
    const key = `${lat.toFixed(1)},${lon.toFixed(1)}`; // ~11 km ızgara: Open-Meteo çözünürlüğüyle uyumlu
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.value;
    if (inflight.has(key)) return inflight.get(key);
    const p = fetchWeather(lat, lon, { fetchImpl })
      .then((value) => {
        cache.set(key, { at: now(), value });
        if (cache.size > 500) cache.delete(cache.keys().next().value);
        return value;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p; // hata olursa eski/bayat veri GÖSTERİLMEZ
  };
}
