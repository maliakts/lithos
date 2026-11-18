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

export function formatMessage(e) {
  const icon = e.mag >= 5 ? '🔴' : e.mag >= 4 ? '🟠' : '🟡';
  const when = new Date(e.time).toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const src = e.sources.map((s) => `${s.name} M${s.mag.toFixed(1)}`).join(' · ');
  const depth = e.depth == null ? '—' : `${e.depth.toFixed(1)} km`;
  return (
    `${icon} Deprem: M${e.mag.toFixed(1)}\n` +
    `📍 ${e.place}\n` +
    `🕒 ${when} (TSİ) · Derinlik ${depth}\n` +
    `📡 ${src}${e.disagree ? '\n⚠ Kaynaklar arasında büyüklük farkı var; ilk değerler güncellenebilir.' : ''}\n` +
    `🗺 https://www.openstreetmap.org/?mlat=${e.lat}&mlon=${e.lon}#map=9/${e.lat}/${e.lon}`
  );
}
