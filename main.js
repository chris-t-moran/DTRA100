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
