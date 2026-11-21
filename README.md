# Porterstown Panthers website

Static site built with [Astro](https://astro.build), deployed on Cloudflare Pages from this repo.
No server, CMS or database. All editable content is in `src/data/*.json`, edited through GitHub.

## Cloudflare Pages setup

1. Cloudflare dashboard > Workers & Pages > Create > Pages > Connect to Git > select this repo.
2. Production branch: `main` (merge the working branch first).
3. Framework preset: **Astro**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Environment variable `NODE_VERSION` = `22`
4. Environment variable `SITE_URL` = the final site URL, e.g. `https://porterstownpanthers.ie`
   (no trailing slash). Used for canonical links, sitemap, robots.txt and social previews.
   Until set, it falls back to `https://porterstown-panthers.pages.dev`, so set it once the domain is known.
5. Every push to `main` redeploys. Other branches get preview URLs.

## Editing content (GitHub web editor works fine)

### Switch season: `src/data/site.json`
Change `"activeSeason": "winter"` to `"summer"`. There is no automatic date switching.
The training and join pages and the homepage all update. The inactive season is shown on the
training page, clearly labelled as not current. Edit locations or times under `seasons.*.sessions`.

### Events: `src/data/events.json`
Add an object (copy the existing one). `date` is `YYYY-MM-DD`. `tags` control the filters
(`Upcoming events`, `Group hikes`, `Running events`, `Social gatherings`, `Annual events`).
Events whose date has passed move to the Past events archive automatically. Only one event
should have `"featured": true`. Optional `image` is a filename in `src/assets/events/`.
Leave out details that are not confirmed.

### Photos
- Gallery: put images in `src/assets/gallery/`, then in `src/data/gallery.json` set `file`
  (the filename), `alt` text, `category` and `credit` (photographer or source). Add or remove entries freely.
  Images are resized and optimised at build time.
- Homepage hero: put one image in `src/assets/hero/`. Without one, a typographic hero is used.
- Event promo image: `src/assets/events/` and reference it in `events.json`.
- Only add photos the club owns or has permission to use.
- Official logo: see the note in `src/components/Logo.astro` (current mark is a placeholder).

### Other settings
Phone, social links, distances and training types are in `src/data/site.json`.
**Check the Facebook link** there: it currently points to a Facebook search because the exact page URL was not verified.

## Admin page (`/admin`)

A password-protected page for the committee to change training times and places, switch season,
manage events, upload or remove photos and edit contact details, with no code or GitHub needed.
**Publish changes** commits straight to this repo (one commit per publish), and Cloudflare
rebuilds the site, so changes go live in about a minute.

It runs as a Cloudflare Pages Function (`functions/api/admin/[[route]].ts`). Set these in
Cloudflare Pages > Settings > Variables and Secrets (Production), as **encrypted secrets**, then redeploy:

| Name | Value |
| --- | --- |
| `ADMIN_PASSWORD` | A long password (a few random words). Share only with the committee. |
| `GITHUB_TOKEN` | GitHub fine-grained personal access token: GitHub > Settings > Developer settings > Fine-grained tokens. Repository access: **only this repo**. Permission: **Contents: Read and write**. Nothing else. |
| `GITHUB_BRANCH` | Optional. Branch the admin saves to; must be the branch Cloudflare deploys. Defaults to `main`. |
| `SESSION_SECRET` | Optional. Random string used to sign login cookies. Defaults to a value derived from the password. |

Notes:
- Until both `ADMIN_PASSWORD` and `GITHUB_TOKEN` exist, `/admin` shows "not configured". The page itself holds no data; everything is behind the login.
- Logins last 12 hours. To lock everyone out, change `ADMIN_PASSWORD`. To revoke repo access, delete the token on GitHub.
- If two people edit at once, the second publish is refused and asked to reload, so nobody's changes are silently overwritten.
- Add a Cloudflare rate-limiting rule for `/api/admin/login` (Security > WAF) for extra protection against password guessing.
- Photos are resized to 2200 px in the browser before upload. Every publish is a normal Git commit, so any change can be reverted on GitHub.
- The files in `src/data/` can still be edited directly on GitHub; the admin page and manual edits both work.

## Development
```
npm install
npm run dev      # local dev server
npm run build    # production build to dist/
npm run preview  # serve the build
```
