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
    // INTRO -> <intro id="intro">...</intro>
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

    // STORY-SHARE -> <story-share id="story-share">...</story-share>
    const shareHtml = await fetchContentByType('STORY-SHARE');
    const shareEl = document.getElementById('story-share');
    if (shareEl && shareHtml) shareEl.innerHTML = shareHtml;

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
  map: null,
  activeTheme: null
};

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


// --- Lucky Dip → Map highlight (v3) ---
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
function highlightSelectedArticleMarker(marker, opts = {}) {
  const {
    zoomTo = true, targetZoom = 17, haloColor = '#2563eb',
    haloDurationMs = 3200, dimOthers = true,
  } = opts;
  if (!marker || !state?.map) return;

  const doHighlight = () => {
    const latlng = marker.getLatLng();
    if (zoomTo) {
      if (state.map.getZoom() < targetZoom) state.map.flyTo(latlng, targetZoom, { duration: 0.6, easeLinearity: 0.25 });
      else state.map.panTo(latlng, { animate: true, duration: 0.6 });
    }
    const ring = L.circleMarker(latlng, { radius: 11, color: haloColor, weight: 3, fill: false, opacity: 0.95 }).addTo(state.map);
    try { marker.bringToFront?.(); } catch {}
    const el = marker.getElement?.(); const prev = el ? el.style.filter : '';
    if (el) el.style.filter = 'brightness(1.25) drop-shadow(0 0 6px rgba(37,99,235,.6))';
    let restore = [];
    if (dimOthers && state.articleMarkers?.getLayers) {
      const layers = state.articleMarkers.getLayers();
      restore = layers.filter(m => m !== marker).map(m => {
        const e = m.getElement?.(); if (!e) return null;
        const p = e.style.opacity; e.style.opacity = '0.45'; return () => { e.style.opacity = p; };
      }).filter(Boolean);
    }
    setTimeout(() => {
      try { state.map.removeLayer(ring); } catch {}
      if (el) el.style.filter = prev;
      restore.forEach(fn => fn && fn());
    }, haloDurationMs);
  };
  if (state.articleMarkers?.zoomToShowLayer) state.articleMarkers.zoomToShowLayer(marker, doHighlight);
  else doHighlight();
}
// --- end Lucky Dip → Map highlight (v3) ---

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
  state.map.addControl(new ResidentsToggleControl());

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
    marker.on('click', () => openModal(article));
    state.articleMarkers.addLayer(marker);
    marker._article = article;
    try { state.articleMarkerIndex.set(_articleKey(article), marker); } catch {}

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
  // toggle sepia filter
  mapEl.classList.toggle('sepia');
  if (visible) {
    // hide residents, show articles
    state.peopleMarkers.forEach((m) => state.map.removeLayer(m));
    if (state.articleMarkers) state.map.addLayer(state.articleMarkers);
    ResidentMoveEgg.hideLayer(state.map);
    button.innerHTML = 'Switch to 1929';
  } else {
    // hide articles, show residents
    if (state.articleMarkers) state.map.removeLayer(state.articleMarkers);
    state.peopleMarkers.forEach((m) => m.addTo(state.map));
    ResidentMoveEgg.showLayer(state.map);
    ResidentMoveEgg.clear(state.map);
    button.innerHTML = 'Switch to Stories';
  }
}

// Create and display a modal for a given article
function openModal(article) {
  // Create modal overlay
  const modal = document.createElement('div');
  modal.className = 'modal';
  // Create modal content wrapper
  const content = document.createElement('div');
  content.className = 'modal-content';
  // Header section with title and short description
  const header = document.createElement('header');
  const title = document.createElement('h2');
  title.textContent = article.title || '';
  const shortDesc = document.createElement('h3');
  shortDesc.textContent = article.short_desc || '';
  header.appendChild(title);
  header.appendChild(shortDesc);
  // Image wrapper
  const imgWrapper = document.createElement('div');
  imgWrapper.className = 'imgWrapper';
  const image = document.createElement('img');
  image.src = article.img || '';
  image.alt = article.title || '';
  imgWrapper.appendChild(image);
  // Description container with progress bar
  const descriptionWrapper = document.createElement('div');
  descriptionWrapper.className = 'descriptionWrapper';
  // Progress bar (sticky)
  const progressBar = document.createElement('div');
  progressBar.className = 'progress-bar';
  descriptionWrapper.appendChild(progressBar);
  // Description content
  const description = document.createElement('div');
  description.innerHTML = (article.description || '').replace(/\n/g, '<br>');
  descriptionWrapper.appendChild(description);
  // Footer with contributor
  const footer = document.createElement('footer');
  footer.textContent = `Shared by: ${article.contributor || ''}`;
  // Assemble modal
  content.appendChild(header);
  content.appendChild(imgWrapper);
  content.appendChild(descriptionWrapper);
  content.appendChild(footer);
  modal.appendChild(content);
  document.body.appendChild(modal);
  // Animate show after small delay
  setTimeout(() => {
    modal.classList.add('show');
  }, 100);
  // Clicking outside content closes modal
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });
  // Update progress bar on scroll
  descriptionWrapper.addEventListener('scroll', () => {
    const scrollTop = descriptionWrapper.scrollTop;
    const scrollHeight = descriptionWrapper.scrollHeight - descriptionWrapper.clientHeight;
    const percent = (scrollTop / scrollHeight) * 100;
    progressBar.style.width = `${percent}%`;
  });
  // Swap image on scroll markers
  descriptionWrapper.addEventListener('scroll', () => {
    const markers = descriptionWrapper.querySelectorAll('.image-change');
    let lastPassed = null;
    markers.forEach((marker) => {
      const rect = marker.getBoundingClientRect();
      const wrapperRect = descriptionWrapper.getBoundingClientRect();
      if (rect.top - wrapperRect.top <= 50) {
        lastPassed = marker;
      }
    });
    if (lastPassed) {
      const newImg = lastPassed.getAttribute('data-img');
      if (newImg && image.src !== newImg) {
        // Fade out image
        image.classList.add('fade-out');
        setTimeout(() => {
          image.src = newImg;
          setTimeout(() => {
            image.classList.remove('fade-out');
            image.classList.add('fade-in');
          }, 50);
        }, 300);
        setTimeout(() => {
          image.classList.remove('fade-in');
        }, 700);
      }
    }
  });
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
