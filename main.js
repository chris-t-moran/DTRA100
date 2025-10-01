/**
 * Triangle100 - Optimized Application Core
 * Drumcondra Triangle Centenary Project
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// =============================================================================
// Configuration & State
// =============================================================================

import { CONFIG as IMPORTED_CONFIG } from './config.js';
const CONFIG = IMPORTED_CONFIG;

const state = {
  db: createClient(CONFIG.supabase.url, CONFIG.supabase.key),
  map: null,
  articles: [],
  articlesById: new Map(),
  residents: [],
  articleMarkers: null,
  residentMarkers: [],
  residentIndex: null,
  activeTheme: null,
  lastSelectedMarker: null,
  residentMoveLayer: null,
  searchControl: null
};

// =============================================================================
// Utilities
// =============================================================================

const utils = {
  isMobile: () => window.innerWidth <= 500,
  
  escape: (str) => String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;'),
  
  debounce: (fn, ms) => {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  },
  
  updateURL: (articleId, replace = false) => {
    const url = new URL(window.location.href);
    articleId ? url.searchParams.set('article', articleId) : url.searchParams.delete('article');
    history[replace ? 'replaceState' : 'pushState']({}, '', url);
  },
  
  getPermalink: (articleId) => {
    if (!articleId) return window.location.href;
    return `${window.location.origin}${window.location.pathname}?article=${articleId}`;
  }
};

// =============================================================================
// View Tracking (Session-based - lighter than localStorage)
// =============================================================================

const viewTracker = (() => {
  const viewed = new Map();
  
  return {
    shouldCount: (articleId) => {
      const key = `a${articleId}`;
      const now = Date.now();
      const last = viewed.get(key);
      const ttl = CONFIG.view.ttlHours * 3600000;
      
      if (!last || now - last >= ttl) {
        viewed.set(key, now);
        return true;
      }
      return false;
    },
    
    increment: async (articleId) => {
      try {
        await state.db.rpc('increment_article_view', { aid: Number(articleId) });
      } catch (e) {
        console.warn('View tracking failed:', e);
      }
    }
  };
})();

// =============================================================================
// Address Normalization (for resident search)
// =============================================================================

const addressUtils = (() => {
  const STREET_ABBREV = {
    rd: 'road', st: 'street', ave: 'avenue', av: 'avenue',
    dr: 'drive', ct: 'court', pl: 'place', sq: 'square',
    pk: 'park', gdns: 'gardens', grn: 'green', tce: 'terrace'
  };
  
  const normalize = (str) => {
    if (!str) return '';
    return str.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };
  
  const canonicalStreet = (str) => {
    return normalize(str)
      .split(' ')
      .map(w => STREET_ABBREV[w] || w)
      .join(' ');
  };
  
  return {
    parse: (query) => {
      const norm = normalize(query);
      const match = norm.match(/^(\d+)\s+(.+)$/);
      return match 
        ? { num: parseInt(match[1], 10), street: canonicalStreet(match[2]) }
        : { num: null, street: canonicalStreet(norm) };
    },
    
    canonical: canonicalStreet
  };
})();

// =============================================================================
// Data Loading
// =============================================================================

async function loadContent() {
  const fetchByType = async (type) => {
    const { data } = await state.db
      .from('site_content')
      .select('str_content')
      .eq('str_contentType', type)
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.str_content || null;
  };
  
  try {
    const [intro, title, share, about] = await Promise.all([
      fetchByType('INTRO'),
      fetchByType('TITLE'),
      fetchByType('STORY-SHARE'),
      fetchByType('ABOUT')
    ]);
    
    const introEl = document.getElementById('intro');
    if (introEl && intro) introEl.innerHTML = intro;
    
    if (title) {
      const tmp = document.createElement('div');
      tmp.innerHTML = title;
      document.title = tmp.textContent.trim() || document.title;
    }
    
    const shareEl = document.getElementById('story-share');
    if (shareEl && share) shareEl.innerHTML = share;
    
    const aboutEl = document.getElementById('about-project');
    if (aboutEl && about) {
      aboutEl.innerHTML = about;
      const yearEl = aboutEl.querySelector('#about-year');
      if (yearEl) yearEl.textContent = new Date().getFullYear();
      
      const shareLink = aboutEl.querySelector('#about-share-link');
      if (shareLink) {
        shareLink.addEventListener('click', (e) => {
          e.preventDefault();
          showStoryForm();
        });
      }
    }
  } catch (e) {
    console.error('Content load failed:', e);
  }
}

async function loadArticles() {
  const { data, error } = await state.db
    .from('articles')
    .select('*')
    .eq('active', true)
    .order('id', { ascending: true });
  
  if (error) {
    console.error('Articles load failed:', error);
    return;
  }
  
  state.articles = data;
  data.forEach(a => state.articlesById.set(a.id, a));
}

async function loadResidents() {
  const { data, error } = await state.db
    .from('residents')
    .select('*')
    .eq('active', true);
  
  if (error) {
    console.error('Residents load failed:', error);
    return;
  }
  
  state.residents = data;
  buildResidentIndex();
}

function buildResidentIndex() {
  const index = [];
  state.residents.forEach(r => {
    index.push({
      resident: r,
      num: r.housenumber ? Number(r.housenumber) : null,
      street: addressUtils.canonical(r.road || '')
    });
  });
  state.residentIndex = index;
}

// =============================================================================
// Map Initialization
// =============================================================================

async function initMap() {
  const isMobile = utils.isMobile();
  const config = isMobile ? CONFIG.map.mobile : CONFIG.map.desktop;
  
  state.map = L.map('map').setView(config.center, config.zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(state.map);
  
  // Article markers with clustering
  state.articleMarkers = L.markerClusterGroup({
    maxClusterRadius: CONFIG.view.clusterRadius,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true
  });
  
  state.articles.forEach(article => {
    const marker = L.circleMarker([article.lat, article.lon], {
      radius: 7,
      color: '#4caf50',
      fillColor: 'orange',
      fillOpacity: 0.8,
      weight: 1
    });
    
    marker._article = article;
    marker._baseStyle = { ...marker.options };
    marker.on('click', () => {
      selectMarker(marker);
      openModal(article);
    });
    
    state.articleMarkers.addLayer(marker);
  });
  
  state.map.addLayer(state.articleMarkers);
  
  // Resident markers (not added to map initially)
  createResidentMarkers();
  
  // Controls
  addResidentsToggle();
  
  // Expose for debugging
  window.triMap = state.map;
  window.triState = state;
}

function createResidentMarkers() {
  state.residents.forEach(r => {
    const hasFormer = Number.isFinite(r.formerAddr_lat) && Number.isFinite(r.formerAddr_lon);
    
    const marker = L.circleMarker([r.lat, r.lon], hasFormer ? {
      radius: 8,
      color: '#f97316',
      weight: 2,
      fillColor: '#ffedd5',
      fillOpacity: 0.95
    } : {
      radius: 7,
      color: 'gold',
      weight: 1,
      fillColor: '#4caf50',
      fillOpacity: 1
    });
    
    marker._resident = r;
    marker.bindPopup(createResidentPopup(r), {
      className: 'resident-popup-wrap',
      maxWidth: 320
    });
    
    if (hasFormer) {
      marker.on('add', () => {
        const el = marker.getElement();
        if (el) el.classList.add('resident-glow');
      });
      marker.on('click', () => showResidentMove(r));
    }
    
    state.residentMarkers.push(marker);
  });
}

// =============================================================================
// Resident Move Visualization
// =============================================================================

function showResidentMove(resident) {
  if (!state.residentMoveLayer) {
    state.residentMoveLayer = L.layerGroup().addTo(state.map);
  }
  
  state.residentMoveLayer.clearLayers();
  
  const hasFormer = Number.isFinite(resident.formerAddr_lat) && Number.isFinite(resident.formerAddr_lon);
  if (!hasFormer) return;
  
  const from = [resident.formerAddr_lat, resident.formerAddr_lon];
  const to = [resident.lat, resident.lon];
  
  const curve = bezierCurve(from, to, 0.25, 48);
  const line = L.polyline(curve, {
    color: '#f97316',
    weight: 3,
    opacity: 0.95,
    dashArray: '4 6'
  });
  
  const halo = L.circleMarker(to, {
    radius: 7,
    color: '#f97316',
    weight: 3,
    fillColor: '#fb923c',
    fillOpacity: 0.6
  });
  
  const former = L.circleMarker(from, {
    radius: 5,
    color: '#f97316',
    weight: 2,
    fillColor: '#fb923c',
    fillOpacity: 0.6
  }).bindTooltip(`Former: ${resident.formeraddress || 'Unknown'}`);
  
  state.residentMoveLayer.addLayer(line);
  state.residentMoveLayer.addLayer(halo);
  state.residentMoveLayer.addLayer(former);
}

function bezierCurve(from, to, curvature = 0.25, segments = 48) {
  const [lat1, lon1] = from;
  const [lat2, lon2] = to;
  const mx = (lat1 + lat2) / 2;
  const my = (lon1 + lon2) / 2;
  const vx = lat2 - lat1;
  const vy = lon2 - lon1;
  const len = Math.sqrt(vx * vx + vy * vy) || 1e-9;
  const px = -vy / len;
  const py = vx / len;
  const offset = len * curvature;
  const cx = mx + px * offset;
  const cy = my + py * offset;
  
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    pts.push([
      a * lat1 + b * cx + c * lat2,
      a * lon1 + b * cy + c * lon2
    ]);
  }
  return pts;
}

// =============================================================================
// UI - Residents Toggle & Search
// =============================================================================

function addResidentsToggle() {
  const ResidentsToggle = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function() {
      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      const btn = L.DomUtil.create('a', 'residents-toggle-btn', container);
      btn.href = '#';
      btn.innerHTML = 'Switch to 1929';
      btn.title = 'Show/Hide First Residents';
      
      L.DomEvent.on(btn, 'click', (e) => {
        L.DomEvent.stopPropagation(e);
        L.DomEvent.preventDefault(e);
        toggleResidents(btn);
      });
      
      return container;
    }
  });
  
  const ResidentsSearch = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function() {
      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      container.style.cssText = 'padding:6px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.2)';
      
      const input = L.DomUtil.create('input', '', container);
      input.type = 'search';
      input.placeholder = 'Search address…';
      input.style.cssText = 'width:180px;border:1px solid #ccc;padding:6px 8px;outline:none';
      
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);
      
      input.addEventListener('input', utils.debounce(() => {
        const q = input.value.trim();
        q ? filterResidents(q) : clearResidentFilter();
      }, 200));
      
      return container;
    }
  });
  
  state.map.addControl(new ResidentsToggle());
  state.searchControl = new ResidentsSearch();
}

function toggleResidents(btn) {
  const showing = state.residentMarkers.length > 0 && state.map.hasLayer(state.residentMarkers[0]);
  const mapEl = document.getElementById('map');
  
  mapEl.classList.toggle('sepia', !showing);
  
  if (showing) {
    // Show articles
    state.residentMarkers.forEach(m => state.map.removeLayer(m));
    if (state.articleMarkers) state.map.addLayer(state.articleMarkers);
    if (state.residentMoveLayer) state.map.removeLayer(state.residentMoveLayer);
    btn.innerHTML = 'Switch to 1929';
    try { state.map.removeControl(state.searchControl); } catch(e) {}
    clearResidentFilter();
  } else {
    // Show residents
    if (state.articleMarkers) state.map.removeLayer(state.articleMarkers);
    state.residentMarkers.forEach(m => m.addTo(state.map));
    btn.innerHTML = 'Switch to Stories';
    try { state.map.addControl(state.searchControl); } catch(e) {}
  }
}

function filterResidents(query) {
  const parsed = addressUtils.parse(query);
  const matches = [];
  
  state.residentIndex.forEach(({ resident, num, street }) => {
    if (!street) return;
    
    let isMatch = false;
    if (parsed.num !== null) {
      isMatch = num === parsed.num && street.includes(parsed.street);
    } else {
      isMatch = street.includes(parsed.street);
    }
    
    if (isMatch) {
      const marker = state.residentMarkers.find(m => m._resident === resident);
      if (marker) matches.push(marker);
    }
  });
  
  state.residentMarkers.forEach(m => {
    const visible = matches.includes(m);
    m.setStyle({ opacity: visible ? 1 : 0, fillOpacity: visible ? 0.7 : 0 });
    const el = m.getElement();
    if (el) el.style.pointerEvents = visible ? '' : 'none';
  });
  
  if (matches.length === 1) {
    const ll = matches[0].getLatLng();
    state.map.flyTo(ll, Math.max(17, state.map.getZoom()), { duration: 0.6 });
  } else if (matches.length > 1) {
    const group = L.featureGroup(matches);
    state.map.fitBounds(group.getBounds().pad(0.2));
  }
}

function clearResidentFilter() {
  state.residentMarkers.forEach(m => {
    m.setStyle({ opacity: 1, fillOpacity: 0.7 });
    const el = m.getElement();
    if (el) el.style.pointerEvents = '';
  });
}

// =============================================================================
// UI - Article Grid & Themes
// =============================================================================

function renderThemes() {
  const themes = {};
  state.articles.forEach(a => {
    themes[a.theme] = themes[a.theme] || [];
    themes[a.theme].push(a);
  });
  
  const container = document.getElementById('themes');
  container.innerHTML = '';
  
  Object.keys(themes).forEach(theme => {
    const btn = document.createElement('div');
    btn.className = 'theme';
    btn.textContent = theme;
    btn.addEventListener('click', () => {
      if (state.activeTheme === theme) {
        state.activeTheme = null;
        renderArticles(null);
        setActiveTheme(null);
      } else {
        state.activeTheme = theme;
        renderArticles(theme);
        setActiveTheme(theme);
      }
    });
    container.appendChild(btn);
  });
  
  // Lucky Dip
  const lucky = document.createElement('div');
  lucky.className = 'theme';
  lucky.textContent = 'Lucky Dip!';
  lucky.style.background = 'gold';
  lucky.addEventListener('click', () => {
    const random = state.articles[Math.floor(Math.random() * state.articles.length)];
    if (random) openModal(random);
  });
  container.appendChild(lucky);
}

function setActiveTheme(theme) {
  document.querySelectorAll('#themes .theme').forEach(el => {
    el.classList.toggle('active', el.textContent === theme);
  });
}

function renderArticles(theme) {
  const filtered = theme 
    ? state.articles.filter(a => a.theme === theme)
    : state.articles;
  
  const list = document.getElementById('article-list');
  list.innerHTML = '';
  
  const grid = document.createElement('ul');
  grid.className = 'grid';
  
  filtered.forEach(article => {
    const li = document.createElement('li');
    li.className = 'card';
    li.dataset.articleId = article.id;
    
    const link = document.createElement('a');
    link.href = 'javascript:void(0)';
    link.addEventListener('click', () => openModal(article));
    link.innerHTML = `
      <img src="${article.img}" alt="${utils.escape(article.title)}" />
      <div class="${article.active ? 'overlay' : 'inactiveoverlay'}">${utils.escape(article.title)}</div>
    `;
    
    li.appendChild(link);
    grid.appendChild(li);
  });
  
  list.appendChild(grid);
}

// =============================================================================
// Marker Selection & Reveal
// =============================================================================

function selectMarker(marker) {
  if (state.lastSelectedMarker && state.lastSelectedMarker !== marker) {
    state.lastSelectedMarker.setStyle(state.lastSelectedMarker._baseStyle);
  }
  
  marker.setStyle({
    color: '#f97316',
    fillColor: '#ffedd5',
    weight: 3,
    radius: Math.max(marker.options.radius || 7, 9)
  });
  
  if (!utils.isMobile() && marker.getLatLng) {
    state.map.panTo(marker.getLatLng(), { animate: true, duration: 0.6 });
  }
  
  state.lastSelectedMarker = marker;
}

function revealAndHighlightMarker(article) {
  // Find the marker for this article
  let marker = null;
  
  try {
    const layers = state.articleMarkers?.getLayers() || [];
    marker = layers.find(m => m._article?.id === article.id);
  } catch(e) {
    console.warn('Failed to find marker:', e);
    return;
  }
  
  if (!marker) return;
  
  // If marker is in a cluster, zoom to reveal it
  const afterVisible = () => {
    // Check if still clustered and spiderfy if needed
    try {
      if (typeof state.articleMarkers.getVisibleParent === 'function') {
        const parent = state.articleMarkers.getVisibleParent(marker);
        if (parent && parent !== marker && typeof parent.spiderfy === 'function') {
          setTimeout(() => parent.spiderfy(), 0);
        }
      }
    } catch(e) {}
    
    // Highlight the marker
    selectMarker(marker);
    
    // Bring to front
    try { marker.bringToFront?.(); } catch(e) {}
    
    // Pan into view on mobile (accounting for content panel)
    if (utils.isMobile()) {
      setTimeout(() => panMarkerIntoView(marker), 0);
    }
  };
  
  // Zoom to show the marker if it's not visible
  if (typeof state.articleMarkers.zoomToShowLayer === 'function') {
    state.articleMarkers.zoomToShowLayer(marker, afterVisible);
  } else {
    afterVisible();
  }
}

function panMarkerIntoView(marker) {
  if (!marker?.getLatLng || !utils.isMobile()) return;
  
  const mapEl = state.map.getContainer();
  const content = document.getElementById('content');
  if (!mapEl || !content) return;
  
  const margin = 20;
  const mapRect = mapEl.getBoundingClientRect();
  const contentRect = content.getBoundingClientRect();
  
  // Calculate overlap
  const overlapTop = Math.max(0, Math.min(contentRect.bottom, mapRect.bottom) - Math.max(contentRect.top, mapRect.top));
  const overlapBottom = Math.max(0, Math.min(mapRect.bottom, contentRect.bottom) - Math.max(mapRect.top, contentRect.top));
  
  // Available vertical space for marker
  const minY = overlapTop + margin;
  const maxY = mapRect.height - overlapBottom - margin;
  
  // Current marker position
  const pt = state.map.latLngToContainerPoint(marker.getLatLng());
  
  // If already visible, don't pan
  if (pt.y >= minY && pt.y <= maxY) return;
  
  // Pan to bring marker into view
  const targetY = (pt.y < minY) ? minY : maxY;
  const deltaY = targetY - pt.y;
  
  state.map.panBy([0, -deltaY], { animate: true });
}

// =============================================================================
// Modal System
// =============================================================================

let currentModal = null;

function openModal(article) {
  if (currentModal) {
    updateModalContent(article);
    return;
  }
  
  currentModal = createModal(article);
  document.body.appendChild(currentModal);
  requestAnimationFrame(() => currentModal.classList.add('show'));
  
  utils.updateURL(article.id, false);
  
  if (viewTracker.shouldCount(article.id)) {
    viewTracker.increment(article.id);
  }
}

function createModal(article) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.dataset.articleId = article.id;
  
  const content = document.createElement('div');
  content.className = 'modal-content';
  content.innerHTML = getModalHTML(article);
  
  modal.appendChild(content);
  
  // Close handlers
  const closeModal = () => {
    const articleId = modal.dataset.articleId;
    
    modal.classList.remove('show');
    setTimeout(() => {
      if (modal.parentNode) modal.parentNode.removeChild(modal);
      currentModal = null;
    }, 120);
    utils.updateURL(null, false);
    
    // Reveal marker on map after closing
    if (articleId) {
      const article = state.articlesById.get(Number(articleId));
      if (article) {
        revealAndHighlightMarker(article);
      }
    }
  };
  
  modal.addEventListener('click', (e) => {
    if (!content.contains(e.target)) closeModal();
  });
  
  content.addEventListener('click', (e) => e.stopPropagation());
  
  const onEsc = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      window.removeEventListener('keydown', onEsc);
    }
  };
  window.addEventListener('keydown', onEsc);
  
  // Navigation
  content.querySelector('.nav-prev')?.addEventListener('click', () => navigateModal(-1));
  content.querySelector('.nav-next')?.addEventListener('click', () => navigateModal(1));
  
  // Share
  content.querySelector('.modal-share-btn')?.addEventListener('click', async () => {
    const url = utils.getPermalink(article.id);
    const shareData = { title: article.title, text: article.short_desc, url };
    
    if (navigator.share) {
      try { await navigator.share(shareData); return; } catch(e) {}
    }
    
    try {
      await navigator.clipboard.writeText(url);
      const btn = content.querySelector('.modal-share-btn');
      const old = btn.innerHTML;
      btn.innerHTML = 'Copied!';
      setTimeout(() => btn.innerHTML = old, 900);
    } catch(e) {}
  });
  
  return modal;
}

function getModalHTML(article) {
  const esc = utils.escape;
  return `
    <button class="modal-share-btn" aria-label="Share">
      <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 3l4 4-1.41 1.41L13 7.83V14h-2V7.83L9.41 8.41 8 7l4-4zM5 10h2v8h10v-8h2v10H5V10z" fill="currentColor"/></svg>
    </button>
    <header>
      <h2>${esc(article.title)}</h2>
      <h3>${esc(article.short_desc)}</h3>
    </header>
    <div class="imgWrapper">
      <img src="${article.img}" alt="${esc(article.title)}" />
      <div class="modal-nav">
        <button class="nav-btn nav-prev" aria-label="Previous">‹</button>
        <button class="nav-btn nav-next" aria-label="Next">›</button>
      </div>
    </div>
    <div class="descriptionWrapper">
      <div class="modal-description">${(article.description || '').replace(/\n/g, '<br>')}</div>
    </div>
    <footer class="modal-footer">
      <span class="modal-contrib">Shared by: ${esc(article.contributor || '')}</span>
    </footer>
  `;
}

function updateModalContent(article) {
  if (!currentModal) return;
  
  const content = currentModal.querySelector('.modal-content');
  content.classList.add('fade-out');
  
  setTimeout(() => {
    content.innerHTML = getModalHTML(article);
    content.classList.remove('fade-out');
    currentModal.dataset.articleId = article.id;
    utils.updateURL(article.id, true);
    
    if (viewTracker.shouldCount(article.id)) {
      viewTracker.increment(article.id);
    }
    
    // Re-bind handlers
    content.querySelector('.nav-prev')?.addEventListener('click', () => navigateModal(-1));
    content.querySelector('.nav-next')?.addEventListener('click', () => navigateModal(1));
    content.querySelector('.modal-share-btn')?.addEventListener('click', async () => {
      const url = utils.getPermalink(article.id);
      if (navigator.share) {
        try { await navigator.share({ title: article.title, url }); return; } catch(e) {}
      }
      try {
        await navigator.clipboard.writeText(url);
        const btn = content.querySelector('.modal-share-btn');
        const old = btn.innerHTML;
        btn.innerHTML = 'Copied!';
        setTimeout(() => btn.innerHTML = old, 900);
      } catch(e) {}
    });
  }, 150);
}

function navigateModal(delta) {
  const currentId = Number(currentModal?.dataset.articleId);
  const idx = state.articles.findIndex(a => a.id === currentId);
  if (idx === -1) return;
  
  const nextIdx = (idx + delta + state.articles.length) % state.articles.length;
  const nextArticle = state.articles[nextIdx];
  
  updateModalContent(nextArticle);
}

// =============================================================================
// Popups
// =============================================================================

function createResidentPopup(r) {
  const esc = utils.escape;
  const addr = `${r.housenumber || ''} ${r.road || ''}`.trim();
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
  
  return `
    <div class="resident-popup">
      <header class="rp-header">
        <div class="rp-headings">
          <h2 class="rp-title">${esc(r.lessee || 'First Resident')}</h2>
          <div class="rp-subtitle">${esc(addr) || 'Address unknown'}</div>
        </div>
      </header>
      <div class="rp-body">
        ${former}
        ${occ}
      </div>
    </div>
  `;
}

// =============================================================================
// Story Submission Form
// =============================================================================

function showStoryForm() {
  let dlg = document.getElementById('story-form-dialog');
  
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'story-form-dialog';
    dlg.innerHTML = `
      <div class="sf-card">
        <header class="sf-header">
          <h3>Share your story</h3>
        </header>
        <div class="sf-body">
          <section id="story-share-content" class="sf-blurb">Loading…</section>
          <form id="story-form" class="sf-form">
            <label>Story Title
              <input name="title" required placeholder="e.g. Life on O'Daly Road">
            </label>
            <label>Your Email (optional)
              <input name="contributor" type="email" placeholder="you@example.com">
            </label>
            <label>Your Story
              <textarea name="description" required rows="6"
                placeholder="Your memories of people, places, traditions and memorable events."></textarea>
            </label>
            <footer class="sf-footer">
              <button type="button" id="sf-back" class="sf-btn sf-btn-ghost">Back</button>
              <button type="submit" class="sf-btn sf-btn-primary">Submit</button>
            </footer>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(dlg);
    
    const closeForm = () => {
      try { dlg.close(); } catch(e) {}
    };
    
    dlg.querySelector('#sf-back')?.addEventListener('click', closeForm);
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      closeForm();
    });
    
    dlg.querySelector('#story-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const title = fd.get('title')?.toString().trim();
      const description = fd.get('description')?.toString().trim();
      const contributor = fd.get('contributor')?.toString().trim();
      
      if (!title || !description) return;
      
      try {
        const { error } = await state.db.from('articles').insert([{
          title,
          description,
          short_desc: description.slice(0, 100) + '…',
          contributor,
          active: false
        }]);
        
        if (error) throw error;
        
        e.target.reset();
        alert('Thank you for your story! It will be reviewed and added soon.');
        closeForm();
      } catch (err) {
        console.error('Submit failed:', err);
        alert('Error submitting your story. Please try again.');
      }
    });
  }
  
  // Load STORY-SHARE content
  (async () => {
    const slot = dlg.querySelector('#story-share-content');
    if (!slot) return;
    
    try {
      const { data } = await state.db
        .from('site_content')
        .select('str_content')
        .eq('str_contentType', 'STORY-SHARE')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      slot.innerHTML = data?.str_content || '';
    } catch(e) {
      console.warn('Failed to load share content:', e);
    }
  })();
  
  try {
    if (!dlg.open) dlg.showModal();
  } catch(e) {}
}

// =============================================================================
// Deep Linking
// =============================================================================

async function handleDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const articleId = params.get('article');
  
  if (!articleId) return;
  
  const id = Number(articleId);
  let article = state.articlesById.get(id);
  
  if (!article) {
    try {
      const { data } = await state.db
        .from('articles')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      
      if (data) {
        article = data;
        state.articlesById.set(id, data);
      }
    } catch(e) {
      console.warn('Deep link fetch failed:', e);
    }
  }
  
  if (article) {
    openModal(article);
  }
}

window.addEventListener('popstate', async () => {
  const params = new URLSearchParams(location.search);
  const id = params.get('article');
  
  if (id && !currentModal) {
    const article = state.articlesById.get(Number(id));
    if (article) openModal(article);
  } else if (!id && currentModal) {
    currentModal.classList.remove('show');
    setTimeout(() => {
      if (currentModal?.parentNode) currentModal.parentNode.removeChild(currentModal);
      currentModal = null;
    }, 120);
  }
});

// =============================================================================
// Mobile Drag Handler
// =============================================================================

function setupMobileDrag() {
  const content = document.getElementById('content');
  const handles = [
    document.getElementById('head_logo'),
    document.getElementById('content-handle')
  ].filter(Boolean);
  
  if (!handles.length) return;
  
  let isDragging = false;
  let startY = 0;
  let startTop = 0;
  
  handles.forEach(handle => {
    handle.addEventListener('touchstart', (e) => {
      if (!utils.isMobile()) return;
      
      isDragging = true;
      startY = e.touches[0].clientY;
      startTop = content.getBoundingClientRect().top;
      content.style.transform = '';
      content.style.overflowY = 'hidden';
      e.preventDefault();
    });
  });
  
  window.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    
    const deltaY = (e.touches[0].clientY - startY) * 1.2;
    let newTop = startTop + deltaY;
    
    const maxTop = window.innerHeight - 100;
    newTop = Math.max(0, Math.min(newTop, maxTop));
    
    content.style.top = `${newTop}px`;
    e.preventDefault();
  }, { passive: false });
  
  window.addEventListener('touchend', () => {
    isDragging = false;
    content.style.overflowY = 'auto';
  });
}

// =============================================================================
// Initialization
// =============================================================================

async function init() {
  try {
    await Promise.all([
      loadContent(),
      loadArticles(),
      loadResidents()
    ]);
    
    await initMap();
    renderThemes();
    renderArticles(null);
    setupMobileDrag();
    
    // Wire share button
    document.getElementById('share-story-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      const content = document.getElementById('content');
      content.classList.add('fade-out');
      setTimeout(() => showStoryForm(), 600);
    });
    
    // Handle deep links
    await handleDeepLink();
    
  } catch(e) {
    console.error('Initialization failed:', e);
  }
}

// Start when ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// =============================================================================
// CSS Notes
// =============================================================================
// All styles are in styles.css - this keeps JS lightweight and CSS cacheable.
// Key classes referenced by this script:
// - .resident-glow (applied to markers with former addresses)
// - .modal-nav, .nav-btn (modal navigation arrows)
// - .modal-share-btn (share button in modal header)
// - .modal-content.fade-out (content swap animation)
// - .resident-popup-wrap, .rp-* (resident popup styling)
// - .sf-* (story form dialog styling)
