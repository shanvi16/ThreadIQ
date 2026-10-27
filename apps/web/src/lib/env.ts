const trimSlash = (url: string) => url.replace(/\/+$/, '');

/** Browser-facing base URLs of the two backend services (set at build/dev time via Vite env vars). */
export const env = {
  catalogUrl: trimSlash(import.meta.env.VITE_CATALOG_API_URL || 'http://localhost:3001'),
  insightsUrl: trimSlash(import.meta.env.VITE_INSIGHTS_API_URL || 'http://localhost:3002'),
};
