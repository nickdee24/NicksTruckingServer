// Traffic: reports near you, and a quick way to report what you see.
const REPORTS = [
  ['accident', 'Accident'], ['jam', 'Jam'], ['roadworks', 'Roadworks'], ['police', 'Police'], ['weather', 'Weather'], ['closure', 'Road closed']
];
const fmtDist = m => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
const compass = rad => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].at(Math.round(((rad * 180 / Math.PI) + 360) % 360 / 45) % 8);

export default {
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 22 20H2z"/><path d="M12 10v4M12 17v.5"/></svg>',

  mount(root, { hub }) {
    root.innerHTML = `
      <p class="muted" style="margin:0 0 8px">Report what you see at your position</p>
      <div data-buttons style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px"></div>
      <ul class="list" data-list></ul>`;
    const list = root.querySelector('[data-list]');

    root.querySelector('[data-buttons]').append(...REPORTS.map(([type, label]) => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.style.cssText = 'padding:8px 12px;background:var(--panel-raised);color:var(--text)';
      b.textContent = label;
      b.onclick = () => {
        hub.send({ type: 'report', incidentType: type });
        b.textContent = 'Sent ✓';
        setTimeout(() => { b.textContent = label; }, 1500);
      };
      return b;
    }));

    let incidents = [];
    let me = null;
    const render = () => {
      const rows = incidents
        .map(i => ({ ...i, dist: me ? Math.hypot(i.x - me.x, i.z - me.z) : null, bearing: me ? Math.atan2(i.x - me.x, -(i.z - me.z)) : 0 }))
        .sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0));
      if (!rows.length) { list.innerHTML = '<li class="muted">No reports. Clear roads!</li>'; return; }
      list.replaceChildren(...rows.map(i => {
        const li = document.createElement('li');
        li.className = 'card';
        li.style.cssText = 'display:flex;justify-content:space-between;gap:12px';
        li.innerHTML = '<div><strong></strong><div class="muted" style="font-size:12px"></div></div><div style="text-align:right;white-space:nowrap"></div>';
        li.querySelector('strong').textContent = i.label + (i.reports > 1 ? ` ×${i.reports}` : '');
        li.querySelector('.muted').textContent = i.note || (i.reporter ? `Reported by ${i.reporter}` : '');
        li.lastChild.textContent = i.dist === null ? '' : `${fmtDist(i.dist)} ${compass(i.bearing)}`;
        return li;
      }));
    };

    const offIncidents = hub.on('incidents', msg => { incidents = msg.items; render(); });
    const offPlayers = hub.on('players', msg => { me = msg.me; render(); });
    return () => { offIncidents(); offPlayers(); };
  }
};
