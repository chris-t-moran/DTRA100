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
// Loading & Error State Management
// =============================================================================

const loadingUI = {
  show(containerId, message = 'Loading...') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>${message}</p>
      </div>
    `;
  },
  
  showError(containerId, message, retryFn = null) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const retryBtn = retryFn ? `
      <button class="retry-btn" type="button">Try Again</button>
    ` : '';
    
    container.innerHTML = `
      <div class="error-state">
        <svg class="error-icon" viewBox="0 0 24 24" width="48" height="48">
          <circle cx="12" cy="12" r="10" fill="none" stroke="#ef4444" stroke-width="2"/>
          <path d="M12 8v4M12 16h.01" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <h3>Something went wrong</h3>
        <p>${message}</p>
        ${retryBtn}
      </div>
    `;
    
    if (retryFn) {
      container.querySelector('.retry-btn')?.addEventListener('click', retryFn);
    }
  },
  
  showEmpty(containerId, message = 'No items found') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = `
      <div class="empty-state">
        <p>${message}</p>
      </div>
    `;
  },
  
  showMapLoading() {
    const mapEl = document.getElementById('map');
    if (!mapEl || document.getElementById('map-loading')) return;
    
    const overlay = document.createElement('div');
    overlay.id = 'map-loading';
    overlay.className = 'map-loading-overlay';
    overlay.innerHTML = `
      <div class="spinner"></div>
      <p>Loading map data...</p>
    `;
    mapEl.appendChild(overlay);
  },
  
  hideMapLoading() {
    const overlay = document.getElementById('map-loading');
    if (overlay) overlay.remove();
  }
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
// Reactions System
// =============================================================================

const reactions = {
  types: [
    { id: 'heart', label: 'Love this', icon: '❤️' },
    { id: 'memory', label: 'I remember this', icon: '💭' },
    { id: 'photo', label: 'I have photos', icon: '📷' }
  ],
  
  async load(articleId) {
    try {
      const { data, error } = await state.db
        .from('article_reactions')
        .select('id, reaction_type, comment, author_name, created_at')
        .eq('article_id', articleId)
        .eq('approved', true)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn('Failed to load reactions:', e);
      return [];
    }
  },
  
  async submit(articleId, reactionType, comment = '', authorName = '', authorEmail = '') {
    try {
      const ipHash = await crypto.subtle.digest(
        'SHA-256', 
        new TextEncoder().encode(navigator.userAgent + Date.now().toString().slice(0, -7))
      ).then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16));
      
      const { error } = await state.db
        .from('article_reactions')
        .insert([{
          article_id: articleId,
          reaction_type: 'memory',
          comment: comment.trim().slice(0, 500),
          author_name: authorName.trim().slice(0, 100),
          author_email: authorEmail.trim(),
          ip_hash: ipHash
        }]);
      
      if (error) throw error;
      return true;
    } catch (e) {
      console.error('Failed to submit reaction:', e);
      return false;
    }
  },
  
  render(reactionsData) {
    if (!reactionsData.length) return '';
    
    const grouped = {};
    reactionsData.forEach(r => {
      if (!grouped[r.reaction_type]) grouped[r.reaction_type] = [];
      grouped[r.reaction_type].push(r);
    });
    
    let html = '<div class="reactions-section"><h4>Community Reactions</h4>';
    html += '<div class="reaction-counts">';
    this.types.forEach(type => {
      const count = grouped[type.id]?.length || 0;
      if (count > 0) {
        html += `<span class="reaction-badge">${type.icon} ${count}</span>`;
      }
    });
    html += '</div>';
    
    const withComments = reactionsData.filter(r => r.comment);
    if (withComments.length > 0) {
      html += '<div class="reaction-comments">';
      withComments.slice(0, 5).forEach(r => {
        const type = this.types.find(t => t.id === r.reaction_type);
        const date = new Date(r.created_at).toLocaleDateString();
        html += `
          <div class="reaction-comment">
            <span class="reaction-icon">${type?.icon || '💬'}</span>
            <div class="reaction-content">
              <p>${utils.escape(r.comment)}</p>
              <small>${utils.escape(r.author_name || 'Anonymous')} • ${date}</small>
            </div>
          </div>
        `;
      });
      html += '</div>';
    }
    
    html += '</div>';
    return html;
  },
  
  createForm(articleId) {
    const form = document.createElement('form');
    form.className = 'reaction-form';
    form.innerHTML = `
      <h4>Share your reaction</h4>
      <label class="reaction-field">
        <span>Your memory or comment (optional):</span>
        <textarea name="comment" rows="3" placeholder="Share your thoughts..."></textarea>
      </label>
      <label class="reaction-field">
        <span>Your name (optional):</span>
        <input type="text" name="author_name" placeholder="Anonymous">
      </label>
      <label class="reaction-field">
        <span>Email (optional, for follow-up only):</span>
        <input type="email" name="author_email" placeholder="you@example.com">
      </label>
      <button type="submit" class="sf-btn sf-btn-primary">Submit Reaction</button>
      <p class="reaction-note">Your reaction will appear after moderation.</p>
    `;
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const btn = form.querySelector('button[type="submit"]');
      const oldText = btn.textContent;
      
      btn.disabled = true;
      btn.textContent = 'Submitting...';
      
      const success = await this.submit(
        articleId,
        fd.get('reaction_type'),
        fd.get('comment'),
        fd.get('author_name'),
        fd.get('author_email')
      );
      
      if (success) {
        form.innerHTML = '<p class="reaction-success">✓ Thank you! Your reaction will appear after review.</p>';
      } else {
        btn.disabled = false;
        btn.textContent = oldText;
        alert('Failed to submit. Please try again.');
      }
    });
    
    return form;
  }
};

// =============================================================================
// View Tracking (Session-based)
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
// Data Loading with Error Handling
// =============================================================================

async function loadContent() {
  const fetchByType = async (type) => {
    try {
      const { data, error } = await state.db
        .from('site_content')
        .select('str_content')
        .eq('str_contentType', type)
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data?.str_content || null;
    } catch (e) {
      console.warn(`Failed to load ${type} content:`, e);
      return null;
    }
  };
  
  try {
    const [intro, title, share, about] = await Promise.all([
      fetchByType('INTRO'),
      fetchByType('TITLE'),
      fetchByType('STORY-SHARE'),
      fetchByType('ABOUT')
    ]);
    
    const introEl = document.getElementById('intro');
    if (introEl) {
      if (intro) {
        introEl.innerHTML = intro;
      } else {
        introEl.innerHTML = '<p>Welcome to the Drumcondra Triangle Centenary Project</p>';
      }
    }
    
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
  try {
    const { data, error } = await state.db
      .from('articles')
      .select('*')
      .eq('active', true)
      .order('id', { ascending: true });
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      console.warn('No articles found');
      return;
    }
    
    state.articles = data;
    data.forEach(a => state.articlesById.set(a.id, a));
    
  } catch (error) {
    console.error('Articles load failed:', error);
    throw new Error('Failed to load stories. Please check your connection.');
  }
}

async function loadResidents() {
  try {
    const { data, error } = await state.db
      .from('residents')
      .select('*')
      .eq('active', true);
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      console.warn('No residents found');
      state.residents = [];
      return;
    }
    
    state.residents = data;
    buildResidentIndex();
    
  } catch (error) {
    console.error('Residents load failed:', error);
    state.residents = [];
  }
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
    state.residentMarkers.forEach(m => state.map.removeLayer(m));
    if (state.articleMarkers) state.map.addLayer(state.articleMarkers);
    if (state.residentMoveLayer) state.map.removeLayer(state.residentMoveLayer);
    btn.innerHTML = 'Switch to 1929';
    try { state.map.removeControl(state.searchControl); } catch(e) {}
    clearResidentFilter();
  } else {
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
// Article Search System
// =============================================================================

const articleSearch = {
  // Search articles by query string
  search(query, articles) {
    if (!query || query.trim().length === 0) {
      return articles;
    }
    
    const searchTerms = query.toLowerCase().trim().split(/\s+/);
    
    return articles.filter(article => {
      const searchableText = [
        article.title || '',
        article.short_desc || '',
        article.description || '',
        article.theme || '',
        article.contributor || ''
      ].join(' ').toLowerCase();
      
      // Article matches if it contains ALL search terms
      return searchTerms.every(term => searchableText.includes(term));
    });
  },
  
  // Render search UI
  createSearchBox() {
    const container = document.createElement('div');
    container.className = 'article-search-container';
    container.innerHTML = `
      <div class="article-search-box">
        <svg class="search-icon" viewBox="0 0 24 24" width="20" height="20">
          <circle cx="11" cy="11" r="8" fill="none" stroke="currentColor" stroke-width="2"/>
          <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <input 
          type="search" 
          id="article-search-input"
          placeholder="Search stories by title, description, or theme..."
          autocomplete="off"
          spellcheck="false"
        />
        <button type="button" class="search-clear-btn" id="search-clear-btn" style="display:none;">
          ×
        </button>
      </div>
      <div id="search-results-count" class="search-results-count"></div>
    `;
    
    return container;
  },
  
  // Update results count display
  updateResultsCount(filtered, total, query) {
    const countEl = document.getElementById('search-results-count');
    if (!countEl) return;
    
    if (query && filtered.length !== total) {
      countEl.textContent = `Found ${filtered.length} of ${total} stories`;
      countEl.style.display = 'block';
    } else {
      countEl.style.display = 'none';
    }
  }
};



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
  
  // Add search box at the top
  const searchBox = articleSearch.createSearchBox();
  container.appendChild(searchBox);
  
  // Wire up search functionality
  const searchInput = document.getElementById('article-search-input');
  const clearBtn = document.getElementById('search-clear-btn');
  
  searchInput.addEventListener('input', utils.debounce((e) => {
    const query = e.target.value;
    
    // Show/hide clear button
    if (clearBtn) {
      clearBtn.style.display = query ? 'block' : 'none';
    }
    
    // Clear active theme when searching
    if (query) {
      state.activeTheme = null;
      setActiveTheme(null);
    }
    
    renderArticles(state.activeTheme, query);
  }, 300));
  
  // Clear button functionality
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      clearBtn.style.display = 'none';
      renderArticles(state.activeTheme, '');
      searchInput.focus();
    });
  }
  
  // Create theme buttons container
  const themesWrapper = document.createElement('div');
  themesWrapper.className = 'themes-buttons';
  
  Object.keys(themes).forEach(theme => {
    const btn = document.createElement('div');
    btn.className = 'theme';
    btn.textContent = theme;
    btn.addEventListener('click', () => {
      // Clear search when selecting theme
      searchInput.value = '';
      if (clearBtn) clearBtn.style.display = 'none';
      
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
    themesWrapper.appendChild(btn);
  });
  
  const lucky = document.createElement('div');
  lucky.className = 'theme';
  lucky.textContent = 'Lucky Dip!';
  lucky.style.background = 'gold';
  lucky.addEventListener('click', () => {
    const random = state.articles[Math.floor(Math.random() * state.articles.length)];
    if (random) openModal(random);
  });
  themesWrapper.appendChild(lucky);

  const toursBtn = document.createElement('div');
  toursBtn.className = 'theme theme-tours';
  toursBtn.textContent = '🚶 Guided Tours';
  toursBtn.style.background = '#2563eb';
  toursBtn.addEventListener('click', () => showToursDialog());
  themesWrapper.appendChild(toursBtn);
  
  container.appendChild(themesWrapper);
}

function setActiveTheme(theme) {
  document.querySelectorAll('.themes-buttons .theme').forEach(el => {
    el.classList.toggle('active', el.textContent === theme);
  });
}

function renderArticles(theme, searchQuery = null) {
  // Start with theme filter
  let filtered = theme 
    ? state.articles.filter(a => a.theme === theme)
    : state.articles;
  
  // Apply search filter if query exists
  const query = searchQuery || document.getElementById('article-search-input')?.value || '';
  if (query.trim()) {
    filtered = articleSearch.search(query, filtered);
  }
  
  const list = document.getElementById('article-list');
  
  // Show empty state if no matches
  if (filtered.length === 0) {
    const message = query 
      ? `No stories found matching "${query}"`
      : `No stories found for "${theme}"`;
    loadingUI.showEmpty('article-list', message);
    articleSearch.updateResultsCount(0, state.articles.length, query);
    return;
  }
  
  // Shuffle and limit to 10 articles
  const shuffled = [...filtered].sort(() => Math.random() - 0.5);
  const limited = shuffled.slice(0, 10);
  
  list.innerHTML = '';
  
  const grid = document.createElement('ul');
  grid.className = 'grid';
  
  limited.forEach(article => {
    const li = document.createElement('li');
    li.className = 'card';
    li.dataset.articleId = article.id;
    
    const link = document.createElement('a');
    link.href = 'javascript:void(0)';
    link.addEventListener('click', () => openModal(article));
    link.innerHTML = `
      <img src="${article.img}" 
           alt="${utils.escape(article.title)}"
           onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22150%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22200%22 height=%22150%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 fill=%22%23999%22 font-size=%2214%22%3EImage unavailable%3C/text%3E%3C/svg%3E'" />
      <div class="${article.active ? 'overlay' : 'inactiveoverlay'}">${utils.escape(article.title)}</div>
    `;
    
    li.appendChild(link);
    grid.appendChild(li);
  });
  
  list.appendChild(grid);
  
  // Show count message
  if (filtered.length > 10) {
    const msg = document.createElement('p');
    msg.textContent = `Showing 10 of ${filtered.length} stories`;
    msg.style.cssText = 'text-align:center;margin-top:1rem;font-size:0.9rem';
    list.appendChild(msg);
  }
  
  // Update search results count
  articleSearch.updateResultsCount(filtered.length, state.articles.length, query);
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
  let marker = null;
  
  try {
    const layers = state.articleMarkers?.getLayers() || [];
    marker = layers.find(m => m._article?.id === article.id);
  } catch(e) {
    console.warn('Failed to find marker:', e);
    return;
  }
  
  if (!marker) return;
  
  const afterVisible = () => {
    try {
      if (typeof state.articleMarkers.getVisibleParent === 'function') {
        const parent = state.articleMarkers.getVisibleParent(marker);
        if (parent && parent !== marker && typeof parent.spiderfy === 'function') {
          setTimeout(() => parent.spiderfy(), 0);
        }
      }
    } catch(e) {}
    
    selectMarker(marker);
    try { marker.bringToFront?.(); } catch(e) {}
    
    if (utils.isMobile()) {
      setTimeout(() => panMarkerIntoView(marker), 0);
    }
  };
  
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
  
  const overlapTop = Math.max(0, Math.min(contentRect.bottom, mapRect.bottom) - Math.max(contentRect.top, mapRect.top));
  const overlapBottom = Math.max(0, Math.min(mapRect.bottom, contentRect.bottom) - Math.max(mapRect.top, contentRect.top));
  
  const minY = overlapTop + margin;
  const maxY = mapRect.height - overlapBottom - margin;
  
  const pt = state.map.latLngToContainerPoint(marker.getLatLng());
  
  if (pt.y >= minY && pt.y <= maxY) return;
  
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

  (async () => {
    const data = await reactions.load(article.id);
    const container = content.querySelector(`#reactions-container-${article.id}`);
    if (container) container.innerHTML = reactions.render(data);
    
    const formContainer = content.querySelector(`#reaction-form-container-${article.id}`);
    if (formContainer) formContainer.appendChild(reactions.createForm(article.id));
  })();
  
  const closeModal = () => {
    const articleId = modal.dataset.articleId;
    
    modal.classList.remove('show');
    setTimeout(() => {
      if (modal.parentNode) modal.parentNode.removeChild(modal);
      currentModal = null;
    }, 120);
    utils.updateURL(null, false);
    
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
  
  content.querySelector('.nav-prev')?.addEventListener('click', () => navigateModal(-1));
  content.querySelector('.nav-next')?.addEventListener('click', () => navigateModal(1));
  
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
      <div id="reactions-container-${article.id}"></div>
      <div id="reaction-form-container-${article.id}"></div>
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
// Initialization with Loading States
// =============================================================================

async function init() {
  loadingUI.show('article-list', 'Loading stories...');
  loadingUI.showMapLoading();
  
  try {
    await Promise.all([
      loadContent(),
      loadArticles(),
      loadResidents()
    ]);
    
    if (!state.articles || state.articles.length === 0) {
      loadingUI.showError(
        'article-list',
        'No stories are available at the moment.',
        init
      );
      loadingUI.hideMapLoading();
      return;
    }
    
    await initMap();
    loadingUI.hideMapLoading();
    
    renderThemes();
    renderArticles(null);
    setupMobileDrag();
    
    document.getElementById('share-story-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      const content = document.getElementById('content');
      content.classList.add('fade-out');
      setTimeout(() => showStoryForm(), 600);
    });
    
    await handleDeepLink();
    
  } catch (e) {
    console.error('Initialization failed:', e);
    
    loadingUI.showError(
      'article-list',
      'Unable to load the application. Please check your internet connection.',
      init
    );
    loadingUI.hideMapLoading();
    
    const mapEl = document.getElementById('map');
    if (mapEl) {
      mapEl.innerHTML = `
        <div class="map-error">
          <p>Map unavailable</p>
          <button class="retry-btn" onclick="location.reload()">Reload Page</button>
        </div>
      `;
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// =============================================================================
// Tours System with Loading States
// =============================================================================

function slideContentPanelDown() {
  if (!utils.isMobile()) return;
  
  const content = document.getElementById('content');
  if (!content) return;
  
  const vh = window.innerHeight;
  const targetTop = Math.round(vh * 0.85);
  
  const prev = content.style.transition;
  content.style.transition = 'top 400ms ease';
  content.style.top = targetTop + 'px';
  
  setTimeout(() => { content.style.transition = prev || ''; }, 500);
}

function restoreContentPanel() {
  if (!utils.isMobile()) return;
  
  const content = document.getElementById('content');
  if (!content) return;
  
  const vh = window.innerHeight;
  const defaultTop = Math.round(vh * 0.5);
  
  const prev = content.style.transition;
  content.style.transition = 'top 400ms ease';
  content.style.top = defaultTop + 'px';
  
  setTimeout(() => { content.style.transition = prev || ''; }, 500);
}

const tours = {
  async loadAll() {
    try {
      const { data, error } = await state.db
        .from('tours')
        .select(`
          *,
          tour_stops(
            id,
            stop_number,
            intro_text,
            outro_text,
            article_id,
            articles(id, title, description, img, lat, lon)
          )
        `)
        .eq('active', true)
        .order('sort_order');
      
      if (error) throw error;
      
      if (data) {
        data.forEach(tour => {
          if (tour.tour_stops) {
            tour.tour_stops.sort((a, b) => a.stop_number - b.stop_number);
          }
        });
      }
      
      return data || [];
    } catch (e) {
      console.error('Failed to load tours:', e);
      throw new Error('Unable to load tours');
    }
  },
  
  async loadTour(tourId) {
    try {
      const { data, error } = await state.db
        .from('tours')
        .select(`
          *,
          tour_stops(
            id,
            stop_number,
            intro_text,
            outro_text,
            article_id,
            articles(id, title, description, img, lat, lon)
          )
        `)
        .eq('id', tourId)
        .eq('active', true)
        .single();
      
      if (error) throw error;
      
      if (data && data.tour_stops) {
        data.tour_stops.sort((a, b) => a.stop_number - b.stop_number);
      }
      
      return data;
    } catch (e) {
      console.error('Failed to load tour:', e);
      return null;
    }
  },
  
  async start(tourId) {
    const tour = await this.loadTour(tourId);
    
    if (!tour || !tour.tour_stops || tour.tour_stops.length === 0) {
      alert('This tour is not available.');
      return;
    }
    
    state.activeTour = {
      ...tour,
      currentStop: 0,
      startedAt: Date.now()
    };

    slideContentPanelDown();    
    this.goToStop(0);
  },
  
  showTourPath(tour) {
    if (state.tourLayers) {
      state.tourLayers.forEach(layer => state.map.removeLayer(layer));
    }
    state.tourLayers = [];
    
    const waypoints = tour.tour_stops.map(s => L.latLng(s.articles.lat, s.articles.lon));
    
    const routingControl = L.Routing.control({
      waypoints: waypoints,
      lineOptions: {
        styles: [{ color: '#2563eb', opacity: 0.7, weight: 3 }]
      },
      createMarker: function(i, waypoint, n) {
        return L.marker(waypoint.latLng, {
          icon: L.divIcon({
            className: 'tour-stop-marker',
            html: `<div class="tour-number">${i + 1}</div>`,
            iconSize: [30, 30]
          })
        });
      },
      routeWhileDragging: false,
      addWaypoints: false,
      draggableWaypoints: false,
      fitSelectedRoutes: false,
      showAlternatives: false
    }).addTo(state.map);
    
    const container = routingControl.getContainer();
    if (container) {
      container.style.display = 'none';
    }
    
    state.tourLayers.push(routingControl);
  },
  
  goToStop(stopIndex) {
    const tour = state.activeTour;
    if (!tour || !tour.tour_stops[stopIndex]) return;
    
    const stop = tour.tour_stops[stopIndex];
    tour.currentStop = stopIndex;
    
    document.querySelectorAll('.tour-number').forEach(el => {
      el.classList.remove('active');
    });
    
    if (stopIndex > 0) {
      setTimeout(() => {
        const markers = document.querySelectorAll('.tour-number');
        if (markers[stopIndex]) markers[stopIndex].classList.add('active');
      }, 100);
    }
    
    let targetLatLng = [stop.articles.lat, stop.articles.lon];
    
    if (utils.isMobile()) {
      const map = state.map;
      const point = map.latLngToContainerPoint(targetLatLng);
      const offsetY = window.innerHeight * -0.10;
      point.y -= offsetY;
      targetLatLng = map.containerPointToLatLng(point);
    }
    
    state.map.flyTo(targetLatLng, 17, {
      duration: 1.5
    });
    
    if (stopIndex === 0 && !state.tourPathShown) {
      setTimeout(() => {
        this.showTourPath(tour);
        state.tourPathShown = true;
        setTimeout(() => {
          const markers = document.querySelectorAll('.tour-number');
          if (markers[0]) markers[0].classList.add('active');
        }, 100);
      }, 1600);
    }
    
    setTimeout(() => {
      this.showTourStop(stop, stopIndex, tour.tour_stops.length);
    }, 1600);
  },
  
  showTourStop(stop, current, total) {
    const modal = document.createElement('div');
    modal.className = 'modal tour-modal';
    
    const content = document.createElement('div');
    content.className = 'modal-content tour-content';
    content.innerHTML = `
      <div class="tour-progress">
        <div class="tour-progress-top">
          <span>Stop ${current + 1} of ${total}</span>
        </div>
        <div class="progress-bar-container">
          <div class="progress-bar-fill" style="width: ${((current + 1) / total) * 100}%"></div>
        </div>
        <div class="tour-progress-nav">
          ${current > 0 ? '<button class="tour-prev" type="button">← Previous</button>' : '<div></div>'}
          ${current < total - 1 
            ? '<button class="tour-next" type="button">Next →</button>'
            : '<button class="tour-complete" type="button">Finish Tour ✓</button>'
          }
        </div>
      </div>
      
      ${stop.intro_text ? `
        <div class="tour-context">
          <h3>Setting the Scene</h3>
          <p>${utils.escape(stop.intro_text)}</p>
        </div>
      ` : ''}
      
      <header>
        <h2>${utils.escape(stop.articles.title)}</h2>
      </header>
    
      <div class="descriptionWrapper">
        <div class="imgWrapper">
          <img src="${stop.articles.img}" alt="${utils.escape(stop.articles.title)}" />
        </div>
        <div class="modal-description">${(stop.articles.description || '').replace(/\n/g, '<br>')}</div>
      </div>
    `;
    
    modal.appendChild(content);
    
    content.querySelector('.tour-next')?.addEventListener('click', () => {
      modal.remove();
      this.goToStop(current + 1);
    });
    
    content.querySelector('.tour-prev')?.addEventListener('click', () => {
      modal.remove();
      this.goToStop(current - 1);
    });
    
    content.querySelector('.tour-complete')?.addEventListener('click', () => {
      modal.remove();
      this.completeTour();
    });
    
    modal.addEventListener('click', (e) => {
      if (!content.contains(e.target)) {
        if (confirm('Exit this tour?')) {
          this.exitTour();
          modal.remove();
        }
      }
    });
    
    content.addEventListener('click', (e) => e.stopPropagation());
    
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));
  },
  
  completeTour() {
    const duration = Math.round((Date.now() - state.activeTour.startedAt) / 60000);
    alert(`Tour completed in ${duration} minute${duration !== 1 ? 's' : ''}! Thank you for exploring the Triangle's history.`);
    this.exitTour();
  },
  
  exitTour() {
    if (state.tourLayers) {
      state.tourLayers.forEach(layer => {
        try { 
          if (layer._markers) {
            layer._markers.forEach(marker => {
              try { state.map.removeLayer(marker); } catch(e) {}
            });
          }
          
          if (layer._line) {
            state.map.removeLayer(layer._line);
          }
          
          state.map.removeControl(layer);
          
          if (layer._container && layer._container.parentNode) {
            layer._container.parentNode.removeChild(layer._container);
          }
        } catch(e) {
          console.warn('Layer removal failed:', e);
        }
      });
      state.tourLayers = [];
    }
    
    document.querySelectorAll('.tour-stop-marker').forEach(el => {
      try { el.parentNode.remove(); } catch(e) {}
    });
    
    const routingContainers = document.querySelectorAll('.leaflet-routing-container');
    routingContainers.forEach(container => {
      try { container.remove(); } catch(e) {}
    });
    
    state.activeTour = null;
    state.tourPathShown = false;
    restoreContentPanel();
  }
};

function showToursDialog() {
  const dialog = document.createElement('dialog');
  dialog.id = 'tours-dialog';
  dialog.innerHTML = `
    <div class="tours-gallery">
      <header>
        <h2>Guided Tours</h2>
        <button class="close-btn" type="button">×</button>
      </header>
      <div id="tours-list">
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Loading tours...</p>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(dialog);
  
  dialog.querySelector('.close-btn').addEventListener('click', () => {
    dialog.close();
    setTimeout(() => document.body.removeChild(dialog), 300);
  });
  
  dialog.showModal();
  
  tours.loadAll()
    .then(data => {
      const list = dialog.querySelector('#tours-list');
      
      if (!data || data.length === 0) {
        list.innerHTML = '<p class="no-tours">No tours available yet. Check back soon!</p>';
        return;
      }
      
      list.innerHTML = data.map(tour => `
        <div class="tour-card" data-tour-id="${tour.id}">
          ${tour.cover_image ? `<img src="${tour.cover_image}" alt="${utils.escape(tour.title)}" />` : ''}
          <div class="tour-card-content">
            <h3>${utils.escape(tour.title)}</h3>
            <p>${utils.escape(tour.description || '')}</p>
            <div class="tour-meta">
              <span>${tour.tour_stops?.length || 0} stops</span>
              ${tour.duration_minutes ? `<span>~${tour.duration_minutes} min</span>` : ''}
            </div>
            <button class="sf-btn sf-btn-primary" type="button">Start Tour</button>
          </div>
        </div>
      `).join('');
      
      list.querySelectorAll('.tour-card button').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const card = e.target.closest('.tour-card');
          const tourId = Number(card.dataset.tourId);
          dialog.close();
          setTimeout(() => document.body.removeChild(dialog), 300);
          tours.start(tourId);
        });
      });
    })
    .catch(error => {
      const list = dialog.querySelector('#tours-list');
      list.innerHTML = `
        <div class="error-state">
          <svg class="error-icon" viewBox="0 0 24 24" width="48" height="48">
            <circle cx="12" cy="12" r="10" fill="none" stroke="#ef4444" stroke-width="2"/>
            <path d="M12 8v4M12 16h.01" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <h3>Failed to load tours</h3>
          <p>Please check your connection and try again.</p>
          <button class="retry-btn" type="button">Try Again</button>
        </div>
      `;
      
      list.querySelector('.retry-btn').addEventListener('click', () => {
        document.getElementById('tours-dialog').remove();
        showToursDialog();
      });
    });
}

