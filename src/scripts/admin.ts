/* Club admin UI. Talks only to /api/admin/*. All changes are staged locally and published as one commit. */
type Any = any;
const app = document.getElementById('app')!;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'photo';
const CATS = ['Club Runs', 'Group Hikes', 'Races', 'Social Events', 'Club Activities'];
const TAGS = ['Group hikes', 'Running events', 'Social gatherings', 'Annual events'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

let data: Any, orig: Any, shas: Any, images: Any;
let uploads: { folder: string; filename: string; base64: string; url: string }[] = [];
let deletes: { folder: string; filename: string }[] = [];
let tab = 'training';
let message: { kind: 'ok' | 'err'; text: string } | null = null;
let busy = false;

async function api(path: string, body?: unknown) {
  const res = await fetch('/api/admin/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Requested-With': 'pp-admin' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(j.error || `Error ${res.status}`), { status: res.status });
  return j;
}

function dirtyKeys() { return ['site', 'events', 'gallery'].filter((k) => JSON.stringify(data[k]) !== orig[k]); }
const pendingCount = () => dirtyKeys().length + uploads.length + deletes.length;

/* ---------- screens ---------- */
function loginScreen(err = '') {
  app.innerHTML = `<form class="a-login a-card" id="login">
    <h1>Club admin</h1><p class="a-help">Porterstown Panthers. Members of the committee only.</p>
    ${err ? `<div class="a-msg err" role="alert">${esc(err)}</div>` : ''}
    <label>Password<input type="password" name="pw" autocomplete="current-password" required autofocus></label>
    <button class="a-btn neon" type="submit">Log in</button></form>`;
  document.getElementById('login')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = (e.target as HTMLFormElement).pw.value;
    try { await api('login', { password: pw }); await load(); } catch (x: Any) { loginScreen(x.message); }
  });
}

async function load() {
  try {
    const c = await api('content');
    data = { site: c.site, events: c.events, gallery: c.gallery };
    orig = { site: JSON.stringify(c.site), events: JSON.stringify(c.events), gallery: JSON.stringify(c.gallery) };
    shas = c.shas; images = c.images; uploads = []; deletes = [];
    render();
  } catch (x: Any) {
    if (x.status === 401) loginScreen(); else app.innerHTML = `<div class="a-wrap"><div class="a-msg err">${esc(x.message)}</div></div>`;
  }
}

function render() {
  const panel = { training, events, gallery, details }[tab as 'training']();
  app.innerHTML = `<div class="a-top"><b>Panthers <span>Admin</span></b><span><a href="/" style="color:#fff;margin-right:1rem" target="_blank" rel="noopener">View site</a><button class="a-btn ghost" style="color:#fff;border-color:#555;padding:.5rem .8rem" data-act="logout">Log out</button></span></div>
  <div class="a-wrap">
    <div class="a-tabs" role="tablist">${[['training', 'Training'], ['events', 'Events'], ['gallery', 'Photos'], ['details', 'Club details']].map(([k, l]) => `<button class="a-tab" role="tab" aria-selected="${tab === k}" data-act="tab" data-v="${k}">${l}</button>`).join('')}</div>
    ${message ? `<div class="a-msg ${message.kind}" role="${message.kind === 'err' ? 'alert' : 'status'}">${esc(message.text)}</div>` : ''}
    ${panel}
  </div>
  <div class="a-bar"><span id="pending"></span><button class="a-btn neon" data-act="publish" ${busy ? 'disabled' : ''}>${busy ? 'Publishing…' : 'Publish changes'}</button></div>`;
  updateBar();
}
function updateBar() {
  const n = pendingCount();
  const el = document.getElementById('pending');
  if (el) el.textContent = n ? `${n} unpublished change${n === 1 ? '' : 's'}` : 'No unpublished changes';
}

/* ---------- panels ---------- */
function training() {
  const s = data.site;
  const locOpts = (sel: string) => Object.entries(s.locations).map(([k, l]: Any) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
  return `
  <div class="a-card"><h2>Current season</h2>
    <p class="a-help">This decides which meeting points visitors see as current. The site never switches by date, so change it here when the club changes. The other season is still shown on the Training page, clearly labelled as not current.</p>
    <div class="a-season">${Object.entries(s.seasons).map(([k, se]: Any) => `<button type="button" data-act="season" data-v="${k}" aria-pressed="${s.activeSeason === k}"><b>${esc(se.label)}</b>${s.activeSeason === k ? 'Showing now' : 'Tap to make current'}</button>`).join('')}</div>
  </div>
  ${Object.entries(s.seasons).map(([k, se]: Any) => `
  <div class="a-card"><h2>${esc(se.label)} sessions</h2>
    <label>Note shown on the training page (optional)<textarea data-b="site.seasons.${k}.note">${esc(se.note)}</textarea></label>
    ${se.sessions.map((x: Any, i: number) => `<div class="a-row a-grid sess">
      <label>Day<select data-b="site.seasons.${k}.sessions.${i}.day">${DAYS.map((d) => `<option ${d === x.day ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label>Time<input type="text" data-b="site.seasons.${k}.sessions.${i}.time" value="${esc(x.time)}" placeholder="6:45 PM"></label>
      <label>Meeting point<select data-b="site.seasons.${k}.sessions.${i}.location">${locOpts(x.location)}</select></label>
      <label>What happens<input type="text" data-b="site.seasons.${k}.sessions.${i}.what" value="${esc(x.what)}"></label>
      <button class="a-btn danger" type="button" data-act="rm-session" data-k="${k}" data-i="${i}" aria-label="Remove session">Remove</button></div>`).join('')}
    <p><button class="a-btn" type="button" data-act="add-session" data-k="${k}" style="margin-top:1rem">Add a session</button></p>
  </div>`).join('')}
  <div class="a-card"><h2>Meeting points</h2>
    <p class="a-help">“Map search text” is what gets searched on Google Maps for the map and directions button. Type it as you would in the Maps app.</p>
    ${Object.entries(s.locations).map(([k, l]: Any) => `<div class="a-row a-grid c2">
      <label>Name<input type="text" data-b="site.locations.${k}.name" value="${esc(l.name)}"></label>
      <label>Area<input type="text" data-b="site.locations.${k}.area" value="${esc(l.area)}"></label>
      <label style="grid-column:1/-1">Map search text<input type="text" data-b="site.locations.${k}.mapQuery" value="${esc(l.mapQuery)}"></label></div>`).join('')}
    <p><button class="a-btn" type="button" data-act="add-location" style="margin-top:1rem">Add a meeting point</button></p>
  </div>`;
}

function events() {
  const list = data.events.map((e: Any, i: number) => ({ e, i })).sort((a: Any, b: Any) => a.e.date.localeCompare(b.e.date));
  return `<div class="a-card"><h2>Events</h2>
    <p class="a-help">Events move to the archive on their own once the date has passed. Only fill in details that are confirmed; leave the rest blank.</p>
    <button class="a-btn neon" type="button" data-act="add-event">Add an event</button></div>
  ${list.map(({ e, i }: Any) => `<details class="a-card" ${e._open || !e.title ? 'open' : ''}><summary>${esc(e.title || 'New event')} <small style="font:400 .9rem var(--font-body);text-transform:none">${esc(e.date)}</small></summary>
    <div class="a-grid c2" style="margin-top:1rem">
      <label>Title<input type="text" data-b="events.${i}.title" value="${esc(e.title)}"></label>
      <label>Date<input type="date" data-b="events.${i}.date" value="${esc(e.date)}"></label>
      <label>Time (optional)<input type="text" data-b="events.${i}.time" value="${esc(e.time)}" placeholder="e.g. 10:00 AM"></label>
      <label>Location<input type="text" data-b="events.${i}.location" value="${esc(e.location)}"></label>
      <label style="grid-column:1/-1">Description<textarea data-b="events.${i}.description">${esc(e.description)}</textarea></label>
      <label>More info link (https://…)<input type="url" data-b="events.${i}.link.url" value="${esc(e.link?.url)}"></label>
      <label>Link button text<input type="text" data-b="events.${i}.link.label" value="${esc(e.link?.label)}" placeholder="More information"></label>
    </div>
    <p style="margin:1rem 0 .4rem;font-weight:700;font-size:.8rem">Categories</p>
    <div class="a-checks">${TAGS.map((t) => `<label><input type="checkbox" data-tag="${i}" value="${t}" ${e.tags.includes(t) ? 'checked' : ''}>${t}</label>`).join('')}</div>
    <div class="a-checks" style="margin-top:.75rem"><label><input type="checkbox" data-feat="${i}" ${e.featured ? 'checked' : ''}>Feature this event at the top of the Events page</label></div>
    <div class="a-row"><p style="font-weight:700;font-size:.8rem;margin:0 0 .5rem">Event photo / promo image</p>
      ${e.image ? `<img src="${imgSrc('events', e.image)}" alt="" style="max-width:14rem;margin-bottom:.5rem">` : '<p class="a-help">No image yet.</p>'}
      <input type="file" accept="image/*" data-event-img="${i}">
      ${e.image ? `<button class="a-btn ghost" type="button" data-act="rm-event-img" data-i="${i}" style="margin-top:.5rem">Remove image</button>` : ''}
      <label style="margin-top:.75rem">Image description (for screen readers)<input type="text" data-b="events.${i}.imageAlt" value="${esc(e.imageAlt)}"></label></div>
    <p style="margin-top:1rem"><button class="a-btn danger" type="button" data-act="rm-event" data-i="${i}">Delete event</button></p>
  </details>`).join('')}`;
}

function imgSrc(folder: string, file: string) {
  const u = uploads.find((x) => x.folder === folder && x.filename === file);
  return u ? u.url : `/api/admin/image?folder=${folder}&file=${encodeURIComponent(file)}`;
}
function heroFiles() {
  return [...images.hero.filter((f: string) => !deletes.some((d) => d.folder === 'hero' && d.filename === f)), ...uploads.filter((u) => u.folder === 'hero').map((u) => u.filename)];
}

function gallery() {
  const hero = heroFiles()[0];
  return `<div class="a-card"><h2>Homepage hero photo</h2>
    <p class="a-help">The large photo at the top of the homepage. Without one, a text-based design is used. Landscape photos of runners work best.</p>
    ${hero ? `<img src="${imgSrc('hero', hero)}" alt="" style="max-width:20rem;margin-bottom:.75rem">` : ''}
    <input type="file" accept="image/*" data-hero>
    ${hero ? `<p><button class="a-btn ghost" type="button" data-act="rm-hero" style="margin-top:.5rem">Remove hero photo</button></p>` : ''}
  </div>
  <div class="a-card"><h2>Add gallery photos</h2>
    <p class="a-help">Only upload photos the club took or has permission to use. Give each photo a short description and, where needed, a credit. Photos are resized automatically.</p>
    <div class="a-grid c2"><label>Category for these photos<select id="up-cat">${CATS.map((c) => `<option>${c}</option>`).join('')}</select></label>
    <label>Choose photos<input type="file" accept="image/*" multiple data-gallery-up></label></div>
  </div>
  <div class="a-card"><h2>Gallery (${data.gallery.length})</h2>
    ${data.gallery.some((g: Any) => !g.file) ? `<p><button class="a-btn ghost" type="button" data-act="rm-placeholders">Remove all “Photo to be added” placeholders</button></p>` : ''}
    <div class="a-photos">${data.gallery.map((g: Any, i: number) => `<div class="a-photo">
      ${g.file ? `<img loading="lazy" src="${imgSrc('gallery', g.file)}" alt="">` : '<div class="a-ph">Placeholder (no photo yet)</div>'}
      <label>Category<select data-b="gallery.${i}.category">${CATS.map((c) => `<option ${c === g.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label>Description (required)<input type="text" data-b="gallery.${i}.alt" value="${esc(g.alt)}"></label>
      <label>Credit / permission (optional)<input type="text" data-b="gallery.${i}.credit" value="${esc(g.credit)}" placeholder="Photo: name"></label>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap"><button class="a-btn ghost" type="button" data-act="mv" data-i="${i}" data-d="-1" aria-label="Move earlier">Up</button><button class="a-btn ghost" type="button" data-act="mv" data-i="${i}" data-d="1" aria-label="Move later">Down</button><button class="a-btn danger" type="button" data-act="rm-photo" data-i="${i}">Delete</button></div>
    </div>`).join('')}</div></div>`;
}

function details() {
  const s = data.site;
  return `<div class="a-card"><h2>Contact and social</h2><div class="a-grid c2">
    <label>Phone (as shown)<input type="text" data-b="site.phone.display" value="${esc(s.phone.display)}"></label>
    <label>Phone (for tap-to-call, e.g. +353872182461)<input type="text" data-b="site.phone.href" value="${esc(s.phone.href)}"></label>
    <label>Instagram handle<input type="text" data-b="site.instagram.handle" value="${esc(s.instagram.handle)}"></label>
    <label>Instagram link<input type="url" data-b="site.instagram.url" value="${esc(s.instagram.url)}"></label>
    <label>Facebook page name<input type="text" data-b="site.facebook.name" value="${esc(s.facebook.name)}"></label>
    <label>Facebook page link<input type="url" data-b="site.facebook.url" value="${esc(s.facebook.url)}"></label></div></div>
  <div class="a-card"><h2>Running distances</h2><label>Separate with commas<input type="text" data-list="site.distances" value="${esc(s.distances.join(', '))}"></label></div>`;
}

/* ---------- helpers ---------- */
function getPath(path: string) { return path.split('.').reduce((o: Any, k) => (o == null ? o : o[k]), data); }
function setPath(path: string, v: unknown) {
  const ks = path.split('.'); const last = ks.pop()!;
  let o: Any = data;
  for (const k of ks) { if (o[k] == null) o[k] = {}; o = o[k]; }
  o[last] = v;
}
async function toJpeg(file: File): Promise<{ base64: string; url: string }> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as Any);
  const scale = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.86));
  const base64 = await new Promise<string>((r) => { const fr = new FileReader(); fr.onload = () => r((fr.result as string).split(',')[1]); fr.readAsDataURL(blob); });
  return { base64, url: URL.createObjectURL(blob) };
}
async function addUpload(folder: string, file: File) {
  const { base64, url } = await toJpeg(file);
  const filename = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}-${slug(file.name.replace(/\.[^.]+$/, ''))}.jpg`;
  uploads.push({ folder, filename, base64, url });
  return filename;
}
function removeImage(folder: string, filename: string) {
  const u = uploads.findIndex((x) => x.folder === folder && x.filename === filename);
  if (u >= 0) uploads.splice(u, 1);
  else if (images[folder].includes(filename) && !deletes.some((d) => d.folder === folder && d.filename === filename)) deletes.push({ folder, filename });
}
const uid = (p: string, taken: string[]) => { let id = p, n = 2; while (taken.includes(id)) id = `${p}-${n++}`; return id; };
function say(kind: 'ok' | 'err', text: string) { message = { kind, text }; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

/* ---------- events (delegated) ---------- */
app.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.dataset.b) { setPath(t.dataset.b, t.value); updateBar(); }
  else if (t.dataset.list) { setPath(t.dataset.list, t.value.split(',').map((x) => x.trim()).filter(Boolean)); updateBar(); }
});
app.addEventListener('change', async (e) => {
  const t = e.target as HTMLInputElement;
  if (t.dataset.b && t.tagName === 'SELECT') { setPath(t.dataset.b, t.value); updateBar(); }
  if (t.dataset.tag !== undefined) {
    const ev = data.events[+t.dataset.tag];
    ev.tags = TAGS.filter((x) => (x === t.value ? t.checked : ev.tags.includes(x)));
    updateBar();
  }
  if (t.dataset.feat !== undefined) {
    data.events.forEach((x: Any, i: number) => (x.featured = i === +t.dataset.feat! ? t.checked : false));
    render();
  }
  if (t.type === 'file' && t.files?.length) {
    try {
      if (t.dataset.galleryUp !== undefined) {
        const cat = (document.getElementById('up-cat') as HTMLSelectElement).value;
        for (const f of [...t.files]) {
          const filename = await addUpload('gallery', f);
          data.gallery.unshift({ id: uid('photo-' + Date.now().toString(36), data.gallery.map((g: Any) => g.id)), category: cat, file: filename, alt: '', credit: '', ratio: '4/5' });
        }
        say('ok', 'Photos added. Add a description to each one, then publish.');
      } else if (t.dataset.hero !== undefined) {
        heroFiles().forEach((f) => removeImage('hero', f));
        await addUpload('hero', t.files[0]); render();
      } else if (t.dataset.eventImg !== undefined) {
        const ev = data.events[+t.dataset.eventImg];
        if (ev.image) removeImage('events', ev.image);
        ev.image = await addUpload('events', t.files[0]); render();
      }
    } catch { say('err', 'That file could not be read as an image. Try a JPG or PNG.'); }
  }
});
app.addEventListener('click', async (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!b) return;
  const a = b.dataset.act, i = +(b.dataset.i ?? -1), k = b.dataset.k!;
  message = null;
  switch (a) {
    case 'tab': tab = b.dataset.v!; return render();
    case 'logout': await api('logout', {}); return loginScreen();
    case 'season': data.site.activeSeason = b.dataset.v; return render();
    case 'add-session': data.site.seasons[k].sessions.push({ day: 'Tuesday', time: '6:45 PM', location: Object.keys(data.site.locations)[0], what: '' }); return render();
    case 'rm-session': if (confirm('Remove this session?')) { data.site.seasons[k].sessions.splice(i, 1); render(); } return;
    case 'add-location': {
      const name = prompt('Name of the new meeting point?'); if (!name) return;
      data.site.locations[uid(slug(name).replace(/^[0-9]+/, 'p') || 'place', Object.keys(data.site.locations))] = { name, area: '', mapQuery: name };
      return render();
    }
    case 'add-event': {
      data.events.push({ id: uid('event-' + Date.now().toString(36), data.events.map((x: Any) => x.id)), title: '', category: 'Events', tags: [], date: new Date().toISOString().slice(0, 10), time: '', location: '', featured: false, image: '', imageAlt: '', description: '', link: { label: '', url: '' } });
      return render();
    }
    case 'rm-event': if (confirm('Delete this event?')) { const ev = data.events[i]; if (ev.image) removeImage('events', ev.image); data.events.splice(i, 1); render(); } return;
    case 'rm-event-img': removeImage('events', data.events[i].image); data.events[i].image = ''; return render();
    case 'rm-hero': heroFiles().forEach((f) => removeImage('hero', f)); return render();
    case 'rm-photo': if (confirm('Delete this photo from the gallery?')) { const g = data.gallery[i]; if (g.file) removeImage('gallery', g.file); data.gallery.splice(i, 1); render(); } return;
    case 'rm-placeholders': data.gallery = data.gallery.filter((g: Any) => g.file); return render();
    case 'mv': { const j = i + +b.dataset.d!; if (j < 0 || j >= data.gallery.length) return; [data.gallery[i], data.gallery[j]] = [data.gallery[j], data.gallery[i]]; return render(); }
    case 'publish': return publish();
  }
});

async function publish() {
  if (!pendingCount()) return say('ok', 'Nothing to publish yet.');
  for (const g of data.gallery) if (g.file && !g.alt.trim()) { tab = 'gallery'; return say('err', 'Every photo needs a short description before publishing.'); }
  for (const ev of data.events) if (!ev.title.trim() || !ev.location.trim() || !ev.date) { tab = 'events'; return say('err', 'Each event needs a title, date and location.'); }
  const json: Any = {};
  for (const k of dirtyKeys()) json[k] = k === 'events' ? data.events.map((e: Any) => ({ ...e, link: e.link?.url ? e.link : undefined })) : data[k];
  busy = true; render();
  try {
    await api('commit', { json, shas, uploads: uploads.map(({ folder, filename, base64 }) => ({ folder, filename, base64 })), deletes });
    busy = false;
    await load();
    say('ok', 'Published. The live site updates in about a minute.');
  } catch (x: Any) {
    busy = false;
    if (x.status === 401) return loginScreen('Your session expired. Log in again (your edits on this page are lost).');
    say('err', x.message);
  }
}

addEventListener('beforeunload', (e) => { if (data && pendingCount()) e.preventDefault(); });
load();
