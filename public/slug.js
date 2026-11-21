// Story page addresses: /stories/<slug>/. Shared by the build (Astro) and the map (main.js),
// so both always agree on a story's link.
export function slugify(text) {
  return String(text || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')   // Róisín → Roisin
    .toLowerCase()
    .replace(/['’‘`]/g, '')                               // O'Daly → odaly
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'story';
}

// Gives every published story a unique slug. If two titles match, the later one
// (by id) gets its id added, e.g. "the-gallaghers-11".
export function slugMap(articles) {
  const map = new Map();
  const used = new Set();
  [...articles].sort((a, b) => Number(a.id) - Number(b.id)).forEach(a => {
    let s = slugify(a.title);
    if (used.has(s)) s = `${s}-${a.id}`;
    used.add(s);
    map.set(Number(a.id), s);
  });
  return map;
}
