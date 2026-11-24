// Poreen: log km, see every Panther on a loop around Ireland, leaderboard and a shareable result.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ROUTE, LOOP_KM, locate, describe, trail } from '../lib/poreen-route.js';

const root = document.querySelector('.poreen');
const API = root.dataset.api;
const $ = (id) => document.getElementById(id);

/* ---------- helpers ---------- */

const store = {
  get(k, fallback) {
    try {
      const v = localStorage.getItem('poreen:' + k);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('poreen:' + k, JSON.stringify(v));
    } catch {
      /* private browsing: fine */
    }
  },
};

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtKm = (n) =>
  n >= 100 ? Math.round(n).toLocaleString('en-IE') : (Math.round(n * 10) / 10).toLocaleString('en-IE');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

const pad = (n) => String(n).padStart(2, '0');
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const toUTC = (s) => new Date(s + 'T00:00:00Z');
const addDays = (s, n) => {
  const d = toUTC(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000);
const weekStart = (s) => addDays(s, -((toUTC(s).getUTCDay() + 6) % 7)); // Monday
const monthStart = (s) => s.slice(0, 8) + '01';
const niceDate = (s) => {
  const t = localToday();
  if (s === t) return 'today';
  if (s === addDays(t, -1)) return 'yesterday';
  return toUTC(s).toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
};

/* One animal per day, by distance run that day. */
const ANIMALS = [
  [21, '🐆', '21 km+'],
  [15, '🦌', '15–21 km'],
  [10, '🦊', '10–15 km'],
  [5, '🐇', '5–10 km'],
  [0, '🐦', 'under 5 km'],
];
const animal = (km) => (km > 0 ? ANIMALS.find(([min]) => km >= min)[1] : '⬛');

const COLORS = ['#b9ff1a', '#ff9f1c', '#2ec4b6', '#ff5d8f', '#7aa2ff', '#ffd23f', '#c084fc', '#5eead4', '#fb7185', '#a3e635'];
const colorFor = (key) => {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
};
const initials = (name) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0].toUpperCase())
    .join('');

/* ---------- state ---------- */

let state = { club: 'Panthers', start: localToday(), codeRequired: false, runs: [] };
let loaded = false;
let period = store.get('period', 'all');
let selected = null; // runner key, or null for the whole club
const mine = store.get('mine', {}); // run id -> delete token

function runners() {
  const today = localToday();
  const from = period === 'week' ? weekStart(today) : period === 'month' ? monthStart(today) : '0000';
  const by = new Map();
  for (const r of state.runs) {
    let p = by.get(r.key);
    if (!p) by.set(r.key, (p = { key: r.key, name: r.name, total: 0, runs: 0, pKm: 0, pRuns: 0 }));
    p.total += r.km;
    p.runs += 1;
    if (r.date >= from) {
      p.pKm += r.km;
      p.pRuns += 1;
    }
  }
  return [...by.values()];
}
const clubTotal = () => state.runs.reduce((s, r) => s + r.km, 0);
const dayLabel = () => '#' + String(Math.max(1, daysBetween(state.start, localToday()) + 1)).padStart(3, '0');

/* ---------- map ---------- */

const map = L.map('prMap', { scrollWheelZoom: false, zoomSnap: 0.25 });
const routeLatLngs = ROUTE.map((s) => [s.lat, s.lng]);
map.fitBounds(L.latLngBounds(routeLatLngs), { padding: [12, 12] });
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 18,
}).addTo(map);

L.polyline(routeLatLngs, { color: '#cfcfcf', weight: 2.5, dashArray: '2 7', lineCap: 'round', opacity: 0.85 }).addTo(map);
for (const s of ROUTE.slice(0, -1)) {
  L.circleMarker([s.lat, s.lng], { radius: 3, weight: 1.5, color: '#cfcfcf', fillColor: '#0a0a0a', fillOpacity: 1 })
    .bindTooltip(`${s.name} · ${Math.round(s.at)} km`, { direction: 'top' })
    .addTo(map);
}
const trailLine = L.polyline([], { color: '#b9ff1a', weight: 5, lineCap: 'round' }).addTo(map);
const pinLayer = L.layerGroup().addTo(map);

function renderMap(list) {
  pinLayer.clearLayers();
  const total = clubTotal();
  const cp = locate(total);
  L.marker([cp.lat, cp.lng], {
    icon: L.divIcon({ className: '', html: '<div class="pr-panther">🐆</div>', iconSize: [26, 26], iconAnchor: [13, 13] }),
    zIndexOffset: 1000,
    keyboard: false,
  })
    .bindTooltip(`The Panthers together · ${fmtKm(total)} km`, { direction: 'top', offset: [0, -10] })
    .on('click', () => select(null))
    .addTo(pinLayer);

  for (const p of [...list].sort((a, b) => a.total - b.total)) {
    const loc = locate(p.total);
    const sel = p.key === selected;
    L.marker([loc.lat, loc.lng], {
      icon: L.divIcon({
        className: '',
        html: `<div class="pr-pin${sel ? ' sel' : ''}" style="background:${colorFor(p.key)}">${esc(initials(p.name))}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
      zIndexOffset: sel ? 2000 : 0,
      title: p.name,
    })
      .bindTooltip(`<b>${esc(p.name)}</b> · ${fmtKm(p.total)} km<br>${esc(describe(p.total))}`, { direction: 'top', offset: [0, -14] })
      .on('click', () => select(p.key))
      .addTo(pinLayer);
  }

  const who = selected && list.find((p) => p.key === selected);
  const km = who ? who.total : total;
  trailLine.setLatLngs(km > 0 ? trail(km) : []);

  const note = $('prNote');
  if (who) {
    note.innerHTML = `Following <b>${esc(who.name)}</b>, ${esc(describe(who.total))}. <button type="button" id="prShowClub">Show the club</button>`;
    $('prShowClub').onclick = () => select(null);
  } else {
    note.textContent = "The 🐆 is the whole club together, and the green line is the club's trail. Tap a runner to follow them.";
  }
}

function select(key) {
  selected = key;
  render();
  const p = key && runners().find((r) => r.key === key);
  if (p) {
    const loc = locate(p.total);
    map.flyTo([loc.lat, loc.lng], Math.max(map.getZoom(), 8), { duration: 0.6 });
  }
}

/* ---------- panels ---------- */

function renderClub() {
  const total = clubTotal();
  const p = locate(total);
  $('prClubKm').textContent = fmtKm(total);
  $('prClubWhere').textContent = total > 0 ? `The Panthers are ${describe(total)}` : 'The Panthers are on the start line in Dublin';
  const pct = Math.min(100, (p.lapKm / LOOP_KM) * 100);
  $('prClubBar').firstElementChild.style.width = pct + '%';
  $('prClubBar').setAttribute('aria-valuenow', String(Math.round(pct)));
  if (!loaded) return;
  const laps = p.laps ? `${plural(p.laps, 'full lap')} done · ` : '';
  const people = new Set(state.runs.map((r) => r.key)).size;
  $('prClubSub').textContent = `${laps}${Math.round(pct)}% of the way round · ${plural(people, 'runner')} · ${plural(state.runs.length, 'run')}`;
}

function renderBoard(list) {
  for (const b of document.querySelectorAll('.poreen .tab')) b.setAttribute('aria-pressed', String(b.dataset.period === period));
  const rows = list.filter((p) => (period === 'all' ? p.runs : p.pRuns)).sort((a, b) => b.pKm - a.pKm || b.total - a.total);
  const ol = $('prBoard');
  if (!rows.length) {
    const what = period === 'week' ? 'this week' : period === 'month' ? 'this month' : 'yet';
    ol.innerHTML = `<li><p class="pr-empty">${loaded ? `No runs ${what}. Be the first Panther out of Dublin.` : 'Loading…'}</p></li>`;
    return;
  }
  ol.innerHTML = rows
    .map(
      (p, i) => `<li>
        <button type="button" class="pr-runner" data-key="${esc(p.key)}" aria-pressed="${p.key === selected}">
          <span class="pr-rank">${i + 1}</span>
          <span class="pr-who">
            <b><i class="pr-dot" style="background:${colorFor(p.key)}"></i><span>${esc(p.name)}</span></b>
            <small>${esc(describe(p.total))}</small>
          </span>
          <span class="pr-km"><b>${fmtKm(p.pKm)}</b> km<small>${plural(p.pRuns, 'run')}</small></span>
        </button>
      </li>`
    )
    .join('');
}

function renderFeed() {
  const recent = [...state.runs].sort((a, b) => (b.created > a.created ? 1 : -1)).slice(0, 12);
  const ul = $('prFeed');
  if (!recent.length) {
    ul.innerHTML = `<li><p class="pr-empty">${loaded ? 'Nothing logged yet.' : 'Loading…'}</p></li>`;
    return;
  }
  ul.innerHTML = recent
    .map(
      (r) => `<li>
        <span class="emo" aria-hidden="true">${animal(r.km)}</span>
        <span><b>${esc(r.name)}</b> ran ${fmtKm(r.km)} km<span class="when">${niceDate(r.date)}</span></span>
        ${mine[r.id] ? `<button type="button" class="pr-del" data-id="${r.id}">Delete</button>` : '<span></span>'}
      </li>`
    )
    .join('');
}

function shareText(key) {
  const p = runners().find((r) => r.key === key);
  if (!p) return null;
  const today = localToday();
  const perDay = new Map();
  for (const r of state.runs) if (r.key === key) perDay.set(r.date, (perDay.get(r.date) || 0) + r.km);
  let week = '';
  for (let i = 6; i >= 0; i--) week += animal(perDay.get(addDays(today, -i)) || 0);
  return [`Poreen ${dayLabel()}`, `${p.name} · ${fmtKm(p.total)} km`, week, `📍 ${describe(p.total)}`, location.origin + '/poreen'].join('\n');
}

function renderShare() {
  const me = store.get('name', '');
  const text = me && shareText(me.toLowerCase());
  $('prShare').hidden = !text;
  if (text) $('prShareText').textContent = text;
}

function renderNames() {
  const names = [...new Map(state.runs.map((r) => [r.key, r.name])).values()].sort((a, b) => a.localeCompare(b));
  $('prRunnerList').innerHTML = names.map((n) => `<option value="${esc(n)}"></option>`).join('');
}

function render() {
  const list = runners();
  document.querySelector('[data-day]').textContent = dayLabel();
  $('prCodeField').hidden = !state.codeRequired;
  $('prCode').required = state.codeRequired;
  $('prDate').min = state.start;
  renderClub();
  renderMap(list);
  renderBoard(list);
  renderFeed();
  renderShare();
  renderNames();
}

/* ---------- data ---------- */

async function load() {
  try {
    const res = await fetch(API + '/api/runs', { cache: 'no-store' });
    if (!res.ok) throw new Error();
    // The API keeps the first spelling of each name, but older rows may differ: use the first one seen.
    const data = await res.json();
    const first = new Map();
    for (const r of data.runs) if (!first.has(r.key)) first.set(r.key, r.name);
    for (const r of data.runs) r.name = first.get(r.key);
    state = data;
    loaded = true;
    render();
  } catch {
    $('prClubSub').textContent = "Couldn't load the club's runs. Check your connection and refresh.";
  }
}

$('prForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('prSubmit');
  const msg = $('prMsg');
  const name = $('prName').value.replace(/\s+/g, ' ').trim();
  const existing = state.runs.find((r) => r.key === name.toLowerCase());
  const body = {
    name: existing ? existing.name : name,
    km: parseFloat(String($('prKm').value).replace(',', '.')),
    date: $('prDate').value,
    code: $('prCode').value,
  };
  btn.disabled = true;
  msg.className = 'pr-msg';
  msg.textContent = 'Adding…';
  try {
    const res = await fetch(API + '/api/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Couldn't save that run. Try again.");
    mine[data.run.id] = data.token;
    store.set('mine', mine);
    store.set('name', data.run.name);
    if (state.codeRequired) store.set('code', body.code);
    state.runs.push(data.run);
    msg.textContent = `Nice one. ${fmtKm(data.run.km)} km ${animal(data.run.km)} added.`;
    $('prKm').value = '';
    select(data.run.key);
    $('prShare').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    msg.className = 'pr-msg err';
    msg.textContent = err.message === 'Failed to fetch' ? "Couldn't reach the server. Check your connection." : err.message;
  } finally {
    btn.disabled = false;
  }
});

$('prFeed').addEventListener('click', async (e) => {
  const btn = e.target.closest('.pr-del');
  if (!btn) return;
  const id = btn.dataset.id;
  if (!confirm('Delete this run?')) return;
  btn.disabled = true;
  try {
    const res = await fetch(`${API}/api/runs/${id}`, { method: 'DELETE', headers: { 'x-run-token': mine[id] } });
    if (!res.ok && res.status !== 404) throw new Error();
    delete mine[id];
    store.set('mine', mine);
    state.runs = state.runs.filter((r) => r.id !== id);
    render();
  } catch {
    btn.disabled = false;
    alert("Couldn't delete that run. Try again.");
  }
});

$('prBoard').addEventListener('click', (e) => {
  const btn = e.target.closest('.pr-runner');
  if (btn) select(btn.dataset.key === selected ? null : btn.dataset.key);
});

for (const b of document.querySelectorAll('.poreen .tab')) {
  b.addEventListener('click', () => {
    period = b.dataset.period;
    store.set('period', period);
    render();
  });
}

$('prCopy').addEventListener('click', async () => {
  const btn = $('prCopy');
  try {
    await navigator.clipboard.writeText($('prShareText').textContent);
    btn.textContent = 'Copied!';
  } catch {
    const range = document.createRange();
    range.selectNodeContents($('prShareText'));
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    btn.textContent = 'Selected, now copy';
  }
  setTimeout(() => (btn.textContent = 'Copy'), 1800);
});

if (navigator.share) {
  $('prNativeShare').hidden = false;
  $('prNativeShare').addEventListener('click', () => navigator.share({ text: $('prShareText').textContent }).catch(() => {}));
}

/* ---------- boot ---------- */

$('prName').value = store.get('name', '');
$('prCode').value = store.get('code', '');
$('prDate').value = localToday();
$('prDate').max = localToday();
$('prLegend').innerHTML =
  '<span>One animal per day:</span>' + ANIMALS.map(([, e, label]) => `<span>${e} ${label}</span>`).join('') + '<span>⬛ rest day</span>';
render();
load();
setInterval(() => document.visibilityState === 'visible' && load(), 60000);
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && load());
