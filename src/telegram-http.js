import https from 'node:https';
import { execFile } from 'node:child_process';

function viaHttps(token, method, data, timeoutMs, host) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      host, family: 4, method: 'POST', path: `/bot${token}/${method}`,
      headers: { 'content-type': 'application/json', 'content-length': data.length },
      timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(new Error(`yanıt okunamadı (HTTP ${res.statusCode})`)); }
      });
    });
    req.on('timeout', () => req.destroy(new Error(`zaman aşımı (${Math.round(timeoutMs / 1000)} sn)`)));
    req.on('error', (e) => reject(new Error(e.message || e.code || 'bağlantı hatası')));
    req.end(data);
  });
}

// Yedek: sistemdeki curl (Windows 10/11'de curl.exe hazır gelir). Node'un TLS'i takılan ağlarda işe yarar.
function viaCurl(token, method, data, timeoutMs, host) {
  return new Promise((resolve, reject) => {
    const bin = process.platform === 'win32' ? 'curl.exe' : 'curl';
    const child = execFile(bin, [
      '-sS', '-4', '--max-time', String(Math.ceil(timeoutMs / 1000)),
      '-H', 'content-type: application/json', '--data-binary', '@-',
      `https://${host}/bot${token}/${method}`,
    ], { maxBuffer: 10 * 1024 * 1024, encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err && !stdout) return reject(new Error(`curl: ${(stderr || err.message).trim().split('\n').pop()}`));
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error(`curl yanıtı okunamadı: ${String(stdout).slice(0, 80)}`)); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(data);
  });
}

/** Telegram Bot API çağrısı: önce https (IPv4), takılırsa curl ile dener. */
export async function telegramCall(token, method, body = {}, { timeoutMs = 40000, host = process.env.TELEGRAM_API_HOST || 'api.telegram.org' } = {}) {
  const data = Buffer.from(JSON.stringify(body));
  try {
    return await viaHttps(token, method, data, method === 'getUpdates' ? timeoutMs : Math.min(timeoutMs, 15000), host);
  } catch (e1) {
    try {
      return await viaCurl(token, method, data, timeoutMs, host);
    } catch (e2) {
      throw new Error(`Telegram'a ulaşılamadı (https: ${e1.message}; ${e2.message})`);
    }
  }
}
