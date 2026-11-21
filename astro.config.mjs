import { defineConfig } from 'astro/config';

// Static site: Netlify runs `astro build` and publishes dist/.
// Story pages are generated from Supabase at build time; the map and 1929 view
// (public/main.js) still load live data in the browser, exactly as before.
export default defineConfig({
  site: 'https://triangle100.ie',
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory' }
});
