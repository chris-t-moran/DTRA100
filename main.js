/*! Resident Move 'Easter Egg' (highlight on selection only) */
(function (global) {
  const ORANGE = '#f97316';
  const ORANGE_FILL = '#fb923c';

  function ensureLayers(map) {
    if (!global.state) global.state = {};
    if (!global.state.residentMoveLayer) {
      global.state.residentMoveLayer = L.layerGroup();
      // Do NOT add by default; only when Residents view is active
    }
    if (!global.state._residentMoveCurrent) global.state._residentMoveCurrent = null;
  }

  function clearResidentMoveHighlight(map) {
    ensureLayers(map);
    global.state.residentMoveLayer.clearLayers();
    global.state._residentMoveCurrent = null;
  }

  function showResidentMoveHighlight(map, resident, currentLatLng) {
    ensureLayers(map);
    clearResidentMoveHighlight(map);

    const hasFormer = isFinite(resident.formerAddr_lat) && isFinite(resident.formerAddr_lon);
    if (!hasFormer) return;

    const from = [resident.formerAddr_lat, resident.formerAddr_lon];
    const to   = currentLatLng ? [currentLatLng.lat, currentLatLng.lng] : [resident.lat, resident.lon];

    try {
      const d = map.distance(from, to);
      if (!isFinite(d) || d < 5) return;
    } catch (_) { return; }

    const curve = bezierCurvePoints(from, to, 0.25, 48);
    const line = L.polyline(curve, {
      color: ORANGE,
      weight: 3,
      opacity: 0.95,
      dashArray: '4 6'
    });

    const halo = L.circleMarker(to, {
      radius: 7,
      color: ORANGE,
      weight: 3,
      fillColor: ORANGE_FILL,
      fillOpacity: 0.6
    });

    const former = L.circleMarker(from, {
      radius: 5,
      color: ORANGE,
      weight: 2,
      fillColor: ORANGE_FILL,
      fillOpacity: 0.6
    }).bindTooltip(`<div><em>Former:</em><br/>${escapeHtml(resident.formeraddress ?? 'Unknown')}</div>`);

    global.state.residentMoveLayer.addLayer(line);
    global.state.residentMoveLayer.addLayer(halo);
    global.state.residentMoveLayer.addLayer(former);
  }

  function hideResidentMoveEasterEgg(map) {
    clearResidentMoveHighlight(map);
    if (global.state && global.state.residentMoveLayer && map.hasLayer(global.state.residentMoveLayer)) {
      map.removeLayer(global.state.residentMoveLayer);
    }
  }

  function showResidentMoveEasterEgg(map) {
    ensureLayers(map);
    if (global.state && global.state.residentMoveLayer && !map.hasLayer(global.state.residentMoveLayer)) {
      global.state.residentMoveLayer.addTo(map);
    }
  }

  function bezierCurvePoints(from, to, curvature = 0.25, segments = 48) {
    const lat1 = from[0], lon1 = from[1];
    const lat2 = to[0],   lon2 = to[1];
    const mx = (lat1 + lat2) / 2;
    const my = (lon1 + lon2) / 2;

    const vx = lat2 - lat1;
    const vy = lon2 - lon1;
    const len = Math.sqrt(vx*vx + vy*vy) || 1e-9;

    const px = -vy / len;
    const py =  vx / len;

    const offset = len * curvature;
    const cx = mx + px * offset;
    const cy = my + py * offset;

    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      const lat = a * lat1 + b * cx + c * lat2;
      const lon = a * lon1 + b * cy + c * lon2;
      pts.push([lat, lon]);
    }
    return pts;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  global.ResidentMoveEgg = {
    show: showResidentMoveHighlight,
    clear: clearResidentMoveHighlight,
    hideLayer: hideResidentMoveEasterEgg,
    showLayer: showResidentMoveEasterEgg
  };
})(window);
// --- end Resident Move 'Easter Egg' ---

(function ensureGlowCSS(){
  if (document.getElementById('resident-glow-css')) return;
  const css = `
  .leaflet-interactive.resident-hasformer-glow {
    filter: drop-shadow(0 0 6px rgba(249, 115, 22, 0.8))
            drop-shadow(0 0 12px rgba(249, 115, 22, 0.5));
  }`;
  const style = document.createElement('style');
  style.id = 'resident-glow-css';
  style.type = 'text/css';
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
})();


// Reveal an article's marker even if it's inside a cluster, then highlight it.
// Reveal an article's marker even if it's inside a cluster, then highlight it.
// Uses getVisibleParent() so we only spiderfy when the marker is still clustered.
function revealArticleMarker(article, opts = {}) {
  const group = state?.articleMarkers;
  const mk = (typeof getArticleMarker === 'function') ? getArticleMarker(article) : null;
  if (!group || !mk) { console.warn('revealArticleMarker: missing group or marker'); return; }

  const afterVisible = () => {
    // If the marker is still represented by a visible cluster, spiderfy that cluster
    try {
      if (typeof group.getVisibleParent === 'function') {
        const vp = group.getVisibleParent(mk);
        if (vp && vp !== mk && typeof vp.spiderfy === 'function') {
          // Defer a tick so the zoom/pan finishes before spiderfying
          setTimeout(() => vp.spiderfy(), 0);
        }
      }
    } catch (e) {
      console.warn('spiderfy check failed', e);
    }

    // Now apply your highlight (and desktop-only pan inside this)
    if (typeof selectArticleMarker === 'function') {
      selectArticleMarker(mk);
    }

    try { mk.bringToFront?.(); } catch {}
  };

  if (typeof group.zoomToShowLayer === 'function') {
    group.zoomToShowLayer(mk, afterVisible);
  } else {
    afterVisible();
  }

  if (typeof selectArticleMarker === 'function') selectArticleMarker(mk);
  // Nudge on mobile so the marker sits above a bottom panel or below a top panel
  setTimeout(function () {
    panMarkerIntoViewWithContentOffset(mk, { margin: 20, animate: true });
  }, 0);

  
}

// Slide the #content panel down to the lower third on mobile (no-op on desktop)
function settleContentPanelToLowerThird(opts) {
  if (window.innerWidth > 500) return; // mobile only
  const content = document.getElementById('content');
  if (!content) return;

  const marginVisible = 100; // keep at least 100px visible (matches your drag clamp)
  const vh = window.innerHeight;
  const desiredTop = Math.min(Math.max(0, Math.round(vh * (2/3))), vh - marginVisible);

  const prev = content.style.transition;
  content.style.transition = 'top 300ms ease';
  content.style.top = desiredTop + 'px';

  // Clean up transition after the animation so dragging feels snappy
  setTimeout(() => { content.style.transition = prev || ''; }, 400);
}



// --- Resident popup template & styles ---
function residentPopupHTML(r) {
  const esc = (v) => (typeof htmlEscape === 'function' ? htmlEscape(String(v ?? '')) : String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s])));
  const addr = `${r.housenumber ?? ''} ${r.road ?? ''}`.trim();
  const former = r.formeraddress ? `
    <div class="rp-row">
      <span class="rp-label">Former Address:</span>
      <span class="rp-value">${esc(r.formeraddress)}</span>
    </div>` : '';

  const occ = r.occupation ? `
    <div class="rp-row">
      <span class="rp-label">Occupation (1929):</span>
      <span class="rp-value">${esc(r.occupation)}</span>
    </div>` : '';

  const name = r.lessee ? esc(r.lessee) : 'First Resident';

  return `
      <div class="resident-popup">
      <header class="rp-header">
        <div class="rp-avatar" aria-hidden="true"></div>
        <div class="rp-headings">
          <h2 class="rp-title">${name}</h2>
          <div class="rp-subtitle">${esc(addr) || 'Address unknown'}</div>
        </div>
      </header>


      <div class="rp-body">
        ${former}
        ${occ}
      </div>

      <footer class="rp-footer">
        
      </footer>
    </div>
  `;
}

// Inject popup CSS once
(function ensureResidentPopupCSS(){
  if (document.getElementById('resident-popup-css')) return;
  const css = `
.leaflet-popup.resident-popup-wrap .leaflet-popup-content-wrapper {
  padding: 0;
  border-radius: 14px;
  box-shadow: 0 6px 24px rgba(0,0,0,.18);
  overflow: hidden;
  border: 1px solid rgba(0,0,0,.08);
}
.leaflet-popup.resident-popup-wrap .leaflet-popup-tip {
  filter: drop-shadow(0 2px 6px rgba(0,0,0,.15));
}
.resident-popup { font: 14px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color:#1f2937; }
.rp-header {
  display: grid;
  grid-template-columns: 40px 1fr;
  gap: 10px;
  align-items: center;
  padding: 12px 14px;
  background: linear-gradient(0deg, #fff7ed 0%, #ffedd5 100%);
  border-bottom: 1px solid #fde6c9;
}
.rp-avatar {
  width: 40px; height: 40px; border-radius: 50%;
  display: grid; place-items: center;
  background: #f97316; color: #fff; font-size: 18px;
  box-shadow: 0 0 0 3px #fff inset;
}
.rp-headings { min-width: 0; }
.rp-title {
  margin: 0; font-size: 15px; font-weight: 700; color:#111827;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.rp-subtitle {
  font-size: 12px; color:#6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.rp-body { padding: 12px 14px; display: grid; gap: 8px; }
.rp-row { display: grid; grid-template-columns: 130px 1fr; gap: 8px; align-items: start; }
.rp-label { color:#6b7280; font-size: 12px; }
.rp-value { color:#1f2937; }
.rp-footer {
  display:flex; justify-content:flex-end; padding: 10px 14px; gap:8px;
  border-top: 1px solid #f3f4f6; background: #fff;
}
.rp-cta {
  appearance:none; border:1px solid #f97316; background:#fff;
  color:#b45309; font-weight:600; font-size:13px;
  padding: 6px 10px; border-radius: 8px; cursor:pointer;
}
.rp-cta:hover { background:#fff7ed; }
.rp-cta:active { transform: translateY(1px); }
@media (max-width: 420px) {
  .rp-row { grid-template-columns: 1fr; }
  .leaflet-popup.resident-popup-wrap .leaflet-popup-content { margin: 8px 10px; }
}`;
  const style = document.createElement('style');
  style.id = 'resident-popup-css';
  style.type = 'text/css';
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
})();
// --- end Resident popup template & styles ---


// Main application logic for Triangle100
// The code here initializes the map, loads data from Supabase,
// renders story categories and article cards, displays modals, and
// handles the story submission form.  It is designed to mirror the
// functionality of the original single–file page while improving
// organisation and readability.

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

// NOTE: exposing API keys in client‑side code is insecure.  Consider
// proxying requests through a backend service or using environment
// variables during the build process.
const supabaseUrl = 'https://vqkoapgiozhytoqscxxx.supabase.co';
const supabaseKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxa29hcGdpb3poeXRvcXNjeHh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU2NjEzMjIsImV4cCI6MjA2MTIzNzMyMn0.z4h2_uY-VlprsvaRZElh3ZOiGHG-fpGHO5rd7Y2nssY';
const supabaseClient = createClient(supabaseUrl, supabaseKey);

/* === BEGIN: site_content dynamic injection (append after supabaseClient is created) === */

async function fetchContentByType(contentType) {
  const { data, error } = await supabaseClient
    .from('site_content')
    .select('str_content')
    .eq('str_contentType', contentType)
    .eq('active', true)                        // boolean
    .order('created_at', { ascending: false }) // latest active first
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`Supabase (${contentType}) error:`, error);
    return null;
  }
  return data?.str_content ?? null;
}

async function injectDynamicContent() {
  try {
    // INTRO -> <section id="intro">...</section>
    const introHtml = await fetchContentByType('INTRO');
    const introEl = document.getElementById('intro');
    if (introEl && introHtml) introEl.innerHTML = introHtml;

    // TITLE -> document.title (strip tags to keep tab title tidy)
    const titleHtml = await fetchContentByType('TITLE');
    if (titleHtml) {
      const tmp = document.createElement('div');
      tmp.innerHTML = titleHtml;
      document.title = (tmp.textContent || '').trim() || document.title;
    }

    // STORY-SHARE -> <section id="story-share">...</section>
    const shareHtml = await fetchContentByType('STORY-SHARE');
    const shareEl = document.getElementById('story-share');
    if (shareEl && shareHtml) shareEl.innerHTML = shareHtml;

    // ABOUT -> <section id="about-project">...</section>
    const aboutHtml = await fetchContentByType('ABOUT');
    let aboutEl = document.getElementById('about-project');
    if (aboutEl && aboutHtml) {
      aboutEl.innerHTML = aboutHtml;

      // Insert dynamic year if placeholder exists
      const yearEl = aboutEl.querySelector('#about-year');
      if (yearEl) yearEl.textContent = new Date().getFullYear();

      // Wire up Share link if present
      const shareLink = aboutEl.querySelector('#about-share-link');
      if (shareLink && typeof showStoryFormPage === 'function') {
        shareLink.addEventListener('click', (e) => {
          e.preventDefault();
          showStoryFormPage();
        });
      }
    }

  } catch (e) {
    console.error('Injection error:', e);
  }
}


// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectDynamicContent);
} else {
  injectDynamicContent();
}

/* === END: site_content dynamic injection === */




// Global application state
const state = {
  articles: [],
  peopleMarkers: [],
  articleMarkers: null,
  articleMarkerIndex: new Map(),
  lastSelectedArticleMarker: null,
  map: null,
  activeTheme: null
};

// --- Modal navigation & sharing helpers (hardened) ---

// Get the active modal's article id
function getCurrentModalArticleId() {
  var m = document.querySelector('.modal');
  if (!m) return null;
  var id = m.dataset && m.dataset.articleId;
  return id != null ? Number(id) : null;
}

// Best-effort cache lookup for an article by id
function getArticleFromCache(id) {
  if (!id || !window.state) return null;
  if (state.articleById && state.articleById[id]) return state.articleById[id];
  if (Array.isArray(state.articles)) {
    for (var i=0;i<state.articles.length;i++) {
      if (Number(state.articles[i].id) === Number(id)) return state.articles[i];
    }
  }
  if (Array.isArray(state.articlesData)) {
    for (var j=0;j<state.articlesData.length;j++) {
      if (Number(state.articlesData[j].id) === Number(id)) return state.articlesData[j];
    }
  }
  return null;
}



function ensureArticleLookupMap() {
  if (!window.state) window.state = {};
  if (!state.articleById) state.articleById = {};
  function add(a) {
    if (!a || a.id == null) return;
    var id = Number(a.id);
    if (!state.articleById[id]) state.articleById[id] = a;
  }
  if (Array.isArray(state.articles)) state.articles.forEach(add);
  if (Array.isArray(state.articlesData)) state.articlesData.forEach(add);
  try {
    if (state.articleMarkers && typeof state.articleMarkers.getLayers === 'function') {
      state.articleMarkers.getLayers().forEach(function(mk){
        var a = mk && (mk._article || (mk.options && mk.options.article) || (mk.feature && mk.feature.properties && mk.feature.properties.article));
        if (a) add(a);
      });
    }
  } catch(e) {}
}

function ensureArticlesOrder() {
  if (!window.state) window.state = {};
  if (Array.isArray(state.articlesOrdered) && state.articlesOrdered.length) return;

  ensureArticleLookupMap();

  var arr = [];
  if (Array.isArray(state.articles) && state.articles.length) {
    arr = state.articles.slice();
  } else if (Array.isArray(state.articlesData)) {
    arr = state.articlesData.slice();
  } else if (state.articleMarkers && typeof state.articleMarkers.getLayers === 'function') {
    try {
      arr = state.articleMarkers.getLayers()
        .map(function(mk){ return mk && (mk._article || (mk.options && mk.options.article) || (mk.feature && mk.feature.properties && mk.feature.properties.article)); })
        .filter(Boolean);
    } catch(e) { arr = []; }
  } else {
    try {
      var nodes = document.querySelectorAll('#article-list [data-article-id]');
      nodes.forEach(function(el){
        var id = Number(el.getAttribute('data-article-id'));
        if (!isNaN(id)) arr.push({ id: id });
      });
    } catch(e) {}
  }

  state.articlesOrdered = arr || [];
  (state.articlesOrdered).forEach(function(a){ if (a && a.id != null) state.articleById[Number(a.id)] = a; });
}


// --- FIX: harden permalink helper & share handler usage ---
(function hardenModalHelpers(){
  // Replace/define a robust permalink helper
  window.getArticlePermalink = function(articleLike){
    // prefer the explicit param; fall back to currentArticle if available
    const a = articleLike || (typeof currentArticle !== 'undefined' ? currentArticle : null);
    if (!a || a.id == null) return location.href;
    const base = location.origin + location.pathname;
    return base + '?article=' + encodeURIComponent(a.id);
  };

  // If a share button exists already, rewire it safely to use currentArticle
  const btns = document.querySelectorAll('.modal-share-btn');
  btns.forEach((shareBtn) => {
    if (shareBtn._rewired) return;
    shareBtn.addEventListener('click', async () => {
      const a = (typeof currentArticle !== 'undefined') ? currentArticle : null;
      const url = getArticlePermalink(a);
      const title = (a && a.title) || 'Triangle 100';
      const text = a && a.short_desc ? String(a.short_desc).slice(0,160) : '';
      if (navigator.share) {
        try { await navigator.share({ title, text, url }); return; } catch(e) {}
      }
      try {
        await navigator.clipboard.writeText(url);
        // tiny visual confirmation
        const old = shareBtn.innerHTML;
        shareBtn.innerHTML = 'Copied!';
        setTimeout(() => { shareBtn.innerHTML = old; }, 900);
      } catch(e) {
        // silent fallback; optional: show a small popup
        console.warn('Share fallback failed', e);
      }
    });
    shareBtn._rewired = true;
  });
})();


function getArticleIndex(article) {
  try { ensureArticlesOrder(); } catch(e) {}
  if (!state || !Array.isArray(state.articlesOrdered)) return -1;
  var id = Number(article && article.id);
  for (var i = 0; i < state.articlesOrdered.length; i++) {
    var it = state.articlesOrdered[i];
    if (it && Number(it.id) === id) return i;
  }
  return -1;
}

function getArticlePermalink(a) {
  // prefer explicit article, else read from modal dataset
  if (!a) {
    var idFromModal = getCurrentModalArticleId();
    if (!idFromModal) return location.href;
    a = getArticleFromCache(idFromModal) || { id: idFromModal };
  }
  if (a.id == null) return location.href;
  var base = location.origin + location.pathname;
  return base + '?article=' + encodeURIComponent(a.id);
}


async function fetchArticleById(id) {
  try {
    if (typeof supabaseClient === 'undefined') return null;
    const { data, error } = await supabaseClient
      .from('articles')
      .select('id,title,short_desc,description,img,contributor,active,lat,lon')
      .eq('id', id)
      .maybeSingle();
    if (error) { console.warn('fetchArticleById error:', error); return null; }
    if (data) {
      if (!window.state) window.state = {};
      if (!state.articleById) state.articleById = {};
      state.articleById[Number(data.id)] = data;
    }
    return data || null;
  } catch (e) {
    console.warn('fetchArticleById failed:', e);
    return null;
  }
}



// HTML helpers
function htmlEscape(str) {
  // Coerce non‑string values to strings.  If str is null or undefined, return
  // an empty string.  Numbers and booleans will be cast to their string
  // representation before escaping.
  if (str === null || str === undefined) return '';
  const s = String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// De-dupe views per article per day using localStorage
function shouldCountView(articleId, ttlHours) {
  try {
    const key = 'viewed:' + articleId;
    const ttl = (ttlHours || 24) * 60 * 60 * 1000;
    const now = Date.now();
    const raw = localStorage.getItem(key);
    if (!raw) { localStorage.setItem(key, String(now)); return true; }
    const then = Number(raw) || 0;
    if (now - then >= ttl) { localStorage.setItem(key, String(now)); return true; }
    return false;
  } catch { return true; } // if storage is blocked, just count
}

async function incrementArticleView(articleId) {
  if (!articleId) return;
  try {
    const { data, error } = await supabaseClient.rpc('increment_article_view', { aid: articleId });
    if (error) console.warn('increment view error', error);
    return data; // new view count
  } catch (e) {
    console.warn('increment view failed', e);
  }
}



// --- Article selection highlight (color only) ---
function _articleKey(a) {
  if (a && a.id != null) return `id:${a.id}`;
  return `at:${a.lat},${a.lon}|${a.title ?? ''}`;
}
function getArticleMarker(article) {
  const k = _articleKey(article);
  if (state.articleMarkerIndex?.has(k)) return state.articleMarkerIndex.get(k);
  try {
    const layers = state.articleMarkers?.getLayers?.() || [];
    for (const lyr of layers) {
      if (lyr && lyr._article) {
        if ((article.id != null && lyr._article.id === article.id) ||
            (lyr._article.lat === article.lat && lyr._article.lon === article.lon && lyr._article.title === article.title)) {
          return lyr;
        }
      }
    }
  } catch {}
  return null;
}
function _styleOf(marker) {
  const o = marker && marker.options || {};
  return {
    radius: o.radius, color: o.color, weight: o.weight,
    fillColor: o.fillColor, fillOpacity: o.fillOpacity, opacity: o.opacity
  };
}
function selectArticleMarker(marker, opts = {}) {
  if (!marker) return;
  const highlight = Object.assign({
    color: '#f97316',
    fillColor: '#ffedd5',
    weight: 3,
    radius: Math.max( (marker.options && marker.options.radius) || 7, 9 )
  }, opts.highlight || {});

  if (state.lastSelectedArticleMarker && state.lastSelectedArticleMarker !== marker) {
    const prev = state.lastSelectedArticleMarker;
    if (prev._baseStyle) prev.setStyle(prev._baseStyle);
  }

  marker.setStyle(highlight);
  // Desktop-only pan to keep marker visible under content panel
  try {
    if (window.innerWidth > 500 && state?.map && marker?.getLatLng) {
      state.map.panTo(marker.getLatLng(), { animate: true, duration: 0.6 });
    }
  } catch {}
  state.lastSelectedArticleMarker = marker;
}
// --- end Article selection highlight ---

// -----------------------------------------------------------------------------
// Data loading
// -----------------------------------------------------------------------------

// Fetch all active articles from Supabase and kick off map/page setup.
async function loadArticles() {
  const { data, error } = await supabaseClient
    .from('articles')
    .select('*')
    .eq('active', true);
  if (error) {
    console.error('Error fetching articles:', error);
    return;
  }
  state.articles = data;
  // Ensure the map and residents are fully initialised
  await initMapAndPage();

  /* removed old loadResidentConnections block */
  
}

// --- Address normalization & parsing (number + street) ---
(function () {
  function deburr(s) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  function normSpaces(s) { return s.replace(/\s+/g, " ").trim(); }
  function stripPunct(s) { return s.replace(/[^a-z0-9\s]/g, " "); }

  // Normalize abbreviations to canonical forms
  var STREET_MAP = {
    rd: "road", road: "road",
    st: "street", street: "street",
    ave: "avenue", av: "avenue", avenue: "avenue",
    dr: "drive", drive: "drive",
    ct: "court", court: "court",
    pl: "place", place: "place",
    sq: "square", square: "square",
    pk: "park", park: "park",
    gdns: "gardens", gardens: "gardens",
    grn: "green", green: "green",
    tce: "terrace", terrace: "terrace"
  };

  function canonStreet(raw) {
    if (!raw) return "";
    var s = deburr(String(raw).toLowerCase());
    s = stripPunct(s);
    s = normSpaces(s);
    return s.split(" ").filter(Boolean).map(function (w) {
      return STREET_MAP[w] || w;
    }).join(" ");
  }

  function parseAddressQuery(q) {
    if (!q) return { num: null, street: "" };
    var s = deburr(String(q).toLowerCase());
    s = stripPunct(s);
    s = normSpaces(s);
    var m = s.match(/^(\d+)\s+(.+)$/); // number then street
    if (m) return { num: parseInt(m[1], 10), street: canonStreet(m[2]) };
    return { num: null, street: canonStreet(s) }; // street only
  }

  window.__addr = { canonStreet: canonStreet, parseAddressQuery: parseAddressQuery };
})();

function buildResidentAddressIndex() {
  var idx = [];
  if (!state || !state.peopleMarkers) return;
  var canon = window.__addr.canonStreet;

  state.peopleMarkers.forEach(function (mk) {
    var r = (mk && mk._resident) ? mk._resident : {};
    var num = (r.housenumber != null && r.housenumber !== "") ? Number(r.housenumber) : null;
    var street = canon(r.road || "");
    idx.push({ marker: mk, num: num, street: street });
  });

  state._residentAddrIndex = idx;
}



// Fetch all active residents and prepare their markers (but do not
// automatically add to the map).  People markers are stored in
// state.peopleMarkers and toggled via the residents toggle button.
async function loadResidents() {
  const { data: residents, error } = await supabaseClient
    .from('residents')
    .select('*')
    .eq('active', true);
  if (error) {
    console.error('Error fetching residents:', error);
    return;
  }
  residents.forEach((resident) => {
    const hasFormer = Number.isFinite(resident.formerAddr_lat) && Number.isFinite(resident.formerAddr_lon);
    const marker = L.circleMarker([resident.lat, resident.lon], hasFormer ? {
      radius: 8,
      color: '#f97316',        // orange stroke
      weight: 2,
      fillColor: '#ffedd5',    // light orange fill
      fillOpacity: 0.95,
      opacity: 1
    } : {
      radius: 7,
      color: 'gold',
      weight: 1,
      fillColor: '#4caf50',    // original green
      fillOpacity: 1,
      opacity: 1
    }).bindPopup(residentPopupHTML(resident), {
      className: 'resident-popup-wrap',
      maxWidth: 320,
      autoPan: true,
      autoPanPadding: [20, 20],
      keepInView: true
    });
    if (hasFormer) {
      marker.on('add', () => {
        const el = marker.getElement();
        if (el) el.classList.add('resident-hasformer-glow');
      });
    }

    if (hasFormer) {
      marker.bindTooltip('Has former address — tap to see where', {direction: 'top', offset: [0, -8]});
    }
    // Attach resident data and click handler for the easter egg
    marker._resident = resident;
    marker.on('click', (e) => {
      // Only show the special layer in Residents mode
      ResidentMoveEgg.showLayer(state.map);
      ResidentMoveEgg.show(state.map, marker._resident, e.latlng);
    });

    // Wire CTA in popup to trigger the move highlight
  marker.on('popupopen', (e) => {
    const btn = e.popup.getElement().querySelector('.rp-cta[data-action="show-move"]');
    if (btn) {
      btn.addEventListener('click', () => {
        ResidentMoveEgg.showLayer(state.map);
        ResidentMoveEgg.show(state.map, resident, marker.getLatLng());
      }, { once: true });
    }
  });

  state.peopleMarkers.push(marker);
  });
  buildResidentAddressIndex();

}

// Hide non-matches; show only exact match(es). Returns array of matched markers.
function filterResidentsByAddressStrict(query) {
  if (!state || !state._residentAddrIndex) return [];

  var parsed = window.__addr.parseAddressQuery(query);
  var qNum = parsed.num;
  var qStreet = parsed.street;

  var exact = [], streetOnly = [];

  state._residentAddrIndex.forEach(function (row) {
    var mk = row.marker, num = row.num, street = row.street;
    if (!street) return;

    if (qNum != null) {
      if (num === qNum) {
        if (street === qStreet) exact.push(mk);
        else if (street.indexOf(qStreet) === 0) exact.push(mk);
        else if (street.indexOf(qStreet) >= 0) exact.push(mk);
      }
    } else {
      if (street === qStreet || street.indexOf(qStreet) === 0 || street.indexOf(qStreet) >= 0) {
        streetOnly.push(mk);
      }
    }
  });

  var matches = (exact.length > 0) ? exact : streetOnly;

  var matchedSet = new Set(matches);
  state.peopleMarkers.forEach(function (mk) {
    var isMatch = matchedSet.has(mk);
    if (mk.setStyle) {
      try { mk.setStyle({ opacity: isMatch ? 1 : 0, fillOpacity: isMatch ? 0.7 : 0 }); } catch (e) {}
    } else {
      if (!isMatch) { try { state.map.removeLayer(mk); } catch (e) {} }
      else { try { mk.addTo(state.map); } catch (e) {} }
    }
    var el = mk.getElement && mk.getElement();
    if (el) el.style.pointerEvents = isMatch ? "" : "none";
    mk._hiddenByResidentFilter = !isMatch;
  });

  if (matches.length === 1) {
    var mk = matches[0];
    try { mk.bringToFront && mk.bringToFront(); } catch (e) {}
    var ll = mk.getLatLng();
    if (window.innerWidth > 500) state.map.flyTo(ll, Math.max(17, state.map.getZoom()), { duration: 0.6 });
    else state.map.panTo(ll, { animate: true });
  } else if (matches.length > 1) {
    try {
      var group = L.featureGroup(matches);
      state.map.fitBounds(group.getBounds().pad(0.2));
    } catch (e) {}
  }

  state._residentsFilterActive = matches.length > 0;
  state._residentsFilterMatches = matches;
  return matches;
}

function clearResidentsFilter() {
  if (!state || !state.peopleMarkers) return;

  state.peopleMarkers.forEach(function (mk) {
    if (mk.setStyle) {
      try { mk.setStyle({ opacity: 1, fillOpacity: 0.7 }); } catch (e) {}
    } else {
      try { mk.addTo(state.map); } catch (e) {}
    }
    var el = mk.getElement && mk.getElement();
    if (el) el.style.pointerEvents = "";
    mk._hiddenByResidentFilter = false;
  });

  state._residentsFilterActive = false;
  state._residentsFilterMatches = null;
}


// -----------------------------------------------------------------------------
// Map initialization & UI setup
// -----------------------------------------------------------------------------





async function initMapAndPage() {
  // Determine map centre/zoom for mobile vs desktop
  const isMobile = window.innerWidth <= 500;
  // Set different map centres for mobile vs desktop.  The mobile
  // coordinates have been updated per user request to focus the view
  // slightly further north and west.
  const initialCenter = isMobile
    ? [53.36873328276553, -6.258910850717367]
    : [53.37155, -6.25873];
  const initialZoom = isMobile ? 15 : 16;

  // Create map
  state.map = L.map('map').setView(initialCenter, initialZoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(state.map);

  // Residents toggle control
  const ResidentsToggleControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function () {
      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      const button = L.DomUtil.create('a', '', container);
      button.className = 'residents-toggle-btn';
      button.href = '#';
      button.innerHTML = 'Switch to 1929';
      button.title = 'Show/Hide First Residents';
      L.DomEvent.on(button, 'click', function (e) {
        L.DomEvent.stopPropagation(e);
        L.DomEvent.preventDefault(e);
        togglePeopleMarkers(button);
      });
      return container;
    }
  });
// debounce helper
function debounce(fn, ms) {
  var t; return function(){ clearTimeout(t); var a=arguments; t=setTimeout(()=>fn.apply(this,a), ms); };
}


// Residents address search control (input only)
const ResidentsSearchControl = L.Control.extend({
  options: { position: 'topright' },
  onAdd: function () {
    const c = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
    c.style.padding = '6px';
    c.style.background = '#fff';
    c.style.boxShadow = '0 1px 4px rgba(0,0,0,.2)';

    const input = L.DomUtil.create('input', '', c);
    input.type = 'search';
    input.placeholder = 'Search address…';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.style.width = '180px';
    input.style.border = '1px solid #ccc';
    input.style.padding = '6px 8px';
    input.style.outline = 'none';

    L.DomEvent.disableClickPropagation(c);
    L.DomEvent.disableScrollPropagation(c);

    const run = debounce(function () {
      const q = input.value.trim();
      if (!q) {
        clearResidentsFilter();
        return;
      }
      filterResidentsByAddressStrict(q);
    }, 200);

    input.addEventListener('input', run);

    return c;
  }
});

  
  state.map.addControl(new ResidentsToggleControl());
  state.residentsSearchControl = new ResidentsSearchControl();

  // Prepare article marker cluster group
  state.articleMarkers = L.markerClusterGroup({
    maxClusterRadius: 40,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true
  });

  // Group articles by theme and create markers
  const themes = {};
  state.articles.forEach((article) => {
    themes[article.theme] = themes[article.theme] || [];
    themes[article.theme].push(article);
    const marker = L.circleMarker([article.lat, article.lon], {
      radius: 7,
      color: '#4caf50',
      fillColor: 'orange',
      fillOpacity: 0.8,
      weight: 1
    });
    marker._article = article;
    marker._baseStyle = _styleOf(marker);
    try { state.articleMarkerIndex.set(_articleKey(article), marker); } catch {}
    marker.on('click', () => { selectArticleMarker(marker); openModal(article); });
    state.articleMarkers.addLayer(marker);
  });
  state.map.addLayer(state.articleMarkers);

  // Expose the map and application state globally so that developers
  // can inspect or modify them via the browser console.  For example,
  // you can call `triMap.setView([lat, lon], zoom)` from DevTools to
  // experiment with different centre coordinates or zoom levels on
  // mobile.  Attaching these objects to the `window` object does not
  // affect normal usage but makes them reachable outside of this
  // module scope.
  window.triMap = state.map;
  window.triState = state;

  // Render category buttons
  renderThemes(themes);
  // Filter to show all articles initially
  filterArticlesByCategory(null);
  // Load resident markers (not yet added to map).  Await to ensure markers
  // are available before the user toggles between stories and residents.
  await loadResidents();
}

// Create category buttons, including a "Lucky Dip" option
function renderThemes(themes) {
  const themesDiv = document.getElementById('themes');
  themesDiv.innerHTML = '';
  Object.keys(themes).forEach((theme) => {
    const item = document.createElement('div');
    item.className = 'theme';
    item.textContent = theme;
    item.addEventListener('click', () => {
      if (state.activeTheme === theme) {
        state.activeTheme = null;
        filterArticlesByCategory(null);
        setActiveCategory(null);
      } else {
        state.activeTheme = theme;
        filterArticlesByCategory(theme);
        setActiveCategory(theme);
      }
    });
    themesDiv.appendChild(item);
  });
  // Lucky Dip button
  const lucky = document.createElement('div');
  lucky.className = 'theme';
  lucky.textContent = 'Lucky Dip!';
  lucky.style.background = 'gold';
  lucky.addEventListener('click', () => {
    // Reset active theme
    state.activeTheme = null;
    // Render all articles first so the grid stays populated
    filterArticlesByCategory(null);
    setActiveCategory(null);
    // Then pick a random article and show it in a modal
    const randomArticle = state.articles[Math.floor(Math.random() * state.articles.length)];
    if (randomArticle) {
      openModal(randomArticle);
      // prep so close action reveals the exact marker (works even if clustered)
      revealArticleMarker(randomArticle, { prepareOnly: true }); // (prepareOnly not used above; optional)

    }
  });
  themesDiv.appendChild(lucky);
}

// Highlight the active category button
function setActiveCategory(theme) {
  const items = document.querySelectorAll('#themes .theme');
  items.forEach((item) => item.classList.remove('active'));
  if (theme) {
    const activeItem = Array.from(items).find(
      (item) => item.textContent === theme
    );
    if (activeItem) activeItem.classList.add('active');
  }
}

// Build the article grid based on the selected category or "Random"
function filterArticlesByCategory(theme) {
  const articleList = document.getElementById('article-list');
  articleList.innerHTML = '';
  // Random selection triggers a modal on a random article but does not clear the grid
  if (theme && theme.toLowerCase() === 'random') {
    const randomArticle = state.articles[Math.floor(Math.random() * state.articles.length)];
    openModal(randomArticle);
    // Do not return; continue to render all articles
  }
  // Determine which articles to display
  // Determine which articles to display.  Treat "random" as showing all
  // articles (the random article modal is already shown separately).
  const isRandom = theme && theme.toLowerCase() === 'random';
  const filtered = !theme || theme.toLowerCase() === 'all' || isRandom
    ? state.articles
    : state.articles.filter((a) => a.theme === theme);
  const grid = document.createElement('ul');
  grid.className = 'grid';
  filtered.forEach((article) => {
    const listItem = document.createElement('li');
    listItem.className = 'card';
    const link = document.createElement('a');
    link.href = 'javascript:void(0)';
    link.addEventListener('click', () => openModal(article));
    // Build card inner HTML
    link.innerHTML = `
      <img src="${article.img}" alt="${htmlEscape(article.title)}" />
      <div class="${article.active ? 'overlay' : 'inactiveoverlay'}">${htmlEscape(article.title)}</div>
    `;
    listItem.appendChild(link);
    grid.appendChild(listItem);
  });
  articleList.appendChild(grid);
}

// Toggle the visibility of story markers vs resident markers
function togglePeopleMarkers(button) {
  const visible =
    state.peopleMarkers.length > 0 && state.map.hasLayer(state.peopleMarkers[0]);
  const mapEl = document.getElementById('map');
  mapEl.classList.toggle('sepia');

  if (visible) {
    // hide residents, show articles
    state.peopleMarkers.forEach((m) => state.map.removeLayer(m));
    if (state.articleMarkers) state.map.addLayer(state.articleMarkers);
    ResidentMoveEgg.hideLayer(state.map);
    button.innerHTML = 'Switch to 1929';

    // remove search control + clear any filter
    if (state.residentsSearchControl) {
      try { state.map.removeControl(state.residentsSearchControl); } catch(e){}
    }
    clearResidentsFilter();

  } else {
    // hide articles, show residents
    if (state.articleMarkers) state.map.removeLayer(state.articleMarkers);
    state.peopleMarkers.forEach((m) => m.addTo(state.map));
    ResidentMoveEgg.showLayer(state.map);
    ResidentMoveEgg.clear(state.map);
    button.innerHTML = 'Switch to Stories';

    // show the search control
    if (state.residentsSearchControl) {
      try { state.map.addControl(state.residentsSearchControl); } catch(e){}
    }
  }
}


// Create and display a modal for a given article
function openModal(article) {
  let currentArticle = article;
  // Helpers we rely on (from earlier builds)
  const getMk = (a) =>
    (typeof getArticleMarker === 'function' ? getArticleMarker(a) : null);
  const selectMk = (mk) =>
    (typeof selectArticleMarker === 'function' ? selectArticleMarker(mk) : null);

  // --- create overlay
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.dataset.articleId = Number(article.id) || '';   

  // content wrapper
  const content = document.createElement('div');
  content.className = 'modal-content';

  // header
  const header = document.createElement('header');
  const title = document.createElement('h2');
  title.textContent = article.title || '';
  const shortDesc = document.createElement('h3');
  shortDesc.textContent = article.short_desc || '';
  header.appendChild(title);
  header.appendChild(shortDesc);

  // image
  const imgWrapper = document.createElement('div');
  imgWrapper.className = 'imgWrapper';
  const image = document.createElement('img');
  image.src = article.img || '';
  image.alt = article.title || '';
  imgWrapper.appendChild(image);

  // description + progress bar
  const descriptionWrapper = document.createElement('div');
  descriptionWrapper.className = 'descriptionWrapper';

  const progressBar = document.createElement('div');
  progressBar.className = 'progress-bar';
  descriptionWrapper.appendChild(progressBar);

  const description = document.createElement('div');
  description.innerHTML = (article.description || '').replace(/\n/g, '<br>');
  descriptionWrapper.appendChild(description);

  // footer with contributor + actions
  const footer = document.createElement('footer');
  footer.className = 'modal-footer';

  const contributor = document.createElement('span');
  contributor.className = 'modal-contrib';
  contributor.textContent = `Shared by: ${article.contributor || ''}`;

  const spacer = document.createElement('span');
  spacer.style.flex = '1 1 auto';

  const viewBtn = document.createElement('button');
  viewBtn.type = 'button';
  viewBtn.className = 'modal-view-btn';
  viewBtn.textContent = 'View on Map';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close-btn';
  closeBtn.textContent = 'Close';

// Smoothly load a new article into the existing modal (no close/reopen)
function loadArticleIntoModal(next) {
  var modal = document.querySelector('.modal');
  if (!modal) return;

  // Elements created in openModal
  var content = modal.querySelector('.modal-content');
  var title = modal.querySelector('header > h2');
  var shortDesc = modal.querySelector('header > h3');
  var image = modal.querySelector('.imgWrapper img');
  var descriptionWrapper = modal.querySelector('.descriptionWrapper');
  var progressBar = modal.querySelector('.progress-bar');
  var description = descriptionWrapper ? descriptionWrapper.querySelector('div') : null;

  // Reset progress & scroll
  if (progressBar) progressBar.style.width = '0%';
  if (descriptionWrapper) descriptionWrapper.scrollTop = 0;

  // Snappy fade
  if (content) content.classList.add('swap-fade','fade-out');
  if (image) image.classList.add('fade-out');

  // Swap text
  if (title) title.textContent = next.title || '';
  if (shortDesc) shortDesc.textContent = next.short_desc || '';
  if (description) description.innerHTML = (next.description || '').replace(/\n/g,'<br>');

  // Swap image after a tick so CSS transition runs
  setTimeout(function(){
    if (image) {
      image.src = next.img || '';
      image.alt = next.title || '';
    }
  }, 60);

  // Update modal’s current id
  modal.dataset.articleId = Number(next.id) || '';

  // View count (optional)
  if (typeof shouldCountView === 'function' && shouldCountView(next.id, 24)) {
    if (typeof incrementArticleView === 'function') incrementArticleView(Number(next.id));
  }

  // End fade
  setTimeout(function(){
    if (image) image.classList.remove('fade-out');
    if (content) content.classList.remove('fade-out');
  }, 180);
}




  
  // assemble
  content.appendChild(header);
  content.appendChild(imgWrapper);
  content.appendChild(descriptionWrapper);
  modal.appendChild(content);
  document.body.appendChild(modal);

  // --- Ensure we have an order to navigate ---
function buildArticlesOrderFromDOM() {
  const arr = [];
  document.querySelectorAll('#article-list [data-article-id]').forEach(el => {
    const id = Number(el.getAttribute('data-article-id'));
    if (!Number.isNaN(id)) {
      // If you have a getter, prefer it; else just store a stub id (we’ll hydrate if needed)
      const a = (typeof getArticleById === 'function') ? getArticleById(id) : { id };
      arr.push(a);
    }
  });
  return arr;
}

if (!window.state) window.state = {};
if (!Array.isArray(state.articlesOrdered) || !state.articlesOrdered.length) {
  if (Array.isArray(state.articles) && state.articles.length) {
    state.articlesOrdered = state.articles.slice();
  } else {
    state.articlesOrdered = buildArticlesOrderFromDOM();
  }
}

  

// --- Wire nav by delegation (robust) ---
const navEl = content.querySelector('.modal-nav');
if (navEl && !navEl._wired) {
  navEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-btn');
    if (!btn) return;
    e.preventDefault();
    openAdjacent(btn.classList.contains('nav-prev') ? -1 : 1);
  });
  navEl._wired = true;
}


  
  // Self-healing: ensure nav arrows + share icon exist and are clickable
  (function ensureModalControls(){
    // header / image containers
    var header = content.querySelector('header');
    var imgWrapper = content.querySelector('.imgWrapper');

    // Share button
    var shareBtn = header ? header.querySelector('.modal-share-btn') : null;
    if (!shareBtn && header) {
      shareBtn = document.createElement('button');
      shareBtn.type = 'button';
      shareBtn.className = 'modal-share-btn';
      shareBtn.setAttribute('aria-label','Share this article');
      shareBtn.innerHTML = '<span class="sr-only">Share</span><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M12 3l4 4-1.41 1.41L13 7.83V14h-2V7.83L9.41 8.41 8 7l4-4zM5 10h2v8h10v-8h2v10H5V10z" fill="currentColor"/></svg>';
      header.appendChild(shareBtn);
    }

    // Nav overlay
    var nav = imgWrapper ? imgWrapper.querySelector('.modal-nav') : null;
    var prevBtn, nextBtn;
    if (!nav && imgWrapper) {
      nav = document.createElement('div');
      nav.className = 'modal-nav';
      prevBtn = document.createElement('button');
      prevBtn.className = 'nav-btn nav-prev';
      prevBtn.setAttribute('aria-label','Previous');
      prevBtn.textContent = '‹';
      nextBtn = document.createElement('button');
      nextBtn.className = 'nav-btn nav-next';
      nextBtn.setAttribute('aria-label','Next');
      nextBtn.textContent = '›';
      nav.appendChild(prevBtn); nav.appendChild(nextBtn);
      imgWrapper.appendChild(nav);
    } else if (nav) {
      prevBtn = nav.querySelector('.nav-prev');
      nextBtn = nav.querySelector('.nav-next');
    }

    // Wire handlers if available
    if (typeof openAdjacent === 'function') {
      if (prevBtn && !prevBtn._wired) { prevBtn.addEventListener('click', () => openAdjacent(-1)); prevBtn._wired = true; }
      if (nextBtn && !nextBtn._wired) { nextBtn.addEventListener('click', () => openAdjacent(1)); nextBtn._wired = true; }
    }

    if (shareBtn && !shareBtn._wired) {
      shareBtn.addEventListener('click', async () => {
        const url = (typeof getArticlePermalink === 'function') ? getArticlePermalink(currentArticle) : location.href;
        const title = currentArticle && currentArticle.title || 'Triangle 100';
        const text = currentArticle && currentArticle.short_desc ? String(currentArticle.short_desc).slice(0,160) : '';
        if (navigator.share) { try { await navigator.share({ title, text, url }); return; } catch(e){} }
        try {
          await navigator.clipboard.writeText(url);
          // visual ping
          shareBtn.style.transform = 'scale(0.97)';
          setTimeout(()=>{ shareBtn.style.transform=''; }, 120);
        } catch(e) {}
      });
      shareBtn._wired = true;
    }
  })();
// Count a view once per article per ~24h on this device
  if (shouldCountView(currentArticle.id, 24)) {
  // ensure it's a number (bigint-compatible)
  incrementArticleView(Number(currentArticle.id));
  }

  async function incrementArticleView(articleIdBigint) {
  if (articleIdBigint == null) return;
  const { data, error } = await supabaseClient
    .rpc('increment_article_view', { aid: articleIdBigint });
  if (error) console.warn('increment view error', error);
  return data; // new views total
}



  // small enter animation
  requestAnimationFrame(() => modal.classList.add('show'));

// --- close + reveal on map (used by all close paths)
function closeAndReveal() {
  // Capture the current article id BEFORE we remove the modal
  var revealId = getCurrentModalArticleId();

  // Start closing animation / removal
  try { modal.classList.remove('show'); } catch (e) {}
  setTimeout(function () {
    try { document.body.removeChild(modal); } catch (e) {}
  }, 120);

  // Helper to actually reveal on the map
  function doReveal() {
    try {
      if (!revealId) return;
      var a2 = getArticleFromCache(revealId);
      if (a2 && typeof revealArticleMarker === 'function') {
        revealArticleMarker(a2);
      }
    } catch (e) {
      console.warn('Reveal failed', e);
    }
  }

  if (window.innerWidth <= 500) {
    // Slide panel first so offset math is right, then reveal
    settleContentPanelToLowerThird();
    setTimeout(doReveal, 350);
  } else {
    doReveal();
  }

  // Clean up listeners
  window.removeEventListener('keydown', onEsc, true);
  try { window.removeEventListener('keydown', onArrow, true); } catch (e) {}
}



  // robust backdrop tap: “outside the content” check
  modal.addEventListener('click', (e) => {
    const clickedOutside = !content.contains(e.target);
    if (clickedOutside) closeAndReveal();
  });

  // prevent inside clicks from bubbling to modal
  content.addEventListener('click', (e) => e.stopPropagation());

  // Escape to close + reveal
  const onEsc = (ev) => { if (ev.key === 'Escape') closeAndReveal(); };
  window.addEventListener('keydown', onEsc, true);


  // progress bar on scroll
  descriptionWrapper.addEventListener('scroll', () => {
    const scrollTop = descriptionWrapper.scrollTop;
    const scrollHeight = descriptionWrapper.scrollHeight - descriptionWrapper.clientHeight;
    const percent = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;
    progressBar.style.width = `${percent}%`;
  });

  // image swap markers
  descriptionWrapper.addEventListener('scroll', () => {
    const markers = descriptionWrapper.querySelectorAll('.image-change');
    let lastPassed = null;
    markers.forEach((marker) => {
      const rect = marker.getBoundingClientRect();
      const wrapperRect = descriptionWrapper.getBoundingClientRect();
      if (rect.top - wrapperRect.top <= 50) lastPassed = marker;
    });
    if (lastPassed) {
      const newImg = lastPassed.getAttribute('data-img');
      if (newImg && image.src !== newImg) {
        image.classList.add('fade-out');
        setTimeout(() => {
          image.src = newImg;
          setTimeout(() => {
            image.classList.remove('fade-out');
            image.classList.add('fade-in');
          }, 50);
        }, 300);
        setTimeout(() => image.classList.remove('fade-in'), 700);
      }
    }
  });
}



async function openAdjacent(delta) {
  try { if (typeof ensureArticlesOrder === 'function') ensureArticlesOrder(); } catch (e) {}

  // Build order from DOM as a fallback
  function buildArticlesOrderFromDOM() {
    var arr = [];
    var nodes = document.querySelectorAll('#article-list [data-article-id]');
    nodes.forEach(function (el) {
      var id = Number(el.getAttribute('data-article-id'));
      if (!isNaN(id)) {
        var a = (typeof getArticleById === 'function') ? getArticleById(id) : { id: id };
        arr.push(a);
      }
    });
    return arr;
  }

  if (!window.state) window.state = {};
  if (!Array.isArray(state.articlesOrdered) || !state.articlesOrdered.length) {
    if (Array.isArray(state.articles) && state.articles.length) {
      state.articlesOrdered = state.articles.slice();
    } else {
      state.articlesOrdered = buildArticlesOrderFromDOM();
    }
  }
  if (!state.articlesOrdered.length) return;

  var curId = getCurrentModalArticleId();
  var idx = -1;
  for (var i = 0; i < state.articlesOrdered.length; i++) {
    if (Number(state.articlesOrdered[i] && state.articlesOrdered[i].id) === Number(curId)) { idx = i; break; }
  }
  if (idx < 0) idx = 0;

  var len = state.articlesOrdered.length;
  var nextIdx = (idx + delta + len) % len;
  var next = state.articlesOrdered[nextIdx];

  // Hydrate if needed
  if (next && (!next.title || !next.description)) {
    try {
      if (typeof fetchArticleById === 'function') {
        var full = await fetchArticleById(Number(next.id));
        if (full) next = full;
      }
    } catch (e) { console.warn('fetchArticleById failed', e); }
  }
  if (!next) return;

// Swap content in-place (your existing function)
if (typeof loadArticleIntoModal === 'function') {
  console.log('[openAdjacent] Using loadArticleIntoModal (no-flash swap) for article id:', next.id);
  loadArticleIntoModal(next);
} else {
  console.warn('[openAdjacent] loadArticleIntoModal not found. Falling back to close + reopen modal for article id:', next.id);
  try { 
    document.body.removeChild(document.querySelector('.modal')); 
  } catch (e) {
    console.error('[openAdjacent] Failed to remove modal during fallback:', e);
  }
  openModal(next);
}


  // Update the modal's current id
  var mm = document.querySelector('.modal');
  if (mm) mm.dataset.articleId = Number(next.id) || '';
}



// Keep a marker visible when part of the map is covered by #content.
// Works for mobile where the panel is BELOW (dragged up) or ABOVE (dragged down).
function panMarkerIntoViewWithContentOffset(marker, opts) {
  var map = state && state.map;
  if (!map || !marker || !marker.getLatLng) return;

  // Mobile only (avoid nudging desktop)
  if (window.innerWidth > 500) return;

  var margin = (opts && opts.margin) != null ? opts.margin : 16; // px
  var animate = (opts && 'animate' in opts) ? !!opts.animate : true;

  var mapEl = map.getContainer();
  var content = document.getElementById('content');
  if (!mapEl || !content) return;

  var m = mapEl.getBoundingClientRect();
  var c = content.getBoundingClientRect();
  var mapH = m.height;

  // Overlap measured INSIDE the map viewport
  var overlapTop    = Math.max(0, Math.min(c.bottom, m.bottom) - Math.max(c.top, m.top) );
  var overlapBottom = Math.max(0, Math.min(m.bottom, c.bottom) - Math.max(m.top, c.top) );

  // If the panel is below the map, overlapTop will be ~0 and overlapBottom > 0.
  // If above, overlapTop > 0 and overlapBottom ~0. If overlaying, both may be > 0.

  // Compute the allowed vertical band for the marker inside the map:
  var minY = overlapTop + margin;
  var maxY = mapH - overlapBottom - margin;

  // Marker’s current position in map container pixels
  var pt = map.latLngToContainerPoint(marker.getLatLng());

  // If already within the visible band, nothing to do
  if (pt.y >= minY && pt.y <= maxY) return;

  // Pan so the marker’s screen Y moves to the nearest edge of the band
  var targetY = (pt.y < minY) ? minY : maxY;
  var d = targetY - pt.y;      // positive if we want the marker to move DOWN on screen
  // panBy moves the MAP; the marker moves opposite: use -d
  map.panBy([0, -d], { animate: animate });
}






// Render the story submission form and replace the map when the user
// clicks the "Get involved" button.  This function also wires up
// submission handling and the back button.
function showStoryFormPage() {
  // Scroll to top of page
  window.scrollTo(0, 0);

  // Replace map with a static image for the form
  const mapDiv = document.getElementById('map');
  mapDiv.innerHTML = '';
  const img = document.createElement('img');
  img.src = 'https://www.drumcondratriangle.com/uploads/1/1/8/4/118430940/lillian-37walshroad-1937_orig.jpg';
  img.style.width = '100%';
  img.style.height = '100%';
  img.style.objectFit = 'cover';
  img.classList.add('fade-in');
  mapDiv.appendChild(img);

  // Build the form inside content
  const container = document.getElementById('content');
  container.innerHTML = `
    <header id="head_logo" class="draggable-content">
      <a href="https://drumcondratriangle.com/dtra100" class="icon" title="Return to the home page">
        <img src="https://www.drumcondratriangle.com/uploads/1/1/8/4/118430940/hardiman-lampost-transparent2_orig.png" alt="Hardiman Road Lamppost ‒ link to homepage" width="150" height="150" />
      </a>
      <h1>Triangle&nbsp;100</h1>
    </header>
    <!-- Drag handle replicating the desktop/mobile handle for the form view -->
    <div id="content-handle" class="content-handle"></div>

    <!-- STORY-SHARE dynamic section -->
    <section id="story-share">
      <div id="story-share-content" style="min-height: 1rem;"></div>
    </section>

    <div id="submission-form" style="max-width:600px;padding:2em;border:1px solid #ccc;border-radius:12px;background:#f9f9f9;">
      <form id="story-form">
        <label for="title" style="display:block;margin-top:1em;">Story Title:</label>
        <input name="title" placeholder="e.g. Life on O'Daly Road" required style="width:100%;padding:0.5em;border-radius:6px;border:1px solid #aaa;" />
        <label for="contributor" style="display:block;margin-top:1em;">Your Email Address:</label>
        <input name="contributor" placeholder="e.g. harry@brainesgarages.com" style="width:100%;padding:0.5em;border-radius:6px;border:1px solid #aaa;" />
        <label for="description" style="display:block;margin-top:1em;">Your Story:</label>
        <textarea name="description" placeholder="Your memories of people, places, traditions and memorable events." required style="width:100%;padding:0.5em;border-radius:6px;border:1px solid #aaa;"></textarea>
        <button type="submit" style="margin-top:1.5em;padding:0.75em 1.5em;background-color:#4caf50;color:white;border:none;border-radius:6px;cursor:pointer;">Submit</button>
        <button id="back-button" type="button" style="margin-top:1.5em;padding:0.75em 1.5em;background-color:#4caf50;color:white;border:none;border-radius:6px;cursor:pointer;">Back</button>
      </form>
    </div>
  `;

  container.style.opacity = 0;
  container.classList.add('fade-in');

  // --- Inject STORY-SHARE content now that #story-share exists ---
  (async () => {
    try {
      // Optional: temporary loading text
      const placeholder = document.getElementById('story-share-content');
      if (placeholder) placeholder.textContent = 'Loading…';

      const shareHtml = await fetchContentByType('STORY-SHARE');
      const target = document.getElementById('story-share-content') || document.getElementById('story-share');
      if (target) {
        target.innerHTML = shareHtml || '';
        // Safety: ensure any share button has a label
        const btn = target.querySelector('#share-story-btn, .share-story-btn, button[data-role="share"]');
        if (btn && !btn.textContent.trim()) {
          btn.textContent = 'Share your story';
        }
      }
    } catch (e) {
      console.error('Failed to load STORY-SHARE content:', e);
    }
  })();

  // Attach event listeners after injecting the form
  const form = document.getElementById('story-form');
  const backButton = document.getElementById('back-button');
  if (backButton) {
    backButton.addEventListener('click', () => {
      document.body.classList.add('fade-out');
      setTimeout(() => {
        window.location.replace(window.location.pathname);
      }, 500);
    });
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = form.title.value.trim();
    const description = form.description.value.trim();
    const contributor = form.contributor.value.trim();
    const { error } = await supabaseClient.from('articles').insert([
      {
        title,
        description,
        short_desc: description.slice(0, 100) + '...',
        contributor,
        active: false
      }
    ]);
    if (error) {
      alert('Error submitting your story. Please try again.');
    } else {
      document.body.classList.add('fade-out');
      setTimeout(() => {
        alert('Thank you for your story! It will be reviewed and added soon.');
        location.href = location.href;
        window.scrollTo(0, 0);
      }, 500);
    }
  });
}

// -----------------------------------------------------------------------------
// Event listeners and init
// -----------------------------------------------------------------------------

// Set up drag-to-move behaviour on mobile for the content section
// This replicates the original drag functionality using touch events.
/*
 * Enable drag-to-move on mobile screens.  The content panel is
 * absolutely positioned with a CSS top and bottom; dragging adjusts
 * the top value in pixels.  Both the logo header and the dedicated
 * drag handle (#content-handle) act as handles.  The panel cannot
 * move above the top of the viewport (top=0) or below a maximum
 * threshold to prevent it disappearing off screen.  This behaviour
 * replicates the original design where dragging down reveals more of
 * the map and dragging up allows the content to cover the map.
 */
(function setupDrag() {
  const content = document.getElementById('content');
  // Potential drag handles: the logo/header and the explicit handle element.
  const handles = [];
  const logo = document.getElementById('head_logo');
  if (logo) handles.push(logo);
  const handleEl = document.getElementById('content-handle');
  if (handleEl) handles.push(handleEl);
  if (handles.length === 0) return;
  let isDragging = false;
  let startY = 0;
  let startTop = 0;
  const dragSensitivity = 1.2;
  handles.forEach((h) => {
    h.addEventListener('touchstart', (e) => {
      // Only engage dragging on mobile sizes
      if (window.innerWidth > 500) return;
      isDragging = true;
      // Starting finger position
      startY = e.touches[0].clientY;
      // Starting top position of the content panel (in pixels)
      startTop = content.getBoundingClientRect().top;
      // Remove any transform so we can control top directly
      content.style.transform = '';
      // Temporarily disable internal scrolling during drag
      content.style.overflowY = 'hidden';
      // Prevent default to avoid selecting text
      e.preventDefault();
    });
  });
  window.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const deltaY = (e.touches[0].clientY - startY) * dragSensitivity;
    // Compute new top value in px
    let newTop = startTop + deltaY;
    // Clamp between 0 (cover map) and a maximum to prevent overscroll
    const maxTop = window.innerHeight - 100; // leave at least 100px visible
    if (newTop < 0) newTop = 0;
    if (newTop > maxTop) newTop = maxTop;
    content.style.top = `${newTop}px`;
    e.preventDefault();
  }, { passive: false });
  window.addEventListener('touchend', () => {
    isDragging = false;
    // Restore scrollability once the drag ends
    content.style.overflowY = 'auto';
  });
})();

// Attach click handler for the share story button
document.getElementById('share-story-btn').addEventListener('click', (e) => {
  e.preventDefault();
  const pageContent = document.getElementById('content'); 
  pageContent.classList.add('fade-out');
  setTimeout(() => {
    showStoryFormPage();
  }, 600);
});

// Kick off loading the site
loadArticles();

// Inject minimal CSS for the modal 'View on Map' button
(function ensureModalViewBtnCSS(){
  if (document.getElementById('modal-view-btn-css')) return;
  const css = `.modal .modal-footer { display:flex; gap:8px; align-items:center; padding:10px 14px; border-top:1px solid #e5e7eb; background:#fff; }
  .modal .modal-view-btn { appearance:none; border:1px solid #2563eb; background:#fff; color:#1e3a8a; font-weight:600; font-size:13px; padding:6px 10px; border-radius:8px; cursor:pointer; }
  .modal .modal-view-btn:hover { background:#eff6ff; }`;
  const style = document.createElement('style');
  style.id = 'modal-view-btn-css';
  style.type = 'text/css';
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
})();


// Inject CSS for modal nav + share icon + snappy swap fade
(function ensureModalUXCSS(){
  if (document.getElementById('modal-ux-css')) return;
  const css = `
  .modal-nav{position:absolute;inset:0;display:flex;align-items:center;justify-content:space-between;pointer-events:none;z-index:2;}
  .modal-nav .nav-btn{pointer-events:auto;appearance:none;border:none;background:rgba(0,0,0,0.45);color:#fff;width:36px;height:36px;border-radius:50%;font-size:20px;font-weight:700;line-height:36px;text-align:center;margin:0 8px;cursor:pointer;transition:background .15s ease,transform .05s ease;}
  .modal-nav .nav-btn:hover{background:rgba(0,0,0,0.6);} .modal-nav .nav-btn:active{transform:translateY(1px);}
  .modal-share-btn{position:absolute;right:8px;top:8px;appearance:none;border:1px solid rgba(0,0,0,.12);background:#fff;color:#374151;border-radius:8px;padding:6px 10px;font:600 13px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.08);display:inline-flex;align-items:center;gap:6px;z-index:3;}
  .modal-share-btn:hover{background:#f9fafb;}
  .modal-share-btn .sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;}
  .modal-share-btn svg{display:block;}
  .modal-content.swap-fade{ transition: opacity .16s ease; }
  .modal-content.swap-fade.fade-out{ opacity: 0; }
  .share-popup{position:fixed;left:50%;top:10%;transform:translateX(-50%);background:#fff;color:#111;border:1px solid #e5e7eb;border-radius:10px;padding:8px 12px;box-shadow:0 10px 26px rgba(0,0,0,.12);z-index:2000;font:500 13px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}
  .share-popup a{color:#2563eb;text-decoration:none;} .share-popup a:hover{text-decoration:underline;}
  `;
  const style = document.createElement('style');
  style.id = 'modal-ux-css';
  style.type = 'text/css';
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
})();
