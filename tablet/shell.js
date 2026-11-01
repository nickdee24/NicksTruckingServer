import { connectHub } from './hub.js';

const $ = id => document.getElementById(id);
const config = await (await fetch('config.json')).json();
const params = new URLSearchParams(location.search);
if (params.get('name')) config.playerName = params.get('name');
// Inside the in-game overlay the page background must stay see-through.
if (params.has('embedded')) document.body.classList.add('embedded');

// Theme: each key in config.theme becomes a CSS variable (frameEdge -> --frame-edge).
for (const [key, value] of Object.entries(config.theme)) {
  document.documentElement.style.setProperty(`--${key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}`, value);
}
$('brand').textContent = config.brand.short;
document.title = `${config.brand.name} Tablet`;

const hub = connectHub(config.playerName);
const ctx = { hub, config };

// Chat history arrives once on connect; keep it for apps that open later.
ctx.chat = [];
hub.on('welcome', msg => { ctx.chat = [...msg.chat]; });
hub.on('chat', msg => { ctx.chat.push(msg); if (ctx.chat.length > 100) ctx.chat.shift(); });
ctx.cb = [];
hub.on('cb', msg => { ctx.cb.push(msg); if (ctx.cb.length > 100) ctx.cb.shift(); });

hub.on('connection', ({ online }) => {
  $('status').textContent = online ? 'Connected' : 'Reconnecting…';
});
hub.on('welcome', msg => { $('status').textContent = msg.server; });
hub.on('players', msg => {
  if (!msg.me) return;
  const tag = msg.me.simulated ? ' · simulated' : '';
  $('status').textContent = `${msg.me.speedKmh ?? 0} km/h · CB ${msg.cbChannel}${tag}`;
});

const tick = () => { $('clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
tick();
setInterval(tick, 10000);

// Apps live in apps/<id>.js and export { icon, mount(root, ctx) -> cleanup }.
const apps = await Promise.all(config.apps.map(async entry => ({
  ...entry,
  module: (await import(`./apps/${entry.id}.js`)).default
})));

let cleanup = null;

function openApp(app) {
  $('home').hidden = true;
  $('app-view').hidden = false;
  $('app-title').textContent = app.label;
  $('app-body').replaceChildren();
  cleanup = app.module.mount($('app-body'), ctx) || null;
}

function goHome() {
  if (cleanup) cleanup();
  cleanup = null;
  $('app-view').hidden = true;
  $('home').hidden = false;
}

for (const app of apps) {
  const btn = document.createElement('button');
  btn.className = 'app-icon';
  btn.style.setProperty('--tint', app.tint);
  btn.innerHTML = `<span class="tile">${app.module.icon}</span><span></span>`;
  btn.lastChild.textContent = app.label;
  btn.onclick = () => openApp(app);
  $('app-grid').append(btn);
}

$('back').onclick = goHome;
$('home-button').onclick = goHome;
