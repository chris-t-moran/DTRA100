// Build-time data from Supabase (the same public, read-only access the map uses).
// If Supabase can't be reached the build fails, so a broken or empty site is never published.
import { readFileSync } from 'node:fs';
import { CONFIG } from '../../public/config.js';
import { slugMap } from '../../public/slug.js';

const ARTICLE_COLS = 'id,title,short_desc,description,theme,img,contributor,inserted_at,updated_at,resident_id';
const RESIDENT_COLS = 'id,housenumber,road,lessee,occupation,consideration,formeraddress,census1926_url';

async function rest(path) {
  const res = await fetch(`${CONFIG.supabase.url}/rest/v1/${path}`, {
    headers: { apikey: CONFIG.supabase.key, Authorization: `Bearer ${CONFIG.supabase.key}` }
  });
  if (!res.ok) throw new Error(`Supabase ${path.split('?')[0]}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

let cache = null;

// Returns { articles, residents, slugs, byId }: published stories only, oldest first.
export async function loadSiteData() {
  if (cache) return cache;
  let articles, residents;
  if (process.env.T100_FIXTURE) {
    // Local testing without network access: a JSON file with { articles, residents }
    ({ articles, residents } = JSON.parse(readFileSync(process.env.T100_FIXTURE, 'utf8')));
  } else {
    [articles, residents] = await Promise.all([
      rest(`articles?select=${ARTICLE_COLS}&active=eq.true&order=id.asc`),
      rest(`residents?select=${RESIDENT_COLS}`)
    ]);
  }
  if (!articles.length) throw new Error('No published stories returned from Supabase; refusing to build an empty site.');
  const slugs = slugMap(articles);
  const residentsById = new Map(residents.map(r => [Number(r.id), r]));
  cache = { articles, residents, slugs, residentsById };
  return cache;
}

export const ROAD_DISPLAY = { "O'Neachtain": "O'Neachtain Road", 'Coymn Place': 'Comyn Place' };
export const roadName = (r) => ROAD_DISPLAY[r] || r || '';
// Matches the ?house= links made by history-features.js
export const houseParam = (r) =>
  `${roadName(r.road).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${r.housenumber}`;

export const LOGO = 'https://vqkoapgiozhytoqscxxx.supabase.co/storage/v1/object/public/icons/T100_icon/T100_transparent_cropped_logo.PNG';
