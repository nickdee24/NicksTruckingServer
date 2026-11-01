const $ = id => document.getElementById(id);
const api = (path, opts = {}) => fetch(path, {
  ...opts, headers: { 'Content-Type': 'application/json' }, body: opts.body && JSON.stringify(opts.body)
}).then(async r => {
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
});

const row = (title, sub, onDelete) => {
  const li = document.createElement('li');
  li.innerHTML = '<div><span></span><small></small></div><button>Remove</button>';
  li.querySelector('span').textContent = title;
  li.querySelector('small').textContent = sub;
  li.querySelector('button').onclick = onDelete;
  return li;
};

async function loadServers() {
  const servers = await api('/api/servers');
  $('servers').tBodies[0].replaceChildren(...servers.map(s => {
    const tr = document.createElement('tr');
    for (const v of [s.name, s.online ? 'Online' : 'Offline', s.online ? `${s.players ?? 0}/${s.maxPlayers}` : '-', s.searchId ?? '-']) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.append(td);
    }
    tr.children[1].className = s.online ? 'on' : 'off';
    return tr;
  }));
}

async function loadNews() {
  const news = await api('/api/news');
  $('news').replaceChildren(...news.map(n => row(n.title, `${n.tag} · ${n.date}`, async () => {
    await api(`/api/admin/news/${n.id}`, { method: 'DELETE' });
    loadNews();
  })));
}

async function loadIncidents() {
  const { types, items } = await api('/api/incidents');
  if (!$('types').options.length) {
    for (const [id, t] of Object.entries(types)) $('types').add(new Option(t.label, id));
  }
  $('incidents').replaceChildren(...items.map(i => row(
    `${i.label}${i.note ? ` · ${i.note}` : ''}`,
    `${i.source} · at ${i.x}, ${i.z}${i.expiresAt ? ` · clears ${new Date(i.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`,
    async () => { await api(`/api/admin/incidents/${i.id}`, { method: 'DELETE' }); loadIncidents(); }
  )));
}

// Server rules: one card per server with the settings Convoy enforces.
const RULES = [
  ['traffic', 'AI traffic'],
  ['playerDamage', 'Damage from crashing into players'],
  ['serviceNoCollision', 'No collisions at truck stops / fuel stations'],
  ['hideInCompany', 'Hide other players in company depots'],
  ['forceSpeedLimiter', 'Force the truck speed limiter on']
];

async function loadRules() {
  const servers = await api('/api/admin/server-rules');
  $('rules').replaceChildren(...servers.map(s => {
    const card = document.createElement('div');
    card.className = 'rule-card';
    card.innerHTML = '<h3><span></span><small class="muted"></small></h3>';
    card.querySelector('h3 span').textContent = s.id[0].toUpperCase() + s.id.slice(1);
    card.querySelector('h3 small').textContent = s.lobbyName;
    for (const [key, label] of RULES) {
      const l = document.createElement('label');
      l.innerHTML = '<input type="checkbox"><span></span>';
      l.firstChild.checked = !!s[key];
      l.firstChild.dataset.key = key;
      l.lastChild.textContent = label;
      card.append(l);
    }
    const max = document.createElement('label');
    max.className = 'num';
    max.innerHTML = '<span>Max players</span><input type="number" min="1" max="8">';
    max.querySelector('input').value = s.maxPlayers;
    card.append(max);
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.innerHTML = '<button class="secondary">Save</button><button>Apply &amp; restart</button>';
    const status = document.createElement('div');
    status.className = 'status';
    card.append(actions, status);

    const save = () => {
      const body = { maxPlayers: max.querySelector('input').value };
      card.querySelectorAll('[data-key]').forEach(cb => { body[cb.dataset.key] = cb.checked; });
      return api(`/api/admin/server-rules/${s.id}`, { method: 'PATCH', body });
    };
    actions.children[0].onclick = async () => { await save(); status.textContent = 'Saved. Restart the server to apply.'; };
    actions.children[1].onclick = async () => {
      if (!confirm(`Restart the ${s.id} server? Anyone on it will be disconnected.`)) return;
      status.textContent = 'Restarting…';
      try {
        await save();
        await api(`/api/admin/server-rules/${s.id}/restart`, { method: 'POST' });
        status.textContent = 'Restarted with the new rules.';
        loadServers();
      } catch (err) { status.textContent = err.message; }
    };
    return card;
  }));
}

async function loadAreaRules() {
  const { rules, speeding } = await api('/api/admin/zone-rules');
  const f = $('area-form');
  f.service.value = rules.service?.speedLimit ?? '';
  f.depot.value = rules.depot?.speedLimit ?? '';
  $('speeding').replaceChildren(...(speeding.length ? speeding.map(s => {
    const li = document.createElement('li');
    li.innerHTML = '<div><span></span><small></small></div>';
    li.querySelector('span').textContent = `${s.driver}: ${s.speedKmh} km/h in a ${s.limit} km/h area`;
    li.querySelector('small').textContent = `${s.zone ?? ''} · ${new Date(s.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    return li;
  }) : [Object.assign(document.createElement('li'), { className: 'empty', textContent: 'No speeding reported.' })]));
}

$('area-form').onsubmit = async e => {
  e.preventDefault();
  const f = e.target;
  await api('/api/admin/zone-rules', { method: 'PUT', body: { service: { speedLimit: f.service.value }, depot: { speedLimit: f.depot.value } } });
  loadAreaRules();
};

async function loadZones() {
  const { kinds, items } = await api('/api/zones');
  if (!$('zone-kinds').options.length) {
    for (const [id, k] of Object.entries(kinds)) $('zone-kinds').add(new Option(k.label, id));
  }
  $('zones').replaceChildren(...items.map(zn => {
    const li = row(
      `${kinds[zn.kind]?.label ?? zn.kind}${zn.name ? ` · ${zn.name}` : ''}`,
      `${zn.source} · ${zn.radius} m · at ${zn.x}, ${zn.z}`,
      async () => { await api(`/api/admin/zones/${zn.id}`, { method: 'DELETE' }); loadZones(); }
    );
    const input = document.createElement('input');
    input.placeholder = 'Default notice';
    input.value = zn.message ?? '';
    input.onchange = () => api(`/api/admin/zones/${zn.id}`, { method: 'PATCH', body: { message: input.value } });
    li.insertBefore(input, li.querySelector('button'));
    const speed = document.createElement('input');
    speed.type = 'number';
    speed.className = 'speed';
    speed.placeholder = 'km/h';
    speed.title = 'Speed limit in this zone';
    speed.value = zn.speedLimit ?? '';
    speed.onchange = () => api(`/api/admin/zones/${zn.id}`, { method: 'PATCH', body: { speedLimit: speed.value } });
    li.insertBefore(speed, li.querySelector('button'));
    return li;
  }));
}

$('zone-form').onsubmit = async e => {
  e.preventDefault();
  const f = e.target;
  const [x, z] = f.at.value.split(',');
  if (!x) return alert('Pick a driver to place the zone at.');
  try {
    await api('/api/admin/zones', { method: 'POST', body: { kind: f.kind.value, x, z, name: f.name.value, radius: f.radius.value || undefined, message: f.message.value, speedLimit: f.speedLimit.value } });
    f.name.value = f.message.value = '';
    loadZones();
  } catch (err) { alert(err.message); }
};

// "At a position" can be filled from any driver's current spot.
function watchDrivers() {
  const ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', name: 'admin', role: 'map' }));
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'incidents') loadIncidents();
    if (msg.type !== 'world') return;
    const sel = $('at');
    const current = sel.value;
    sel.replaceChildren(new Option('At a position…', ''), ...msg.drivers.map(d => {
      const o = new Option(`At ${d.name}`, `${d.x},${d.z}`);
      o.dataset.name = d.name;
      return o;
    }));
    const keep = [...sel.options].find(o => o.dataset.name && current && o.textContent === current);
    if (keep) sel.value = keep.value;
    sel.dataset.selectedName = sel.selectedOptions[0]?.textContent ?? '';
    const zoneAt = $('zone-at');
    const zoneCurrent = zoneAt.selectedOptions[0]?.textContent;
    zoneAt.replaceChildren(new Option('At a driver…', ''), ...msg.drivers.map(d => new Option(`At ${d.name}`, `${d.x},${d.z}`)));
    const again = [...zoneAt.options].find(o => o.textContent === zoneCurrent);
    if (again) zoneAt.value = again.value;
  };
  ws.onclose = () => setTimeout(watchDrivers, 2000);
}

$('at').onchange = () => {
  const [x, z] = $('at').value.split(',');
  $('incident-form').x.value = x ?? '';
  $('incident-form').z.value = z ?? '';
};

$('news-form').onsubmit = async e => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('/api/admin/news', { method: 'POST', body: { title: f.title.value, tag: f.tag.value, body: f.body.value } });
    if (f.announce.checked) {
      await api('/api/admin/announce', { method: 'POST', body: { title: f.tag.value, text: f.title.value, seconds: 10, style: f.tag.value === 'Event' ? 'event' : 'info' } });
    }
    f.reset();
    loadNews();
  } catch (err) { alert(err.message); }
};

$('announce-form').onsubmit = async e => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('/api/admin/announce', { method: 'POST', body: { title: f.title.value, text: f.text.value, seconds: f.seconds.value, style: f.style.value } });
    f.text.value = '';
  } catch (err) { alert(err.message); }
};

$('incident-form').onsubmit = async e => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('/api/admin/incidents', { method: 'POST', body: { type: f.type.value, x: f.x.value, z: f.z.value, minutes: f.minutes.value, note: f.note.value } });
    f.note.value = '';
    loadIncidents();
  } catch (err) { alert(err.message); }
};

loadServers();
loadNews();
loadIncidents();
loadZones();
loadRules();
loadAreaRules();
watchDrivers();
setInterval(loadAreaRules, 15000);
setInterval(loadServers, 10000);
