// Copied from github.com/LtHalkin/Poreen (public/route.js). Keep the two in sync if the route changes.
// The Poreen loop: Dublin → south-east coast → Wild Atlantic Way → Causeway Coast → back to Dublin.
// Distances are straight lines between stops, so the map and the numbers always agree.

export const STOPS = [
  ["Dublin", 53.3498, -6.2603],
  ["Bray", 53.2028, -6.0983],
  ["Wicklow", 52.9808, -6.0446],
  ["Arklow", 52.7977, -6.1599],
  ["Gorey", 52.6747, -6.2925],
  ["Wexford", 52.3369, -6.4633],
  ["New Ross", 52.3966, -6.9366],
  ["Waterford", 52.2593, -7.1101],
  ["Dungarvan", 52.0845, -7.625],
  ["Youghal", 51.9537, -7.8506],
  ["Cork", 51.8985, -8.4756],
  ["Kinsale", 51.7059, -8.5222],
  ["Clonakilty", 51.6231, -8.8707],
  ["Skibbereen", 51.55, -9.2667],
  ["Bantry", 51.68, -9.4528],
  ["Kenmare", 51.88, -9.5833],
  ["Waterville", 51.8333, -10.1667],
  ["Cahersiveen", 51.9481, -10.2221],
  ["Killorglin", 52.1069, -9.7856],
  ["Dingle", 52.1409, -10.2689],
  ["Tralee", 52.2713, -9.6999],
  ["Listowel", 52.4464, -9.485],
  ["Kilrush", 52.6397, -9.4833],
  ["Kilkee", 52.6833, -9.65],
  ["Lahinch", 52.9333, -9.3447],
  ["Doolin", 53.0167, -9.4],
  ["Galway", 53.2707, -9.0568],
  ["Clifden", 53.4894, -10.0189],
  ["Leenaun", 53.5961, -9.6955],
  ["Westport", 53.8, -9.5167],
  ["Achill Sound", 53.9333, -9.9333],
  ["Belmullet", 54.225, -9.9906],
  ["Ballina", 54.1149, -9.155],
  ["Sligo", 54.2766, -8.4761],
  ["Bundoran", 54.4778, -8.2806],
  ["Donegal", 54.6538, -8.1096],
  ["Killybegs", 54.635, -8.45],
  ["Dungloe", 54.95, -8.35],
  ["Dunfanaghy", 55.1833, -7.9667],
  ["Letterkenny", 54.9558, -7.7342],
  ["Buncrana", 55.1333, -7.45],
  ["Derry", 54.9966, -7.3086],
  ["Portrush", 55.2042, -6.6528],
  ["Ballycastle", 55.2044, -6.2442],
  ["Larne", 54.8578, -5.8236],
  ["Belfast", 54.5973, -5.9301],
  ["Downpatrick", 54.3283, -5.7156],
  ["Newcastle", 54.2167, -5.8833],
  ["Newry", 54.1751, -6.3402],
  ["Dundalk", 54.009, -6.4049],
  ["Drogheda", 53.7179, -6.3561],
  ["Balbriggan", 53.6122, -6.1817],
  ["Dublin", 53.3498, -6.2603],
];

function haversine(a, b) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLng = (b[2] - a[2]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const ROUTE = (() => {
  let at = 0;
  return STOPS.map((s, i) => {
    if (i > 0) at += haversine(STOPS[i - 1], s);
    return { name: s[0], lat: s[1], lng: s[2], at };
  });
})();

export const LOOP_KM = ROUTE[ROUTE.length - 1].at;

/** Where on the loop is someone who has run `km` in total? */
export function locate(km) {
  const laps = Math.floor(km / LOOP_KM);
  const d = km - laps * LOOP_KM;
  let i = 0;
  while (i < ROUTE.length - 2 && ROUTE[i + 1].at <= d) i++;
  const a = ROUTE[i];
  const b = ROUTE[i + 1];
  const t = (d - a.at) / (b.at - a.at || 1);
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
    laps,
    lapKm: d,
    index: i,
    prev: a,
    next: b,
    toNext: b.at - d,
  };
}

/** Short human description of a position, e.g. "past Kenmare" or "12 km to Dingle". */
export function describe(km) {
  if (km <= 0) return "on the start line in Dublin";
  const p = locate(km);
  const lap = p.laps > 0 ? ` (lap ${p.laps + 1})` : "";
  if (p.lapKm - p.prev.at < 2) return `in ${p.prev.name}${lap}`;
  if (p.toNext < 2) return `nearly in ${p.next.name}${lap}`;
  return `past ${p.prev.name}, ${Math.round(p.toNext)} km to ${p.next.name}${lap}`;
}

/** Points from Dublin to the current position on this lap. */
export function trail(km) {
  const p = locate(km);
  const pts = ROUTE.slice(0, p.index + 1).map((s) => [s.lat, s.lng]);
  pts.push([p.lat, p.lng]);
  return pts;
}
