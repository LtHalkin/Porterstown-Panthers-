import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Set SITE_URL in Cloudflare Pages (Settings > Environment variables) once the
// final domain is known. It is used for canonical URLs, the sitemap and OG tags.
const site = process.env.SITE_URL || 'https://porterstown-panthers.pages.dev';

export default defineConfig({
  site,
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [sitemap()],
  image: { layout: 'constrained' },
});
