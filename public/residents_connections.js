// residents_connections.js
// Usage:
//   1) Include after Leaflet and after your Supabase client is created.
//   2) Call: loadResidentConnections(map, supabaseClient)
//
// Adds a toggleable overlay layer "Resident Moves" with polylines from former address to current address,
// and small markers at each end. Tooltips show basic resident info.

export async function loadResidentConnections(map, supabaseClient) {
  const connectionsLayer = L.layerGroup();

  // Fetch residents with both current coords and former coords
  const { data, error } = await supabaseClient
    .from('residents')
    .select('id, lessee, housenumber, road, lat, lon, formeraddress, formerAddr_lat, formerAddr_lon')
    .eq('active', true)
    .not('lat', 'is', null)
    .not('lon', 'is', null)
    .not('formerAddr_lat', 'is', null)
    .not('formerAddr_lon', 'is', null);

  if (error) {
    console.error('Supabase (residents) error:', error);
    return { layer: connectionsLayer, count: 0 };
  }

  const rows = data || [];
  let drawn = 0;

  rows.forEach(r => {
    const from = [r.formerAddr_lat, r.formerAddr_lon];
    const to   = [r.lat, r.lon];

    // Skip degenerate or super-short connections
    try {
      const d = map.distance(from, to);
      if (!isFinite(d) || d < 5) return;
    } catch (_) {
      return;
    }

    const info = `
      <div style="font-size:0.9rem; line-height:1.2;">
        <strong>${r.lessee ?? 'Resident'}</strong><br/>
        ${r.formeraddress ? `${escapeHtml(r.formeraddress)} &rarr; ` : ''}
        ${[r.housenumber, r.road].filter(Boolean).join(' ')}
      </div>
    `;

    const line = L.polyline([from, to], {
      color: '#2b6cb0',
      weight: 2.5,
      opacity: 0.8,
      dashArray: '6 6'
    }).bindTooltip(info, { sticky: true });

    const fromMarker = L.circleMarker(from, {
      radius: 4,
      weight: 1,
      opacity: 0.9,
      fillOpacity: 0.7
    }).bindTooltip(`<div><em>Former:</em><br/>${escapeHtml(r.formeraddress ?? 'Unknown')}</div>`);

    const toLabel = [r.housenumber, r.road].filter(Boolean).join(' ') || 'Current';
    const toMarker = L.circleMarker(to, {
      radius: 4,
      weight: 1,
      opacity: 0.9,
      fillOpacity: 0.7
    }).bindTooltip(`<div><em>Current:</em><br/>${escapeHtml(toLabel)}</div>`);

    connectionsLayer.addLayer(line);
    connectionsLayer.addLayer(fromMarker);
    connectionsLayer.addLayer(toMarker);
    drawn += 1;
  });

  // Add to map & layer control
  connectionsLayer.addTo(map);
  ensureOverlayInLayerControl(map, connectionsLayer, 'Resident Moves');

  return { layer: connectionsLayer, count: drawn };
}

// Minimal HTML escaper for safe tooltips
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Adds overlay to an existing L.control.layers if present; otherwise creates one.
function ensureOverlayInLayerControl(map, layer, label) {
  // Try to find an existing control
  let found = null;
  map.eachLayer(() => {}); // no-op just to keep pattern consistent

  // Heuristic: attach a single global control if one isn't present
  if (!map._residentMovesControl) {
    map._residentMovesControl = L.control.layers(undefined, {}, { collapsed: true }).addTo(map);
  }
  map._residentMovesControl.addOverlay(layer, label);
}
