// Turns the raw list of runs into everything the page shows: runners, the club journey,
// checkpoint stamps, streaks, awards and the activity feed.
import { LOOP_KM, CHECKPOINTS, locate, crossed } from '../../lib/poreen-route.js';
import { addDays, daysBetween, weekStart, monthStart, localToday } from './util.js';

const byCreated = (a, b) => (a.created < b.created ? -1 : a.created > b.created ? 1 : 0);
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : byCreated(a, b));

/** Consecutive Monday-to-Sunday weeks with at least one run, up to this week (or last week, if this week is still empty). */
function weekStreak(weeks, today) {
  let w = weekStart(today);
  if (!weeks.has(w)) w = addDays(w, -7);
  let n = 0;
  while (weeks.has(w)) {
    n++;
    w = addDays(w, -7);
  }
  return n;
}

export function derive(data, period = 'week', today = localToday()) {
  const runs = data.runs.map((r) => ({ ...r })).sort(byCreated);
  const runsById = new Map(runs.map((r) => [r.id, r]));
  const thisWeek = weekStart(today);
  const lastWeek = addDays(thisWeek, -7);
  const from = period === 'week' ? thisWeek : period === 'month' ? monthStart(today) : '0000-00-00';

  /* The club journey, in the order runs were logged. */
  let clubKm = 0;
  const clubStamps = [];
  for (const r of runs) {
    const before = clubKm;
    clubKm += r.km;
    r.clubCrossed = crossed(before, clubKm);
    for (const c of r.clubCrossed) clubStamps.push({ cp: c, lap: c.lap, run: r });
  }

  /* Each runner's own journey, in the order they ran. */
  const groups = new Map();
  for (const r of runs) {
    if (!groups.has(r.key)) groups.set(r.key, []);
    groups.get(r.key).push(r);
  }
  const runners = [];
  for (const [key, list] of groups) {
    list.sort(byDate);
    const p = {
      key,
      name: list[0].name,
      runs: list,
      total: 0,
      count: list.length,
      longest: 0,
      pKm: 0,
      pRuns: 0,
      weekKm: 0,
      lastWeekKm: 0,
      timedKm: 0,
      timedSecs: 0,
      kudos: 0,
      stamps: [],
      weeks: new Map(),
      days: new Map(),
      first: list[0].date,
      last: list[list.length - 1].date,
    };
    let longestSoFar = 0;
    list.forEach((r, i) => {
      const before = p.total;
      p.total += r.km;
      r.before = before;
      r.after = p.total;
      r.crossed = crossed(before, p.total);
      r.isFirst = i === 0;
      r.isLongest = i > 0 && r.km > longestSoFar;
      longestSoFar = Math.max(longestSoFar, r.km);
      for (const c of r.crossed) p.stamps.push({ cp: c, lap: c.lap, date: r.date, run: r });
      p.longest = Math.max(p.longest, r.km);
      p.kudos += r.kudos || 0;
      if (r.secs) {
        p.timedKm += r.km;
        p.timedSecs += r.secs;
      }
      if (r.date >= from) {
        p.pKm += r.km;
        p.pRuns += 1;
      }
      const w = weekStart(r.date);
      p.weeks.set(w, (p.weeks.get(w) || 0) + r.km);
      p.days.set(r.date, (p.days.get(r.date) || 0) + r.km);
      if (w === thisWeek) p.weekKm += r.km;
      if (w === lastWeek) p.lastWeekKm += r.km;
    });
    p.pace = p.timedKm ? p.timedSecs / p.timedKm : null;
    p.streak = weekStreak(p.weeks, today);
    p.where = locate(p.total);
    p.stampIds = new Set(p.stamps.filter((s) => s.lap === 0).map((s) => s.cp.n));
    p.laps = Math.floor(p.total / LOOP_KM);
    runners.push(p);
  }

  // Ranks: by km in the chosen period, then all-time km.
  const ranked = runners
    .filter((p) => (period === 'all' ? p.count : p.pRuns))
    .sort((a, b) => b.pKm - a.pKm || b.total - a.total || a.name.localeCompare(b.name));
  ranked.forEach((p, i) => (p.rank = i + 1));
  const allTime = [...runners].sort((a, b) => b.total - a.total);
  allTime.forEach((p, i) => (p.allRank = i + 1));
  const byKey = new Map(runners.map((p) => [p.key, p]));

  /* Club numbers. */
  const where = locate(clubKm);
  const last14 = runs.filter((r) => r.date > addDays(today, -14) && r.date <= today).reduce((s, r) => s + r.km, 0);
  const sinceStart = Math.max(1, Math.min(14, daysBetween(data.start, today) + 1));
  const perDay = last14 / sinceStart;
  const weekly = new Map();
  for (const r of runs) weekly.set(weekStart(r.date), (weekly.get(weekStart(r.date)) || 0) + r.km);
  const weeks = [];
  const firstWeek = weekStart(data.start);
  for (let w = thisWeek, n = 0; n < 10 && w >= firstWeek; n++, w = addDays(w, -7)) weeks.unshift({ week: w, km: weekly.get(w) || 0 });
  const longestRun = runs.reduce((best, r) => (!best || r.km > best.km ? r : best), null);
  const club = {
    km: clubKm,
    where,
    laps: where.laps,
    stamps: clubStamps,
    reachedThisLap: new Map(clubStamps.filter((s) => s.lap === where.laps).map((s) => [s.cp.n, s])),
    reachedEver: new Map(clubStamps.filter((s) => s.lap === 0).map((s) => [s.cp.n, s])),
    perDay,
    etaNextDays: perDay > 0 ? where.toNextCp / perDay : null,
    etaLapDays: perDay > 0 ? (LOOP_KM - where.lapKm) / perDay : null,
    weekKm: weekly.get(thisWeek) || 0,
    lastWeekKm: weekly.get(lastWeek) || 0,
    // Last week up to the same weekday, for a fair comparison mid-week.
    lastWeekSoFar: runs.filter((r) => r.date >= lastWeek && r.date <= addDays(today, -7)).reduce((s, r) => s + r.km, 0),
    weeks,
    runners: runners.length,
    runs: runs.length,
    avg: runs.length ? clubKm / runs.length : 0,
    longestRun,
    timedRuns: runs.filter((r) => r.secs).length,
  };

  /* This week's awards. */
  const weekRuns = runs.filter((r) => r.date >= thisWeek && r.date <= addDays(thisWeek, 6));
  const awards = [];
  const top = (score, min = 0) => {
    let best = null;
    for (const p of runners) {
      const v = score(p);
      if (v > min && (!best || v > best.v)) best = { p, v };
    }
    return best;
  };
  const most = top((p) => p.weekKm);
  if (most) awards.push({ icon: '🏆', title: 'Most km', who: most.p, value: most.v, unit: 'km' });
  const long = weekRuns.reduce((b, r) => (!b || r.km > b.km ? r : b), null);
  if (long) awards.push({ icon: '📏', title: 'Longest run', who: byKey.get(long.key), value: long.km, unit: 'km' });
  const busy = top((p) => p.runs.filter((r) => r.date >= thisWeek).length, 1);
  if (busy) awards.push({ icon: '⚡', title: 'Most runs', who: busy.p, value: busy.v, unit: busy.v === 1 ? 'run' : 'runs' });
  const club2 = top((p) => p.runs.filter((r) => r.date >= thisWeek && r.kind === 'club').length);
  if (club2) awards.push({ icon: '🐆', title: 'Most club sessions', who: club2.p, value: club2.v, unit: club2.v === 1 ? 'session' : 'sessions' });
  const climber = top((p) => p.weekKm - p.lastWeekKm, 5);
  if (climber && climber.p.lastWeekKm > 0) awards.push({ icon: '📈', title: 'Biggest step up', who: climber.p, value: climber.v, unit: 'km more than last week' });
  const loved = top((p) => p.runs.filter((r) => r.date >= thisWeek).reduce((s, r) => s + (r.kudos || 0), 0));
  if (loved) awards.push({ icon: '👏', title: 'Most kudos', who: loved.p, value: loved.v, unit: 'kudos' });

  /* Activity feed, newest first: runs, plus the club checkpoints they unlocked. */
  const feed = [];
  for (const r of [...runs].reverse()) {
    for (const c of [...r.clubCrossed].reverse()) feed.push({ type: 'club', cp: c, run: r });
    feed.push({ type: 'run', run: r });
  }

  return { runs, runsById, runners, ranked, byKey, club, awards, feed, period, today };
}

export { CHECKPOINTS, LOOP_KM };
