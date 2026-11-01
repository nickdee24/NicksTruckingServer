import { connectHub } from './hub.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const config = await (await fetch('config.json')).json();
const name = params.get('name') || config.playerName;

for (const [key, value] of Object.entries(config.theme)) {
  document.documentElement.style.setProperty(`--${key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}`, value);
}

// Widget positions and visibility, saved per PC. config.overlay sets the defaults.
const defaults = config.overlay?.widgets ?? {
  nearby: { x: 24, y: 80, show: true },
  chat: { x: 24, y: 200, show: true },
  cb: { x: 24, y: 440, show: true }
};
let layout;
try { layout = { ...defaults, ...JSON.parse(localStorage.getItem('overlay-layout')) }; } catch { layout = { ...defaults }; }
const saveLayout = () => { try { localStorage.setItem('overlay-layout', JSON.stringify(layout)); } catch {} };

document.querySelectorAll('[data-widget]').forEach(el => {
  const key = el.dataset.widget;
  const pos = layout[key] ?? { x: 24, y: 24, show: true };
  el.style.left = `${pos.x}px`;
  el.style.top = `${pos.y}px`;
  el.hidden = pos.show === false;

  el.querySelector('.grip').addEventListener('pointerdown', e => {
    if (!document.body.classList.contains('editing')) return;
    const startX = e.clientX - el.offsetLeft, startY = e.clientY - el.offsetTop;
    const move = ev => {
      el.style.left = `${Math.max(0, ev.clientX - startX)}px`;
      el.style.top = `${Math.max(0, ev.clientY - startY)}px`;
    };
    const up = () => {
      removeEventListener('pointermove', move);
      layout[key] = { ...pos, x: el.offsetLeft, y: el.offsetTop };
      saveLayout();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up, { once: true });
  });
});

// Opening the tablet (hotkey) also unlocks the HUD for dragging.
const setVisible = visible => {
  $('tablet-wrap').hidden = !visible;
  document.body.classList.toggle('editing', visible);
  if (visible && !$('tablet').src) $('tablet').src = `index.html?embedded=1&name=${encodeURIComponent(name)}`;
};
window.overlay?.onVisible(setVisible);
addEventListener('keydown', e => { if (e.key === 'Escape') window.overlay?.close(); });

const hub = connectHub(name, params.get('server'));
const time = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function addLine(list, html, parts) {
  const li = document.createElement('li');
  li.innerHTML = html;
  li.querySelectorAll('[data-t]').forEach((n, i) => { n.textContent = parts[i]; });
  list.append(li);
  while (list.children.length > 6) list.firstChild.remove();
}

hub.on('welcome', msg => msg.chat.slice(-4).forEach(m => addLine($('chat'), '<b data-t></b> <span data-t></span>', [m.from, m.text])));
hub.on('chat', m => addLine($('chat'), '<b data-t></b> <span data-t></span>', [m.from, m.text]));
hub.on('cb', m => addLine($('cb'), '<b data-t></b> <small data-t></small> <span data-t></span>',
  [m.from, m.distance ? `${(m.distance / 1000).toFixed(1)} km` : time(m.ts), m.text]));

// Server announcements slide in at the top and away after their time is up.
// config.overlay.announcementLayout: "strip" (full-width banner) or "card" (box at top centre).
const layoutName = config.overlay?.announcementLayout ?? 'strip';
$('announcements').classList.add(layoutName);
$('top-stack').classList.add(layoutName);

// Area notice while inside a zone (truck stop, fuel station, depot), cleared on the way out.
hub.on('zone', ({ notice }) => {
  $('notice').hidden = !notice;
  $('notice-text').textContent = notice ?? '';
});
hub.on('announcement', a => {
  const el = document.createElement('div');
  el.className = `announcement ${a.style}`;
  el.innerHTML = '<span class="mark"></span><div><h3></h3><p></p></div>';
  el.querySelector('.mark').textContent = config.brand.short;
  el.querySelector('h3').textContent = a.title;
  el.querySelector('p').textContent = a.text;
  $('announcements').append(el);
  setTimeout(() => {
    el.classList.add('leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, a.seconds * 1000);
});

hub.on('players', ({ players, cbChannel }) => {
  $('cb-ch').textContent = `· CH ${cbChannel}`;
  const near = players.filter(p => p.distance !== null && p.distance <= 5000);
  const inCb = players.filter(p => p.inCbRange).length;
  const nearest = players[0];
  $('nearby').textContent = nearest
    ? `${near.length} within 5 km · ${inCb} in CB range · nearest ${nearest.name} ${(nearest.distance / 1000).toFixed(1)} km`
    : 'Nobody nearby';
});
