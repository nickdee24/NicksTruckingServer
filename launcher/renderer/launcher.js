const $ = id => document.getElementById(id);
const L = window.launcher;
let settings;
let servers = [];
let selected = null;
let hubOnline = false;
let gameRunning = false;
let news = [];
let page = null;
const navStack = [];

const hub = path => fetch(`${settings.hubUrl}${path}`).then(r => {
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
});
const titleCase = s => s[0].toUpperCase() + s.slice(1);

// ---------- Branding and artwork ----------

// Images live in launcher/assets. Until you add one, logos show a dashed box at the size they'll use.
function loadAsset(file) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `../assets/${file}`;
  });
}

async function applyArtwork() {
  for (const el of document.querySelectorAll('[data-asset]')) {
    const img = await loadAsset(el.dataset.asset);
    if (el.classList.contains('hero-bg') || el.classList.contains('game-art')) {
      if (img) el.style.setProperty(el.classList.contains('hero-bg') ? '--hero-image' : 'background-image', `url("${img.src}")`);
      continue;
    }
    el.replaceChildren();
    el.classList.toggle('placeholder', !img);
    if (img) el.append(img);
    else el.textContent = el.offsetWidth < 60 ? 'Logo' : `Your logo ${el.dataset.size}`;
  }
  const mark = await loadAsset('logo-mark.png');
  if (mark) { $('intro-mark').replaceChildren(mark.cloneNode()); $('intro-mark').style.border = '0'; }
}

// Colours and names come from the hub's tablet config so everything matches.
async function applyBrand() {
  let brand = { name: 'Trucking Launcher', short: 'NTS' };
  try {
    const cfg = await hub('/tablet/config.json');
    brand = cfg.brand;
    for (const [k, v] of Object.entries(cfg.theme)) {
      if (['frame', 'frameEdge', 'panel', 'panelRaised', 'wallpaper', 'radius'].includes(k)) continue;
      document.documentElement.style.setProperty(`--${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}`, v);
    }
  } catch {}
  $('intro-mark').textContent = brand.short;
  $('intro-name').textContent = brand.name;
  $('about').textContent = `About ${brand.name}`;
  document.title = `${brand.name} Launcher`;
}

function playIntro() {
  return new Promise(resolve => {
    const intro = $('intro');
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      intro.classList.add('done');
      setTimeout(() => intro.remove(), 700);
      resolve();
    };
    intro.onclick = finish;
    if (!settings.playIntro) return finish();
    // A custom intro video wins if you drop one at launcher/assets/intro.mp4.
    const video = $('intro-video');
    video.src = '../assets/intro.mp4';
    video.onloadeddata = () => {
      $('intro-logo').hidden = true;
      video.hidden = false;
      video.muted = false;
      video.play().catch(() => { video.muted = true; video.play(); });
    };
    video.onended = finish;
    video.onerror = () => setTimeout(finish, 3200);
  });
}

// ---------- Navigation ----------

const TITLES = { games: 'Games', ets2: 'ETS2', news: 'News', map: 'Live map', settings: 'Settings', support: 'Support' };

function go(next, { remember = true } = {}) {
  if (next === page) return;
  if (remember) navStack.push(page);
  page = next;
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.dataset.page === page));
  const navPage = page === 'ets2' ? 'games' : page;
  document.querySelectorAll('.nav').forEach(n => n.classList.toggle('active', n.dataset.page === navPage));
  $('page-title').textContent = TITLES[page];
  $('open-browser').hidden = page !== 'map';
  if (page === 'map' && !$('map-frame').src) {
    $('map-frame').src = `${settings.hubUrl}/map/?embedded=1&name=${encodeURIComponent(settings.playerName)}`;
  }
  if (page === 'settings') refreshSettings();
}

document.querySelectorAll('.nav').forEach(n => { n.onclick = () => go(n.dataset.page === 'games' && settings.lastGame === 'ets2' ? 'ets2' : n.dataset.page); });
document.querySelectorAll('[data-goto]').forEach(b => { b.onclick = () => go(b.dataset.goto); });
document.querySelectorAll('[data-back]').forEach(b => { b.onclick = () => go(navStack.pop() ?? 'games', { remember: false }); });
document.querySelectorAll('[data-open-hub]').forEach(b => { b.onclick = () => L.openExternal(settings.hubUrl + b.dataset.openHub); });
document.querySelector('[data-goto-news]').onclick = () => $('announcements').scrollIntoView({ behavior: 'smooth' });
$('game-ets2').onclick = async () => { settings = await L.setSettings({ lastGame: 'ets2' }); go('ets2'); };
document.querySelector('.change-game').onclick = async () => { settings = await L.setSettings({ lastGame: null }); go('games'); };
$('open-browser').onclick = () => L.openExternal(`${settings.hubUrl}/map/?name=${encodeURIComponent(settings.playerName)}`);
$('open-docs').onclick = () => L.openPath('docs');
$('open-mods').onclick = () => L.openPath('mods');
$('open-assets').onclick = () => L.openPath('assets');
$('dashtruck-btn').onclick = () => (settings.dashTruckUrl ? L.openExternal(settings.dashTruckUrl) : go('settings'));
$('min-btn').onclick = () => L.minimize();
$('close-btn').onclick = () => L.close();

// ---------- ETS2 page: servers and Play ----------

function renderServers() {
  $('server-line').replaceChildren(...servers.map(s => {
    const b = document.createElement('button');
    b.className = 'server-chip' + (s.id === selected ? ' selected' : '');
    b.innerHTML = '<span class="dot"></span><span></span><small></small>';
    b.querySelector('.dot').classList.add(s.online ? 'on' : 'off');
    b.children[1].textContent = titleCase(s.id);
    b.querySelector('small').textContent = s.online ? `${s.players ?? 0} driver${s.players === 1 ? '' : 's'}` : 'offline';
    b.title = s.tagline ?? '';
    b.onclick = () => { selected = s.id; renderServers(); updatePlay(); };
    return b;
  }));
  const online = servers.filter(s => s.online).length;
  $('game-ets2-status').textContent = hubOnline ? `${online} of ${servers.length} servers online` : 'Hub offline';
  const ev = servers.find(s => s.id === 'event');
  $('tile-events').textContent = ev ? (ev.online ? `Event server online · ${ev.players ?? 0} drivers` : 'No event running') : '';
}

function updatePlay() {
  const s = servers.find(x => x.id === selected);
  $('game-dot').className = 'dot ' + (gameRunning ? 'on' : hubOnline ? '' : 'off');
  $('game-state').textContent = gameRunning ? 'Playing' : hubOnline ? 'Ready' : 'Hub offline';
  $('game-hint').textContent = gameRunning ? 'Close ETS2 to launch it again from here.' : s ? s.tagline ?? '' : '';
  $('play-btn').disabled = gameRunning || !hubOnline || !s?.online;
  $('play-label').textContent = gameRunning ? 'ETS2 is running' : s ? `Play ${titleCase(s.id)}` : 'Play';
}

async function refresh() {
  try {
    servers = await hub('/api/servers');
    hubOnline = true;
  } catch {
    hubOnline = false;
  }
  try { gameRunning = (await L.gameStatus()).running; } catch {}
  if (!servers.some(s => s.id === selected)) selected = servers[0]?.id ?? null;
  renderServers();
  updatePlay();
}

function showJoin(server) {
  $('join').hidden = false;
  $('hotkey').textContent = settings.overlayHotkey;
  const setCopy = (btn, value) => {
    btn.textContent = value || 'not available';
    btn.onclick = async () => {
      await L.copy(value);
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1500);
    };
  };
  setCopy($('copy-id'), server.searchId);
  setCopy($('copy-pass'), server.password);
}

$('play-btn').onclick = async () => {
  const server = servers.find(s => s.id === selected);
  const status = $('play-status');
  status.classList.remove('error');
  $('play-btn').disabled = true;
  try {
    const result = await L.play(server.id);
    status.textContent = result.modsActivated
      ? 'Game starting. New mods were installed: enable them once in the Mod Manager.'
      : 'Game starting. Have a good drive!';
    showJoin(server);
    gameRunning = true;
  } catch (err) {
    status.classList.add('error');
    status.textContent = err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  } finally {
    updatePlay();
  }
};
L.onProgress(({ detail }) => { $('play-status').textContent = detail; });
L.onGameExited(() => { $('play-status').textContent = 'Game closed.'; refresh(); });

// ---------- News ----------

const fmtDate = d => new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
const imageVar = n => (n.image ? `url("${settings.hubUrl}${n.image}")` : '');

async function loadNews() {
  try {
    news = await hub('/api/news');
  } catch {
    news = [];
  }
  const [first, ...rest] = news;
  const hero = $('news-hero');
  hero.innerHTML = '<span class="pill"></span><h2></h2><p></p>';
  hero.style.setProperty('--card-image', first ? imageVar(first) : '');
  hero.querySelector('.pill').textContent = first?.tag ?? 'News';
  hero.querySelector('h2').textContent = first?.title ?? 'No news yet';
  hero.querySelector('p').textContent = first?.body ?? 'Post news from the admin page and it shows up here.';

  $('news-grid').replaceChildren(...rest.map(n => {
    const card = document.createElement('article');
    card.className = 'news-card';
    card.innerHTML = '<div class="art"></div><div class="body"><div class="meta"><b></b><span></span></div><h3></h3><p></p></div>';
    if (n.image) card.querySelector('.art').style.setProperty('--card-image', imageVar(n));
    card.querySelector('b').textContent = n.tag;
    card.querySelector('.meta span').textContent = fmtDate(n.date);
    card.querySelector('h3').textContent = n.title;
    card.querySelector('p').textContent = n.body;
    return card;
  }));

  $('ticker').textContent = first ? `${first.title}: ${first.body}` : 'Welcome!';
}

async function loadDriving() {
  try {
    const r = await fetch(`${settings.hubUrl}/api/incidents`);
    const { items } = await r.json();
    const real = servers.reduce((n, s) => n + (s.players ?? 0), 0);
    $('tile-driving').textContent = `${real} driving now · ${items.length} road report${items.length === 1 ? '' : 's'}`;
  } catch {
    $('tile-driving').textContent = '';
  }
}

// ---------- Settings ----------

async function refreshSettings() {
  document.querySelectorAll('[data-setting]').forEach(el => {
    if (el.type === 'checkbox') el.checked = !!settings[el.dataset.setting];
    else el.value = settings[el.dataset.setting] ?? '';
  });
  const status = await L.gameStatus();
  $('game-dir').value = status.dir ?? 'Not found';
  $('dir-dot').className = 'dot ' + (status.found ? 'on' : 'off');
  $('dir-state').textContent = status.found ? 'Game linked.' : 'Euro Truck Simulator 2 was not found. Choose its folder.';
  const p = status.plugin;
  $('tele-dot').className = 'dot ' + (p?.installed ? 'on' : '');
  $('tele-state').textContent = p?.installed
    ? `Plugin installed${p.name ? `, reporting as ${p.name}` : ''}.`
    : 'Plugin not installed yet. It is added the first time you press Play.';
}

document.querySelectorAll('[data-setting]').forEach(el => {
  el.onchange = async () => {
    const value = el.type === 'checkbox' ? el.checked : el.value.trim();
    settings = await L.setSettings({ [el.dataset.setting]: value });
    $('saved').textContent = 'Saved';
    setTimeout(() => { $('saved').textContent = ''; }, 1500);
    if (el.dataset.setting === 'hubUrl') { $('map-frame').removeAttribute('src'); await applyBrand(); refresh(); loadNews(); }
  };
});

$('change-folder').onclick = async () => {
  try { await L.chooseGameFolder(); } catch (err) { alert(err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }
  refreshSettings();
};
$('find-steam').onclick = async () => {
  const dir = await L.findGameInSteam();
  if (!dir) alert('Euro Truck Simulator 2 was not found in your Steam libraries.');
  refreshSettings();
};
$('check-telemetry').onclick = async () => {
  try {
    const t = await hub(`/api/telemetry/${encodeURIComponent(settings.playerName)}`);
    const live = t.seen && t.secondsAgo < 10;
    $('tele-dot').className = 'dot ' + (live ? 'on' : 'off');
    $('tele-state').textContent = live
      ? `Working: the hub is receiving your truck${t.truck ? ` (${t.truck})` : ''} at ${Math.round(t.x)}, ${Math.round(t.z)}${t.paused ? ', game paused' : ''}.`
      : t.seen ? `Last heard ${t.secondsAgo} seconds ago. Is the game running and unpaused?` : 'Nothing received yet. Start the game with Play and drive for a moment.';
  } catch {
    $('tele-state').textContent = 'The hub is not reachable.';
  }
};

// ---------- Start ----------

(async () => {
  settings = await L.getSettings();
  selected = settings.lastServer;
  await applyBrand();
  applyArtwork();
  // A #page in the URL opens that page directly (used for screenshots while developing).
  const startPage = location.hash.slice(1);
  if (startPage) settings.playIntro = false;
  go(startPage || (settings.lastGame === 'ets2' ? 'ets2' : 'games'), { remember: false });
  $('intro-status').textContent = 'Connecting to the hub…';
  await Promise.all([playIntro(), refresh(), loadNews()]);
  loadDriving();
  setInterval(() => { refresh(); loadDriving(); }, 10000);
})();
