import site from '../data/site.json';
import events from '../data/events.json';

export { site };

export const nav = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Training', href: '/training' },
  { label: 'Events', href: '/events' },
  { label: 'Gallery', href: '/gallery' },
  { label: 'Join Us', href: '/join', cta: true },
  { label: 'Contact', href: '/contact' },
];

export type Season = keyof typeof site.seasons;
export const activeSeasonKey = site.activeSeason as Season;
export const seasonKeys = Object.keys(site.seasons) as Season[];

export function sessionsFor(key: Season) {
  return site.seasons[key].sessions.map((s) => ({
    ...s,
    place: site.locations[s.location as keyof typeof site.locations],
  }));
}

export const activeSessions = sessionsFor(activeSeasonKey);
export const activeSeason = site.seasons[activeSeasonKey];

export function mapEmbed(q: string) {
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
}
export function directions(q: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
}

export type EventItem = (typeof events)[number];
const today = new Date().toISOString().slice(0, 10);
export const allEvents = [...events].sort((a, b) => a.date.localeCompare(b.date));
export const upcomingEvents = allEvents.filter((e) => e.date >= today);
export const pastEvents = allEvents.filter((e) => e.date < today).reverse();

export function formatDate(iso: string) {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-IE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}
export function parts(iso: string) {
  const d = new Date(iso + 'T12:00:00Z');
  return {
    day: d.getUTCDate(),
    month: d.toLocaleDateString('en-IE', { month: 'short', timeZone: 'UTC' }),
    year: d.getUTCFullYear(),
  };
}

// With build.format 'file', Astro reports /about.html and /index.html. Normalise to the public URL.
export function cleanPath(p: string) {
  const c = p.replace(/\/index\.html$/, '/').replace(/\.html$/, '').replace(/\/$/, '');
  return c || '/';
}
