import dns from 'node:dns';
import net from 'node:net';
// Bazı ağlarda IPv6 takılır (Telegram zaman aşımı): IPv4'ü öne al, hızlı yedekle.
dns.setDefaultResultOrder('ipv4first');
try { net.setDefaultAutoSelectFamilyAttemptTimeout(400); } catch {}
// Bağımlılıksız, her işletim sisteminde çalışan minik .env yükleyici.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadEnv(files = [path.join(PROJECT_ROOT, '.env'), path.join(process.cwd(), '.env')]) {
  for (const file of [].concat(files)) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    text = text.replace(/^\uFEFF/, ''); // Not Defteri UTF-8 BOM ekleyebilir
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}
