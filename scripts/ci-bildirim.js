// GitHub Actions için tek seferlik bildirim: AFAD + Kandilli'yi okur, yeni depremleri Telegram kanalına gönderir.
// Gönderilenler .cache/posted.json içinde tutulur (Actions cache ile run'lar arasında taşınır).
import fs from 'node:fs';
import path from 'node:path';
import * as afad from '../src/sources/afad.js';
import * as kandilli from '../src/sources/kandilli.js';
import { merge } from '../src/merge.js';
import { formatMessage } from '../src/notify.js';
import { telegramCall } from '../src/telegram-http.js';

const token = process.env.TELEGRAM_BOT_TOKEN;
const chat = process.env.TELEGRAM_CHANNEL;
const minMag = Number(process.env.CHANNEL_MIN_MAG ?? 2.5) || 0;
const maxAgeMs = 60 * 60 * 1000; // en fazla 1 saat önceki depremler (Actions gecikmesi için pay)
if (!token || !chat) { console.error('TELEGRAM_BOT_TOKEN ve TELEGRAM_CHANNEL gerekli.'); process.exit(1); }

console.log(`Bot kimliği: ${token.split(':')[0]} | kanal: ${chat} | belirteç uzunluğu: ${token.length}`);

const file = path.join('.cache', 'posted.json');
fs.mkdirSync('.cache', { recursive: true });
const firstRun = !fs.existsSync(file);
const posted = new Set(firstRun ? [] : JSON.parse(fs.readFileSync(file, 'utf8')));

// Actions'tan elle başlatılınca (Run workflow) bağlantıyı sınamak için bir deneme mesajı gönderir.
if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
  const r = await telegramCall(token, 'sendMessage', { chat_id: chat, text: '✅ Lithos: GitHub Actions bağlantısı çalışıyor. Yeni depremler (M' + minMag + '+) bu kanala otomatik gelecek.', disable_web_page_preview: true });
  if (!r.ok) { console.error('Telegram hatası:', r.description); process.exit(1); }
  console.log('Deneme mesajı gönderildi.');
}

const lists = {};
const results = await Promise.allSettled([afad.fetchRecent(), kandilli.fetchRecent()]);
['AFAD', 'Kandilli'].forEach((n, i) => {
  if (results[i].status === 'fulfilled') { lists[n] = results[i].value.events; console.log(`${n}: ${lists[n].length} kayıt`); }
  else console.error(`${n} okunamadı: ${results[i].reason?.message}`);
});
if (!lists.AFAD && !lists.Kandilli) { console.error('Hiçbir kaynak okunamadı.'); process.exit(1); }

const now = Date.now();
const events = merge([lists.AFAD ?? [], lists.Kandilli ?? []], { now, windowMs: 24 * 3600 * 1000 });
const keysOf = (e) => e.sources.map((s) => `${s.name}:${s.id}`);
const fresh = events.filter((e) => !keysOf(e).some((k) => posted.has(k)));

let sent = 0;
// İlk çalıştırmada eski depremleri kanala boşaltma: sadece kaydet.
const toSend = firstRun ? [] : fresh.filter((e) => e.mag >= minMag && now - Date.parse(e.time) <= maxAgeMs).reverse();
for (const e of toSend) {
  for (let t = 0; t < 3; t++) {
    const r = await telegramCall(token, 'sendMessage', { chat_id: chat, text: formatMessage(e), disable_web_page_preview: true });
    if (r.ok) { sent++; break; }
    if (r.parameters?.retry_after) { await new Promise((ok) => setTimeout(ok, (r.parameters.retry_after + 1) * 1000)); continue; }
    console.error('Telegram hatası:', r.description); process.exit(1);
  }
  await new Promise((ok) => setTimeout(ok, 1200));
}
events.forEach((e) => keysOf(e).forEach((k) => posted.add(k)));
fs.writeFileSync(file, JSON.stringify([...posted].slice(-20000)));
console.log(`${events.length} deprem görüldü, ${fresh.length} yeni, ${sent} Telegram'a gönderildi${firstRun ? ' (ilk çalıştırma: sadece kaydedildi)' : ''}.`);
