// Builds src/lib/poreen-data.js: the Poreen running route around Ireland and the land outlines for its map.
//
//   node scripts/poreen/build-data.mjs
//
// The route follows real roads, paths and greenways between the stops in stops.mjs, using the
// OSRM foot router at routing.openstreetmap.de (OpenStreetMap data). The land comes from
// Natural Earth via the world-atlas package. Only needed when the stops change; the output is committed.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import * as topojson from 'topojson-client';
import { STOPS } from './stops.mjs';

const OUT = new URL('../../src/lib/poreen-data.js', import.meta.url);
const ROUTER = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot/';
const ATLAS = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-10m.json';

const getJSON = (url) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return JSON.parse(execFileSync('curl', ['-sS', '--fail', '-m', '120', url], { maxBuffer: 1 << 28 }).toString());
    } catch (err) {
      if (attempt >= 4) throw err;
      execFileSync('sleep', [String(attempt * 3)]);
    }
  }
};

const R = 6371.0088;
const rad = Math.PI / 180;
function km([lng1, lat1], [lng2, lat2]) {
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const lengthOf = (pts) => pts.reduce((s, p, i) => (i ? s + km(pts[i - 1], p) : 0), 0);

// Douglas–Peucker on [lng, lat] points (tolerance in degrees, latitude-corrected).
function simplify(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const k = Math.cos(pts[0][1] * rad);
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = [pts[a][0] * k, pts[a][1]];
    const [bx, by] = [pts[b][0] * k, pts[b][1]];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let worst = -1;
    let dmax = 0;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][0] * k;
      const py = pts[i][1];
      let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > dmax) [dmax, worst] = [d, i];
    }
    if (dmax > tol) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

// Google encoded polyline of [lng, lat] points, stored as lat,lng.
function encode(pts, precision) {
  const f = 10 ** precision;
  let out = '';
  let pLat = 0;
  let pLng = 0;
  const enc = (v) => {
    v = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (v >= 0x20) {
      s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    return s + String.fromCharCode(v + 63);
  };
  for (const [lng, lat] of pts) {
    const la = Math.round(lat * f);
    const ln = Math.round(lng * f);
    out += enc(la - pLat) + enc(ln - pLng);
    pLat = la;
    pLng = ln;
  }
  return out;
}

/* ---------- route ---------- */

const line = [];
const stopIndex = [];
const CHUNK = 10;
for (let start = 0; start < STOPS.length - 1; start += CHUNK - 1) {
  const chunk = STOPS.slice(start, Math.min(start + CHUNK, STOPS.length));
  const coords = chunk.map(([, lat, lng]) => `${lng},${lat}`).join(';');
  const res = getJSON(`${ROUTER}${coords}?overview=full&geometries=geojson&steps=false`);
  if (res.code !== 'Ok') throw new Error(`Router: ${res.code} for ${chunk.map((s) => s[0]).join(', ')}`);
  const geom = res.routes[0].geometry.coordinates;
  const legs = res.routes[0].legs;

  // Where does each waypoint sit on this chunk's geometry? Search forwards for the nearest vertex.
  let from = 0;
  const local = res.waypoints.map((w, j) => {
    if (w.distance > 400) console.warn(`  ! ${chunk[j][0]} snapped ${Math.round(w.distance)} m from its point`);
    let best = from;
    let bestD = Infinity;
    for (let i = from; i < geom.length; i++) {
      const d = km(geom[i], w.location);
      if (d < bestD) [bestD, best] = [d, i];
      if (d < 0.001) break;
    }
    from = best;
    return best;
  });

  const offset = line.length ? line.length - 1 : 0;
  line.push(...(line.length ? geom.slice(1) : geom));
  local.forEach((li, j) => {
    if (start > 0 && j === 0) return; // shared with previous chunk
    stopIndex.push(offset + li);
  });
  legs.forEach((leg, j) => {
    const a = chunk[j];
    const b = chunk[j + 1];
    const crow = km([a[2], a[1]], [b[2], b[1]]);
    const ratio = leg.distance / 1000 / crow;
    console.log(`${(leg.distance / 1000).toFixed(1).padStart(7)} km  ${a[0]} → ${b[0]}${ratio > 2.2 ? `   (x${ratio.toFixed(1)} the straight line)` : ''}`);
  });
  execFileSync('sleep', ['1.2']); // be polite to the public router
}
if (stopIndex.length !== STOPS.length) throw new Error(`Matched ${stopIndex.length} of ${STOPS.length} stops`);

const fullKm = lengthOf(line);

// Simplify between stops so every stop stays an exact vertex.
const simple = [line[stopIndex[0]]];
const simpleStop = [0];
for (let s = 1; s < stopIndex.length; s++) {
  const seg = simplify(line.slice(stopIndex[s - 1], stopIndex[s] + 1), 0.00045);
  simple.push(...seg.slice(1));
  simpleStop.push(simple.length - 1);
}

/* ---------- land ---------- */

const topo = getJSON(ATLAS);
const geoms = topo.objects.countries.geometries;
const byId = (id) => geoms.find((g) => String(g.id) === id);
const polysOf = (g) => (g.type === 'Polygon' ? [g.arcs] : g.arcs);
const outer = (arcs) => topojson.feature(topo, { type: 'Polygon', arcs }).geometry.coordinates[0];
const centre = (ring) => {
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
};
const inNI = ([x, y]) => x > -8.3 && x < -5.3 && y > 53.9 && y < 55.42;

const irlPolys = polysOf(byId('372'));
const ukPolys = polysOf(byId('826'));
const niPolys = ukPolys.filter((p) => inNI(centre(outer(p))));
const gbPolys = ukPolys.filter((p) => !inNI(centre(outer(p))));
const island = topojson.merge(topo, [...irlPolys, ...niPolys].map((arcs) => ({ type: 'Polygon', arcs })));

const VIEW = [-12, 50.3, -2.6, 57.2];
const visible = (ring) => ring.some(([x, y]) => x > VIEW[0] && x < VIEW[2] && y > VIEW[1] && y < VIEW[3]);
const big = (ring, min) => {
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  return Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys) > min;
};

const irelandRings = island.coordinates.map((poly) => poly[0]).filter((r) => big(r, 0.025)).map((r) => simplify(r, 0.0035));
const otherRings = [...gbPolys, ...polysOf(byId('833'))]
  .map(outer)
  .filter((r) => visible(r) && big(r, 0.06))
  .map((r) => simplify(r, 0.008));

/* ---------- write ---------- */

const stops = STOPS.map(([name, , , cp], i) => {
  const s = { name, i: simpleStop[i] };
  if (cp) s.cp = cp;
  return s;
});

const js = `// Generated by scripts/poreen/build-data.mjs from scripts/poreen/stops.mjs. Do not edit by hand.
// Route: OpenStreetMap contributors, routed with OSRM (foot). Land: Natural Earth.

/** Encoded polyline (precision 5) of the whole loop, Dublin to Dublin. */
export const ROUTE_LINE = ${JSON.stringify(encode(simple, 5))};

/** Length of the loop along real roads and paths, in km. */
export const ROUTE_KM = ${fullKm.toFixed(2)};

/** Stops in running order. \`i\` is the vertex index on ROUTE_LINE. Stops with \`cp\` are checkpoints. */
export const STOPS = ${JSON.stringify(stops, null, 0).replace(/\},\{/g, '},\n  {').replace(/^\[/, '[\n  ').replace(/\]$/, ',\n]')};

/** Land outlines, encoded polylines (precision 4): the island of Ireland, and neighbouring coasts. */
export const LAND = {
  ireland: ${JSON.stringify(irelandRings.map((r) => encode(r, 4)))},
  other: ${JSON.stringify(otherRings.map((r) => encode(r, 4)))},
};
`;
writeFileSync(OUT, js);
console.log(`\nLoop: ${fullKm.toFixed(1)} km, ${line.length} → ${simple.length} points. ${STOPS.filter((s) => s[3]).length} checkpoints.`);
console.log(`Land: ${irelandRings.length} Irish rings (${irelandRings.reduce((s, r) => s + r.length, 0)} pts), ${otherRings.length} others.`);
console.log(`Wrote ${OUT.pathname} (${(js.length / 1024).toFixed(1)} KB)`);
