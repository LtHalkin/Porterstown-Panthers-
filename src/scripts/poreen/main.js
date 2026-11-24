// Poreen: the Porterstown Panthers' run around Ireland.
import { LOOP_KM, CHECKPOINTS, locate, describe } from '../../lib/poreen-route.js';
import { createApi } from './api.js';
import { derive } from './model.js';
import { createMap } from './map.js';
import { shareText, makeCard, shareImage } from './share.js';
import { confetti } from './confetti.js';
import {
  $, $$, store, session, esc, plural, fmtKm, localToday, addDays, daysBetween, weekStart, niceDate, shortDate,
  weekday, parseTime, fmtTime, fmtPace, MILE, avatar, animal, ANIMALS, KINDS, reducedMotion,
} from './util.js';

const root = $('.poreen');
const api = createApi(root.dataset.api);
const form = $('#prForm');
const profileDlg = $('[data-profile]');
const celebrateDlg = $('[data-celebrate]');
const LAST = CHECKPOINTS.length;

const S = {
  data: { club: 'Panthers', start: localToday(), codeRequired: false, runs: [] },
  loaded: false,
  failed: false,
  model: null,
  period: store.get('period', 'week'),
  me: store.get('name', ''),
  mine: store.get('mine', {}),
  kudos: store.get('kudos', {}),
  unit: store.get('unit', 'km'),
  admin: session.get('admin'),
  feedLimit: 12,
  editing: null,
  profileKey: null,
  selected: null,
  signature: '',
  trackPlaced: false,
};

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const firstName = (n) => n.split(' ')[0];
const meKey = () => S.me.toLowerCase();
const dayLabel = () => '#' + String(Math.max(1, daysBetween(S.data.start, localToday()) + 1)).padStart(3, '0');
const canChange = (run) => Boolean(S.admin || S.mine[run.id]);
const runLabel = (r) => `${fmtKm(r.km)} km ${niceDate(r.date).toLowerCase()}`;

function toast(text) {
  const el = $('[data-toast]');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 2800);
}

function countUp(el, to) {
  const from = Number(el.dataset.v || 0);
  el.dataset.v = to;
  if (reducedMotion() || Math.abs(to - from) < 0.05) return (el.textContent = fmtKm(to));
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 1400);
    el.textContent = fmtKm(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** "about 3 days away at this pace (Fri 27 Nov)", from the last fortnight's club km. */
function etaText(days) {
  if (days == null || !Number.isFinite(days) || days > 3650) return '';
  if (days < 1) return 'due today at this pace';
  if (days < 1.5) return 'about a day away at this pace';
  const d = addDays(localToday(), Math.round(days));
  return `about ${Math.round(days)} days away at this pace (${weekday(d)} ${shortDate(d)})`;
}
function etaDay(days) {
  if (days == null || !Number.isFinite(days) || days > 3650) return '';
  const d = addDays(localToday(), Math.max(0, Math.round(days)));
  return `${weekday(d)} ${shortDate(d)}`;
}

/* ---------- map ---------- */

const mapView = createMap($('#prMap'), {
  onRunner: (key) => selectRunner(key),
  onClub: () => selectRunner(null),
});

function selectRunner(key, { fly = false } = {}) {
  S.selected = key;
  mapView.select(key);
  renderMapNote();
  if (key && fly) mapView.flyToRunner(key);
}

function renderMapNote() {
  const el = $('[data-map-note]');
  const p = S.selected && S.model?.byKey.get(S.selected);
  if (!p) {
    el.innerHTML = 'The 🐆 is the whole club together. Tap a runner or a checkpoint.';
    return;
  }
  el.innerHTML = `Following <b>${esc(p.name)}</b>, ${esc(describe(p.total))}. <button class="pr-textbtn" type="button" data-open-profile="${esc(p.key)}">Profile</button> <button class="pr-textbtn" type="button" data-unselect>Show the club</button>`;
}

/* ---------- hero ---------- */

const rail = $('[data-rail]');
const railTicks = $('.pr-rail-ticks', rail);
railTicks.innerHTML = CHECKPOINTS.slice(1, -1)
  .map((c) => `<i style="left:${((c.at / LOOP_KM) * 100).toFixed(2)}%" title="${esc(c.title)} · km ${Math.round(c.at)}"></i>`)
  .join('');

function renderHero() {
  const c = S.model.club;
  const w = c.where;
  $('[data-day]').textContent = dayLabel();
  countUp($('[data-club-km]'), c.km);
  $('[data-club-where]').textContent = c.km > 0 ? `The Panthers are ${describe(c.km)}` : 'On the start line in Dublin';
  const next = $('[data-club-next]');
  if (S.failed && !S.loaded) next.textContent = "Couldn't load the club's runs. Check your connection and refresh.";
  else if (!c.km) next.innerHTML = `${fmtKm(LOOP_KM)} km and ${LAST} checkpoints ahead. First stop: <b>${w.nextCp.emoji} ${esc(w.nextCp.title)}</b>, ${fmtKm(w.toNextCp)} km.`;
  else {
    const eta = etaText(c.etaNextDays);
    next.innerHTML = `Next checkpoint: <b>${w.nextCp.emoji} ${esc(w.nextCp.title)}</b> in ${fmtKm(w.toNextCp)} km${eta ? `, ${eta}` : ''}.`;
  }
  const pct = (w.lapPct * 100).toFixed(2) + '%';
  $('.pr-rail-fill', rail).style.width = pct;
  $('.pr-rail-cat', rail).style.left = pct;
  $$('i', railTicks).forEach((t, i) => {
    const cp = CHECKPOINTS[i + 1];
    t.className = c.km > 0 && cp.at <= w.lapKm ? 'is-reached' : cp.n === w.nextCp.n ? 'is-next' : '';
  });
  $('[data-rail-lap]').textContent = `Lap ${w.laps + 1} · ${Math.floor(w.lapPct * 100)}%`;
}

/* ---------- you ---------- */

function prevCheckpoint(lapKm) {
  let prev = CHECKPOINTS[0];
  for (const c of CHECKPOINTS) if (c.at <= lapKm) prev = c;
  return prev;
}

function renderMe() {
  const el = $('[data-me]');
  const p = S.me && S.model.byKey.get(meKey());
  if (!p) {
    el.hidden = true;
    return;
  }
  const w = p.where;
  const prev = prevCheckpoint(w.lapKm);
  const pct = Math.max(2, Math.min(100, ((w.lapKm - prev.at) / (w.nextCp.at - prev.at || 1)) * 100));
  el.hidden = false;
  el.innerHTML = `
    <div class="pr-me-head">${avatar(p)}<div><span class="pr-me-label">Your journey</span><span class="pr-me-name">${esc(p.name)}</span></div>
      <span class="pr-me-rank">#${p.allRank}<small>of ${S.model.runners.length}</small></span></div>
    <div class="pr-me-stats"><span><b>${fmtKm(p.total)}</b> km</span><span><b>${p.count}</b> ${p.count === 1 ? 'run' : 'runs'}</span><span><b>${p.stampIds.size}</b>/${LAST} stamps</span>${p.streak > 1 ? `<span>🔥 <b>${p.streak}</b> weeks</span>` : ''}</div>
    <p>📍 ${esc(cap(describe(p.total)))}</p>
    <div class="pr-me-next"><span>Next stamp: ${w.nextCp.emoji} ${esc(w.nextCp.title)}</span><span>${fmtKm(w.toNextCp)} km</span></div>
    <div class="pr-bar" aria-hidden="true"><span style="width:${pct}%"></span></div>
    <div class="pr-me-actions"><button class="btn dark-btn" type="button" data-open-profile="${esc(p.key)}">My profile</button><button class="pr-textbtn" type="button" data-share-runner="${esc(p.key)}">Share</button><button class="pr-textbtn" type="button" data-not-me>Not you?</button></div>`;
}

/* ---------- form ---------- */

const F = form.elements;
const codeField = $('[data-code-field]');
const msg = $('[data-msg]');

function setMsg(text, error = false) {
  msg.textContent = text;
  msg.classList.toggle('is-error', error);
}

function setUnit(unit) {
  S.unit = unit;
  store.set('unit', unit);
  $$('[data-unit]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.unit === unit)));
  F.km.placeholder = unit === 'mi' ? '5.2' : '8.4';
  updatePace();
}

function updatePace() {
  const dist = parseFloat(String(F.km.value).replace(',', '.'));
  const secs = parseTime(F.time.value);
  const el = $('[data-pace]');
  if (!(dist > 0) || !secs) return (el.textContent = Number.isNaN(secs) ? 'Use mm:ss or h:mm:ss' : '');
  const km = S.unit === 'mi' ? dist * MILE : dist;
  el.textContent = `${fmtPace(secs / km)} /km` + (S.unit === 'mi' ? ` · ${fmtPace(secs / dist)} /mi` : '');
}

function renderFormMeta() {
  const today = localToday();
  F.date.max = addDays(today, 0);
  F.date.min = S.data.start;
  if (!F.date.value) F.date.value = today;
  const storedCode = store.get('code', '');
  codeField.hidden = !S.data.codeRequired || Boolean(storedCode && !codeField.dataset.force);
  $('#prRunners').innerHTML = S.model.runners
    .map((p) => p.name)
    .sort((a, b) => a.localeCompare(b))
    .map((n) => `<option value="${esc(n)}"></option>`)
    .join('');
}

function readForm() {
  const name = F.name.value.replace(/\s+/g, ' ').trim();
  const dist = parseFloat(String(F.km.value).replace(',', '.'));
  const secs = parseTime(F.time.value);
  const fail = (field, text) => {
    field.setAttribute('aria-invalid', 'true');
    field.focus();
    return { error: text };
  };
  $$('[aria-invalid]', form).forEach((el) => el.removeAttribute('aria-invalid'));
  if (!S.editing && !name) return fail(F.name, 'Add your name first.');
  if (!(dist > 0)) return fail(F.km, 'How far did you go?');
  if (Number.isNaN(secs)) return fail(F.time, 'Time should look like 45:30 or 1:05:30.');
  if (!F.date.value) return fail(F.date, 'Pick the date of your run.');
  const km = Math.round((S.unit === 'mi' ? dist * MILE : dist) * 100) / 100;
  // Match an existing runner whatever the capitals.
  const existing = S.model.byKey.get(name.toLowerCase());
  return {
    name: existing ? existing.name : name,
    km,
    date: F.date.value,
    secs,
    kind: form.querySelector('input[name="kind"]:checked')?.value || 'run',
    note: F.note.value.trim(),
    code: (codeField.hidden ? store.get('code', '') : F.code.value).trim(),
  };
}

function resetRunFields() {
  F.km.value = '';
  F.time.value = '';
  F.note.value = '';
  F.date.value = localToday();
  form.querySelector('input[name="kind"][value="run"]').checked = true;
  updatePace();
}

function startEdit(run) {
  S.editing = run.id;
  closeDialogs();
  $('[data-form-title]').textContent = 'Edit run';
  $('[data-submit]').firstChild.textContent = 'Save changes ';
  $('[data-cancel-edit]').hidden = false;
  F.name.value = run.name;
  F.name.disabled = true;
  setUnit('km');
  F.km.value = run.km;
  F.date.value = run.date;
  F.time.value = run.secs ? fmtTime(run.secs) : '';
  F.note.value = run.note || '';
  const kind = form.querySelector(`input[name="kind"][value="${run.kind || 'run'}"]`);
  if (kind) kind.checked = true;
  updatePace();
  setMsg(`Editing ${esc(run.name)}'s run from ${niceDate(run.date).toLowerCase()}.`);
  form.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
  setTimeout(() => F.km.focus({ preventScroll: true }), 350);
}

function stopEdit() {
  S.editing = null;
  $('[data-form-title]').textContent = 'Log a run';
  $('[data-submit]').firstChild.textContent = 'Add my km ';
  $('[data-cancel-edit]').hidden = true;
  F.name.disabled = false;
  F.name.value = S.me;
  resetRunFields();
  setMsg('');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = readForm();
  if (v.error) return setMsg(v.error, true);
  const btn = $('[data-submit]');
  btn.disabled = true;
  setMsg(S.editing ? 'Saving…' : 'Adding your km…');
  try {
    if (S.editing) {
      const id = S.editing;
      const own = S.mine[id];
      const res = await api.edit(id, { km: v.km, date: v.date, secs: v.secs, kind: v.kind, note: v.note }, own, own ? '' : S.admin);
      S.data.runs = S.data.runs.map((r) => (r.id === id ? res.run : r));
      stopEdit();
      renderAll();
      toast('Run updated');
      return;
    }
    const before = S.model;
    const res = await api.create(v);
    S.mine[res.run.id] = res.token;
    store.set('mine', S.mine);
    S.me = res.run.name;
    store.set('name', S.me);
    if (S.data.codeRequired && v.code) {
      store.set('code', v.code);
      delete codeField.dataset.force;
    }
    S.data.runs.push(res.run);
    resetRunFields();
    setMsg('');
    renderAll({ animate: true });
    selectRunner(res.run.key);
    celebrate(before, S.model, res.run);
  } catch (err) {
    if (err.status === 403 && /code/i.test(err.message)) {
      store.set('code', '');
      codeField.dataset.force = '1';
      codeField.hidden = false;
      F.code.setAttribute('aria-invalid', 'true');
      F.code.focus();
    }
    setMsg(err.message, true);
  } finally {
    btn.disabled = false;
  }
});

form.addEventListener('input', (e) => {
  if (e.target.name === 'km' || e.target.name === 'time') updatePace();
  e.target.removeAttribute?.('aria-invalid');
});
$$('[data-unit]').forEach((b) => b.addEventListener('click', () => setUnit(b.dataset.unit)));
$$('[data-dist]').forEach((b) =>
  b.addEventListener('click', () => {
    setUnit('km');
    F.km.value = b.dataset.dist;
    updatePace();
  })
);
$$('[data-day-pick]').forEach((b) => b.addEventListener('click', () => (F.date.value = addDays(localToday(), -Number(b.dataset.dayPick)))));
$('[data-cancel-edit]').addEventListener('click', stopEdit);

/* ---------- checkpoints ---------- */

function checkpointState(cp) {
  const c = S.model.club;
  if (cp.n === LAST) return c.laps > 0 ? { cls: 'is-reached', stamp: c.reachedEver.get(LAST) } : cp.n === c.where.nextCp.n ? { cls: 'is-next' } : { cls: 'is-ahead' };
  if (c.km > 0 && cp.at <= c.where.lapKm) return { cls: 'is-reached', stamp: c.reachedThisLap.get(cp.n) || c.reachedEver.get(cp.n) };
  if (cp.n === c.where.nextCp.n) return { cls: 'is-next' };
  return { cls: 'is-ahead' };
}

function renderCheckpoints() {
  const c = S.model.club;
  const track = $('[data-cps]');
  track.innerHTML = CHECKPOINTS.map((cp) => {
    const st = checkpointState(cp);
    const toGo = cp.at - c.where.lapKm;
    let status;
    if (st.cls === 'is-reached') {
      const r = st.stamp?.run;
      status = r
        ? `<span>${shortDate(r.date)} · ${cp.n === 1 ? `${esc(r.name)} got us started` : `${esc(r.name)}'s ${fmtKm(r.km)} km got us here`}</span>`
        : '<span>Reached</span>';
    } else if (st.cls === 'is-next') {
      const prev = prevCheckpoint(c.where.lapKm);
      const pct = Math.max(3, Math.min(100, ((c.where.lapKm - prev.at) / (cp.at - prev.at || 1)) * 100));
      const eta = etaText(c.etaNextDays);
      status = `<span><b>Next stop</b> · ${fmtKm(toGo)} km to go</span><div class="pr-bar"><span style="width:${pct}%"></span></div>${eta ? `<span>${cap(eta)}</span>` : ''}`;
    } else if (cp.n === 1) status = '<span>The first run logged starts the journey</span>';
    else status = `<span>${fmtKm(toGo)} km ahead</span>`;
    return `<li class="pr-cp ${st.cls}" data-cp="${cp.n}">
      <div class="pr-cp-top"><span class="pr-cp-n">${String(cp.n).padStart(2, '0')}</span><span class="pr-cp-emoji" aria-hidden="true">${cp.emoji}</span></div>
      ${st.cls === 'is-reached' ? '<span class="pr-stamp" aria-hidden="true">Stamped</span>' : ''}
      <h3>${esc(cp.title)}</h3>
      <p class="pr-cp-meta">Km ${fmtKm(Math.round(cp.at))}${cp.name !== cp.title ? ` · ${esc(cp.name)}` : ''}</p>
      <p class="pr-cp-fact">${esc(cp.fact)}</p>
      <div class="pr-cp-status">${status}</div>
      <button class="pr-cp-go" type="button" data-cp-map="${cp.n}">Show on map</button>
    </li>`;
  }).join('');
  if (!S.trackPlaced && S.loaded) {
    S.trackPlaced = true;
    const target = track.querySelector('.is-next') || track.firstElementChild;
    const prev = target.previousElementSibling || target;
    track.scrollLeft = prev.offsetLeft - track.firstElementChild.offsetLeft;
  }
}

$$('[data-track]').forEach((b) =>
  b.addEventListener('click', () => {
    const track = $('[data-cps]');
    const card = track.firstElementChild;
    track.scrollBy({ left: Number(b.dataset.track) * (card.offsetWidth + 16) * 2, behavior: reducedMotion() ? 'auto' : 'smooth' });
  })
);

/* ---------- leaderboard ---------- */

function renderBoard() {
  $$('[data-period]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.period === S.period)));
  const ranked = S.model.ranked;
  const word = { week: 'this week', month: 'this month', all: 'yet' }[S.period];
  const pod = $('[data-podium]');
  const board = $('[data-board]');
  if (!ranked.length) {
    pod.innerHTML = '';
    board.innerHTML = `<li><p class="pr-empty">${S.loaded ? `No runs logged ${word}. The first one takes the top spot.` : 'Loading the leaderboard…'}</p></li>`;
    return;
  }
  pod.innerHTML = ranked
    .slice(0, 3)
    .map(
      (p, i) => `<button class="pr-pod p${i + 1}" type="button" data-open-profile="${esc(p.key)}">
        <span class="pr-pod-rank" aria-hidden="true">${i + 1}</span>
        ${avatar(p)}
        <span class="pr-pod-name">${esc(p.name)}${p.key === meKey() ? ' <span class="pr-you">You</span>' : ''}</span>
        <span class="pr-pod-km">${fmtKm(p.pKm)}<small>km</small></span>
        <span class="pr-pod-sub">${plural(p.pRuns, 'run')}${p.streak > 1 ? ` · 🔥 ${p.streak} weeks` : ''} · ${p.stampIds.size} stamps</span>
      </button>`
    )
    .join('');
  board.innerHTML = ranked
    .slice(3)
    .map(
      (p) => `<li><button class="pr-row-btn${p.key === meKey() ? ' is-me' : ''}" type="button" data-open-profile="${esc(p.key)}">
        <span class="pr-rank">${p.rank}</span>${avatar(p)}
        <span class="pr-who"><b><span>${esc(p.name)}</span>${p.key === meKey() ? '<span class="pr-you">You</span>' : ''}</b><small>${esc(cap(describe(p.total)))}</small></span>
        <span class="pr-km"><b>${fmtKm(p.pKm)}</b> km<small>${plural(p.pRuns, 'run')}${p.streak > 1 ? ` · 🔥${p.streak}` : ''}</small></span>
      </button></li>`
    )
    .join('');
}

$$('[data-period]').forEach((b) =>
  b.addEventListener('click', () => {
    S.period = b.dataset.period;
    store.set('period', S.period);
    S.model = derive(S.data, S.period);
    renderBoard();
  })
);

/* ---------- feed and awards ---------- */

function runBadges(r) {
  const out = [];
  if (r.isFirst) out.push('<span class="pr-badge is-neon">👋 First run</span>');
  if (r.isLongest) out.push('<span class="pr-badge">⭐ Longest run yet</span>');
  for (const c of r.crossed) if (c.n !== 1) out.push(`<span class="pr-badge">${c.n === LAST ? '🏆 Finished a lap' : `${c.emoji} Stamped ${esc(c.title)}`}</span>`);
  return out.length ? `<p class="pr-badges">${out.join('')}</p>` : '';
}

function runMeta(r) {
  const bits = [niceDate(r.date)];
  if (r.secs) bits.push(fmtTime(r.secs), `${fmtPace(r.secs / r.km)}/km`);
  return bits.join(' · ');
}

function renderFeed() {
  const el = $('[data-feed]');
  const items = S.model.feed;
  if (!items.length) {
    el.innerHTML = `<li><p class="pr-empty">${S.loaded ? 'Nothing logged yet. Be the first Panther out of Dublin.' : 'Loading…'}</p></li>`;
    $('[data-feed-more]').hidden = true;
    return;
  }
  el.innerHTML = items
    .slice(0, S.feedLimit)
    .map((it) => {
      const r = it.run;
      if (it.type === 'club') {
        const c = it.cp;
        const head = c.n === 1 ? 'Poreen is under way' : c.n === LAST ? `Lap ${c.lap + 1} complete!` : `The Panthers reached ${esc(c.title)}`;
        const sub = c.n === 1 ? `${esc(r.name)} logged the club's first km` : `Checkpoint ${c.n} of ${LAST}${c.lap ? ` · lap ${c.lap + 1}` : ''} · ${esc(r.name)}'s ${fmtKm(r.km)} km got us there`;
        return `<li class="pr-item pr-item-club"><span class="pr-cp-badge" aria-hidden="true">${c.emoji}</span><div><p><b>${head}</b></p><p>${sub}</p></div></li>`;
      }
      const kind = r.kind && r.kind !== 'run' ? `<span class="pr-kind">${KINDS[r.kind]?.emoji || ''} ${esc(KINDS[r.kind]?.label || '')}</span>` : '';
      const given = Boolean(S.kudos[r.id]);
      const edit = canChange(r) ? `<button class="pr-mini" type="button" data-edit="${r.id}">Edit</button><button class="pr-mini is-danger" type="button" data-delete="${r.id}">Delete</button>` : '';
      return `<li class="pr-item">
        ${avatar(r)}
        <div>
          <p><button class="pr-name" type="button" data-open-profile="${esc(r.key)}">${esc(r.name)}</button> ran <b>${fmtKm(r.km)} km</b> ${animal(r.km)} ${kind}</p>
          ${r.note ? `<p class="pr-note">“${esc(r.note)}”</p>` : ''}
          <p class="pr-meta">${runMeta(r)}</p>
          ${runBadges(r)}
        </div>
        <div class="pr-actions">
          <button class="pr-kudos" type="button" data-kudos="${r.id}" aria-pressed="${given}" aria-label="${given ? 'You gave kudos' : 'Give kudos'} (${r.kudos || 0})">👏 <span>${r.kudos || ''}</span></button>
          ${edit}
        </div>
      </li>`;
    })
    .join('');
  $('[data-feed-more]').hidden = items.length <= S.feedLimit;
}

$('[data-feed-more]').addEventListener('click', () => {
  S.feedLimit += 15;
  renderFeed();
});

function renderAwards() {
  const el = $('[data-awards]');
  const list = S.model.awards;
  if (!list.length) {
    el.innerHTML = `<li><p class="pr-empty">No runs yet this week (Monday to Sunday). The first one takes every award going.</p></li>`;
    return;
  }
  el.innerHTML = list
    .map(
      (a) => `<li><button class="pr-award" type="button" data-open-profile="${esc(a.who.key)}">
        <span class="pr-award-icon" aria-hidden="true">${a.icon}</span>
        <span><small>${esc(a.title)}</small><b>${esc(a.who.name)}</b><span>${a.unit.startsWith('km') ? fmtKm(a.value) : a.value} ${esc(a.unit)}</span></span>
      </button></li>`
    )
    .join('');
}

/* ---------- stats ---------- */

function renderStats() {
  const c = S.model.club;
  const change = c.lastWeekSoFar > 0 ? Math.round(((c.weekKm - c.lastWeekSoFar) / c.lastWeekSoFar) * 100) : null;
  const reached = CHECKPOINTS.filter((cp) => checkpointState(cp).cls === 'is-reached').length;
  const weekRunners = S.model.runners.filter((p) => p.weekKm > 0).length;
  const lapEta = c.km > 0 ? etaDay(c.etaLapDays) : '';
  const tiles = [
    ['Together', fmtKm(c.km), c.laps ? `${plural(c.laps, 'full lap')} + ${Math.floor(c.where.lapPct * 100)}%` : `${Math.floor(c.where.lapPct * 100)}% of the way round`],
    ['This week', fmtKm(c.weekKm), change == null ? 'Monday to Sunday' : `${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}% on this time last week`, change > 0 ? 'up' : ''],
    ['Runs', c.runs.toLocaleString('en-IE'), c.runs ? `${fmtKm(c.avg)} km on average` : 'None yet'],
    ['Runners', String(c.runners), `${weekRunners} out this week`],
    ['Longest run', c.longestRun ? fmtKm(c.longestRun.km) : '0', c.longestRun ? `${esc(c.longestRun.name)}, ${shortDate(c.longestRun.date)}` : 'Up for grabs'],
    ['Checkpoints', `${reached}/${LAST}`, lapEta ? `Lap ${c.laps + 1} done around ${lapEta} at this pace` : `Next: ${esc(c.where.nextCp.title)}`],
  ];
  $('[data-stats]').innerHTML = tiles
    .map(([label, value, sub, cls]) => `<div class="pr-stat"><span>${label}</span><b>${value}</b><small class="${cls || ''}">${sub}</small></div>`)
    .join('');
  const max = Math.max(1, ...c.weeks.map((w) => w.km));
  const now = weekStart(localToday());
  $('[data-chart]').innerHTML = c.weeks
    .map(
      (w) => `<li class="${w.week === now ? 'is-now' : ''}" aria-label="Week of ${shortDate(w.week)}: ${fmtKm(w.km)} km">
        <span class="v">${fmtKm(w.km)}</span><span class="bar" style="height:${((w.km / max) * 72).toFixed(1)}%"></span><span class="w">${shortDate(w.week)}</span></li>`
    )
    .join('');
}

/* ---------- profile ---------- */

function renderProfile(key) {
  const p = S.model.byKey.get(key);
  if (!p) return profileDlg.close();
  const w = p.where;
  const today = localToday();
  const thisWeek = weekStart(today);
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const wk = addDays(thisWeek, -7 * i);
    weeks.push({ week: wk, km: p.weeks.get(wk) || 0 });
  }
  const max = Math.max(1, ...weeks.map((x) => x.km));
  const periodRank = S.model.ranked.find((x) => x.key === key)?.rank;
  const periodWord = { week: 'this week', month: 'this month', all: 'all time' }[S.period];
  const stamps = CHECKPOINTS.map((c) => {
    const has = p.stampIds.has(c.n);
    const when = p.stamps.find((s) => s.cp.n === c.n && s.lap === 0)?.date;
    return `<button class="pr-pstamp${has ? ' has' : ''}" type="button" data-stamp="${c.n}" data-has="${has ? (when ? shortDate(when) : 'yes') : ''}" aria-label="${esc(c.title)}${has ? ', stamped' : ''}" aria-pressed="false"><span>${c.emoji}</span><i>${c.n}</i></button>`;
  }).join('');
  const runs = [...p.runs].reverse();
  profileDlg.innerHTML = `<div class="pr-dlg">
    <button class="pr-dlg-close" type="button" data-close aria-label="Close"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg></button>
    <div class="pr-prof-head">${avatar(p, 'lg')}<div>
      <h2 id="prProfileName">${esc(p.name)}</h2>
      <div class="pr-prof-ranks"><span class="is-neon">#${p.allRank} all time</span>${periodRank && S.period !== 'all' ? `<span>#${periodRank} ${periodWord}</span>` : ''}${p.streak > 1 ? `<span>🔥 ${p.streak}-week streak</span>` : ''}${p.laps ? `<span>🏆 ${plural(p.laps, 'lap')}</span>` : ''}</div>
    </div></div>
    <p class="pr-prof-where">📍 ${esc(cap(describe(p.total)))}</p>
    <div class="pr-bar"><span style="width:${(w.lapPct * 100).toFixed(1)}%"></span></div>
    <div class="pr-prof-lap"><span>Lap ${w.laps + 1}: ${fmtKm(w.lapKm)} of ${fmtKm(LOOP_KM)} km</span><span>Next: ${w.nextCp.emoji} ${esc(w.nextCp.title)} in ${fmtKm(w.toNextCp)} km</span></div>
    <div class="pr-tiles">
      <div><span>Total</span><b>${fmtKm(p.total)} km</b></div>
      <div><span>Runs</span><b>${p.count}</b></div>
      <div><span>Longest</span><b>${fmtKm(p.longest)} km</b></div>
      <div><span>This week</span><b>${fmtKm(p.weekKm)} km</b></div>
      <div><span>Avg pace</span><b>${p.pace ? fmtPace(p.pace) : '–'}</b></div>
      <div><span>Kudos</span><b>👏 ${p.kudos}</b></div>
    </div>
    <h3>Last 8 weeks</h3>
    <ol class="pr-weeks">${weeks
      .map((x) => `<li class="${x.week === thisWeek ? 'is-now' : ''}" aria-label="Week of ${shortDate(x.week)}: ${fmtKm(x.km)} km"><span class="v">${x.km ? fmtKm(x.km) : ''}</span><span class="bar" style="height:${((x.km / max) * 70).toFixed(1)}%"></span><span class="w">${shortDate(x.week)}</span></li>`)
      .join('')}</ol>
    <h3>Passport · ${p.stampIds.size}/${LAST} stamps</h3>
    <div class="pr-passport">${stamps}</div>
    <p class="pr-stamp-info" data-stamp-info>Tap a stamp to see where it is.</p>
    <h3>Runs</h3>
    <ul class="pr-runs">${runs
      .map(
        (r) => `<li><div>
          <p><b>${fmtKm(r.km)} km</b> ${animal(r.km)} ${r.kind && r.kind !== 'run' ? `<span class="pr-kind">${KINDS[r.kind]?.emoji} ${esc(KINDS[r.kind]?.label)}</span>` : ''}</p>
          ${r.note ? `<p class="pr-note">“${esc(r.note)}”</p>` : ''}
          <p class="pr-meta">${runMeta(r)}${r.kudos ? ` · 👏 ${r.kudos}` : ''}</p></div>
          ${canChange(r) ? `<div class="pr-row-actions"><button class="pr-mini" type="button" data-edit="${r.id}">Edit</button><button class="pr-mini is-danger" type="button" data-delete="${r.id}">Delete</button></div>` : '<span></span>'}
        </li>`
      )
      .join('')}</ul>
    <div class="btn-row">
      <button class="btn" type="button" data-share-runner="${esc(p.key)}">Share picture</button>
      <button class="btn ghost" type="button" data-copy-runner="${esc(p.key)}">Copy text</button>
      <button class="btn ghost" type="button" data-show-runner="${esc(p.key)}">Show on map</button>
    </div>
  </div>`;
}

function openProfile(key) {
  if (!S.model.byKey.get(key)) return;
  S.profileKey = key;
  renderProfile(key);
  if (!profileDlg.open) profileDlg.showModal();
  profileDlg.scrollTop = 0;
  history.replaceState(null, '', `#runner=${encodeURIComponent(key)}`);
}

profileDlg.addEventListener('close', () => {
  S.profileKey = null;
  if (location.hash.startsWith('#runner=')) history.replaceState(null, '', location.pathname + location.search);
});

profileDlg.addEventListener('click', (e) => {
  const stamp = e.target.closest('[data-stamp]');
  if (!stamp) return;
  const c = CHECKPOINTS[Number(stamp.dataset.stamp) - 1];
  $$('[data-stamp]', profileDlg).forEach((b) => b.setAttribute('aria-pressed', String(b === stamp)));
  const has = stamp.dataset.has;
  $('[data-stamp-info]', profileDlg).innerHTML = `<b>${c.emoji} ${esc(c.title)}</b> · km ${fmtKm(Math.round(c.at))}. ${has ? (has === 'yes' ? 'Stamped.' : `Stamped ${has}.`) : 'Not stamped yet.'} ${esc(c.fact)}`;
});

/* ---------- celebration ---------- */

function celebrate(before, after, run) {
  const prev = before?.byKey.get(run.key);
  const p = after.byKey.get(run.key);
  if (!p) return;
  const fresh = p.stamps.filter((s) => !prev?.stamps.some((b) => b.cp.n === s.cp.n && b.lap === s.lap));
  const club = after.club.stamps.filter((s) => s.run.id === run.id);
  const first = !prev;
  const longest = prev && run.km > prev.longest;
  const streakUp = prev && p.streak > prev.streak && p.streak >= 2;
  const badges = [];
  if (first) badges.push('<span class="pr-badge is-neon">👋 Welcome to Poreen</span>');
  if (longest) badges.push('<span class="pr-badge is-neon">⭐ Your longest run yet</span>');
  if (streakUp) badges.push(`<span class="pr-badge">🔥 ${p.streak}-week streak</span>`);
  if (prev && p.allRank < prev.allRank) badges.push(`<span class="pr-badge">📈 Up to #${p.allRank} all time</span>`);
  // A checkpoint unlocked for the club and for you at once is shown once.
  const both = new Set(club.filter((c) => fresh.some((s) => s.cp.n === c.cp.n && s.lap === c.lap)).map((c) => `${c.cp.n}:${c.lap}`));
  const mineOnly = fresh.filter((s) => !both.has(`${s.cp.n}:${s.lap}`));
  const unlock = (s, isClub) => {
    const c = s.cp;
    const also = isClub && both.has(`${c.n}:${s.lap}`) ? ' · and a stamp in your passport' : '';
    const label = isClub
      ? (c.n === 1 ? 'You got Poreen started' : c.n === LAST ? 'Your run finished the lap for the club' : `Club checkpoint ${c.n} of ${LAST} · your run got us here`) + also
      : c.n === 1 ? 'First stamp' : c.n === LAST ? 'Lap complete' : `Stamp ${c.n} of ${LAST}`;
    return `<div class="pr-unlock${isClub ? ' is-club' : ''}"><span class="e" aria-hidden="true">${c.emoji}</span><div><small>${label}</small><b>${esc(c.title)}</b><p>${esc(c.fact)}</p></div></div>`;
  };
  const w = p.where;
  const move = first
    ? `You're off: <b>${esc(describe(p.total))}</b>.`
    : `You're now <b>${esc(describe(p.total))}</b>.`;
  celebrateDlg.innerHTML = `<div class="pr-dlg pr-cel">
    <button class="pr-dlg-close" type="button" data-close aria-label="Close"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg></button>
    <div class="eyebrow">Run logged · Poreen ${dayLabel()}</div>
    <h2 id="prCelebrateTitle">Nice one, ${esc(firstName(p.name))}</h2>
    <p class="pr-cel-km">+${fmtKm(run.km)}<small>km</small><span aria-hidden="true">${animal(run.km)}</span></p>
    <p class="pr-cel-move">${move}</p>
    ${badges.length ? `<p class="pr-badges">${badges.join('')}</p>` : ''}
    ${mineOnly.length || club.length ? `<div class="pr-unlocks">${club.map((s) => unlock(s, true)).join('')}${mineOnly.map((s) => unlock(s, false)).join('')}</div>` : ''}
    <p class="pr-cel-next">Next stamp: <b>${w.nextCp.emoji} ${esc(w.nextCp.title)}</b> in ${fmtKm(w.toNextCp)} km. You're #${p.allRank} of ${after.runners.length} all time, with ${fmtKm(p.weekKm)} km this week.</p>
    <div class="btn-row">
      <button class="btn" type="button" data-share-runner="${esc(p.key)}">Share picture</button>
      <button class="btn ghost" type="button" data-copy-runner="${esc(p.key)}">Copy text</button>
      <button class="btn ghost" type="button" data-close>Done</button>
    </div>
  </div>`;
  celebrateDlg.showModal();
  const canvas = $('[data-confetti]');
  celebrateDlg.append(canvas);
  if (first || longest || fresh.length || club.length) setTimeout(() => confetti(canvas), 150);
}

celebrateDlg.addEventListener('close', () => document.body.append($('[data-confetti]')));

for (const dlg of [profileDlg, celebrateDlg]) {
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
  });
}
const closeDialogs = () => [profileDlg, celebrateDlg].forEach((d) => d.open && d.close());

/* ---------- sharing ---------- */

async function sharePicture(key, btn) {
  const label = btn?.textContent;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Making picture…';
  }
  try {
    const blob = await makeCard(S.model, key, dayLabel());
    const result = await shareImage(blob, shareText(S.model, key, dayLabel()), `poreen-${key ? key.replace(/[^a-z0-9]+/gi, '-') : 'panthers'}.png`);
    if (result === 'downloaded') toast('Picture saved. Post it anywhere.');
  } catch {
    toast("Couldn't make the picture on this device.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = label;
    }
  }
}

async function copyText(key) {
  const text = shareText(S.model, key, dayLabel());
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied. Paste it into the group chat.');
  } catch {
    prompt('Copy this:', text);
  }
}

/* ---------- runs: edit, delete, kudos ---------- */

async function removeRun(run) {
  if (!confirm(`Delete ${run.name}'s ${runLabel(run)}?`)) return;
  const own = S.mine[run.id];
  try {
    await api.remove(run.id, own, own ? '' : S.admin);
  } catch (err) {
    if (err.status !== 404) return toast(err.message);
  }
  S.data.runs = S.data.runs.filter((r) => r.id !== run.id);
  delete S.mine[run.id];
  store.set('mine', S.mine);
  renderAll();
  toast('Run deleted');
}

async function giveKudos(id, btn) {
  if (S.kudos[id]) return;
  const run = S.data.runs.find((r) => r.id === id);
  if (!run) return;
  S.kudos[id] = 1;
  store.set('kudos', S.kudos);
  run.kudos = (run.kudos || 0) + 1;
  btn.setAttribute('aria-pressed', 'true');
  btn.querySelector('span').textContent = run.kudos;
  btn.classList.remove('is-pop');
  void btn.offsetWidth;
  btn.classList.add('is-pop');
  try {
    const res = await api.kudos(id);
    run.kudos = res.kudos;
  } catch {
    run.kudos -= 1;
    delete S.kudos[id];
    store.set('kudos', S.kudos);
  }
  S.signature = '';
  S.model = derive(S.data, S.period);
  renderFeed();
  renderAwards();
}

/* ---------- committee ---------- */

function renderAdmin() {
  const el = $('[data-admin]');
  if (!S.admin) {
    el.innerHTML = `<div class="pr-admin"><form data-admin-unlock>
      <p>For the committee: edit or delete any run, fix or merge names, and download everything as a spreadsheet.</p>
      <label class="pr-lfield">Admin code<input type="password" name="admin" autocomplete="off" required /></label>
      <button class="btn dark-btn" type="submit">Unlock</button>
      <p class="pr-msg" data-admin-msg role="status"></p>
    </form></div>`;
    return;
  }
  const options = [...S.model.runners]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => `<option value="${esc(p.key)}">${esc(p.name)} (${plural(p.count, 'run')})</option>`)
    .join('');
  el.innerHTML = `<div class="pr-admin">
    <p class="pr-admin-on">Committee tools are on for this tab. Every run now shows Edit and Delete.</p>
    <form data-admin-rename>
      <label class="pr-lfield">Runner<select name="from" required>${options}</select></label>
      <label class="pr-lfield">New name<input name="to" maxlength="32" required /></label>
      <button class="btn dark-btn" type="submit">Rename or merge</button>
      <p class="pr-msg" data-admin-msg role="status">Renaming to someone who already exists merges their runs.</p>
    </form>
    <div class="btn-row"><button class="btn outline" type="button" data-admin-csv>Download spreadsheet</button><button class="btn outline" type="button" data-admin-lock>Lock</button></div>
  </div>`;
}

$('[data-admin]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const out = $('[data-admin-msg]', f);
  out.classList.remove('is-error');
  try {
    if (f.matches('[data-admin-unlock]')) {
      const code = f.elements.admin.value.trim();
      await api.checkAdmin(code);
      S.admin = code;
      session.set('admin', code);
      renderAll();
      toast('Committee tools unlocked');
    } else if (f.matches('[data-admin-rename]')) {
      const res = await api.rename(f.elements.from.value, f.elements.to.value, S.admin);
      S.signature = '';
      await load();
      toast(`Renamed ${plural(res.changed, 'run')} to ${res.name}`);
    }
  } catch (err) {
    out.textContent = err.message;
    out.classList.add('is-error');
  }
});

$('[data-admin]').addEventListener('click', (e) => {
  if (e.target.closest('[data-admin-lock]')) {
    S.admin = '';
    session.set('admin', '');
    renderAll();
  }
  if (e.target.closest('[data-admin-csv]')) {
    const rows = [['date', 'name', 'km', 'type', 'time', 'pace_per_km', 'note', 'kudos', 'logged_at']];
    for (const r of [...S.data.runs].sort((a, b) => (a.date < b.date ? -1 : 1)))
      rows.push([r.date, r.name, r.km, KINDS[r.kind]?.label || r.kind, r.secs ? fmtTime(r.secs) : '', r.secs ? fmtPace(r.secs / r.km) : '', r.note || '', r.kudos || 0, r.created]);
    const csv = rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = `poreen-runs-${localToday()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
});

/* ---------- one click handler for everything else ---------- */

document.addEventListener('click', (e) => {
  const t = e.target.closest('button, a');
  if (!t) return;
  const d = t.dataset;
  if (d.openProfile) openProfile(d.openProfile);
  else if (d.kudos) giveKudos(d.kudos, t);
  else if (d.edit) {
    const run = S.data.runs.find((r) => r.id === d.edit);
    if (run) startEdit(run);
  } else if (d.delete) {
    const run = S.data.runs.find((r) => r.id === d.delete);
    if (run) removeRun(run);
  } else if (d.cpMap) {
    $('#prMap').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    setTimeout(() => mapView.showCheckpoint(Number(d.cpMap)), reducedMotion() ? 0 : 450);
  } else if (d.shareRunner !== undefined) sharePicture(d.shareRunner, t);
  else if (d.copyRunner !== undefined) copyText(d.copyRunner);
  else if ('shareClub' in d) sharePicture(null, t);
  else if (d.showRunner) {
    closeDialogs();
    selectRunner(d.showRunner);
    $('#prMap').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    setTimeout(() => mapView.flyToRunner(d.showRunner), reducedMotion() ? 0 : 450);
  } else if ('unselect' in d) {
    selectRunner(null);
    mapView.flyToClub();
  } else if (d.map === 'club') {
    selectRunner(null);
    mapView.flyToClub();
  } else if (d.map === 'fit') mapView.fit();
  else if ('notMe' in d) {
    S.me = '';
    store.set('name', '');
    F.name.value = '';
    renderMe();
    F.name.focus();
  }
});

/* ---------- render + load ---------- */

function renderAll({ animate = false } = {}) {
  S.model = derive(S.data, S.period);
  renderHero();
  renderMe();
  renderFormMeta();
  renderCheckpoints();
  renderBoard();
  renderFeed();
  renderAwards();
  renderStats();
  renderMapNote();
  const adminSig = S.admin + '|' + S.model.runners.map((p) => p.key + p.count).join();
  if (adminSig !== S.adminSig) {
    S.adminSig = adminSig;
    renderAdmin();
  }
  mapView.update(S.model, { animate });
  if (S.profileKey && profileDlg.open) {
    const top = profileDlg.scrollTop;
    renderProfile(S.profileKey);
    profileDlg.scrollTop = top;
  }
}

async function load() {
  try {
    const data = await api.list();
    const sig = JSON.stringify(data);
    S.failed = false;
    if (sig === S.signature && S.loaded) return;
    S.signature = sig;
    const first = !S.loaded;
    S.data = data;
    S.loaded = true;
    renderAll({ animate: true });
    if (first) openFromHash();
  } catch {
    S.failed = true;
    if (!S.loaded) renderHero();
  }
}

function openFromHash() {
  const m = location.hash.match(/^#runner=(.+)$/);
  if (m) openProfile(decodeURIComponent(m[1]));
  if (location.hash === '#committee') $('#committee').open = true;
}

$('[data-legend]').innerHTML =
  '<b>One animal per day:</b> ' + ANIMALS.map(([, e, label]) => `<span>${e} ${label}</span>`).join('') + '<span>⬛ rest day</span>';

F.name.value = S.me;
F.code.value = store.get('code', '');
F.date.value = localToday();
setUnit(S.unit);
renderAll();
load();
setInterval(() => document.visibilityState === 'visible' && !S.editing && load(), 45000);
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && load());
