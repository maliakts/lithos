import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './env.js';
import { createApp } from './app.js';
import * as afad from './sources/afad.js';
import * as kandilli from './sources/kandilli.js';
import * as usgs from './sources/usgs.js';
import { createWeatherService } from './weather.js';
import { Subscribers } from './subscribers.js';
import { TelegramBot } from './bot.js';

loadEnv();
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const POLL_MS = Math.max(15, Number(process.env.POLL_SECONDS) || 60) * 1000;

let app;
const subs = new Subscribers(path.join(ROOT, 'data', 'subscribers.json'));
const bot = process.env.TELEGRAM_BOT_TOKEN
  ? new TelegramBot({ token: process.env.TELEGRAM_BOT_TOKEN, subscribers: subs, getLatest: (n) => app.latest(n) })
  : null;

app = createApp({
  // Sıra = öncelik: AFAD (resmî, birincil) > Kandilli (ikinci resmî) > USGS (uluslararası doğrulama)
  sources: [
    { name: afad.NAME, fetchRecent: () => afad.fetchRecent() },
    { name: kandilli.NAME, fetchRecent: () => kandilli.fetchRecent() },
    { name: usgs.NAME, fetchRecent: () => usgs.fetchRecent(), allowEmpty: true },
  ],
  pollMs: POLL_MS,
  publicDir: path.join(ROOT, 'public'),
  weather: createWeatherService(),
  bot,
  subs,
  // Kanal: TELEGRAM_CHANNEL (@kullaniciadi veya -100...) tanımlıysa yeni depremler oraya otomatik gönderilir
  channel:
    bot && process.env.TELEGRAM_CHANNEL
      ? { minMag: Number(process.env.CHANNEL_MIN_MAG ?? 2.5) || 0, post: (text) => bot.send(process.env.TELEGRAM_CHANNEL, text) }
      : null,
});

const port = await app.start(PORT);
console.log(`Lithos → http://localhost:${port}`);
console.log(bot ? 'Telegram botu açık' : 'Telegram kapalı (TELEGRAM_BOT_TOKEN yok)');
if (bot && process.env.TELEGRAM_CHANNEL) console.log(`Kanal bildirimleri açık: ${process.env.TELEGRAM_CHANNEL} (M${process.env.CHANNEL_MIN_MAG ?? 2.5}+)`);
bot?.start();
