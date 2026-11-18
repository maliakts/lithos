# 🪨 Lithos

Türkiye için **canlı deprem haritası**. Üç bağımsız kaynağı birbiriyle çapraz doğrular, depremin olduğu yerdeki hava durumunu gösterir ve yeni depremleri Telegram kanalına otomatik gönderir.

> **EN:** Live earthquake map for Turkey that cross-checks AFAD, Kandilli and USGS, shows local weather (Open-Meteo) and auto-posts new quakes to a Telegram channel. Zero runtime dependencies (Node.js 20+).

<!-- BURAYA DEMO GIF'İ EKLE: ![demo](docs/demo.gif) -->

## Veri kaynakları

| Kaynak | Rol | Not |
|---|---|---|
| [AFAD](https://deprem.afad.gov.tr) | Birincil (resmî) | `eventDate` UTC kabul edilir |
| [Kandilli (KRDAE)](http://www.koeri.boun.edu.tr/scripts/lst0.asp) | İkinci resmî kaynak | Saatler Türkiye saati (UTC+3) |
| [USGS](https://earthquake.usgs.gov/fdsnws/event/1/) | Uluslararası doğrulama | Açık, anahtarsız GeoJSON API |
| [Open-Meteo](https://open-meteo.com) | Hava durumu | Açık kaynak, anahtarsız, ticari olmayan kullanım |

**Yanlış veri göstermemek için:**
- Her kayıt okunurken doğrulanır (koordinat, büyüklük aralığı, tarih); geçersiz kayıt atılır, atılan oran arayüzde uyarı olarak görünür.
- Aynı deprem kaynaklar arasında zaman (≤90 sn) ve konum (≤75 km) ile eşleştirilir; her kaydın hangi kaynaklardan geldiği gösterilir.
- AFAD ile Kandilli büyüklüğü 0.3 veya daha fazla farklıysa ⚠ işaretlenir.
- Son 12 saatte iki resmî kaynakta da veri varken hiç eşleşme yoksa "Kaynaklar eşleşmiyor" uyarısı çıkar (saat dilimi/biçim sorunu belirtisi).
- Bir kaynak çökerse diğerleri çalışmaya devam eder; çöken kaynağın durumu ve son başarılı güncelleme saati görünür.
- Hava verisi mantık denetiminden geçer; hata veya bayat veri durumunda eski değer **gösterilmez**.
- İlk dakikalarda otomatik hesaplanan değerler resmî kurumlarca güncellenebilir. Lithos bir erken uyarı sistemi değildir; afet kararları için resmî kaynakları kullanın.

## Kurulum

Gereksinim: [Node.js](https://nodejs.org) 20 veya üzeri.

```bash
git clone https://github.com/maliakts/lithos.git
cd lithos
npm run verify     # gerçek verinin doğru okunduğunu kanıtlar
npm start          # http://localhost:3000
```

Windows'ta: `dogrula.bat` (kontroller) ve `baslat.bat` (uygulamayı başlatıp tarayıcıyı açar) dosyalarına çift tıklamak yeterli.

## Telegram

1. [@BotFather](https://t.me/BotFather) ile bot oluştur, token'ı al.
2. Bir kanal aç, botu **yönetici** yap (mesaj gönderme yetkisi yeterli).
3. `.env.example` dosyasını `.env` olarak kopyala ve doldur:

```
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_CHANNEL=@kanal_adi        # özel kanalda -100... numarası
CHANNEL_MIN_MAG=2.5
```

4. `npm run telegram` ile bağlantıyı sına, sonra `npm start`.

Kanal mesajları sıralı gönderilir (Telegram sınırı: kanala dakikada ~20 mesaj). Bot ayrıca kişisel abonelik de sunar: `/abone 4 Malatya`, `/iptal`, `/son`.

## Mimari

```
AFAD ─┐
Kandilli ─┼─ poll (60 sn) ─► doğrulama ─► merge ─► /api/earthquakes
USGS ─┘                                    │ ├────► /api/stream (SSE) ─► tarayıcı (Leaflet)
                                           │ └────► Telegram kanalı + abonelere
Open-Meteo ◄── /api/weather (10 dk önbellek)
```

| Dosya | Görev |
|---|---|
| `src/sources/*.js` | AFAD, Kandilli, USGS istemcileri ve doğrulayıcı ayrıştırıcılar |
| `src/merge.js` | Çoklu kaynak birleştirme ve çapraz kontrol |
| `src/weather.js` | Open-Meteo istemcisi, WMO kodları, önbellek |
| `src/app.js` | HTTP sunucusu, polling, SSE, bildirim mantığı |
| `src/bot.js` | Telegram botu ve sıralı gönderim kuyruğu |
| `public/` | Arayüz (Leaflet, uydu görüntüsü, cam materyaller, yaylı alt sayfa) |

## Test

```bash
npm test           # birim ve entegrasyon testleri
npm run verify     # canlı veri kontrolü
```

## Lisans

MIT
