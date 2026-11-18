// Telegram bağlantısını sınar:  npm run telegram   (veya dogrula.bat)
// 1) bot belirteci geçerli mi, 2) kanala yazabiliyor mu, 3) örnek bir deprem mesajı gönderir.
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv, PROJECT_ROOT } from '../src/env.js';
import { telegramCall } from '../src/telegram-http.js';
import { formatMessage } from '../src/notify.js';

loadEnv();
const token = process.env.TELEGRAM_BOT_TOKEN;
const chat = process.env.TELEGRAM_CHANNEL;
if (!token || !chat) {
  console.log('❌ .env dosyasında TELEGRAM_BOT_TOKEN ve TELEGRAM_CHANNEL dolu olmalı.');
  console.log(`   Çalıştığın klasör: ${PROJECT_ROOT}`);
  console.log(fs.existsSync(path.join(PROJECT_ROOT, '.env'))
    ? '   .env bulundu ama içindeki alanlar boş.'
    : '   Bu klasörde .env dosyası YOK. Telegram bilgilerinin olduğu klasörde çalıştır (veya .env.example dosyasını .env olarak kopyalayıp doldur).');
  process.exit(1);
}
const call = (method, body) => telegramCall(token, method, body ?? {}, { timeoutMs: 30000 });

try {
  const me = await call('getMe');
  if (!me.ok) throw new Error(`bot belirteci geçersiz: ${me.description}`);
  console.log(`✅ Bot bulundu: @${me.result.username}`);

  const sample = {
    mag: 4.2, place: 'ÖRNEK MESAJ (test) — Malatya', province: 'Malatya', lat: 38.35, lon: 38.31, depth: 7.1,
    time: new Date().toISOString(), disagree: false,
    sources: [{ name: 'AFAD', mag: 4.2 }, { name: 'Kandilli', mag: 4.1 }],
  };
  const sent = await call('sendMessage', {
    chat_id: chat,
    text: `✅ Lithos bağlantı testi başarılı. Gerçek depremler buraya otomatik gelecek.\n\n${formatMessage(sample)}`,
    disable_web_page_preview: true,
  });
  if (!sent.ok) throw new Error(`kanala yazılamadı: ${sent.description}`);
  console.log(`✅ Kanala test mesajı gönderildi: "${sent.result.chat.title}"`);
  console.log('\nHer şey hazır. baslat.bat ile uygulamayı çalıştırabilirsin.');
} catch (e) {
  console.log(`❌ ${e.message}`);
  console.log('   İpucu: bot kanalda yönetici olmalı ve TELEGRAM_CHANNEL doğru yazılmalı.');
  process.exit(1);
}
