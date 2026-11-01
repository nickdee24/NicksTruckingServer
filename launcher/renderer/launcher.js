const $ = id => document.getElementById(id);
let settings;
let servers = [];
let selected = null;
let hubOnline = false;

const hub = path => fetch(`${settings.hubUrl}${path}`).then(r => {
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
});

// Brand and colours come from the hub's tablet config so everything matches.
async function applyBrand() {
  try {
    const cfg = await hub('/tablet/config.json');
    for (const [k, v] of Object.entries(cfg.theme)) {
      document.documentElement.style.setProperty(`--${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}`, v);
    }
    $('mark').textContent = $('intro-mark').textContent = cfg.brand.short;
    $('title').textContent = $('intro-name').textContent = cfg.brand.name;
    document.title = `${cfg.brand.name} Launcher`;
  } catch {
    $('mark').textContent = $('intro-mark').textContent = 'NTS';
    $('title').textContent = $('intro-name').textContent = 'Trucking Launcher';
  }
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

function renderServers() {
  const list = $('server-list');
  list.replaceChildren(...servers.map(s => {
    const b = document.createElement('button');
    b.className = 'server' + (s.id === selected ? ' selected' : '');
    b.innerHTML = `
      <h3></h3>
      <div class="state"><span class="dot ${s.online ? 'on' : ''}"></span><span></span></div>
      <div class="tagline"></div>
      <div class="badges"></div>`;
    b.querySelector('h3').textContent = s.id[0].toUpperCase() + s.id.slice(1);
    b.querySelector('.state span:last-child').textContent = s.online ? `Online · ${s.players ?? 0}/${s.maxPlayers} drivers` : 'Offline';
    b.querySelector('.tagline').textContent = s.tagline;
    const badges = [s.traffic ? 'AI traffic' : 'No AI traffic', s.playerDamage ? 'Collisions on' : 'No damage'];
    if (s.speedLimiter) badges.push('Speed limiter');
    b.querySelector('.badges').replaceChildren(...badges.map(t => Object.assign(document.createElement('span'), { className: 'badge', textContent: t })));
    b.onclick = () => { selected = s.id; renderServers(); updatePlayButton(); };
    return b;
  }));
}

function updatePlayButton() {
  const s = servers.find(x => x.id === selected);
  $('play-btn').disabled = !hubOnline || !s || !s.online;
  $('play-btn').textContent = s ? `Play ${s.id[0].toUpperCase() + s.id.slice(1)}` : 'Play';
}

async function refresh() {
  try {
    servers = await hub('/api/servers');
    hubOnline = true;
    $('hub-state').textContent = 'Hub connected';
  } catch {
    hubOnline = false;
    $('hub-state').textContent = `Hub offline at ${settings.hubUrl}`;
  }
  if (!servers.some(s => s.id === selected)) selected = servers[0]?.id ?? null;
  renderServers();
  updatePlayButton();
}

async function loadNews() {
  try {
    const items = await hub('/api/news');
    $('news').replaceChildren(...items.map(n => {
      const li = document.createElement('li');
      li.innerHTML = '<div class="meta"><span class="tag"></span><span></span></div><h4></h4><p></p>';
      li.querySelector('.tag').textContent = n.tag;
      li.querySelector('.meta span:last-child').textContent = new Date(n.date).toLocaleDateString([], { day: 'numeric', month: 'short' });
      li.querySelector('h4').textContent = n.title;
      li.querySelector('p').textContent = n.body;
      return li;
    }));
  } catch {
    $('news').innerHTML = '<li class="muted">News is unavailable while the hub is offline.</li>';
  }
}

function showJoin(server) {
  $('join').hidden = false;
  $('join-name').textContent = server.name;
  $('hotkey').textContent = settings.overlayHotkey;
  const setCopy = (btn, value) => {
    btn.textContent = value || 'not available';
    btn.onclick = async () => {
      await window.launcher.copy(value);
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
    const result = await window.launcher.play(server.id);
    status.textContent = result.modsActivated
      ? 'Game starting. New mods were installed: enable the "nts_" mods once in the Mod Manager.'
      : 'Game starting. Have a good drive!';
    showJoin(server);
  } catch (err) {
    status.classList.add('error');
    status.textContent = err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  } finally {
    updatePlayButton();
  }
};

window.launcher.onProgress(({ detail }) => { $('play-status').textContent = detail; });
window.launcher.onGameExited(() => { $('play-status').textContent = 'Game closed.'; refresh(); });

// Tools open in the browser; they are pages served by the hub.
document.querySelectorAll('[data-open]').forEach(b => {
  b.onclick = () => window.launcher.openExternal(settings.hubUrl + b.dataset.open);
});
$('dashtruck-btn').onclick = () => {
  if (settings.dashTruckUrl) window.launcher.openExternal(settings.dashTruckUrl);
  else openSettings();
};

function openSettings() {
  const form = $('settings-form');
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') el.checked = !!settings[el.name];
    else el.value = settings[el.name] ?? '';
  }
  $('settings').showModal();
}
$('settings-btn').onclick = openSettings;
$('settings').addEventListener('close', async () => {
  if ($('settings').returnValue !== 'save') return;
  const form = $('settings-form');
  const next = {};
  for (const el of form.elements) {
    if (el.name) next[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
  }
  settings = await window.launcher.setSettings(next);
  await applyBrand();
  refresh();
  loadNews();
});

$('min-btn').onclick = () => window.launcher.minimize();
$('close-btn').onclick = () => window.launcher.close();

(async () => {
  settings = await window.launcher.getSettings();
  selected = settings.lastServer;
  await applyBrand();
  $('intro-status').textContent = 'Connecting to the hub…';
  await Promise.all([playIntro(), refresh(), loadNews()]);
  setInterval(refresh, 10000);
})();
