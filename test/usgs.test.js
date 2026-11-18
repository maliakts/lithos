import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../src/sources/usgs.js';

// Biçim, USGS'nin canlı yanıtından doğrulandı (id us7000txx9)
const FEATURE = {
  type: 'Feature',
  id: 'us7000txx9',
  properties: { mag: 5.1, place: '39 km S of Moíres, Greece', time: 1794528304104, updated: 1794532906219, magType: 'mb', type: 'earthquake', status: 'reviewed' },
  geometry: { type: 'Point', coordinates: [24.8798, 34.6967, 43.358] },
};

test('USGS özelliğini normalize eder (boylam, enlem, derinlik sırası)', () => {
  const q = normalize(FEATURE);
  assert.equal(q.id, 'us7000txx9');
  assert.equal(q.lon, 24.8798);
  assert.equal(q.lat, 34.6967);
  assert.equal(q.depth, 43.358);
  assert.equal(q.mag, 5.1);
  assert.equal(q.magType, 'mb');
  assert.equal(q.time, new Date(1794528304104).toISOString());
  assert.equal(q.source, 'USGS');
});

test('deprem olmayan, magsız veya bozuk kayıtları eler', () => {
  assert.equal(normalize({ ...FEATURE, properties: { ...FEATURE.properties, type: 'quarry blast' } }), null);
  assert.equal(normalize({ ...FEATURE, properties: { ...FEATURE.properties, mag: null } }), null);
  assert.equal(normalize({ ...FEATURE, geometry: { coordinates: [] } }), null);
  assert.equal(normalize(null), null);
});
