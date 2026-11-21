// Strict server-side validation. Everything written to the repo is rebuilt from
// whitelisted fields, so the admin UI (or anyone with a stolen cookie) can't inject arbitrary data.

export class ValidationError extends Error {}

export const GALLERY_CATEGORIES = ['Club Runs', 'Group Hikes', 'Races', 'Social Events', 'Club Activities'];
export const EVENT_TAGS = ['Group hikes', 'Running events', 'Social gatherings', 'Annual events'];
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const IMAGE_FOLDERS = ['gallery', 'events', 'hero'] as const;
export type Folder = (typeof IMAGE_FOLDERS)[number];

const fail = (m: string): never => { throw new ValidationError(m); };

function str(v: unknown, label: string, max = 300, required = false): string {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') fail(`${label} must be text`);
  const s = (v as string).trim();
  if (s.length > max) fail(`${label} is too long (max ${max} characters)`);
  if (required && !s) fail(`${label} is required`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s)) fail(`${label} contains invalid characters`);
  return s;
}
const key = (v: unknown, label: string) => {
  const s = str(v, label, 31, true);
  if (!/^[a-z][a-z0-9-]*$/.test(s)) fail(`${label} is invalid`);
  return s;
};
function url(v: unknown, label: string, required = false): string {
  const s = str(v, label, 500, required);
  if (s && !/^https:\/\/[^\s]+$/.test(s)) fail(`${label} must be a full https:// link`);
  return s;
}
const obj = (v: unknown, label: string): Record<string, any> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(`${label} is invalid`);
  return v as Record<string, any>;
};
const arr = (v: unknown, label: string, max: number): any[] => {
  if (!Array.isArray(v)) fail(`${label} is invalid`);
  if ((v as any[]).length > max) fail(`${label} has too many entries`);
  return v as any[];
};

export function safeFilename(v: unknown, label = 'filename'): string {
  const s = str(v, label, 90, true);
  if (!/^[a-z0-9][a-z0-9._-]*\.(jpg|jpeg|png|webp)$/.test(s) || s.includes('..')) fail(`${label} is invalid`);
  return s;
}

export function validateSite(input: unknown) {
  const s = obj(input, 'site');
  const locations: Record<string, any> = {};
  const lin = obj(s.locations, 'locations');
  for (const k of Object.keys(lin)) {
    const l = obj(lin[k], `location ${k}`);
    locations[key(k, 'Location key')] = {
      name: str(l.name, 'Location name', 80, true),
      area: str(l.area, 'Location area', 80),
      mapQuery: str(l.mapQuery, 'Map search text', 160, true),
    };
  }
  if (!Object.keys(locations).length) fail('At least one location is required');
  const seasons: Record<string, any> = {};
  const sin = obj(s.seasons, 'seasons');
  for (const k of Object.keys(sin)) {
    const se = obj(sin[k], `season ${k}`);
    seasons[key(k, 'Season key')] = {
      label: str(se.label, 'Season name', 30, true),
      note: str(se.note, 'Season note', 400),
      sessions: arr(se.sessions, 'Sessions', 14).map((x, i) => {
        const o = obj(x, `Session ${i + 1}`);
        const day = str(o.day, 'Day', 12, true);
        if (!DAYS.includes(day)) fail('Day is invalid');
        const loc = str(o.location, 'Session location', 31, true);
        if (!locations[loc]) fail(`Session ${i + 1} uses an unknown location`);
        return { day, time: str(o.time, 'Time', 20, true), location: loc, what: str(o.what, 'Session description', 120) };
      }),
    };
  }
  const activeSeason = str(s.activeSeason, 'Active season', 31, true);
  if (!seasons[activeSeason]) fail('Active season does not exist');
  const phoneIn = obj(s.phone, 'phone');
  const phoneHref = str(phoneIn.href, 'Phone link number', 20, true);
  if (!/^\+?[0-9]{7,15}$/.test(phoneHref)) fail('Phone link number must be digits only, e.g. +353872182461');
  const ig = obj(s.instagram, 'instagram'), fb = obj(s.facebook, 'facebook');
  return {
    name: str(s.name, 'Club name', 60, true),
    locality: str(s.locality, 'Locality', 80, true),
    tagline: str(s.tagline, 'Tagline', 100, true),
    phone: { display: str(phoneIn.display, 'Phone number', 25, true), href: phoneHref },
    instagram: { handle: str(ig.handle, 'Instagram handle', 60, true), url: url(ig.url, 'Instagram link', true) },
    facebook: { name: str(fb.name, 'Facebook name', 60, true), url: url(fb.url, 'Facebook link', true) },
    activeSeason,
    distances: arr(s.distances, 'Distances', 10).map((d) => str(d, 'Distance', 10, true)),
    trainingTypes: arr(s.trainingTypes, 'Training types', 10).map((t) => {
      const o = obj(t, 'Training type');
      return { title: str(o.title, 'Training type title', 60, true), text: str(o.text, 'Training type text', 160) };
    }),
    locations,
    seasons,
  };
}

export function validateEvents(input: unknown) {
  const seen = new Set<string>();
  let featured = 0;
  const out = arr(input, 'Events', 200).map((x, i) => {
    const e = obj(x, `Event ${i + 1}`);
    const id = key(e.id, 'Event id');
    if (seen.has(id)) fail('Duplicate event id');
    seen.add(id);
    const date = str(e.date, 'Event date', 10, true);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) fail('Event date is invalid');
    const tags = arr(e.tags ?? [], 'Event tags', 10).map((t) => {
      if (!EVENT_TAGS.includes(t)) fail('Event category is invalid');
      return t as string;
    });
    const isFeatured = e.featured === true;
    if (isFeatured) featured++;
    const image = e.image ? safeFilename(e.image, 'Event image') : '';
    const out: Record<string, unknown> = {
      id,
      title: str(e.title, 'Event title', 100, true),
      category: tags[0] ?? 'Events',
      tags,
      date,
      time: str(e.time, 'Event time', 40),
      location: str(e.location, 'Event location', 120, true),
      featured: isFeatured,
      image,
      imageAlt: str(e.imageAlt, 'Event image description', 200),
      description: str(e.description, 'Event description', 1200),
    };
    const linkUrl = url(obj(e.link ?? {}, 'link').url, 'Event link');
    if (linkUrl) out.link = { label: str(e.link.label, 'Event link label', 60) || 'More information', url: linkUrl };
    return out;
  });
  if (featured > 1) fail('Only one event can be featured');
  return out;
}

export function validateGallery(input: unknown) {
  const seen = new Set<string>();
  return arr(input, 'Gallery', 300).map((x, i) => {
    const g = obj(x, `Photo ${i + 1}`);
    const id = key(g.id, 'Photo id');
    if (seen.has(id)) fail('Duplicate photo id');
    seen.add(id);
    const category = str(g.category, 'Category', 30, true);
    if (!GALLERY_CATEGORIES.includes(category)) fail('Gallery category is invalid');
    const file = g.file ? safeFilename(g.file, 'Photo file') : '';
    const alt = str(g.alt, 'Photo description', 200, !!file);
    const ratio = /^\d{1,2}\/\d{1,2}$/.test(g.ratio ?? '') ? g.ratio : '4/5';
    const out: Record<string, string> = { id, category, file, alt, ratio };
    const credit = str(g.credit, 'Photo credit', 120);
    if (credit) out.credit = credit;
    return out;
  });
}

const MAX_BYTES = 6 * 1024 * 1024;
export function validateUploads(input: unknown) {
  const list = arr(input ?? [], 'Uploads', 20);
  return list.map((u) => {
    const o = obj(u, 'Upload');
    const folder = str(o.folder, 'Folder', 10, true) as Folder;
    if (!IMAGE_FOLDERS.includes(folder)) fail('Upload folder is invalid');
    const filename = safeFilename(o.filename);
    const b64 = str(o.base64, 'Image data', 9_000_000, true);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) fail('Image data is invalid');
    if ((b64.length * 3) / 4 > MAX_BYTES) fail(`${filename} is too large (max 6 MB)`);
    const head = atob(b64.slice(0, 16));
    const jpeg = head.startsWith('\xff\xd8\xff');
    const png = head.startsWith('\x89PNG');
    const webp = head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP';
    if (!jpeg && !png && !webp) fail(`${filename} is not a valid image`);
    return { folder, filename, base64: b64 };
  });
}
export function validateDeletes(input: unknown) {
  return arr(input ?? [], 'Deletes', 200).map((d) => {
    const o = obj(d, 'Delete');
    const folder = str(o.folder, 'Folder', 10, true) as Folder;
    if (!IMAGE_FOLDERS.includes(folder)) fail('Delete folder is invalid');
    return { folder, filename: safeFilename(o.filename) };
  });
}
