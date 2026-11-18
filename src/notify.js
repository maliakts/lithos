// Türkçe karakterleri sadeleştirir: "Iğdır" / "IĞDIR" / "igdir" aynı şeydir.
export function fold(s) {
  return String(s ?? '')
    .toLocaleLowerCase('tr')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u');
}

/** Abonelik bu depremle ilgileniyor mu? */
export function matches(sub, e) {
  if (e.mag < (sub.minMag ?? 0)) return false;
  if (sub.province && !fold(`${e.province} ${e.place}`).includes(fold(sub.province))) return false;
  return true;
}

/** Büyüklüğü herkesin anlayacağı dile çevirir. */
export function magLevel(m) {
  if (m < 2) return { icon: '🟢', name: 'Çok hafif', effect: 'Genellikle hissedilmez, aletlerle kaydedilir.' };
  if (m < 3) return { icon: '🟢', name: 'Hafif', effect: 'Çoğu kişi hissetmez; sessiz ortamda hafif sallantı olabilir.' };
  if (m < 4) return { icon: '🟡', name: 'Orta-hafif', effect: 'Yakın çevrede hissedilir, hasar beklenmez.' };
  if (m < 5) return { icon: '🟠', name: 'Orta', effect: 'Geniş alanda hissedilir; eşyalar sallanır, zayıf yapılarda küçük hasar olabilir.' };
  if (m < 6) return { icon: '🔴', name: 'Kuvvetli', effect: 'Kuvvetle hissedilir; dayanıksız yapılarda hasar olabilir.' };
  if (m < 7) return { icon: '🔴', name: 'Çok kuvvetli', effect: 'Yıkıcı olabilir; merkez üssüne yakın yerlerde ciddi hasar riski var.' };
  return { icon: '🆘', name: 'Büyük', effect: 'Çok yıkıcı; geniş alanda ağır hasar riski var.' };
}

export function depthLevel(d) {
  if (d == null) return '';
  return d < 10 ? 'çok sığ' : d < 30 ? 'sığ' : d < 70 ? 'orta derinlik' : 'derin';
}

export function formatMessage(e) {
  const lv = magLevel(e.mag);
  const when = new Date(e.time).toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
  const mm = /^(.*?)[\s-]*\((.+)\)\s*$/.exec(e.place || '');
  const place = mm ? `${mm[1].trim() || e.place}, ${mm[2].trim()}` : e.place;
  const src = e.sources.map((s) => `${s.name} M${s.mag.toFixed(1)}`).join(' · ');
  const verified = e.sources.length > 1 ? ' ✅ birden fazla kaynakta doğrulandı' : '';
  const depth = e.depth == null ? '—' : `${e.depth.toFixed(0)} km (${depthLevel(e.depth)})`;
  return (
    `${lv.icon} ${lv.name} deprem · Büyüklük ${e.mag.toFixed(1)}\n\n` +
    `📍 ${place}\n` +
    `🕒 ${when} (TSİ)\n` +
    `⬇️ Derinlik: ${depth}\n` +
    `💬 ${lv.effect}\n\n` +
    `📡 ${src}${verified}${e.disagree ? '\n⚠️ Kaynaklar arasında büyüklük farkı var; ilk değerler güncellenebilir.' : ''}\n` +
    `🗺 https://www.google.com/maps?q=${e.lat},${e.lon}`
  );
}
