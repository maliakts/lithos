import test from 'node:test';
import assert from 'node:assert/strict';
import { matches, formatMessage, fold } from '../src/notify.js';

const e = { mag: 4.5, province: 'Malatya', place: 'Yeşilyurt (Malatya)', lat: 38.3, lon: 38.3, depth: 8, time: '2026-11-18T10:00:00Z', disagree: true, sources: [{ name: 'AFAD', mag: 4.5 }, { name: 'Kandilli', mag: 4.1 }] };

test('büyüklük eşiği', () => {
  assert.equal(matches({ minMag: 4 }, e), true);
  assert.equal(matches({ minMag: 5 }, e), false);
});

test('il filtresi Türkçe karakter ve büyük/küçük harfe duyarsız', () => {
  assert.equal(matches({ minMag: 0, province: 'MALATYA' }, e), true);
  assert.equal(matches({ minMag: 0, province: 'İzmir' }, e), false);
  assert.equal(matches({ minMag: 0, province: 'IĞDIR' }, { ...e, province: 'Iğdır', place: 'Iğdır' }), true);
  assert.equal(matches({ minMag: 0, province: 'Iğdır' }, { ...e, province: 'IGDIR', place: 'Merkez (IGDIR)' }), true); // Kandilli ASCII yazar
  assert.equal(fold('ŞANLIURFA'), 'sanliurfa');
});

test('mesajda kaynaklar ve uyarı yer alır', () => {
  const m = formatMessage(e);
  assert.match(m, /M4\.5/);
  assert.match(m, /AFAD M4\.5 · Kandilli M4\.1/);
  assert.match(m, /farkı var/);
  assert.match(m, /openstreetmap/);
});
