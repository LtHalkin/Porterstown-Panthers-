// Small helpers shared by the Poreen page.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const store = {
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

export const session = {
  get(k) {
    try {
      return sessionStorage.getItem('poreen:' + k) || '';
    } catch {
      return '';
    }
  },
  set(k, v) {
    try {
      if (v) sessionStorage.setItem('poreen:' + k, v);
      else sessionStorage.removeItem('poreen:' + k);
    } catch {
      /* fine */
    }
  },
};

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const plural = (n, word, many = word + 's') => `${n.toLocaleString('en-IE')} ${n === 1 ? word : many}`;

/** 8.4, 12, 235, 1,204 */
export function fmtKm(n) {
  if (!n) return '0';
  if (n >= 100) return Math.round(n).toLocaleString('en-IE');
  return (Math.round(n * 10) / 10).toLocaleString('en-IE', { maximumFractionDigits: 1 });
}

/* ---------- dates (all local YYYY-MM-DD strings) ---------- */

const pad = (n) => String(n).padStart(2, '0');
export const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const toUTC = (s) => new Date(s + 'T00:00:00Z');
export const addDays = (s, n) => {
  const d = toUTC(s);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000);
export const weekStart = (s) => addDays(s, -((toUTC(s).getUTCDay() + 6) % 7)); // Monday
export const monthStart = (s) => s.slice(0, 8) + '01';
export const shortDate = (s) => toUTC(s).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const weekday = (s) => toUTC(s).toLocaleDateString('en-IE', { weekday: 'short', timeZone: 'UTC' });
export function niceDate(s, today = localToday()) {
  if (s === today) return 'Today';
  if (s === addDays(today, -1)) return 'Yesterday';
  if (daysBetween(s, today) < 7 && s < today) return toUTC(s).toLocaleDateString('en-IE', { weekday: 'long', timeZone: 'UTC' });
  return toUTC(s).toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/* ---------- time and pace ---------- */

/** "52:10", "1:05:30", "45" (minutes) → seconds. Empty → null. Invalid → NaN. */
export function parseTime(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (!/^\d{1,3}(:\d{1,2}){0,2}$/.test(t)) return NaN;
  const parts = t.split(':').map(Number);
  if (parts.slice(1).some((p) => p > 59)) return NaN;
  if (parts.length === 1) return parts[0] * 60;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

export function fmtTime(secs) {
  if (!secs) return '';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.round(secs % 60);
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export const fmtPace = (secsPerKm) => {
  if (!secsPerKm || !Number.isFinite(secsPerKm)) return '';
  const m = Math.floor(secsPerKm / 60);
  const s = Math.round(secsPerKm % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${pad(s)}`;
};

export const MILE = 1.609344;

/* ---------- runners ---------- */

const COLORS = ['#b9ff1a', '#ff9f1c', '#2ec4b6', '#ff5d8f', '#7aa2ff', '#ffd23f', '#c084fc', '#5eead4', '#fb7185', '#f97316', '#38bdf8', '#e879f9'];
export function colorFor(key) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

export const initials = (name) =>
  String(name)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0].toUpperCase())
    .join('');

export const avatar = (r, cls = '') =>
  `<span class="pr-av ${cls}" style="--c:${colorFor(r.key)}" aria-hidden="true">${esc(initials(r.name))}</span>`;

/* ---------- animals and run types ---------- */

// One animal per day, by distance run that day (Boreen-style).
export const ANIMALS = [
  [21, '🐆', '21 km+'],
  [15, '🦌', '15 to 21 km'],
  [10, '🦊', '10 to 15 km'],
  [5, '🐇', '5 to 10 km'],
  [0, '🐦', 'under 5 km'],
];
export const animal = (km) => (km > 0 ? ANIMALS.find(([min]) => km >= min)[1] : '⬛');

export const KINDS = {
  run: { label: 'Solo run', emoji: '🏃' },
  club: { label: 'Club session', emoji: '🐆' },
  parkrun: { label: 'parkrun', emoji: '🌳' },
  race: { label: 'Race', emoji: '🏅' },
};

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
