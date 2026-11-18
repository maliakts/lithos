import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, windDir, createWeatherService } from '../src/weather.js';

const NOW = Date.parse('2026-11-18T12:00:00Z');
const json = (over = {}) => ({ current: { time: NOW / 1000 - 300, temperature_2m: 6.4, apparent_temperature: 3.1, relative_humidity_2m: 71, is_day: 1, precipitation: 0.2, weather_code: 61, wind_speed_10m: 14.2, wind_direction_10m: 225, wind_gusts_10m: 30.4, ...over } });

test('Open-Meteo yanıtını Türkçe etiketle sadeleştirir', () => {
  const w = normalize(json(), NOW);
  assert.equal(w.temp, 6.4);
  assert.equal(w.label, 'Hafif yağmur');
  assert.equal(w.windKmh, 14);
  assert.equal(w.windDir, 'GB');
  assert.equal(w.humidity, 71);
  assert.equal(w.isDay, true);
  assert.equal(w.time, new Date(NOW - 300000).toISOString());
});

test('mantıksız, bilinmeyen veya bayat veriyi reddeder', () => {
  assert.throws(() => normalize(json({ temperature_2m: 500 }), NOW), /Sıcaklık/);
  assert.throws(() => normalize(json({ relative_humidity_2m: 140 }), NOW), /Nem/);
  assert.throws(() => normalize(json({ weather_code: 42 }), NOW), /Bilinmeyen/);
  assert.throws(() => normalize(json({ time: NOW / 1000 - 5 * 3600 }), NOW), /güncel değil/);
  assert.throws(() => normalize({}, NOW), /current/);
});

test('rüzgar yönü', () => {
  assert.equal(windDir(0), 'K');
  assert.equal(windDir(90), 'D');
  assert.equal(windDir(180), 'G');
  assert.equal(windDir(270), 'B');
  assert.equal(windDir(359), 'K');
});

test('servis önbelleğe alır, hata olunca bayat veri vermez', async () => {
  let calls = 0;
  let fail = false;
  let t = NOW;
  const fetchImpl = async () => {
    calls++;
    if (fail) return { ok: false, status: 500 };
    return { ok: true, json: async () => json({ time: t / 1000 }) };
  };
  const realNow = Date.now;
  Date.now = () => t;
  try {
    const get = createWeatherService({ fetchImpl, now: () => t });
    await get(39.93, 32.86);
    await get(39.94, 32.87); // aynı ızgara hücresi
    assert.equal(calls, 1);
    t += 11 * 60 * 1000;
    fail = true;
    await assert.rejects(get(39.93, 32.86), /HTTP 500/);
  } finally {
    Date.now = realNow;
  }
});
