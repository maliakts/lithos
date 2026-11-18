'use strict';

/* ================= Yardımcılar ================= */
const $ = (id) => document.getElementById(id);
const TZ = 'Europe/Istanbul';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => matchMedia('(max-width: 760px)').matches;

const fmtAbs = (iso) =>
  new Date(iso).toLocaleString('tr-TR', { timeZone: TZ, day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fmtClock = (iso) => new Date(iso).toLocaleTimeString('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' });
function ago(iso) {
  const sec = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (sec < 60) return 'az önce';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} dk önce`;
  const h = Math.floor(min / 60);
  return `${h} sa ${min % 60} dk önce`;
}
const magColor = (m) => (m >= 5 ? '#ff453a' : m >= 4 ? '#ff9f0a' : m >= 3 ? '#ffd60a' : '#30d158');
const depthText = (d) => (d == null ? '—' : `${d.toFixed(1)} km`);

/* ================= Harita ================= */
const map = L.map('map', { zoomControl: false, minZoom: 4, maxZoom: 14, worldCopyJump: true, zoomSnap: 0.5 }).setView([39, 35.2], 6);
L.control.zoom({ position: 'bottomright' }).addTo(map);
map.createPane('labels').style.zIndex = 350;
map.getPane('labels').style.pointerEvents = 'none';

const CARTO = (style) => `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`;
const BASES = {
  sat: [
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Görüntü © Esri, Maxar, Earthstar Geographics',
      maxZoom: 14,
    }),
    L.tileLayer(CARTO('dark_only_labels'), { pane: 'labels', attribution: '© OpenStreetMap, © CARTO', maxZoom: 14 }),
  ],
  dark: [L.tileLayer(CARTO('dark_all'), { attribution: '© OpenStreetMap, © CARTO', maxZoom: 14 })],
  light: [L.tileLayer(CARTO('rastertiles/voyager'), { attribution: '© OpenStreetMap, © CARTO', maxZoom: 14 })],
};
let baseKey = null;
function setBase(key) {
  if (baseKey) BASES[baseKey].forEach((l) => map.removeLayer(l));
  BASES[key].forEach((l) => l.addTo(map));
  baseKey = key;
  for (const b of $('segBase').children) b.setAttribute('aria-checked', String(b.dataset.v === key));
}

/* Tektonik levha sınırları (isteğe bağlı, istemci tarafında yüklenir) */
const PLATES_URL = 'https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json';
let platesLayer = null;
async function togglePlates() {
  const btn = $('plates');
  const on = btn.getAttribute('aria-pressed') !== 'true';
  btn.setAttribute('aria-pressed', String(on));
  if (!on) return platesLayer && map.removeLayer(platesLayer);
  try {
    if (!platesLayer) {
      const gj = await (await fetch(PLATES_URL)).json();
      platesLayer = L.geoJSON(gj, { style: { color: '#ff9f0a', weight: 1.6, opacity: 0.85, dashArray: '5 5' }, interactive: false });
    }
    platesLayer.addTo(map);
  } catch {
    btn.setAttribute('aria-pressed', 'false');
    toast('Levha sınırları yüklenemedi');
  }
}

/* ================= Durum ================= */
const state = { items: [], status: null, hours: 24, minMag: 0, selected: null };
const markers = new Map();
const layer = L.layerGroup().addTo(map);
let selRing = null;

function visible() {
  const since = Date.now() - state.hours * 3600 * 1000;
  return state.items.filter((e) => e.mag >= state.minMag && Date.parse(e.time) >= since);
}

/* ================= Çizim ================= */
function renderMap(items) {
  layer.clearLayers();
  markers.clear();
  for (const e of [...items].reverse()) {
    const c = magColor(e.mag);
    const m = L.circleMarker([e.lat, e.lon], {
      radius: 3.5 + e.mag * 2.5,
      color: 'rgba(255,255,255,0.85)',
      weight: 1,
      fillColor: c,
      fillOpacity: 0.62,
      bubblingMouseEvents: false,
    });
    m.on('click', () => select(e.id, true));
    m.addTo(layer);
    markers.set(e.id, m);
    if (!reduceMotion() && Date.now() - Date.parse(e.time) < 30 * 60 * 1000) {
      L.marker([e.lat, e.lon], {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: '', html: `<span class="pulse" style="--c:${c}"></span>`, iconSize: [44, 44] }),
      }).addTo(layer);
    }
  }
  drawSelection();
}

function drawSelection() {
  if (selRing) map.removeLayer(selRing);
  selRing = null;
  const e = state.items.find((x) => x.id === state.selected);
  if (e) selRing = L.circleMarker([e.lat, e.lon], { radius: 9 + e.mag * 2.5, color: '#fff', weight: 2.5, fill: false }).addTo(map);
}

function renderList(items) {
  const list = $('list');
  if (!items.length) {
    list.innerHTML = `<li class="empty">Bu filtrede deprem yok.</li>`;
    return;
  }
  list.innerHTML = items
    .slice(0, 300)
    .map(
      (e) => `<li><button class="row${e.id === state.selected ? ' sel' : ''}" data-id="${esc(e.id)}">
        <span class="badge" style="background:${magColor(e.mag)}">${e.mag.toFixed(1)}</span>
        <span class="meta"><b>${esc(e.place)}</b>
        <small>${ago(e.time)} · ${depthText(e.depth)}${e.disagree ? ' · <span class="warnmark" title="Kaynaklar arasında fark var">⚠</span>' : ''}${e.sources.length > 1 ? ' · çift kaynak' : ` · ${esc(e.sources[0].name)}`}</small></span>
      </button></li>`,
    )
    .join('');
}

function renderChips() {
  const st = state.status;
  if (!st) return ($('chips').innerHTML = '');
  const chips = st.sources.map((s) => {
    let cls = '';
    let txt = s.lastSuccess ? fmtClock(s.lastSuccess) : 'veri yok';
    let tip = s.lastSuccess ? `Son başarılı güncelleme: ${fmtAbs(s.lastSuccess)}` : 'Henüz veri alınamadı';
    if (!s.ok && s.lastError) {
      cls = s.lastSuccess ? 'warn' : 'bad';
      tip = `Hata: ${s.lastError}`;
      txt = s.lastSuccess ? `${fmtClock(s.lastSuccess)} · hata` : 'erişilemiyor';
    } else if (s.stale) cls = 'warn';
    else if (s.degraded) {
      cls = 'warn';
      tip = s.degraded;
      txt += ' · ' + s.degraded;
    }
    return `<span class="chip ${cls}" title="${esc(tip)}"><i></i>${esc(s.name)} ${esc(txt)}</span>`;
  });
  if (st.crossCheck && !st.crossCheck.ok) {
    chips.push(`<span class="chip bad" title="Son 12 saatte AFAD ${st.crossCheck.afad}, Kandilli ${st.crossCheck.kandilli} kayıt var ama hiçbiri eşleşmedi. Saat dilimi veya veri biçimi sorunu olabilir.">
      <i></i>Kaynaklar eşleşmiyor</span>`);
  }
  $('chips').innerHTML = chips.join('');
}

function render() {
  const items = visible();
  renderList(items);
  renderMap(items);
  renderChips();
  if (state.selected) renderDetail(false);
}

/* ================= Hava durumu (Open-Meteo, sunucu üzerinden) ================= */
const wxCache = new Map();
async function getWeather(lat, lon) {
  const key = `${lat.toFixed(1)},${lon.toFixed(1)}`;
  const hit = wxCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.w;
  const r = await fetch(`/api/weather?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Hava durumu alınamadı');
  wxCache.set(key, { at: Date.now(), w: j });
  return j;
}
function weatherHTML(w) {
  const rain = w.precipMm > 0 ? ` · ${w.precipMm} mm yağış` : '';
  const gust = w.windGustKmh ? ` (hamle ${w.windGustKmh})` : '';
  return `<div class="wx-main"><span class="wx-ico" aria-hidden="true">${w.icon}</span>
      <span class="wx-temp">${Math.round(w.temp)}°</span>
      <span class="wx-txt"><b>${esc(w.label)}</b><small>Hissedilen ${w.feelsLike == null ? '—' : Math.round(w.feelsLike) + '°'} · Nem %${w.humidity}</small></span></div>
    <small class="wx-sub">Rüzgar ${w.windKmh} km/sa ${esc(w.windDir)}${gust}${rain}<br>Open-Meteo · ${fmtClock(w.time)}</small>`;
}
async function fillWeather(el, lat, lon) {
  try {
    el.innerHTML = weatherHTML(await getWeather(lat, lon));
  } catch (err) {
    el.innerHTML = `<small class="wx-sub">Hava durumu şu an alınamadı.</small>`; // bayat/yanlış veri göstermeyiz
  }
}
map.on('click', (ev) => {
  const box = document.createElement('div');
  box.className = 'wx';
  box.innerHTML = '<small class="wx-sub">Hava durumu yükleniyor…</small>';
  L.popup({ className: 'glass-popup', maxWidth: 260, closeButton: false }).setLatLng(ev.latlng).setContent(box).openOn(map);
  fillWeather(box, ev.latlng.lat, ev.latlng.lng);
});

/* ================= Ayrıntı görünümü ================= */
function renderDetail(animate = true) {
  const e = state.items.find((x) => x.id === state.selected);
  const d = $('detail');
  if (!e) return closeDetail();
  const rows = e.sources
    .map(
      (s) => `<tr><td>${esc(s.name)}</td><td><b>M${s.mag.toFixed(1)}</b> <small>${esc(s.magType)}</small></td><td>${depthText(s.depth)}</td><td>${fmtClock(s.time)}</td></tr>`,
    )
    .join('');
  const only = e.sources.length === 1;
  const note = e.disagree
    ? `<div class="note">Kaynaklar arasında <b>${e.magDiff.toFixed(1)}</b> büyüklük farkı var. İlk dakikalarda değerler güncellenebilir; resmî açıklama için kurumun kendi sayfasına bakın.</div>`
    : only
      ? `<div class="note info">Bu deprem şu an yalnızca ${esc(e.sources[0].name)} kaydında görünüyor. Diğer kaynak yayımladığında burada karşılaştırılır.</div>`
      : `<div class="note info">AFAD ve Kandilli kayıtları uyumlu.</div>`;
  d.innerHTML = `
    <button class="back" id="back">‹ Depremler</button>
    <div class="bigmag"><span class="badge" style="background:${magColor(e.mag)}">${e.mag.toFixed(1)}</span>
      <div><h2>${esc(e.place)}</h2><p>${ago(e.time)}</p></div></div>
    <div class="grid">
      <div><small>Zaman (TSİ)</small><span>${fmtAbs(e.time)}</span></div>
      <div><small>Derinlik</small><span>${depthText(e.depth)}</span></div>
      <div><small>Enlem</small><span>${e.lat.toFixed(4)}°</span></div>
      <div><small>Boylam</small><span>${e.lon.toFixed(4)}°</span></div>
    </div>
    <div class="wx" id="wx"><small class="wx-sub">Depremin olduğu yerde hava durumu yükleniyor…</small></div>
    <table class="srcs"><thead><tr><th>Kaynak</th><th>Büyüklük</th><th>Derinlik</th><th>Saat</th></tr></thead><tbody>${rows}</tbody></table>
    ${note}
    ${e.sources.some((x) => x.name === 'USGS') ? '<div class="note info">USGS büyüklüğü farklı bir ölçekte (ör. mb) hesaplanabilir; karşılaştırma bilgi amaçlıdır.</div>' : ''}
    <div class="links">
      <a href="https://www.openstreetmap.org/?mlat=${e.lat}&mlon=${e.lon}#map=10/${e.lat}/${e.lon}" target="_blank" rel="noopener">Haritada aç</a>
      <a href="https://deprem.afad.gov.tr/last-earthquakes.html" target="_blank" rel="noopener">AFAD</a>
      <a href="http://www.koeri.boun.edu.tr/scripts/lst0.asp" target="_blank" rel="noopener">Kandilli</a>
    </div>`;
  $('back').onclick = () => closeDetail();
  fillWeather($('wx'), e.lat, e.lon);
  if (d.hidden) {
    d.hidden = false;
    d.classList.remove('out');
    if (!animate) d.style.animation = 'none';
    else d.style.animation = '';
  }
  $('list').style.visibility = 'hidden';
}

function closeDetail() {
  const d = $('detail');
  state.selected = null;
  $('list').style.visibility = '';
  if (!d.hidden) {
    if (reduceMotion()) d.hidden = true;
    else {
      d.classList.add('out');
      d.addEventListener('animationend', () => { d.hidden = true; d.classList.remove('out'); }, { once: true });
    }
  }
  drawSelection();
  renderList(visible());
}

function select(id, fly) {
  state.selected = id;
  const e = state.items.find((x) => x.id === id);
  if (!e) return;
  renderDetail(true);
  drawSelection();
  if (fly) map.flyTo([e.lat, e.lon], Math.max(map.getZoom(), 8), { duration: reduceMotion() ? 0 : 1.1 });
  if (isMobile()) sheet.snapTo('half');
}

/* ================= Etkileşimler ================= */
function bindSeg(id, onPick) {
  $(id).addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    for (const x of $(id).children) x.setAttribute('aria-checked', String(x === b));
    onPick(b.dataset.v);
  });
}
bindSeg('segBase', setBase);
bindSeg('segTime', (v) => { state.hours = Number(v); render(); });
bindSeg('segMag', (v) => { state.minMag = Number(v); render(); });
$('plates').addEventListener('click', togglePlates);
$('list').addEventListener('click', (ev) => {
  const b = ev.target.closest('.row');
  if (b) select(b.dataset.id, true);
});

let toastTimer;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  t.style.animation = 'none';
  void t.offsetWidth;
  t.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 6000);
}

/* ================= Yay (spring) ve alt sayfa ================= */
// response: saniye cinsinden yanıt süresi, damping: 1 = aşım yok, <1 = sıçrama
function spring(from, to, { velocity = 0, response = 0.35, damping = 1, onUpdate, onDone }) {
  let x = from;
  let v = velocity;
  const w = (2 * Math.PI) / response;
  const k = w * w;
  const c = 2 * damping * w;
  let last = performance.now();
  let raf = 0;
  const step = (now) => {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    const n = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      v += (-k * (x - to) - c * v) * h;
      x += v * h;
    }
    onUpdate(x);
    if (Math.abs(x - to) < 0.1 && Math.abs(v) < 5) {
      onUpdate(to);
      onDone && onDone();
      return;
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return { cancel: () => cancelAnimationFrame(raf) };
}
// Apple'ın momentum projeksiyonu: bırakma hızından duracağı yeri tahmin eder
const project = (v, rate = 0.998) => ((v / 1000) * rate) / (1 - rate);
const rubberband = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

const sheet = (() => {
  const panel = $('panel');
  let y = 0;
  let anim = null;
  let snaps = {};
  let current = 'half';

  const H = () => panel.offsetHeight;
  const calc = () => {
    const h = H();
    const vh = innerHeight;
    snaps = { full: 0, half: Math.max(0, h - vh * 0.5), peek: Math.max(0, h - 150) };
  };
  const apply = (v) => { y = v; panel.style.transform = `translateY(${v}px)`; };
  const enabled = () => isMobile();

  function snapTo(name, velocity = 0, bounce = false) {
    if (!enabled()) return;
    calc();
    current = name;
    anim && anim.cancel();
    if (reduceMotion()) return apply(snaps[name]);
    anim = spring(y, snaps[name], { velocity, response: 0.35, damping: bounce ? 0.8 : 1, onUpdate: apply });
  }

  let drag = null;
  function down(ev) {
    if (!enabled()) return;
    anim && anim.cancel(); // yarıda kesilebilir: mevcut değerden devam
    calc();
    drag = { startY: ev.clientY, startOffset: y, samples: [{ t: performance.now(), y: ev.clientY }] };
    ev.currentTarget.setPointerCapture(ev.pointerId);
  }
  function move(ev) {
    if (!drag) return;
    drag.samples.push({ t: performance.now(), y: ev.clientY });
    if (drag.samples.length > 6) drag.samples.shift();
    let target = drag.startOffset + (ev.clientY - drag.startY);
    if (target < snaps.full) target = snaps.full - rubberband(snaps.full - target, H());
    else if (target > snaps.peek) target = snaps.peek + rubberband(target - snaps.peek, H());
    apply(target); // parmakla 1:1
  }
  function up() {
    if (!drag) return;
    const s = drag.samples;
    const a = s[0];
    const b = s[s.length - 1];
    const dtMs = Math.max(1, b.t - a.t);
    const vel = ((b.y - a.y) / dtMs) * 1000; // px/sn, aşağı +
    drag = null;
    const projected = y + project(vel);
    let best = 'half';
    let bestD = Infinity;
    for (const [name, v] of Object.entries(snaps)) {
      const d = Math.abs(v - projected);
      if (d < bestD) { bestD = d; best = name; }
    }
    snapTo(best, vel, Math.abs(vel) > 300); // yalnızca fırlatma varsa hafif sıçrama
  }
  for (const el of [$('grabber'), $('head')]) {
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
  addEventListener('resize', () => {
    if (enabled()) { calc(); apply(snaps[current]); } else panel.style.transform = '';
  });
  if (enabled()) { calc(); apply(snaps.half); }
  return { snapTo };
})();

/* ================= Veri akışı ================= */
function applySnapshot(snap) {
  state.items = snap.items;
  state.status = snap.status;
  render();
  $('live').textContent = 'Canlı';
  $('live').classList.remove('off');
}

async function initial() {
  try {
    applySnapshot(await (await fetch('/api/earthquakes')).json());
  } catch {
    $('live').textContent = 'Sunucuya ulaşılamıyor';
    $('live').classList.add('off');
  }
}

function connect() {
  const es = new EventSource('/api/stream');
  es.addEventListener('sync', (ev) => applySnapshot(JSON.parse(ev.data)));
  es.addEventListener('new', (ev) => {
    const e = JSON.parse(ev.data);
    toast(`M${e.mag.toFixed(1)} · ${e.place}`);
  });
  es.onerror = () => { $('live').textContent = 'Bağlantı kesildi'; $('live').classList.add('off'); };
  es.onopen = () => { $('live').textContent = 'Canlı'; $('live').classList.remove('off'); };
}

setBase('sat');
for (const b of $('segTime').children) b.setAttribute('aria-checked', String(Number(b.dataset.v) === state.hours));
initial();
connect();
setInterval(render, 30000); // "x dk önce" yazıları ve bayatlık göstergeleri tazelensin
