// Live map: drivers, the roads you have driven, cities and traffic incidents.
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

const params = new URLSearchParams(location.search);
const config = await fetch('/tablet/config.json').then(r => r.json()).catch(() => null);
const me = params.get('name') || config?.playerName || '';
if (config) {
  $('mark').textContent = config.brand.short;
  $('title').textContent = `${config.brand.name} live map`;
  document.title = `${config.brand.name} Live Map`;
  document.documentElement.style.setProperty('--accent', config.theme.accent);
}
$('follow-name').textContent = me || 'me';

const map = L.map('map', { crs: L.CRS.Simple, minZoom: -9, maxZoom: 2, zoomSnap: 0.5, attributionControl: false });
map.setView(ll(0, 0), -2);

const roadLayer = L.layerGroup().addTo(map);
const cityLayer = L.layerGroup().addTo(map);
const incidentLayer = L.layerGroup().addTo(map);
const driverLayer = L.layerGroup().addTo(map);

async function loadRoads() {
  const { lines, cities } = await fetch('/api/roads').then(r => r.json());
  roadLayer.clearLayers();
  for (const line of lines) {
    if (line.length > 1) L.polyline(line.map(([x, z]) => ll(x, z)), { color: '#3a4553', weight: 4, opacity: .9 }).addTo(roadLayer);
  }
  cityLayer.clearLayers();
  for (const [name, [x, z]] of Object.entries(cities)) {
    L.circleMarker(ll(x, z), { radius: 4, color: '#8b96a3', fillOpacity: 1 }).addTo(cityLayer);
    L.marker(ll(x, z), { icon: L.divIcon({ className: 'city-label', html: '', iconAnchor: [-8, 6] }) })
      .addTo(cityLayer).getElement()?.append(name);
  }
}
loadRoads();
setInterval(loadRoads, 30000);

const truckIcon = (d, isMe) => {
  const colour = isMe ? 'var(--accent)' : d.isBot ? '#8b96a3' : '#58a6ff';
  const el = document.createElement('div');
  el.className = 'truck';
  el.innerHTML = `<svg width="22" height="22" viewBox="-11 -11 22 22" style="transform:rotate(${d.heading}rad)"><path d="M0 -9 L7 8 L0 4 L-7 8 Z" fill="${colour}" stroke="#0d1117" stroke-width="1.5"/></svg><span class="truck-label"></span>`;
  el.querySelector('.truck-label').textContent = d.name;
  return L.divIcon({ className: '', html: el, iconSize: [22, 22], iconAnchor: [11, 11] });
};

const describe = d => [d.truck, d.cargo && `${d.cargo}${d.to ? ` to ${d.to}` : ''}`, `${d.speedKmh ?? 0} km/h`].filter(Boolean).join(' · ');

let drivers = [];
let incidents = [];

function renderDrivers() {
  const showBots = $('show-bots').checked;
  const visible = drivers.filter(d => showBots || !d.isBot);
  driverLayer.clearLayers();
  for (const d of visible) {
    const isMe = d.name.toLowerCase() === me.toLowerCase();
    L.marker(ll(d.x, d.z), { icon: truckIcon(d, isMe), zIndexOffset: isMe ? 1000 : 0 })
      .bindPopup(() => { const p = document.createElement('div'); p.innerHTML = '<b></b><br><span></span>'; p.querySelector('b').textContent = d.name; p.querySelector('span').textContent = describe(d); return p; })
      .addTo(driverLayer);
  }
  const mine = drivers.find(d => d.name.toLowerCase() === me.toLowerCase());
  if (mine && $('follow').checked) map.panTo(ll(mine.x, mine.z), { animate: true });

  const real = drivers.filter(d => !d.isBot).length;
  $('summary').textContent = `${real} driver${real === 1 ? '' : 's'} online${showBots ? ` · ${drivers.length - real} simulated` : ''} · ${incidents.length} report${incidents.length === 1 ? '' : 's'}`;

  $('drivers').replaceChildren(...(visible.length ? visible : [null]).map(d => {
    const li = document.createElement('li');
    if (!d) { li.className = 'empty'; li.textContent = 'Nobody is driving.'; return li; }
    li.innerHTML = '<span></span><small></small>';
    li.firstChild.textContent = d.name + (d.simulated ? ' (simulated)' : '');
    li.lastChild.textContent = describe(d);
    li.onclick = () => { $('follow').checked = false; map.setView(ll(d.x, d.z), Math.max(map.getZoom(), -2)); };
    return li;
  }));
}

function renderIncidents() {
  incidentLayer.clearLayers();
  for (const i of incidents) {
    const style = INCIDENT_STYLE[i.type] ?? INCIDENT_STYLE.slow;
    const html = `<div class="incident" style="background:${style.colour}">${style.glyph}</div>`;
    L.marker(ll(i.x, i.z), { icon: L.divIcon({ className: '', html, iconSize: [26, 26], iconAnchor: [13, 13] }) })
      .bindPopup(() => { const p = document.createElement('div'); p.innerHTML = '<b></b><br><span></span>'; p.querySelector('b').textContent = i.label; p.querySelector('span').textContent = i.note || ''; return p; })
      .addTo(incidentLayer);
  }
  $('incidents').replaceChildren(...(incidents.length ? incidents : [null]).map(i => {
    const li = document.createElement('li');
    if (!i) { li.className = 'empty'; li.textContent = 'No reports. Clear roads!'; return li; }
    li.innerHTML = '<span></span><small></small>';
    li.firstChild.textContent = i.label + (i.reports > 1 ? ` (${i.reports} reports)` : '');
    li.lastChild.textContent = `${i.note || ''} · ${Math.max(1, Math.round((Date.now() - i.createdAt) / 60000))} min ago`;
    li.onclick = () => { $('follow').checked = false; map.setView(ll(i.x, i.z), Math.max(map.getZoom(), -2)); };
    return li;
  }));
}

$('show-bots').onchange = renderDrivers;

function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', name: 'map', role: 'map' }));
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'world') { drivers = msg.drivers; renderDrivers(); }
    if (msg.type === 'incidents') { incidents = msg.items; renderIncidents(); }
  };
  ws.onclose = () => { $('summary').textContent = 'Reconnecting…'; setTimeout(connect, 2000); };
}
connect();
