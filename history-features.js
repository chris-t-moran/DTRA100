/**
 * Triangle100 – local history features built on the 1929 residents data
 *   • Who first lived in my house?  (lookup, map, share, print)
 *   • 1929 in numbers               (facts and figures about the first community)
 *
 * Everything is computed in the browser from the residents already loaded by main.js.
 */

// Display fixes for road names as stored in the data (data left untouched)
const ROAD_DISPLAY = {
  "O'Neachtain": "O'Neachtain Road",
  'Coymn Place': 'Comyn Place'
};

// Occupation values that describe a woman's status rather than a trade
const WOMEN_STATUS = /^(married woman|widow|spinster|housewife|single woman)$/i;
const NOT_RECORDED = /^(unknown|n\/?a|none|-)?$/i;

let ctx = null; // { state, utils, a11y, openModal, showStoryForm, toggleResidents }

const roadName = (r) => ROAD_DISPLAY[r] || r || '';
const slug = (s) => roadName(s).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const money = (n) => (Number.isFinite(Number(n)) && Number(n) > 0) ? `£${Number(n).toLocaleString('en-IE')}` : null;
const esc = (s) => ctx.utils.escape(s);
const hasOccupation = (o) => o && !NOT_RECORDED.test(String(o).trim());

function residents() {
  return (ctx.state.residents || []).filter(r => r.road);
}

function roadsSorted() {
  const counts = new Map();
  residents().forEach(r => counts.set(r.road, (counts.get(r.road) || 0) + 1));
  return [...counts.keys()].sort((a, b) => roadName(a).localeCompare(roadName(b)));
}

function priceRange(list) {
  const p = list.map(r => Number(r.consideration)).filter(n => n > 0);
  return p.length ? [Math.min(...p), Math.max(...p)] : null;
}

// Distance in metres (good enough at this scale)
function metres(aLat, aLon, bLat, bLon) {
  const k = 111320, dLat = (aLat - bLat) * k, dLon = (aLon - bLon) * k * Math.cos(aLat * Math.PI / 180);
  return Math.hypot(dLat, dLon);
}

function storyForHouse(r) {
  let best = null, bestD = 25; // within 25 m of the house
  (ctx.state.articles || []).forEach(a => {
    if (!a.active || a.lat == null || a.lon == null) return;
    const d = metres(Number(a.lat), Number(a.lon), r.lat, r.lon);
    if (d < bestD) { best = a; bestD = d; }
  });
  return best;
}

// -----------------------------------------------------------------------------
// Shared dialog shell (matches the site's existing dialogs)
// -----------------------------------------------------------------------------
function openDialog(id, title, bodyHTML) {
  document.getElementById(id)?.remove();
  const dlg = document.createElement('dialog');
  dlg.id = id;
  dlg.className = 'hx-dialog';
  dlg.setAttribute('aria-labelledby', `${id}-title`);
  dlg.innerHTML = `
    <div class="hx-card">
      <header class="hx-header">
        <h2 id="${id}-title">${title}</h2>
        <button type="button" class="hx-close" aria-label="Close">×</button>
      </header>
      <div class="hx-body">${bodyHTML}</div>
    </div>`;
  document.body.appendChild(dlg);
  const close = () => { try { dlg.close(); } catch (e) {} };
  dlg.querySelector('.hx-close').addEventListener('click', close);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.addEventListener('close', () => setTimeout(() => dlg.remove(), 50));
  dlg.showModal();
  const cleanup = ctx.a11y?.trapFocus?.(dlg);
  if (cleanup) dlg.addEventListener('close', cleanup);
  return dlg;
}

// -----------------------------------------------------------------------------
// Who first lived in my house?
// -----------------------------------------------------------------------------
export function showHouseLookup(preset = {}) {
  const roads = roadsSorted();
  const options = roads.map(r =>
    `<option value="${esc(r)}"${r === preset.road ? ' selected' : ''}>${esc(roadName(r))}</option>`).join('');

  const dlg = openDialog('house-dialog', 'Who first lived in my house?', `
    <p class="hx-lede">The Drumcondra scheme's first families got their keys in 1929.
      Pick your road and house number to meet the people who first lived in your home.</p>
    <form class="hx-form" novalidate>
      <label>Road
        <select name="road" required>
          <option value="">Choose a road…</option>${options}
        </select>
      </label>
      <label>House number
        <input name="num" type="number" inputmode="numeric" min="1" max="999" required
               value="${preset.num ? esc(preset.num) : ''}" placeholder="e.g. 34">
      </label>
      <button type="submit" class="sf-btn sf-btn-primary">Find my house</button>
    </form>
    <div class="hx-result" aria-live="polite"></div>
  `);

  const form = dlg.querySelector('.hx-form');
  const out = dlg.querySelector('.hx-result');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const road = form.road.value;
    const num = parseInt(form.num.value, 10);
    if (!road || !num) {
      out.innerHTML = `<p class="hx-hint">Choose your road and type your house number.</p>`;
      (road ? form.num : form.road).focus();
      return;
    }
    renderHouse(out, road, num);
  });

  if (preset.road && preset.num) renderHouse(out, preset.road, Number(preset.num));
  else form.road.focus();
}

function renderHouse(out, road, num) {
  const onRoad = residents().filter(r => r.road === road);
  const found = onRoad.filter(r => Number(r.housenumber) === num);
  const addr = `${num} ${roadName(road)}`;

  if (!found.length) {
    const nums = onRoad.map(r => Number(r.housenumber)).filter(Boolean);
    const range = nums.length ? `numbers ${Math.min(...nums)} to ${Math.max(...nums)}` : 'this road';
    out.innerHTML = `
      <div class="hx-empty">
        <h3>We haven't found ${esc(addr)} yet</h3>
        <p>Volunteers have so far traced ${onRoad.length} of the first households on
          ${esc(roadName(road))} (${range}), and the research is still going.</p>
        <p><strong>Do you know who lived here?</strong> Old documents, family stories or photos all help.</p>
        <button type="button" class="sf-btn sf-btn-primary hx-share-story">Share what you know</button>
      </div>`;
    out.querySelector('.hx-share-story').addEventListener('click', () => {
      document.getElementById('house-dialog')?.close();
      ctx.showStoryForm();
    });
    return;
  }

  const range = priceRange(onRoad);
  const cards = found.map(r => {
    const occ = hasOccupation(r.occupation) ? r.occupation : null;
    const price = money(r.consideration);
    const story = storyForHouse(r);
    return `
      <article class="hx-house" data-id="${r.id}">
        <p class="hx-eyebrow">${esc(addr)} · first lessee, 1929</p>
        <h3 class="hx-name">${esc(r.lessee || 'Name not yet traced')}</h3>
        <dl class="hx-facts">
          ${occ ? `<div><dt>Occupation</dt><dd>${esc(occ)}</dd></div>` : ''}
          ${r.formeraddress ? `<div><dt>Moved from</dt><dd>${esc(r.formeraddress)}</dd></div>` : ''}
          ${price ? `<div><dt>Price paid</dt><dd>${price}${range && range[0] !== range[1]
              ? ` <span class="hx-muted">(houses on ${esc(roadName(road))} went for ${money(range[0])}–${money(range[1])})</span>` : ''}</dd></div>` : ''}
          ${r.MilitaryHistory ? `<div><dt>Note</dt><dd>A military history has been recorded for this household</dd></div>` : ''}
        </dl>
        ${story ? `<button type="button" class="hx-story-link" data-article="${story.id}">📖 Read the story: ${esc(story.title)}</button>` : ''}
      </article>`;
  }).join('');

  out.innerHTML = `
    ${found.length > 1 ? `<p class="hx-hint">The records show ${found.length} names for this house.</p>` : ''}
    ${cards}
    <div class="hx-actions">
      <button type="button" class="sf-btn sf-btn-primary" data-act="map">📍 Show on the 1929 map</button>
      <button type="button" class="sf-btn sf-btn-ghost" data-act="share">🔗 Share</button>
      <button type="button" class="sf-btn sf-btn-ghost" data-act="print">🖨️ Print a house card</button>
    </div>
    <p class="hx-small">Know more about the family? <a href="#" class="hx-share-story">Add to their story</a>.</p>`;

  out.querySelectorAll('.hx-story-link').forEach(b => b.addEventListener('click', () => {
    const a = ctx.state.articlesById.get(Number(b.dataset.article));
    document.getElementById('house-dialog')?.close();
    if (a) ctx.openModal(a);
  }));
  out.querySelector('.hx-share-story').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('house-dialog')?.close();
    ctx.showStoryForm();
  });
  out.querySelector('[data-act="map"]').addEventListener('click', () => showOnMap(found[0]));
  out.querySelector('[data-act="share"]').addEventListener('click', () => shareHouse(road, num, found[0]));
  out.querySelector('[data-act="print"]').addEventListener('click', () => printHouse(addr, found, range));

  try {
    const url = new URL(location.href);
    url.searchParams.delete('article');
    url.searchParams.set('house', `${slug(road)}-${num}`);
    history.replaceState(history.state, '', url);
  } catch (e) {}
}

function showOnMap(r) {
  document.getElementById('house-dialog')?.close();
  const { state } = ctx;
  const showing = state.residentMarkers.length && state.map.hasLayer(state.residentMarkers[0]);
  if (!showing) {
    const btn = document.querySelector('.residents-toggle-btn');
    if (btn) ctx.toggleResidents(btn);
  }
  const marker = state.residentMarkers.find(m => m._resident === r);
  if (!marker) return;
  state.map.flyTo(marker.getLatLng(), 18, { duration: 0.8 });
  state.map.once('moveend', () => marker.openPopup());
}

async function shareHouse(road, num, r) {
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set('house', `${slug(road)}-${num}`);
  const text = `In 1929, ${num} ${roadName(road)} was first home to ${r.lessee || 'one of the Triangle\'s first families'}.`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Who first lived in my house? – Triangle100', text, url: url.href });
      return;
    }
    await navigator.clipboard.writeText(url.href);
    ctx.utils.toast('Link copied. Paste it anywhere to share this house.', { type: 'success' });
  } catch (e) {
    if (e?.name !== 'AbortError') ctx.utils.toast('Couldn\'t copy the link automatically. You can copy it from the address bar.');
  }
}

function printHouse(addr, found, range) {
  const logo = document.querySelector('#head_logo img')?.src || '';
  const people = found.map(r => {
    const rows = [
      hasOccupation(r.occupation) && ['Occupation', r.occupation],
      r.formeraddress && ['Moved from', r.formeraddress],
      money(r.consideration) && ['Price paid', money(r.consideration)]
    ].filter(Boolean).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
    return `<h2>${esc(r.lessee || 'Name not yet traced')}</h2><table>${rows}</table>`;
  }).join('');
  const w = window.open('', '_blank', 'width=720,height=900');
  if (!w) { ctx.utils.toast('Please allow pop-ups to print the house card.'); return; }
  w.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
    <title>${esc(addr)} – first residents 1929</title>
    <style>
      @page { size: A5; margin: 14mm; }
      body { font: 15px/1.5 Georgia, 'Times New Roman', serif; color: #1f2933; text-align: center; margin: 0; }
      .card { border: 3px double #2e8b57; padding: 28px 24px; border-radius: 10px; }
      img { width: 110px; height: auto; }
      .eyebrow { letter-spacing: .12em; text-transform: uppercase; font: 600 12px system-ui, sans-serif; color: #2e8b57; margin: 14px 0 2px; }
      h1 { font-size: 28px; margin: 0 0 18px; }
      h2 { font-size: 22px; margin: 18px 0 6px; }
      table { margin: 0 auto; border-collapse: collapse; text-align: left; }
      th { font: 600 12px system-ui, sans-serif; text-transform: uppercase; color: #52606d; padding: 4px 14px 4px 0; vertical-align: top; }
      td { padding: 4px 0; }
      .foot { margin-top: 22px; font: 12px system-ui, sans-serif; color: #52606d; }
    </style></head><body><div class="card">
      ${logo ? `<img src="${esc(logo)}" alt="Triangle100">` : ''}
      <p class="eyebrow">First residents · 1929</p>
      <h1>${esc(addr)}</h1>
      ${people}
      <p class="foot">From the Triangle100 project, celebrating a century of the Drumcondra Triangle (1929–2029)<br>triangle100.ie</p>
    </div>
    <script>window.onload = () => { setTimeout(() => window.print(), 300); };<\/script>
    </body></html>`);
  w.document.close();
}

// -----------------------------------------------------------------------------
// 1929 in numbers
// -----------------------------------------------------------------------------
function bars(rows, { fmt = (v) => v, max } = {}) {
  const top = max ?? Math.max(...rows.map(r => r.value), 1);
  return `<ul class="hx-bars">${rows.map(r => `
    <li title="${esc(r.label)}: ${esc(fmt(r.value))}">
      <span class="hx-bar-label">${esc(r.label)}</span>
      <span class="hx-bar-track"><span class="hx-bar" style="width:${Math.max(2, (r.value / top) * 100).toFixed(1)}%"></span></span>
      <span class="hx-bar-value">${esc(fmt(r.value))}</span>
    </li>`).join('')}</ul>`;
}

export function showNumbers() {
  const all = residents();
  if (!all.length) { ctx.utils.toast('The 1929 records are still loading. Please try again in a moment.'); return; }

  const roads = new Set(all.map(r => r.road));
  const occs = new Map();
  let women = 0, withOcc = 0;
  all.forEach(r => {
    const o = (r.occupation || '').trim();
    if (WOMEN_STATUS.test(o)) { women++; return; }
    if (!hasOccupation(o)) return;
    withOcc++;
    occs.set(o, (occs.get(o) || 0) + 1);
  });
  const topOcc = [...occs.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10).map(([label, value]) => ({ label, value }));
  const range = priceRange(all);
  const moved = all.filter(r => r.formeraddress && r.formeraddress.trim()).length;
  const military = all.filter(r => r.MilitaryHistory).length;

  const byRoad = [...roads].map(road => {
    const list = all.filter(r => r.road === road);
    const p = list.map(r => Number(r.consideration)).filter(n => n > 0);
    return { label: roadName(road), value: p.length ? Math.round(p.reduce((a, b) => a + b, 0) / p.length) : 0, n: list.length };
  }).filter(r => r.value).sort((a, b) => b.value - a.value);

  const households = [...roads].map(road => ({
    label: roadName(road), value: all.filter(r => r.road === road).length
  })).sort((a, b) => b.value - a.value);

  const dlg = openDialog('numbers-dialog', '1929 in numbers', `
    <p class="hx-lede">A portrait of the Triangle's first community, drawn from the lease records
      local volunteers have gathered so far.</p>

    <div class="hx-tiles">
      <div class="hx-tile"><span class="hx-num">${all.length}</span><span class="hx-cap">households traced</span></div>
      <div class="hx-tile"><span class="hx-num">${roads.size}</span><span class="hx-cap">roads</span></div>
      <div class="hx-tile"><span class="hx-num">${occs.size}</span><span class="hx-cap">different occupations</span></div>
      ${range ? `<div class="hx-tile"><span class="hx-num">${money(range[0])}–${money(range[1]).slice(1)}</span><span class="hx-cap">price of a house</span></div>` : ''}
    </div>

    <section>
      <h3>What they did for a living</h3>
      <p class="hx-sub">The ten most common occupations among ${withOcc} lessees whose trade is recorded</p>
      ${bars(topOcc)}
    </section>

    <section>
      <h3>What a house cost</h3>
      <p class="hx-sub">Average price paid, by road. The Triangle was built with two sizes of house.</p>
      ${bars(byRoad, { fmt: money })}
    </section>

    <section>
      <h3>Households traced so far, by road</h3>
      ${bars(households)}
    </section>

    <div class="hx-facts-row">
      <div class="hx-fact"><span class="hx-num">${women}</span>
        <p>${women === 1 ? 'lease was' : 'leases were'} held by women, recorded as married women or widows</p></div>
      <div class="hx-fact"><span class="hx-num">${moved}</span>
        <p>${moved === 1 ? 'family\'s previous address is' : 'families\' previous addresses are'} known so far
        <button type="button" class="hx-linkbtn" data-act="journeys">See their journeys →</button></p></div>
      ${military ? `<div class="hx-fact"><span class="hx-num">${military}</span>
        <p>${military === 1 ? 'household' : 'households'} with a military history recorded</p></div>` : ''}
    </div>

    <div class="hx-foot">
      <button type="button" class="sf-btn sf-btn-primary" data-act="house">🏠 Find your own house</button>
      <p class="hx-small">Spotted a mistake, or know a family we haven't traced?
        <a href="#" data-act="story">Tell us</a>.</p>
    </div>
  `);

  dlg.querySelector('[data-act="house"]').addEventListener('click', () => { dlg.close(); setTimeout(() => showHouseLookup(), 60); });
  dlg.querySelector('[data-act="story"]').addEventListener('click', (e) => { e.preventDefault(); dlg.close(); ctx.showStoryForm(); });
  dlg.querySelector('[data-act="journeys"]').addEventListener('click', () => {
    dlg.close();
    const { state } = ctx;
    const showing = state.residentMarkers.length && state.map.hasLayer(state.residentMarkers[0]);
    if (!showing) { const btn = document.querySelector('.residents-toggle-btn'); if (btn) ctx.toggleResidents(btn); }
    ctx.utils.toast('Tap a glowing orange house to see where that family moved from.', { duration: 6000 });
  });
}

// -----------------------------------------------------------------------------
// Wiring
// -----------------------------------------------------------------------------
export function initHistoryFeatures(deps) {
  ctx = deps;
}

/** Handle ?house=walsh-road-87 links. Returns true if it opened something. */
export function handleHouseLink() {
  const v = new URLSearchParams(location.search).get('house');
  if (!v) return false;
  const m = v.match(/^(.*)-(\d+)$/);
  if (!m) return false;
  const road = roadsSorted().find(r => slug(r) === m[1]);
  if (!road) return false;
  showHouseLookup({ road, num: m[2] });
  return true;
}
