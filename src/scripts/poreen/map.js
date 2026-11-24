// The Poreen map: Ireland in club colours, the real route, checkpoint stamps, runners and the club panther.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LINE, STOPS, CHECKPOINTS, LAND_RINGS, LOOP_KM, locate, slice } from '../../lib/poreen-route.js';
import { esc, fmtKm, colorFor, initials, reducedMotion, shortDate } from './util.js';

const NEON = '#b9ff1a';

export function createMap(el, { onRunner, onClub }) {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const map = L.map(el, {
    scrollWheelZoom: false,
    dragging: !coarse,
    tap: false,
    zoomSnap: 0.25,
    zoomDelta: 0.75,
    minZoom: 5.5,
    maxZoom: 12,
    maxBounds: L.latLngBounds([49.4, -14.5], [57.8, -1.5]),
    attributionControl: true,
  });
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution('Route &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Land: Natural Earth');

  const bounds = L.latLngBounds(LINE);
  const fit = () => map.fitBounds(bounds, { padding: [14, 14] });
  fit();

  // Land, then the route on top.
  L.polygon(LAND_RINGS.other.map((r) => [r]), { stroke: false, fillColor: '#151515', fillOpacity: 1, interactive: false }).addTo(map);
  L.polygon(LAND_RINGS.ireland.map((r) => [r]), { color: '#2d3324', weight: 1.2, fillColor: '#1b1e17', fillOpacity: 1, interactive: false }).addTo(map);
  L.polyline(LINE, { color: '#4a4f44', weight: 3, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
  const lapsLine = L.polyline([], { color: NEON, weight: 3, opacity: 0.35, interactive: false }).addTo(map);
  const clubTrail = L.polyline([], { color: NEON, weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round', className: 'pr-glow', interactive: false }).addTo(map);
  const runnerTrail = L.polyline([], { color: '#fff', weight: 4, opacity: 0.95, lineCap: 'round', lineJoin: 'round', dashArray: '1 7', interactive: false }).addTo(map);

  // Towns as small dots.
  for (const s of STOPS) {
    if (s.cp) continue;
    L.circleMarker([s.lat, s.lng], { radius: 2.5, weight: 0, fillColor: '#8a8f80', fillOpacity: 1 })
      .bindTooltip(`${esc(s.name)} · km ${Math.round(s.at)}`, { direction: 'top', className: 'pr-tip' })
      .addTo(map);
  }

  // Checkpoints.
  const cpMarkers = new Map();
  for (const c of CHECKPOINTS) {
    if (c.n === CHECKPOINTS.length) continue; // the finish shares Dublin with the start
    const m = L.marker([c.lat, c.lng], {
      icon: L.divIcon({ className: '', html: `<div class="pr-cp-pin"><span>${c.emoji}</span></div>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
      zIndexOffset: 500,
      keyboard: true,
      title: c.title,
    }).addTo(map);
    m.bindPopup('', { className: 'pr-popup', maxWidth: 260, autoPanPadding: [20, 20] });
    cpMarkers.set(c.n, m);
  }

  // Runners and the panther.
  const runnerLayer = L.layerGroup().addTo(map);
  const panther = L.marker([LINE[0][0], LINE[0][1]], {
    icon: L.divIcon({ className: '', html: '<div class="pr-panther" aria-hidden="true">🐆</div>', iconSize: [40, 40], iconAnchor: [20, 20] }),
    zIndexOffset: 3000,
    title: 'The Panthers',
  })
    .bindTooltip('', { direction: 'top', offset: [0, -18], className: 'pr-tip pr-tip-strong' })
    .on('click', () => onClub?.())
    .addTo(map);

  // On phones, one finger scrolls the page until someone taps "explore".
  const hint = el.parentElement.querySelector('[data-map-unlock]');
  if (coarse && hint) {
    hint.hidden = false;
    hint.addEventListener('click', () => {
      map.dragging.enable();
      hint.hidden = true;
    });
    new IntersectionObserver(([e]) => {
      if (!e.isIntersecting && map.dragging.enabled()) {
        map.dragging.disable();
        hint.hidden = false;
      }
    }).observe(el);
  }

  let model = null;
  let selected = null;
  let clubShown = 0; // km currently drawn (animates)
  let anim = 0;

  function drawClub(km) {
    clubShown = km;
    const p = locate(km);
    clubTrail.setLatLngs(km > 0 ? slice(0, p.lapKm) : []);
    lapsLine.setLatLngs(p.laps > 0 ? LINE : []);
    panther.setLatLng([p.lat, p.lng]);
  }

  function animateClub(to, ms = 1400) {
    cancelAnimationFrame(anim);
    const from = clubShown;
    if (reducedMotion() || Math.abs(to - from) < 0.01) return drawClub(to);
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      drawClub(from + (to - from) * e);
      if (k < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  function checkpointStatus(c) {
    const club = model.club;
    if (club.km > 0 && c.at <= club.where.lapKm) return { cls: 'is-reached', reached: club.reachedThisLap.get(c.n) || club.reachedEver.get(c.n) };
    if (c.n === club.where.nextCp.n) return { cls: 'is-next' };
    return { cls: 'is-ahead' };
  }

  function paintCheckpoints() {
    for (const c of CHECKPOINTS) {
      const m = cpMarkers.get(c.n);
      if (!m) continue;
      const { cls, reached } = checkpointStatus(c);
      const pin = m.getElement()?.querySelector('.pr-cp-pin');
      if (pin) pin.className = `pr-cp-pin ${cls}`;
      const toGo = c.at - model.club.where.lapKm;
      const status = reached
        ? `<p class="pr-pop-status is-reached">Reached ${shortDate(reached.run.date)} · ${esc(reached.run.name)}'s ${fmtKm(reached.run.km)} km got the club here</p>`
        : cls === 'is-next'
          ? `<p class="pr-pop-status is-next">Next stop · ${fmtKm(toGo)} km to go</p>`
          : `<p class="pr-pop-status">${fmtKm(toGo)} km ahead</p>`;
      m.setPopupContent(
        `<div class="pr-pop"><span class="pr-pop-emoji">${c.emoji}</span><p class="pr-pop-n">Checkpoint ${c.n} of ${CHECKPOINTS.length} · km ${Math.round(c.at)}</p><h3>${esc(c.title)}</h3><p>${esc(c.fact)}</p>${status}</div>`
      );
      m.unbindTooltip();
      if (cls === 'is-next') m.bindTooltip(`Next · ${fmtKm(toGo)} km`, { permanent: true, direction: 'right', offset: [14, 0], className: 'pr-tip pr-tip-next' });
      else m.bindTooltip(`${esc(c.title)} · km ${Math.round(c.at)}`, { direction: 'top', offset: [0, -14], className: 'pr-tip' });
    }
  }

  // Runners close together on screen share one marker.
  function paintRunners() {
    runnerLayer.clearLayers();
    if (!model) return;
    const list = [...model.runners].sort((a, b) => b.total - a.total);
    const groups = [];
    for (const p of list) {
      const pt = map.latLngToLayerPoint([p.where.lat, p.where.lng]);
      const g = groups.find((g) => g.pt.distanceTo(pt) < 30);
      if (g) g.members.push(p);
      else groups.push({ pt, members: [p], latlng: [p.where.lat, p.where.lng] });
    }
    for (const g of groups) {
      const lead = g.members.find((p) => p.key === selected) || g.members[0];
      const sel = g.members.some((p) => p.key === selected);
      const extra = g.members.length - 1;
      const html = `<div class="pr-pin${sel ? ' is-sel' : ''}" style="--c:${colorFor(lead.key)}"><span>${esc(initials(lead.name))}</span>${extra ? `<b>+${extra}</b>` : ''}</div>`;
      const marker = L.marker(g.latlng, {
        icon: L.divIcon({ className: '', html, iconSize: [32, 32], iconAnchor: [16, 16] }),
        zIndexOffset: sel ? 2500 : 1000 + Math.min(900, g.members.length),
        title: g.members.map((p) => p.name).join(', '),
      }).addTo(runnerLayer);
      if (g.members.length === 1) {
        marker.bindTooltip(`<b>${esc(lead.name)}</b> · ${fmtKm(lead.total)} km`, { direction: 'top', offset: [0, -16], className: 'pr-tip' });
        marker.on('click', () => onRunner?.(lead.key));
      } else {
        const items = g.members
          .map((p) => `<li><button type="button" data-runner="${esc(p.key)}"><i style="--c:${colorFor(p.key)}"></i>${esc(p.name)} <span>${fmtKm(p.total)} km</span></button></li>`)
          .join('');
        marker.bindPopup(`<div class="pr-pop"><p class="pr-pop-n">${g.members.length} runners here</p><ul class="pr-pop-list">${items}</ul></div>`, { className: 'pr-popup', maxWidth: 240 });
      }
    }
  }
  map.on('zoomend', paintRunners);
  map.on('popupopen', (e) => {
    e.popup.getElement()?.querySelectorAll('[data-runner]').forEach((b) =>
      b.addEventListener('click', () => {
        map.closePopup();
        onRunner?.(b.dataset.runner);
      })
    );
  });

  function paintSelected() {
    const p = selected && model?.byKey.get(selected);
    runnerTrail.setLatLngs(p ? slice(0, p.where.lapKm) : []);
    if (p) runnerTrail.setStyle({ color: colorFor(p.key) });
  }

  return {
    map,
    update(next, { animate = false } = {}) {
      const first = !model;
      model = next;
      panther.setTooltipContent(`<b>The Panthers</b> · ${fmtKm(model.club.km)} km together`);
      paintCheckpoints();
      paintRunners();
      paintSelected();
      if (first || animate) animateClub(model.club.km, first ? 1800 : 1100);
      else drawClub(model.club.km);
    },
    select(key) {
      selected = key;
      paintRunners();
      paintSelected();
    },
    flyToRunner(key) {
      const p = model?.byKey.get(key);
      if (p) map.flyTo([p.where.lat, p.where.lng], Math.max(map.getZoom(), 8), { duration: reducedMotion() ? 0 : 0.8 });
    },
    flyToClub() {
      const w = model.club.where;
      map.flyTo([w.lat, w.lng], Math.max(map.getZoom(), 7.5), { duration: reducedMotion() ? 0 : 0.8 });
    },
    showCheckpoint(n) {
      const m = cpMarkers.get(n) || cpMarkers.get(1);
      map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 8), { duration: reducedMotion() ? 0 : 0.8 });
      map.once('moveend', () => m.openPopup());
    },
    fit,
    invalidate: () => map.invalidateSize(),
  };
}

export { LOOP_KM };
