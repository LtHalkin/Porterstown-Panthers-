import type { ImageMetadata } from 'astro';

// Anything dropped in src/assets/** is picked up automatically and optimised at build time.
const all = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/**/*.{jpg,jpeg,png,webp,avif}',
  { eager: true },
);

export function findImage(folder: string, file?: string): ImageMetadata | undefined {
  if (!file) return undefined;
  return all[`/src/assets/${folder}/${file}`]?.default;
}

export function firstImage(folder: string): ImageMetadata | undefined {
  const key = Object.keys(all).sort().find((k) => k.startsWith(`/src/assets/${folder}/`));
  return key ? all[key].default : undefined;
}
