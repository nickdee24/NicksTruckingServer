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
watchDrivers();
setInterval(loadServers, 10000);
