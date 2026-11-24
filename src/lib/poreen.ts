// Poreen runs live in their own small Cloudflare Worker + database (github.com/LtHalkin/Poreen).
// The page reads and writes them through its API. PUBLIC_POREEN_API overrides it (e.g. a local worker).
export const POREEN_API: string = import.meta.env.PUBLIC_POREEN_API || 'https://poreen.cianop101.workers.dev';
