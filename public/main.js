/**
 * Triangle100 - Optimized Application Core
 * Drumcondra Triangle Centenary Project
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/+esm';

// =============================================================================
// Configuration & State
// =============================================================================

import { CONFIG as IMPORTED_CONFIG } from './config.js';
import { initHistoryFeatures, showHouseLookup, showNumbers, handleHouseLink, storiesForHouse } from './history-features.js';
import { slugMap } from './slug.js';
const CONFIG = IMPORTED_CONFIG;

// Public article columns (contributor_email is private and not readable by visitors)
const BASE_ARTICLE_COLUMNS = 'id, title, short_desc, description, theme, img, url, contributor, lat, lon, active, inserted_at, updated_at, views';
// resident_id links a story to its house; falls back gracefully if the column isn't there yet
let ARTICLE_COLUMNS = BASE_ARTICLE_COLUMNS + ', resident_id';

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
  isMobile: () => window.innerWidth < 900,
  
  escape: (str) => String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;'),

  // Story descriptions may contain formatting HTML; strip anything executable.
  // Falls back to plain escaped text if DOMPurify failed to load.
  richText: (str) => {
    const html = String(str ?? '').replace(/\n/g, '<br>');
    return window.DOMPurify
      ? window.DOMPurify.sanitize(html, { ADD_ATTR: ['target'] })
      : utils.escape(str).replace(/\n/g, '<br>');
  },

  // Friendly, non-blocking notification (replaces alert()).
  toast: (message, { type = 'info', duration = 4500 } = {}) => {
    // An open modal dialog makes the rest of the page inert, so show toasts inside it.
    const host = [...document.querySelectorAll('dialog[open]')].pop() || document.body;
    let region = host.querySelector(':scope > .toast-region');
    if (!region) {
      region = document.createElement('div');
      region.className = 'toast-region';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      host.appendChild(region);
    }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    const icon = { success: '✓', error: '!', info: 'i' }[type] || 'i';
    el.innerHTML = `<span class="toast-icon" aria-hidden="true">${icon}</span><span class="toast-msg"></span>
      <button type="button" class="toast-close" aria-label="Dismiss">×</button>`;
    el.querySelector('.toast-msg').textContent = message;
    const remove = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); };
    el.querySelector('.toast-close').addEventListener('click', remove);
    region.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    if (duration) setTimeout(remove, duration);
  },

  // Spam guard: hidden "website" field only bots fill in, plus a minimum
  // time between the form appearing and being submitted.
  honeypotHTML: '<div class="hp-field" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;">' +
    '<label>Leave this empty <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>',
  looksLikeBot: (form, minMs = 4000) => {
    const hp = form.querySelector('input[name="website"]');
    const opened = Number(form.dataset.openedAt || 0);
    return (hp && hp.value.trim() !== '') || (opened && Date.now() - opened < minMs);
  },
  submitErrorMessage: (err) => /too many/i.test(err?.message || '')
    ? 'Thanks! We have received a lot of submissions just now. Please try again in a little while.'
    : 'Sorry, something went wrong submitting. Please try again.',

  // Image/link URLs: allow http(s) and relative paths only, attribute-escaped.
  safeUrl: (url) => {
    const u = String(url ?? '').trim();
    const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(u);
    return (!hasScheme || /^https?:/i.test(u)) ? utils.escape(u) : '';
  },
  
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
  
  // Shared links go to the story's own page (with a proper preview on WhatsApp, Facebook etc.)
  getPermalink: (articleId) => {
    if (!articleId) return window.location.href;
    state.slugs = state.slugs || slugMap(state.articles || []);
    const slug = state.slugs.get(Number(articleId));
    return slug
      ? `${window.location.origin}/stories/${slug}/`
      : `${window.location.origin}/?article=${articleId}`;
  }
};


// =============================================================================
// Keyboard Shortcuts Help
// =============================================================================

const keyboardShortcuts = {
  show() {
    const existing = document.getElementById('keyboard-help');
    if (existing) {
      existing.remove();
      return;
    }
    
    const help = document.createElement('div');
    help.id = 'keyboard-help';
    help.className = 'keyboard-help-overlay';
    help.setAttribute('role', 'dialog');
    help.setAttribute('aria-labelledby', 'keyboard-help-title');
    help.innerHTML = `
      <div class="keyboard-help-content">
        <header>
          <h2 id="keyboard-help-title">Keyboard Shortcuts</h2>
          <button class="close-btn" type="button" aria-label="Close help">×</button>
        </header>
        <div class="shortcuts-list">
          <div class="shortcut-item">
            <kbd>Esc</kbd>
            <span>Close modal or dialog</span>
          </div>
          <div class="shortcut-item">
            <kbd>←</kbd> <kbd>→</kbd>
            <span>Navigate between articles in modal</span>
          </div>
          <div class="shortcut-item">
            <kbd>Tab</kbd>
            <span>Move between interactive elements</span>
          </div>
          <div class="shortcut-item">
            <kbd>Shift + Tab</kbd>
            <span>Move backward between elements</span>
          </div>
          <div class="shortcut-item">
            <kbd>?</kbd>
            <span>Show this help</span>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(help);
    
    const closeHelp = () => help.remove();
    help.querySelector('.close-btn').addEventListener('click', closeHelp);
    help.addEventListener('click', (e) => {
      if (e.target === help) closeHelp();
    });
    
    help.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeHelp();
    });
    
    requestAnimationFrame(() => help.classList.add('show'));
    
    // Focus first button
    setTimeout(() => help.querySelector('.close-btn').focus(), 100);
  }
};

// Global keyboard shortcut listener
document.addEventListener('keydown', (e) => {
  // Show help with ? key (shift + /)
  if (e.key === '?' && !e.target.matches('input, textarea')) {
    e.preventDefault();
    keyboardShortcuts.show();
  }
});

// Add help button to page (optional - can be added to your HTML)
function addKeyboardHelpButton() {
  const btn = document.createElement('button');
  btn.className = 'keyboard-help-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Keyboard shortcuts help');
  btn.innerHTML = '?';
  btn.addEventListener('click', () => keyboardShortcuts.show());
  document.body.appendChild(btn);
}


// =============================================================================
// Accessibility Enhancements
// =============================================================================

const a11y = {
  // Focus trap for modals
  trapFocus(container) {
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    
    const handleTab = (e) => {
      if (e.key !== 'Tab') return;
      
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    };
    
    container.addEventListener('keydown', handleTab);
    
    // Focus first element
    if (firstElement) {
      setTimeout(() => firstElement.focus(), 100);
    }
    
    return () => container.removeEventListener('keydown', handleTab);
  },
  
  // Announce to screen readers
  announce(message, priority = 'polite') {
    const announcer = document.getElementById('sr-announcer') || this.createAnnouncer();
    announcer.setAttribute('aria-live', priority);
    announcer.textContent = message;
    
    // Clear after announcement
    setTimeout(() => {
      announcer.textContent = '';
    }, 1000);
  },
  
  createAnnouncer() {
    const announcer = document.createElement('div');
    announcer.id = 'sr-announcer';
    announcer.className = 'sr-only';
    announcer.setAttribute('aria-live', 'polite');
    announcer.setAttribute('aria-atomic', 'true');
    document.body.appendChild(announcer);
    return announcer;
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
      const { error } = await state.db
        .from('article_reactions')
        .insert([{
          article_id: articleId,
          reaction_type: 'memory',
          comment: comment.trim().slice(0, 500),
          author_name: authorName.trim().slice(0, 100),
          author_email: authorEmail.trim().slice(0, 254) || null
        }]);
      
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      console.error('Failed to submit reaction:', e);
      return { ok: false, error: e };
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
        <textarea name="comment" rows="3" maxlength="500" placeholder="Share your thoughts..."></textarea>
      </label>
      <label class="reaction-field">
        <span>Your name (optional):</span>
        <input type="text" name="author_name" maxlength="100" placeholder="Anonymous">
      </label>
      <label class="reaction-field">
        <span>Email (optional, for follow-up only):</span>
        <input type="email" name="author_email" maxlength="254" placeholder="you@example.com">
      </label>
      ${utils.honeypotHTML}
      <button type="submit" class="sf-btn sf-btn-primary">Submit Reaction</button>
      <p class="reaction-note">Your reaction will appear after moderation.</p>
    `;
    
    form.dataset.openedAt = Date.now();
    const thanks = '<p class="reaction-success">✓ Thank you! Your reaction will appear after review.</p>';
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (utils.looksLikeBot(form)) { form.innerHTML = thanks; return; }
      const fd = new FormData(form);
      const btn = form.querySelector('button[type="submit"]');
      const oldText = btn.textContent;
      
      btn.disabled = true;
      btn.textContent = 'Submitting...';
      
      const result = await this.submit(
        articleId,
        fd.get('reaction_type'),
        fd.get('comment'),
        fd.get('author_name'),
        fd.get('author_email')
      );
      
      if (result.ok) {
        form.innerHTML = thanks;
      } else {
        btn.disabled = false;
        btn.textContent = oldText;
        utils.toast(utils.submitErrorMessage(result.error), { type: 'error', duration: 7000 });
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
      .select(ARTICLE_COLUMNS)
      .eq('active', true)
      .order('id', { ascending: true });
    
    if (error && error.code === '42703' && ARTICLE_COLUMNS !== BASE_ARTICLE_COLUMNS) {
      ARTICLE_COLUMNS = BASE_ARTICLE_COLUMNS;
      return loadArticles();
    }
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
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(state.map);
  
  // Article markers with clustering
  state.articleMarkers = L.markerClusterGroup({
    maxClusterRadius: CONFIG.view.clusterRadius,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true
  });
  
  state.articles.forEach(article => {
    const marker = L.circleMarker([article.lat, article.lon], {
      radius: 8,
      color: '#FFFFFF',
      fillColor: '#1F6B43',
      fillOpacity: 1,
      weight: 3
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
  
  // "A story from this house" buttons inside 1929 resident pop-ups
  state.map.getContainer().addEventListener('click', (e) => {
    const btn = e.target.closest('.rp-story');
    if (!btn) return;
    const article = state.articlesById.get(Number(btn.dataset.article));
    if (article) { state.map.closePopup(); openModal(article); }
  });
  
  // Expose for debugging
  window.triMap = state.map;
  window.triState = state;
}

function createResidentMarkers() {
  state.residents.forEach(r => {
    const hasFormer = Number.isFinite(r.formerAddr_lat) && Number.isFinite(r.formerAddr_lon);
    
    const marker = L.circleMarker([r.lat, r.lon], hasFormer ? {
      radius: 8,
      color: '#A8641C',
      weight: 2.5,
      fillColor: '#FBE7CF',
      fillOpacity: 1
    } : {
      radius: 6,
      color: '#FFFFFF',
      weight: 1.5,
      fillColor: '#A8641C',
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

// Today / 1929 switch (top bar) and the 1929 tools in the panel
function setupEraControls() {
  document.querySelectorAll('#era-toggle button').forEach(btn => {
    btn.addEventListener('click', () => setEra(btn.dataset.era));
  });
  const input = document.getElementById('resident-search');
  input?.addEventListener('input', utils.debounce(() => {
    const q = input.value.trim();
    q ? filterResidents(q) : clearResidentFilter();
  }, 200));
  document.getElementById('btn-house')?.addEventListener('click', () => showHouseLookup());
  document.getElementById('btn-numbers')?.addEventListener('click', () => showNumbers());
}

function setEra(era) {
  const past = era === '1929';
  const showing = state.residentMarkers.length > 0 && state.map.hasLayer(state.residentMarkers[0]);
  if (past !== showing) {
    document.getElementById('map').classList.toggle('sepia', past);
    if (past) {
      if (state.articleMarkers) state.map.removeLayer(state.articleMarkers);
      state.residentMarkers.forEach(m => m.addTo(state.map));
    } else {
      state.residentMarkers.forEach(m => state.map.removeLayer(m));
      if (state.articleMarkers) state.map.addLayer(state.articleMarkers);
      if (state.residentMoveLayer) state.map.removeLayer(state.residentMoveLayer);
      const input = document.getElementById('resident-search');
      if (input) input.value = '';
      clearResidentFilter();
    }
  }
  state.era = past ? '1929' : 'today';
  document.querySelectorAll('#era-toggle button').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.era === state.era));
  });
  document.getElementById('era-today-panel').hidden = past;
  document.getElementById('era-1929-panel').hidden = !past;
  updatePanelHeader();
  setActiveTab(past ? '1929' : (state.activeTab === '1929' ? 'explore' : state.activeTab));
}

// Kept for older callers: flips between the two eras
function toggleResidents() {
  setEra(state.era === '1929' ? 'today' : '1929');
}

function updatePanelHeader(shown) {
  const title = document.getElementById('panel-title');
  const count = document.getElementById('panel-count');
  if (!title || !count) return;
  if (state.era === '1929') {
    title.textContent = 'First residents, 1929';
    count.textContent = `${state.residents.length} households traced so far`;
  } else {
    title.textContent = 'Stories from the Triangle';
    const total = state.articles.length;
    count.textContent = (shown != null && shown !== total)
      ? `${shown} of ${total} stories`
      : `${total} stories`;
  }
}

// =============================================================================
// Panel (sheet) and tab bar
// =============================================================================

const sheet = {
  // Resting positions as a fraction of the viewport height (phones only)
  stops: { peek: null, half: 0.52, full: 0.08 },
  peekTop() {
    // Show the handle, the heading and the filters above the tab bar
    const tab = document.getElementById('tabbar')?.offsetHeight || 64;
    return window.innerHeight - tab - 190;
  },
  topFor(name) {
    if (name === 'peek') return this.peekTop();
    return Math.round(window.innerHeight * this.stops[name]);
  },
  set(name) {
    if (!utils.isMobile()) return;
    state.sheetState = name;
    document.documentElement.style.setProperty('--sheet-top', this.topFor(name) + 'px');
  },
  nearest(top) {
    const names = ['full', 'half', 'peek'];
    return names.reduce((best, n) => Math.abs(this.topFor(n) - top) < Math.abs(this.topFor(best) - top) ? n : best, 'half');
  }
};

function setActiveTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('#tabbar button').forEach(b => {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
}

function setupTabs() {
  document.querySelectorAll('#tabbar button').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (currentModal) currentModal._close?.();
      switch (tab) {
        case 'explore':
          setEra('today'); setActiveTab('explore'); sheet.set('peek');
          break;
        case 'stories':
          setEra('today'); setActiveTab('stories'); sheet.set('full');
          setTimeout(() => document.getElementById('article-search-input')?.focus({ preventScroll: true }), 350);
          break;
        case '1929':
          setEra('1929'); sheet.set('half');
          break;
        case 'tours':
          setEra('today');
          showToursDialog();
          break;
        case 'share':
          showStoryForm();
          break;
      }
    });
  });
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
    m.setStyle({ opacity: visible ? 1 : 0, fillOpacity: visible ? 1 : 0 });
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
    m.setStyle({ opacity: 1, fillOpacity: 1 });
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
          placeholder="Search stories keyword..."
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
  
  // One row of filter chips
  const themesWrapper = document.createElement('div');
  themesWrapper.className = 'themes-buttons';
  themesWrapper.setAttribute('role', 'group');
  themesWrapper.setAttribute('aria-label', 'Filter stories');

  const makeChip = (label, value) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip theme';
    chip.textContent = label;
    chip.dataset.theme = value;
    chip.setAttribute('aria-pressed', String(value === '' ));
    return chip;
  };

  const allChip = makeChip('All', '');
  allChip.addEventListener('click', () => {
    searchInput.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    state.activeTheme = null;
    renderArticles(null);
    setActiveTheme(null);
  });
  themesWrapper.appendChild(allChip);

  Object.keys(themes).sort().forEach(theme => {
    const chip = makeChip(theme, theme);
    chip.addEventListener('click', () => {
      searchInput.value = '';
      if (clearBtn) clearBtn.style.display = 'none';
      const next = state.activeTheme === theme ? null : theme;
      state.activeTheme = next;
      renderArticles(next);
      setActiveTheme(next);
    });
    themesWrapper.appendChild(chip);
  });

  const lucky = makeChip('Lucky dip', '__lucky');
  lucky.setAttribute('aria-pressed', 'false');
  lucky.addEventListener('click', () => {
    const random = state.articles[Math.floor(Math.random() * state.articles.length)];
    if (random) openModal(random);
  });
  themesWrapper.appendChild(lucky);

  container.appendChild(themesWrapper);
}

function setActiveTheme(theme) {
  document.querySelectorAll('.themes-buttons .chip').forEach(el => {
    if (el.dataset.theme === '__lucky') return;
    el.setAttribute('aria-pressed', String(el.dataset.theme === (theme || '')));
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
  
  list.innerHTML = '';
  const grid = document.createElement('ul');
  grid.className = 'grid';

  // Newest first, so new stories are easy to find
  const ordered = [...filtered].sort((a, b) => String(b.inserted_at || '').localeCompare(String(a.inserted_at || '')));
  ordered.forEach(article => {
    const li = document.createElement('li');
    li.dataset.articleId = article.id;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'story-row';
    btn.addEventListener('click', () => openModal(article));
    const img = utils.safeUrl(article.img);
    const house = article.resident_id != null
      ? state.residents.find(r => Number(r.id) === Number(article.resident_id)) : null;
    const where = house ? `${house.housenumber} ${roadDisplayName(house.road)}` : '';
    btn.innerHTML = `
      ${img
        ? `<img class="story-thumb" src="${img}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'story-thumb placeholder'}))">`
        : `<span class="story-thumb placeholder" aria-hidden="true"></span>`}
      <span class="story-meta">
        <strong>${utils.escape(article.title)}</strong>
        ${article.short_desc ? `<span>${utils.escape(article.short_desc)}</span>` : ''}
        <small>${utils.escape([article.theme, where].filter(Boolean).join(' · '))}</small>
      </span>`;
    li.appendChild(btn);
    grid.appendChild(li);
  });
  list.appendChild(grid);

  updatePanelHeader(filtered.length);
  articleSearch.updateResultsCount(filtered.length, state.articles.length, query);
}

function roadDisplayName(road) {
  return road === "O'Neachtain" ? "O'Neachtain Road" : road === 'Coymn Place' ? 'Comyn Place' : (road || '');
}

// =============================================================================
// Marker Selection & Reveal
// =============================================================================

function selectMarker(marker) {
  if (state.lastSelectedMarker && state.lastSelectedMarker !== marker) {
    state.lastSelectedMarker.setStyle(state.lastSelectedMarker._baseStyle);
  }
  
  marker.setStyle({
    color: '#1C2420',
    fillColor: '#1F6B43',
    weight: 3,
    radius: Math.max(marker.options.radius || 8, 11)
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

// Clean up when closing modal
function openModal(article) {
  if (currentModal) {
    // Clean up old modal's event listeners
    if (currentModal._cleanupKeyboard) currentModal._cleanupKeyboard();
    if (currentModal._cleanupFocusTrap) currentModal._cleanupFocusTrap();
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
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'modal-title');
  
  const content = document.createElement('div');
  content.className = 'modal-content';
  content.innerHTML = getModalHTML(article);
  
  modal.appendChild(content);

  // Load reactions
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
    
    // Restore focus to trigger element if possible
    if (modal._triggerElement) {
      modal._triggerElement.focus();
    }
    
    // Announce to screen readers
    a11y.announce('Article closed');
  };
  
  // Store what triggered the modal for focus restoration
  modal._triggerElement = document.activeElement;
  modal._close = closeModal;
  
  // Backdrop click
  modal.addEventListener('click', (e) => {
    if (!content.contains(e.target)) closeModal();
  });
  
  content.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target.closest('.story-close')) { closeModal(); return; }
    const link = e.target.closest('.modal-house-link');
    if (link) {
      closeModal();
      setTimeout(() => showHouseLookup({ road: link.dataset.road, num: link.dataset.num }), 150);
    }
  });
  
  // Keyboard handlers
  const handleKeyboard = (e) => {
    switch(e.key) {
      case 'Escape':
        closeModal();
        break;
      case 'ArrowLeft':
        if (!e.target.matches('input, textarea')) {
          e.preventDefault();
          navigateModal(-1);
        }
        break;
      case 'ArrowRight':
        if (!e.target.matches('input, textarea')) {
          e.preventDefault();
          navigateModal(1);
        }
        break;
    }
  };
  
  window.addEventListener('keydown', handleKeyboard);
  modal._cleanupKeyboard = () => window.removeEventListener('keydown', handleKeyboard);
  
  // Navigation buttons
  content.querySelector('.nav-prev')?.addEventListener('click', () => navigateModal(-1));
  content.querySelector('.nav-next')?.addEventListener('click', () => navigateModal(1));
  
  // Share button
  content.querySelector('.modal-share-btn')?.addEventListener('click', async () => {
    const url = utils.getPermalink(article.id);
    const shareData = { title: article.title, text: article.short_desc, url };
    
    if (navigator.share) {
      try { 
        await navigator.share(shareData);
        a11y.announce('Story shared successfully');
        return;
      } catch(e) {}
    }
    
    try {
      await navigator.clipboard.writeText(url);
      const btn = content.querySelector('.modal-share-btn');
      const old = btn.innerHTML;
      btn.innerHTML = 'Copied!';
      a11y.announce('Link copied to clipboard');
      setTimeout(() => btn.innerHTML = old, 900);
    } catch(e) {
      a11y.announce('Failed to copy link', 'assertive');
    }
  });
  
  // Set up focus trap
  const cleanupFocusTrap = a11y.trapFocus(content);
  modal._cleanupFocusTrap = cleanupFocusTrap;
  
  // Announce to screen readers
  a11y.announce(`Article opened: ${article.title}`);
  
  return modal;
}

function storyNeighbours(article) {
  const idx = state.articles.findIndex(a => a.id === article.id);
  const len = state.articles.length;
  return {
    prev: state.articles[(idx - 1 + len) % len],
    next: state.articles[(idx + 1) % len]
  };
}

function readingTime(html) {
  const words = String(html || '').replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

const ICONS = {
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
  house: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>'
};

function getModalHTML(article) {
  const esc = utils.escape;
  const img = utils.safeUrl(article.img);
  const { prev, next } = storyNeighbours(article);
  const mins = readingTime(article.description);
  const by = article.contributor ? `Shared by ${esc(article.contributor)}` : '';
  return `
    <div class="story-hero${img ? '' : ' no-image'}">
      ${img ? `<img src="${img}" alt="" />` : ''}
      <div class="story-hero-bar">
        <button type="button" class="icon-btn story-close" aria-label="Close story">${ICONS.back}</button>
        <button type="button" class="icon-btn modal-share-btn" aria-label="Share this story">${ICONS.share}</button>
      </div>
    </div>
    <article class="story-body">
      <p class="story-eyebrow"><b>${esc(article.theme || 'Story')}</b>${mins} min read</p>
      <h2 id="modal-title" class="story-title">${esc(article.title)}</h2>
      ${(article.short_desc || by) ? `<p class="story-dek">${[esc(article.short_desc || ''), by].filter(Boolean).join(' · ')}</p>` : ''}
      ${modalHouseNote(article)}
      <div class="modal-description">${utils.richText(article.description)}</div>
      <div id="reactions-container-${article.id}"></div>
      <div id="reaction-form-container-${article.id}"></div>
    </article>
    <nav class="story-nav" aria-label="More stories">
      <button type="button" class="nav-btn nav-prev" aria-label="Previous story: ${esc(prev?.title || '')}">‹ <span>${esc(prev?.title || 'Previous')}</span></button>
      <button type="button" class="nav-btn nav-next" aria-label="Next story: ${esc(next?.title || '')}"><span>${esc(next?.title || 'Next')}</span> ›</button>
    </nav>
  `;
}

function modalHouseNote(article) {
  if (article.resident_id == null) return '';
  const r = state.residents.find(x => Number(x.id) === Number(article.resident_id));
  if (!r) return '';
  return `<p class="modal-house"><button type="button" class="modal-house-link"
      data-road="${utils.escape(r.road)}" data-num="${utils.escape(r.housenumber)}">${ICONS.house}
      <span>In 1929, ${utils.escape(r.housenumber)} ${utils.escape(roadDisplayName(r.road))} was first leased to
      <strong>${utils.escape(r.lessee || 'a family not yet traced')}</strong></span>${ICONS.chevron}</button></p>`;
}

function updateModalContent(article) {
  if (!currentModal) return;
  
  const content = currentModal.querySelector('.modal-content');
  content.classList.add('fade-out');
  
  setTimeout(() => {
    content.innerHTML = getModalHTML(article);
    content.scrollTop = 0;
    content.classList.remove('fade-out');
    (async () => {
      const data = await reactions.load(article.id);
      const container = content.querySelector(`#reactions-container-${article.id}`);
      if (container) container.innerHTML = reactions.render(data);
      const formContainer = content.querySelector(`#reaction-form-container-${article.id}`);
      if (formContainer) formContainer.appendChild(reactions.createForm(article.id));
    })();
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
        ${storiesForHouse(r).map(a => `<button type="button" class="rp-story" data-article="${a.id}">A story from this house: ${esc(a.title)}</button>`).join('')}
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
              <input name="title" required maxlength="200" placeholder="e.g. Life on O'Daly Road">
            </label>
            <label>Your Name (shown with your story)
              <input name="contributor" maxlength="120" autocomplete="name" placeholder="e.g. Mary from Hardiman Road">
            </label>
            <label>Your Email (optional, never shown, only so we can follow up)
              <input name="contributor_email" type="email" maxlength="254" autocomplete="email" placeholder="you@example.com">
            </label>
            <label>Your Story
              <textarea name="description" required rows="6" maxlength="20000"
                placeholder="Your memories of people, places, traditions and memorable events."></textarea>
            </label>
            ${utils.honeypotHTML}
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
      const contributor = fd.get('contributor')?.toString().trim() || null;
      const contributor_email = fd.get('contributor_email')?.toString().trim() || null;
      const thanks = 'Thank you for your story! It will be reviewed and added soon.';
      
      if (!title || !description) return;
      
      if (utils.looksLikeBot(e.target, 8000)) {
        e.target.reset();
        closeForm();
        utils.toast(thanks, { type: 'success', duration: 6000 });
        return;
      }
      
      try {
        const { error } = await state.db.from('articles').insert([{
          title: title.slice(0, 200),
          description: description.slice(0, 20000),
          short_desc: description.slice(0, 100) + '…',
          contributor,
          contributor_email,
          active: false
        }]);
        
        if (error) throw error;
        
        e.target.reset();
        closeForm();
        utils.toast(thanks, { type: 'success', duration: 6000 });
      } catch (err) {
        console.error('Submit failed:', err);
        utils.toast(utils.submitErrorMessage(err), { type: 'error', duration: 7000 });
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
    if (!dlg.open) {
      const sf = dlg.querySelector('#story-form');
      if (sf) sf.dataset.openedAt = Date.now();
      dlg.showModal();
    }
  } catch(e) {}
}

// =============================================================================
// Deep Linking
// =============================================================================

async function handleDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const articleId = params.get('article');
  
  if (!articleId) { handleHouseLink(); return; }
  
  const id = Number(articleId);
  let article = state.articlesById.get(id);
  
  if (!article) {
    try {
      const { data } = await state.db
        .from('articles')
        .select(ARTICLE_COLUMNS)
        .eq('id', id)
        .eq('active', true)
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
  const handles = [document.getElementById('content-handle'), document.getElementById('panel-header')].filter(Boolean);
  if (!content || !handles.length) return;

  let dragging = false, startY = 0, startTop = 0, lastTop = 0, moved = false;

  const onStart = (y) => {
    if (!utils.isMobile()) return false;
    dragging = true; moved = false;
    startY = y;
    startTop = lastTop = content.getBoundingClientRect().top;
    content.classList.add('dragging');
    return true;
  };
  const onMove = (y) => {
    if (!dragging) return;
    const top = Math.max(48, Math.min(startTop + (y - startY), window.innerHeight - 160));
    if (Math.abs(y - startY) > 4) moved = true;
    lastTop = top;
    document.documentElement.style.setProperty('--sheet-top', top + 'px');
  };
  const onEnd = () => {
    if (!dragging) return;
    dragging = false;
    content.classList.remove('dragging');
    if (!moved) {
      // A tap on the handle toggles between half and full
      sheet.set(state.sheetState === 'full' ? 'half' : 'full');
      return;
    }
    sheet.set(sheet.nearest(lastTop));
  };

  handles.forEach(h => {
    h.addEventListener('touchstart', (e) => { if (onStart(e.touches[0].clientY)) e.preventDefault(); }, { passive: false });
    h.addEventListener('mousedown', (e) => { if (onStart(e.clientY)) e.preventDefault(); });
  });
  window.addEventListener('touchmove', (e) => { if (dragging) { onMove(e.touches[0].clientY); e.preventDefault(); } }, { passive: false });
  window.addEventListener('mousemove', (e) => onMove(e.clientY));
  window.addEventListener('touchend', onEnd);
  window.addEventListener('mouseup', onEnd);

  // Keyboard: the handle works as a button
  const handle = document.getElementById('content-handle');
  handle.setAttribute('role', 'button');
  handle.setAttribute('tabindex', '0');
  handle.setAttribute('aria-label', 'Expand or collapse the stories panel');
  handle.removeAttribute('aria-hidden');
  handle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sheet.set(state.sheetState === 'full' ? 'half' : 'full'); }
  });

  sheet.set('half');
  window.addEventListener('resize', utils.debounce(() => sheet.set(state.sheetState || 'half'), 150));
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
    
    initHistoryFeatures({ state, utils, a11y, openModal, showStoryForm, toggleResidents, setEra, sheet });
    await initMap();
    loadingUI.hideMapLoading();
    
    renderThemes();
    renderArticles(null);
    setupMobileDrag();
    setupEraControls();
    setupTabs();
    state.era = 'today';
    updatePanelHeader();
    
    document.getElementById('share-story-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      showStoryForm();
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

function slideContentPanelDown() { sheet.set('peek'); }
function restoreContentPanel() { sheet.set('half'); }

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
      utils.toast('Sorry, this tour isn\'t available right now.', { type: 'error' });
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
          <img src="${utils.safeUrl(stop.articles.img)}" alt="${utils.escape(stop.articles.title)}" />
        </div>
        <div class="modal-description">${utils.richText(stop.articles.description)}</div>
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
    utils.toast(`Tour complete in ${duration} minute${duration !== 1 ? 's' : ''}! Thank you for exploring the Triangle's history.`, { type: 'success', duration: 7000 });
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

// =============================================================================
// Enhanced Tours Dialog with Keyboard Support
// =============================================================================

function showToursDialog() {
  const dialog = document.createElement('dialog');
  dialog.id = 'tours-dialog';
  dialog.setAttribute('aria-labelledby', 'tours-dialog-title');
  dialog.innerHTML = `
    <div class="tours-gallery">
      <header>
        <h2 id="tours-dialog-title">Guided Tours</h2>
        <button class="close-btn" type="button" aria-label="Close tours dialog">×</button>
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
  
  const closeDialog = () => {
    dialog.close();
    setTimeout(() => document.body.removeChild(dialog), 300);
  };
  
  dialog.querySelector('.close-btn').addEventListener('click', closeDialog);
  
  // Keyboard support
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDialog();
    }
  });
  
  dialog.showModal();
  
  // Set up focus trap
  const cleanupFocusTrap = a11y.trapFocus(dialog);
  dialog.addEventListener('close', cleanupFocusTrap);
  
  // Load tours
  tours.loadAll()
    .then(data => {
      const list = dialog.querySelector('#tours-list');
      
      if (!data || data.length === 0) {
        list.innerHTML = '<p class="no-tours">No tours available yet. Check back soon!</p>';
        return;
      }
      
      list.innerHTML = data.map(tour => `
        <div class="tour-card" data-tour-id="${tour.id}">
          ${tour.cover_image ? `<img src="${utils.safeUrl(tour.cover_image)}" alt="" />` : ''}
          <div class="tour-card-content">
            <h3>${utils.escape(tour.title)}</h3>
            <p>${utils.escape(tour.description || '')}</p>
            <div class="tour-meta">
              <span>${tour.tour_stops?.length || 0} stops</span>
              ${tour.duration_minutes ? `<span>~${tour.duration_minutes} minutes</span>` : ''}
            </div>
            <button class="sf-btn sf-btn-primary" type="button">Start Tour</button>
          </div>
        </div>
      `).join('');
      
      list.querySelectorAll('.tour-card button').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const card = e.target.closest('.tour-card');
          const tourId = Number(card.dataset.tourId);
          closeDialog();
          tours.start(tourId);
        });
      });
      
      a11y.announce(`${data.length} tours available`);
    })
    .catch(error => {
      const list = dialog.querySelector('#tours-list');
      list.innerHTML = `
        <div class="error-state">
          <svg class="error-icon" viewBox="0 0 24 24" width="48" height="48" aria-hidden="true">
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
      
      a11y.announce('Failed to load tours', 'assertive');
    });
}

