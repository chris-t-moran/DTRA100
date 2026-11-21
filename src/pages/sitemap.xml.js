import { loadSiteData } from '../lib/data.js';

export async function GET({ site }) {
  const { articles, slugs } = await loadSiteData();
  const urls = [
    { loc: new URL('/', site).href },
    { loc: new URL('/stories/', site).href },
    ...articles.map(a => ({
      loc: new URL(`/stories/${slugs.get(Number(a.id))}/`, site).href,
      lastmod: (a.updated_at || a.inserted_at || '').slice(0, 10)
    }))
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
}
