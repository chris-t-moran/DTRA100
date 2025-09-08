/*! Resident Move 'Easter Egg' (highlight on selection only) */
(function (global) {
  const ORANGE = '#f97316'; // Tailwind orange-500
  const ORANGE_FILL = '#fb923c'; // orange-400-ish

  function ensureLayers(map) {
    if (!global.state) global.state = {};
    if (!global.state.residentMoveLayer) {
      global.state.residentMoveLayer = L.layerGroup();
      global.state.residentMoveLayer.addTo(map);
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

    // Safety: skip tiny distances
    try {
      const d = map.distance(from, to);
      if (!isFinite(d) || d < 5) return;
    } catch (_) { return; }

    // Orange curved arc (use a simple midpoint offset for a subtle bend)
    const curve = bezierCurvePoints(from, to, 0.25, 48);
    const line = L.polyline(curve, {
      color: ORANGE,
      weight: 3,
      opacity: 0.95,
      dashArray: '4 6'
    });

    // Highlight current location with an orange halo (overlay circle marker)
    const halo = L.circleMarker(to, {
      radius: 7,
      color: ORANGE,
      weight: 3,
      fillColor: ORANGE_FILL,
      fillOpacity: 0.6
    });

    // Small marker on the former location
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

    global.state._residentMoveCurrent = { line, halo, former };
  }

  // Hook you can call when leaving Residents view
  function hideResidentMoveEasterEgg(map) {
    clearResidentMoveHighlight(map);
    if (global.state && global.state.residentMoveLayer) {
      try { map.removeLayer(global.state.residentMoveLayer); } catch (_) {}
    }
  }

  function showResidentMoveEasterEgg(map) {
    ensureLayers(map);
    if (global.state && global.state.residentMoveLayer && !map.hasLayer(global.state.residentMoveLayer)) {
      global.state.residentMoveLayer.addTo(map);
    }
  }

  // Quadratic Bezier helper (same as earlier)
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

  // Expose API
  global.ResidentMoveEgg = {
    show: showResidentMoveHighlight,
    clear: clearResidentMoveHighlight,
    hideLayer: hideResidentMoveEasterEgg,
    showLayer: showResidentMoveEasterEgg
  };
})(window);

/* === Integration example ===
  // 1) Include this script after Leaflet and after your Supabase client + main.js.
  // 2) In loadResidents(), when you create each resident marker, attach data & click handler:
  //
  //   const marker = L.circleMarker([row.lat, row.lon], {...});
  //   marker._resident = row; // attach full row so we can read formerAddr_* later
  //   marker.on('click', (e) => {
  //     // Ensure the special layer is visible only in Residents mode
  //     ResidentMoveEgg.showLayer(state.map);
  //     ResidentMoveEgg.show(state.map, marker._resident, e.latlng);
  //   });
  //
  // 3) When switching away from the Residents view (your "Switch to 1929" etc):
  //
  //   ResidentMoveEgg.hideLayer(state.map); // also clears any highlight
  //
  // This keeps the line invisible by default, only shows on resident selection,
  // and styles the highlight in orange.
=== */
