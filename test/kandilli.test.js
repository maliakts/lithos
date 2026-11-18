import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/sources/kandilli.js';

// Sentetik örnek: Kandilli lst0.asp biçiminde (gerçek biçim `npm run verify` ile canlı doğrulanır)
const PAGE = `<html><body><pre>
   SON DEPREMLER
   Tarih      Saat      Enlem(N)  Boylam(E)  Derinlik(km)  MD   ML   Mw    Yer                                         Çözüm Niteliği
---------- --------  --------  ---------  ----------    ---  ---  ---   -----------------------------------------   --------------
2026.11.18 19:05:23  38.3500   38.3100        7.1      -.-  3.2  -.-   YESILYURT (MALATYA)                         İlksel
2026.11.18 19:01:10  36.9000   27.2000       12.3      -.-  -.-  4.1   EGE DENIZI                                  REVIZE01
2026.11.18 18:50:00  39.0000   35.0000        5.0      2.5  -.-  -.-   SARIOGLAN (KAYSERI)                         İlksel
2026.11.18 18:40:00  39.0000   35.0000        5.0      -.-  -.-  -.-   MAGNITUDESIZ (KAYSERI)                      İlksel
2026.11.18 18:30:00  99.0000   35.0000        5.0      -.-  2.0  -.-   BOZUK KONUM                                 İlksel
</pre></body></html>`;

test('Kandilli satırlarını ayrıştırır', () => {
  const { events, rawRows } = parse(PAGE);
  assert.equal(rawRows, 5);
  assert.equal(events.length, 3); // büyüklüksüz ve geçersiz enlem elenir
  const [a, b, c] = events;
  assert.equal(a.mag, 3.2);
  assert.equal(a.magType, 'ML');
  assert.equal(a.depth, 7.1);
  assert.equal(a.place, 'Yesilyurt (Malatya)');
  assert.equal(a.province, 'Malatya');
  assert.equal(b.magType, 'Mw'); // ML yoksa Mw
  assert.equal(b.province, '');
  assert.equal(c.magType, 'MD'); // ikisi de yoksa MD
});

test('Türkiye saati (UTC+3) doğru çevrilir', () => {
  const { events } = parse(PAGE);
  assert.equal(events[0].time, '2026-11-18T16:05:23.000Z');
});

test('boş / bozuk metinde çökmez', () => {
  assert.deepEqual(parse(''), { events: [], rawRows: 0 });
  assert.equal(parse('merhaba\ndünya').events.length, 0);
});
