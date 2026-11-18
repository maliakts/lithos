import test from 'node:test';
import assert from 'node:assert/strict';
import { merge, crossCheck } from '../src/merge.js';

const ev = (source, iso, lat, lon, mag, id = `${source}-${iso}`) => ({ source, id, time: iso, lat, lon, mag, depth: 5, magType: 'ML', place: `${source} yeri`, province: '', updatedAt: null });
const NOW = Date.parse('2026-11-18T12:00:00Z');

test('üç kaynak aynı depremi tek kayıtta birleştirir; AFAD birincildir', () => {
  const out = merge(
    [[ev('AFAD', '2026-11-18T10:00:00.000Z', 38.35, 38.31, 4.2)],
     [ev('Kandilli', '2026-11-18T10:00:05.000Z', 38.36, 38.30, 4.0)],
     [ev('USGS', '2026-11-18T10:00:02.000Z', 38.34, 38.33, 4.4)]],
    { now: NOW },
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].primary, 'AFAD');
  assert.deepEqual(out[0].sources.map((s) => s.name), ['AFAD', 'Kandilli', 'USGS']);
  assert.equal(out[0].magDiff, 0.2);
  assert.equal(out[0].disagree, false);
});

test('AFAD ve Kandilli arasında 0.3+ fark "disagree" olur; USGS farkı sayılmaz', () => {
  const out = merge(
    [[ev('AFAD', '2026-11-18T10:00:00.000Z', 38, 38, 4.5)],
     [ev('Kandilli', '2026-11-18T10:00:01.000Z', 38, 38, 4.0)],
     [ev('USGS', '2026-11-18T10:00:01.000Z', 38, 38, 6.0)]],
    { now: NOW },
  );
  assert.equal(out[0].disagree, true);
  assert.equal(out[0].magDiff, 0.5);
  const out2 = merge(
    [[ev('AFAD', '2026-11-18T10:00:00.000Z', 38, 38, 4.5)], [ev('Kandilli', '2026-11-18T10:00:01.000Z', 38, 38, 4.4)], [ev('USGS', '2026-11-18T10:00:01.000Z', 38, 38, 5.5)]],
    { now: NOW },
  );
  assert.equal(out2[0].disagree, false);
});

test('uzak veya zamanı farklı kayıtlar birleşmez', () => {
  const out = merge(
    [[ev('AFAD', '2026-11-18T10:00:00.000Z', 38, 38, 3)],
     [ev('Kandilli', '2026-11-18T10:05:00.000Z', 38, 38, 3), ev('Kandilli', '2026-11-18T10:00:00.000Z', 41, 30, 3)]],
    { now: NOW },
  );
  assert.equal(out.length, 3);
});

test('aynı kaynağın iki kaydı birleşmez; en yakın zamanlı eşleşir', () => {
  const out = merge(
    [[ev('AFAD', '2026-11-18T10:00:00.000Z', 38, 38, 3, 'a1'), ev('AFAD', '2026-11-18T10:00:30.000Z', 38, 38, 3, 'a2')],
     [ev('Kandilli', '2026-11-18T10:00:28.000Z', 38, 38, 3)]],
    { now: NOW },
  );
  assert.equal(out.length, 2);
  const withK = out.find((e) => e.sources.length === 2);
  assert.equal(withK.id, 'a2');
});

test('24 saatten eski ve gelecekteki kayıtlar elenir; yeni olan önce gelir', () => {
  const out = merge(
    [[ev('AFAD', '2026-11-17T09:00:00.000Z', 38, 38, 3), ev('AFAD', '2026-11-18T11:00:00.000Z', 38, 38, 3), ev('AFAD', '2026-11-18T09:00:00.000Z', 39, 39, 3), ev('AFAD', '2026-11-19T00:00:00.000Z', 40, 40, 3)]],
    { now: NOW },
  );
  assert.deepEqual(out.map((e) => e.time), ['2026-11-18T11:00:00.000Z', '2026-11-18T09:00:00.000Z']);
});

test('crossCheck: yeterli veri olup hiç eşleşme yoksa uyarır', () => {
  const mk = (src, shiftMin) => Array.from({ length: 6 }, (_, i) => ev(src, new Date(NOW - (i + 1) * 3600e3 / 2 + shiftMin * 60e3).toISOString(), 38 + i * 0.1, 38, 3));
  assert.equal(crossCheck(mk('AFAD', 0), mk('Kandilli', 0), NOW).ok, true);
  assert.equal(crossCheck(mk('AFAD', 0), mk('Kandilli', 180), NOW).ok, false); // 3 saat kayık = saat dilimi hatası
  assert.equal(crossCheck(mk('AFAD', 0).slice(0, 2), [], NOW).ok, true); // yetersiz veri uyarı değildir
});
