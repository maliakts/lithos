import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../src/sources/afad.js';

test('AFAD kaydını normalize eder (saat dilimi yoksa UTC)', () => {
  const q = normalize({
    eventID: '123', eventDate: '2026-11-18T10:00:00', latitude: '38.35', longitude: '38.31',
    depth: '7.1', magnitude: '4.2', type: 'ML', location: 'Yeşilyurt (Malatya)', province: 'Malatya',
  });
  assert.equal(q.id, '123');
  assert.equal(q.time, '2026-11-18T10:00:00.000Z');
  assert.equal(q.mag, 4.2);
  assert.equal(q.magType, 'ML');
  assert.equal(q.depth, 7.1);
  assert.equal(q.province, 'Malatya');
  assert.equal(q.source, 'AFAD');
});

test('geçersiz veya mantıksız kayıtları eler', () => {
  assert.equal(normalize(null), null);
  assert.equal(normalize({}), null);
  const base = { eventDate: '2026-01-01T00:00:00', latitude: 1, longitude: 1, magnitude: 1 };
  assert.equal(normalize({ ...base, eventDate: 'bozuk' }), null);
  assert.equal(normalize({ ...base, latitude: 'x' }), null);
  assert.equal(normalize({ ...base, latitude: 91 }), null);
  assert.equal(normalize({ ...base, magnitude: 11 }), null);
});

test('id yoksa zaman+konumdan üretir; derinlik yoksa null', () => {
  const q = normalize({ date: '2026-01-01 00:00:00', latitude: 1, longitude: 2, magnitude: 3 });
  assert.match(q.id, /2026-01-01/);
  assert.equal(q.depth, null);
});
