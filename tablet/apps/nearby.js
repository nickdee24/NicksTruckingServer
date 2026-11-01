// Nearby drivers: a north-up radar plus a list, nearest first.
const RANGE_M = 5000;

const fmtDist = m => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);
const compass = rad => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].at(Math.round(((rad * 180 / Math.PI) + 360) % 360 / 45) % 8);

export default {
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>',

  mount(root, { hub }) {
    root.innerHTML = `
      <div style="display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:16px;align-items:start">
        <div class="card" style="aspect-ratio:1;padding:8px">
          <svg viewBox="-110 -110 220 220" style="width:100%;height:100%">
            <circle r="100" fill="none" stroke="var(--panel-raised)"/>
            <circle r="50" fill="none" stroke="var(--panel-raised)" stroke-dasharray="3 4"/>
            <circle data-cb r="50" fill="var(--good)" fill-opacity=".06" stroke="var(--good)" stroke-opacity=".5"/>
            <text x="0" y="-102" text-anchor="middle" font-size="9" fill="var(--text-muted)">N</text>
            <g data-blips></g>
            <path d="M0 -7 L5 6 L0 3 L-5 6 Z" fill="var(--accent)" data-me/>
          </svg>
        </div>
        <div>
          <p class="muted" data-summary style="margin:0 0 10px"></p>
          <ul class="list" data-list></ul>
        </div>
      </div>`;
    const blips = root.querySelector('[data-blips]');
    const list = root.querySelector('[data-list]');
    const summary = root.querySelector('[data-summary]');
    const cbRing = root.querySelector('[data-cb]');
    const meArrow = root.querySelector('[data-me]');

    let cbRange = 2500;
    fetch('/api/server').then(r => r.json()).then(s => { cbRange = s.cbRangeMeters; });

    const off = hub.on('players', ({ me, players }) => {
      if (!me) { summary.textContent = 'Waiting for your position…'; return; }
      cbRing.setAttribute('r', (cbRange / RANGE_M) * 100);
      meArrow.setAttribute('transform', `rotate(${me.heading * 180 / Math.PI})`);

      const near = players.filter(p => p.distance !== null && p.distance <= RANGE_M);
      summary.textContent = `${near.length} driver${near.length === 1 ? '' : 's'} within ${RANGE_M / 1000} km · ${players.length} online`;

      blips.replaceChildren(...near.map(p => {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const x = ((p.x - me.x) / RANGE_M) * 100, y = ((p.z - me.z) / RANGE_M) * 100;
        g.innerHTML = `<circle cx="${x}" cy="${y}" r="4" fill="${p.inCbRange ? 'var(--good)' : 'var(--text-muted)'}"/>`;
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        Object.entries({ x: x + 6, y: y + 3, 'font-size': 8, fill: 'var(--text)' }).forEach(([k, v]) => label.setAttribute(k, v));
        label.textContent = p.name;
        g.append(label);
        return g;
      }));

      list.replaceChildren(...players.slice(0, 12).map(p => {
        const li = document.createElement('li');
        li.className = 'card';
        li.style.cssText = 'display:flex;align-items:center;gap:12px';
        li.innerHTML = `
          <span style="font-size:18px;display:inline-block;transform:rotate(${p.bearing}rad)">↑</span>
          <div style="flex:1;min-width:0">
            <div><strong></strong> <span class="pill"></span></div>
            <div class="muted" style="font-size:12px"></div>
          </div>
          <div style="text-align:right">
            <div></div>
            ${p.inCbRange ? '<span class="pill good">CB range</span>' : ''}
          </div>`;
        li.querySelector('strong').textContent = p.name;
        li.querySelector('.pill').textContent = p.isBot ? 'sim' : 'player';
        li.querySelector('.muted').textContent = `${p.truck ?? 'Truck'} · ${p.cargo ?? 'No cargo'} · ${p.speedKmh ?? 0} km/h`;
        li.lastElementChild.firstElementChild.textContent = `${fmtDist(p.distance)} ${compass(p.bearing)}`;
        return li;
      }));
    });
    return off;
  }
};
