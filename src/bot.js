import { telegramCall } from './telegram-http.js';
import { formatMessage } from './notify.js';

const HELP =
  'Lithos 🌍 canlı deprem bildirimleri\n\n' +
  '/abone [minimum büyüklük] [il] — bildirim al\n' +
  '   örn: /abone 4  veya  /abone 3.5 Malatya\n' +
  '/iptal — aboneliği kapat\n' +
  '/son — en son 5 deprem\n';

export class TelegramBot {
  constructor({ token, subscribers, getLatest }) {
    this.token = token;
    this.subs = subscribers;
    this.getLatest = getLatest;
    this.offset = 0;
    this.running = false;
    this.queue = [];
    this.draining = false;
  }

  async api(method, body) {
    const json = await telegramCall(this.token, method, body, { timeoutMs: method === 'getUpdates' ? 45000 : 40000 });
    if (!json.ok) {
      const err = new Error(`Telegram ${method}: ${json.description}`);
      err.retryAfter = json.parameters?.retry_after;
      throw err;
    }
    return json.result;
  }

  /** Mesajlar sırayla, aralarında ~1.1 sn bırakılarak gönderilir (Telegram sınırı: kanala dakikada ~20). */
  send(chatId, text) {
    this.queue.push({ chatId, text, tries: 0 });
    this.drain();
  }

  async drain() {
    if (this.draining) return;
    this.draining = true;
    while (this.queue.length) {
      const m = this.queue.shift();
      try {
        await this.api('sendMessage', { chat_id: m.chatId, text: m.text, disable_web_page_preview: true });
      } catch (e) {
        if (e.retryAfter && m.tries < 3) {
          m.tries++;
          this.queue.unshift(m);
          await new Promise((r) => setTimeout(r, (e.retryAfter + 1) * 1000));
          continue;
        }
        console.error('[bot] gönderilemedi:', e.message);
      }
      await new Promise((r) => setTimeout(r, 1100));
    }
    this.draining = false;
  }

  async handle(msg) {
    const chatId = msg.chat.id;
    const [cmd, ...args] = (msg.text || '').trim().split(/\s+/);
    switch (cmd.split('@')[0]) {
      case '/start':
      case '/yardim':
        return this.send(chatId, HELP);
      case '/abone': {
        let minMag = 4;
        const rest = [];
        for (const a of args) {
          const n = Number(a.replace(',', '.'));
          if (rest.length === 0 && Number.isFinite(n)) minMag = Math.min(Math.max(n, 0), 9);
          else rest.push(a);
        }
        const province = rest.join(' ');
        this.subs.set(chatId, { minMag, province });
        return this.send(chatId, `✅ Abone oldun: M${minMag}+ ${province ? `· ${province}` : '· tüm Türkiye'}`);
      }
      case '/iptal':
        return this.send(chatId, this.subs.remove(chatId) ? 'Abonelik kapatıldı.' : 'Zaten abone değildin.');
      case '/son': {
        const list = this.getLatest(5);
        return this.send(chatId, list.length ? list.map(formatMessage).join('\n\n') : 'Henüz veri yok.');
      }
      default:
        return this.send(chatId, HELP);
    }
  }

  async start() {
    this.running = true;
    console.log('[bot] Telegram botu başladı');
    while (this.running) {
      try {
        const updates = await this.api('getUpdates', { offset: this.offset, timeout: 25 });
        for (const u of updates) {
          this.offset = u.update_id + 1;
          if (u.message?.text) await this.handle(u.message);
        }
      } catch (e) {
        console.error('[bot]', e.message);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  stop() {
    this.running = false;
  }
}
