import { GitHub, type Env } from '../../../src/server/github.ts';
import {
  ValidationError, validateSite, validateEvents, validateGallery, validateUploads, validateDeletes, IMAGE_FOLDERS,
} from '../../../src/server/validate.ts';

const COOKIE = 'pp_admin';
const SESSION_HOURS = 12;
const FILES = { site: 'src/data/site.json', events: 'src/data/events.json', gallery: 'src/data/gallery.json' } as const;
const enc = new TextEncoder();

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};
const secretOf = (env: Env) => (env.SESSION_SECRET || env.ADMIN_PASSWORD + ':session') as string;

async function isAuthed(req: Request, env: Env) {
  const m = (req.headers.get('Cookie') || '').match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, sig] = decodeURIComponent(m[1]).split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(secretOf(env), `session:${exp}`));
}

export const onRequest = async ({ request, env, params }: { request: Request; env: Env; params: { route?: string | string[] } }) => {
  const route = ([] as string[]).concat(params.route ?? []).join('/');
  const url = new URL(request.url);
  try {
    if (!env.ADMIN_PASSWORD || !env.GITHUB_TOKEN) {
      return json({ error: 'Admin is not configured yet. Add ADMIN_PASSWORD and GITHUB_TOKEN in Cloudflare Pages settings.' }, 503);
    }
    if (request.method === 'POST') {
      // CSRF defence on top of SameSite=Strict: custom header + same-origin check.
      const origin = request.headers.get('Origin');
      if (request.headers.get('X-Requested-With') !== 'pp-admin' || (origin && origin !== url.origin)) return json({ error: 'Forbidden' }, 403);
    }

    if (route === 'login' && request.method === 'POST') {
      const body: any = await request.json().catch(() => ({}));
      const given = typeof body.password === 'string' ? body.password : '';
      const ok = safeEqual(await hmac(secretOf(env), `pw:${given}`), await hmac(secretOf(env), `pw:${env.ADMIN_PASSWORD}`));
      if (!ok) { await new Promise((r) => setTimeout(r, 800)); return json({ error: 'Incorrect password' }, 401); }
      const exp = Date.now() + SESSION_HOURS * 3600_000;
      const token = `${exp}.${await hmac(secretOf(env), `session:${exp}`)}`;
      const secure = url.protocol === 'https:' ? '; Secure' : '';
      return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}${secure}` });
    }
    if (route === 'logout' && request.method === 'POST') {
      return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` });
    }
    if (route === 'session' && request.method === 'GET') return json({ authed: await isAuthed(request, env) });

    if (!(await isAuthed(request, env))) return json({ error: 'Please log in' }, 401);
    const gh = new GitHub(env);

    if (route === 'content' && request.method === 'GET') {
      const head = await gh.head();
      const tree = await gh.tree(head.tree);
      const data: Record<string, unknown> = {};
      const shas: Record<string, string> = {};
      for (const [k, path] of Object.entries(FILES)) {
        const sha = tree.get(path);
        if (!sha) throw new Error(`${path} not found on branch ${gh.branch}`);
        shas[k] = sha;
        data[k] = JSON.parse(await gh.readText(sha));
      }
      const images: Record<string, string[]> = { gallery: [], events: [], hero: [] };
      for (const p of tree.keys()) {
        const m = p.match(/^src\/assets\/(gallery|events|hero)\/([^/]+\.(?:jpe?g|png|webp))$/);
        if (m) images[m[1]].push(m[2]);
      }
      return json({ ...data, shas, images, branch: gh.branch });
    }

    if (route === 'image' && request.method === 'GET') {
      const folder = url.searchParams.get('folder') || '';
      const file = url.searchParams.get('file') || '';
      if (!(IMAGE_FOLDERS as readonly string[]).includes(folder) || !/^[a-z0-9][a-z0-9._-]*\.(jpe?g|png|webp)$/.test(file)) return json({ error: 'Bad request' }, 400);
      const head = await gh.head();
      const sha = (await gh.tree(head.tree)).get(`src/assets/${folder}/${file}`);
      if (!sha) return json({ error: 'Not found' }, 404);
      const b = await gh.blob(sha);
      const bytes = Uint8Array.from(atob(b.content.replace(/\n/g, '')), (c) => c.charCodeAt(0));
      const type = file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
      return new Response(bytes, { headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
    }

    if (route === 'commit' && request.method === 'POST') {
      const body: any = await request.json().catch(() => null);
      if (!body || typeof body !== 'object') return json({ error: 'Invalid request' }, 400);
      const changes: { path: string; text?: string; base64?: string; remove?: boolean }[] = [];
      const touched: string[] = [];
      for (const [k, validate] of [['site', validateSite], ['events', validateEvents], ['gallery', validateGallery]] as const) {
        if (body.json?.[k] !== undefined) {
          changes.push({ path: FILES[k], text: JSON.stringify((validate as (x: unknown) => unknown)(body.json[k]), null, 2) + '\n' });
          touched.push(k);
        }
      }
      for (const u of validateUploads(body.uploads)) changes.push({ path: `src/assets/${u.folder}/${u.filename}`, base64: u.base64 });
      const head = await gh.head();
      const tree = await gh.tree(head.tree);
      for (const d of validateDeletes(body.deletes)) {
        const path = `src/assets/${d.folder}/${d.filename}`;
        if (tree.has(path)) changes.push({ path, remove: true });
      }
      if (!changes.length) return json({ error: 'Nothing to publish' }, 400);
      // Optimistic concurrency: refuse if someone else changed a data file since this page loaded.
      for (const k of touched) {
        if (body.shas?.[k] && tree.get(FILES[k as keyof typeof FILES]) !== body.shas[k]) {
          return json({ error: 'The content was changed somewhere else since you opened this page. Reload the page and re-apply your changes.' }, 409);
        }
      }
      const message = `Admin: update ${[...touched, ...(body.uploads?.length ? ['photos'] : [])].join(', ') || 'content'}`;
      const sha = await gh.commit(message, head, changes);
      return json({ ok: true, commit: sha });
    }

    return json({ error: 'Not found' }, 404);
  } catch (err) {
    if (err instanceof ValidationError) return json({ error: err.message }, 400);
    console.error(err);
    return json({ error: 'Something went wrong saving to GitHub. Check the GITHUB_TOKEN and try again.' }, 500);
  }
};
