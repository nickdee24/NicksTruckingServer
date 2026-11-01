// Live map: drivers, the roads you have driven, cities, zones and road incidents.
// Game coordinates are metres: x to the east, z to the south. Leaflet's simple CRS uses [lat, lng],
// so a point is drawn at [-z, x].
const $ = id => document.getElementById(id);
const L = window.L;
const ll = (x, z) => [-z, x];

const INCIDENT_STYLE = {
  accident: { colour: '#f85149', glyph: '!' },
  jam: { colour: '#d29922', glyph: '≡' },
  slow: { colour: '#e3b341', glyph: '~' },
  roadworks: { colour: '#f0883e', glyph: '⚒' },
  closure: { colour: '#a40e26', glyph: '⛔' },
  police: { colour: '#388bfd', glyph: 'P' },
  weather: { colour: '#8b96a3', glyph: '☂' }
};
const ARROW = '<svg viewBox="0 0 24 24"><path d="M12 3 20 21 12 16 4 21z"/></svg>';
const WARN = '<svg viewBox="0 0 24 24"><path d="M12 3 22 20H2z"/><path d="M12 10v4M12 17v.5"/></svg>';

const params = new URLSearchParams(location.search);
const config = await fetch('/tablet/config.json').then(r => r.json()).catch(() => null);
const me = params.get('name') || config?.playerName || '';
if (config) {
  document.title = `${config.brand.name} Live Map`;
  document.documentElement.style.setProperty('--accent', config.theme.accent);
}
$('follow-name').textContent = me || 'me';

const map = L.map('map', { crs: L.CRS.Simple, minZoom: -9, maxZoom: 2, zoomSnap: 0.5, attributionControl: false, zoomControl: false });
L.control.zoom({ position: 'topright' }).addTo(map);
map.setView(ll(0, 0), -2);

const layers = {
  roads: L.layerGroup().addTo(map),
  cities: L.layerGroup().addTo(map),
  zones: L.layerGroup(),
  incidents: L.layerGroup().addTo(map),
  drivers: L.layerGroup().addTo(map)
};

// A rendered map background, if one has been set up (see docs). Otherwise roads are drawn as you drive.
const mapInfo = await fetch('/api/map').then(r => r.json()).catch(() => ({}));
if (mapInfo.tiles) {
  L.tileLayer(mapInfo.tiles.url, { ...mapInfo.tiles.options, noWrap: true }).addTo(map);
} else {
  $('empty-note').hidden = false;
}

let drivers = [];
let incidents = [];
let servers = [];
let serverFilter = 'all';
let tab = 'players';
let query = '';
let showBots = true;

async function loadRoads() {
  const { lines, cities } = await fetch('/api/roads').then(r => r.json());
  layers.roads.clearLayers();
  for (const line of lines) {
    if (line.length > 1) L.polyline(line.map(([x, z]) => ll(x, z)), { color: '#4a5260', weight: 4, opacity: .95 }).addTo(layers.roads);
  }
  layers.cities.clearLayers();
  for (const [name, [x, z]] of Object.entries(cities)) {
    L.marker(ll(x, z), { icon: L.divIcon({ className: 'city-label', html: '', iconAnchor: [0, 6] }) }).addTo(layers.cities).getElement()?.append(name);
  }
  if (!lines.length && !mapInfo.tiles) $('empty-note').hidden = false;
}

async function loadZones() {
  const { items } = await fetch('/api/zones').then(r => r.json());
  layers.zones.clearLayers();
  for (const zn of items) {
    L.circle(ll(zn.x, zn.z), { radius: zn.radius, color: '#3fb950', weight: 1.5, fillOpacity: .08 }).bindTooltip(zn.name || zn.kind).addTo(layers.zones);
  }
}

async function loadServers() {
  servers = await fetch('/api/servers').then(r => r.json()).catch(() => []);
  renderServerTabs();
}
loadRoads();
loadZones();
loadServers();
setInterval(loadRoads, 30000);
setInterval(loadZones, 60000);
setInterval(loadServers, 10000);

const truckIcon = (d, isMe) => {
  const colour = isMe ? 'var(--accent)' : d.isBot ? '#8b96a3' : '#f2c27a';
  const el = document.createElement('div');
  el.className = 'truck';
  el.innerHTML = `<svg width="20" height="20" viewBox="-11 -11 22 22" style="transform:rotate(${d.heading}rad)"><path d="M0 -9 L7 8 L0 4 L-7 8 Z" fill="${colour}" stroke="#0d1117" stroke-width="1.5"/></svg><span class="truck-label"></span>`;
  el.querySelector('.truck-label').textContent = d.name;
  return L.divIcon({ className: '', html: el, iconSize: [20, 20], iconAnchor: [10, 10] });
};
const describe = d => [`${d.speedKmh ?? 0} km/h`, d.cargo && `${d.cargo}${d.to ? ` to ${d.to}` : ''}`, d.isBot && 'simulated'].filter(Boolean).join(' · ');
const popup = (title, text) => () => { const p = document.createElement('div'); p.innerHTML = '<b></b><br><span></span>'; p.querySelector('b').textContent = title; p.querySelector('span').textContent = text; return p; };
const matches = text => !query || text.toLowerCase().includes(query);
const onServer = d => serverFilter === 'all' || (d.server ?? 'main') === serverFilter;

function renderServerTabs() {
  const count = id => drivers.filter(d => (d.server ?? 'main') === id && (showBots || !d.isBot)).length;
  $('server-tabs').replaceChildren(...servers.map(s => {
    const b = document.createElement('button');
    b.className = 'server-tab' + (serverFilter === s.id ? ' active' : '');
    b.innerHTML = '<span></span><small></small>';
    b.firstChild.textContent = s.id[0].toUpperCase() + s.id.slice(1);
    b.lastChild.textContent = s.online ? count(s.id) : 'offline';
    b.onclick = () => { serverFilter = serverFilter === s.id ? 'all' : s.id; renderServerTabs(); render(); };
    return b;
  }));
}

function renderMarkers() {
  layers.drivers.clearLayers();
  for (const d of drivers.filter(d => (showBots || !d.isBot) && onServer(d))) {
    const isMe = d.name.toLowerCase() === me.toLowerCase();
    L.marker(ll(d.x, d.z), { icon: truckIcon(d, isMe), zIndexOffset: isMe ? 1000 : 0 }).bindPopup(popup(d.name, describe(d))).addTo(layers.drivers);
  }
  layers.incidents.clearLayers();
  for (const i of incidents) {
    const style = INCIDENT_STYLE[i.type] ?? INCIDENT_STYLE.slow;
    const html = `<div class="incident" style="background:${style.colour}">${style.glyph}</div>`;
    L.marker(ll(i.x, i.z), { icon: L.divIcon({ className: '', html, iconSize: [24, 24], iconAnchor: [12, 12] }) }).bindPopup(popup(i.label, i.note || '')).addTo(layers.incidents);
  }
}

function renderList() {
  const rows = tab === 'players'
    ? drivers.filter(d => (showBots || !d.isBot) && onServer(d) && matches(d.name)).sort((a, b) => a.name.localeCompare(b.name))
    : incidents.filter(i => matches(`${i.label} ${i.note ?? ''}`));
  $('list-title').textContent = tab === 'players' ? 'Players online' : 'Road incidents';
  $('list-count').textContent = rows.length;
  if (!rows.length) {
    $('list').innerHTML = `<li class="empty">${tab === 'players' ? 'Nobody is driving.' : 'No reports. Clear roads!'}</li>`;
    return;
  }
  $('list').replaceChildren(...rows.map(r => {
    const li = document.createElement('li');
    const isIncident = tab === 'incidents';
    li.className = isIncident ? 'incident' : r.isBot ? 'bot' : '';
    li.innerHTML = `${isIncident ? WARN : ARROW}<div><strong></strong><small></small></div>`;
    li.querySelector('strong').textContent = isIncident ? r.label + (r.reports > 1 ? ` ×${r.reports}` : '') : r.name;
    li.querySelector('small').textContent = isIncident
      ? `${r.note || ''}${r.note ? ' · ' : ''}${Math.max(1, Math.round((Date.now() - r.createdAt) / 60000))} min ago`
      : describe(r);
    li.onclick = () => { $('follow').checked = false; map.setView(ll(r.x, r.z), Math.max(map.getZoom(), -1)); };
    return li;
  }));
}

function render() {
  renderMarkers();
  renderList();
  const mine = drivers.find(d => d.name.toLowerCase() === me.toLowerCase());
  if (mine && $('follow').checked) map.panTo(ll(mine.x, mine.z), { animate: true });
}

// Search can also jump to a city.
$('search').oninput = e => {
  query = e.target.value.trim().toLowerCase();
  render();
};
$('search').onkeydown = async e => {
  if (e.key !== 'Enter' || !query) return;
  const { cities } = await fetch('/api/roads').then(r => r.json());
  const city = Object.entries(cities).find(([name]) => name.toLowerCase().includes(query));
  if (city) { $('follow').checked = false; map.setView(ll(...city[1]), -1); }
};
document.querySelectorAll('.tab').forEach(t => {
  t.onclick = () => {
    tab = t.dataset.tab;
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    renderList();
  };
});
$('overview').onclick = () => {
  $('follow').checked = false;
  const pts = [...drivers, ...incidents].map(d => ll(d.x, d.z));
  if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.2));
};
$('layers-btn').onclick = () => { $('layers').hidden = !$('layers').hidden; };
$('hide-list').onclick = () => {
  const hidden = $('panel').classList.toggle('hidden');
  $('hide-list').querySelector('span').textContent = hidden ? 'Show list' : 'Hide list';
  setTimeout(() => map.invalidateSize(), 50);
};
document.querySelectorAll('[data-layer]').forEach(cb => {
  cb.onchange = () => {
    if (cb.dataset.layer === 'bots') { showBots = cb.checked; renderServerTabs(); render(); return; }
    const layer = layers[cb.dataset.layer];
    if (cb.checked) layer.addTo(map); else layer.remove();
  };
});

function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', name: 'map', role: 'map' }));
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'world') { drivers = msg.drivers; render(); renderServerTabs(); }
    if (msg.type === 'incidents') { incidents = msg.items; render(); }
  };
  ws.onclose = () => setTimeout(connect, 2000);
}
connect();
