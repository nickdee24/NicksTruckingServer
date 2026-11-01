// CB radio: only drivers within range on the same channel hear you.
const time = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default {
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M8 8 15 3"/><circle cx="9" cy="14" r="2"/><path d="M14 13h3M14 16h3"/></svg>',

  mount(root, ctx) {
    const { hub } = ctx;
    root.style.cssText = 'display:flex;flex-direction:column;height:100%';
    root.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <label class="muted" for="cb-ch">Channel</label>
        <select id="cb-ch" class="pill accent" style="font:inherit;font-size:14px;padding:6px 10px;border:0"></select>
        <span class="muted" data-inrange style="font-size:13px"></span>
      </div>
      <ul class="list" data-log style="flex:1;overflow:auto"></ul>
      <form class="composer"><input placeholder="Key the mic…" maxlength="200"><button>Transmit</button></form>`;
    const select = root.querySelector('select');
    const log = root.querySelector('[data-log]');
    const inRange = root.querySelector('[data-inrange]');

    for (let ch = 1; ch <= 40; ch++) select.add(new Option(`CH ${ch}`, ch));
    select.value = hub.latest('players')?.cbChannel ?? 19;
    select.onchange = () => hub.send({ type: 'cb-channel', channel: Number(select.value) });

    const add = m => {
      const li = document.createElement('li');
      li.className = 'card';
      li.innerHTML = '<div style="display:flex;gap:8px;align-items:baseline"><strong></strong><span class="muted" style="font-size:12px"></span></div><div></div>';
      li.querySelector('strong').textContent = m.from;
      li.querySelector('.muted').textContent = `CH ${m.channel} · ${m.distance ? `${(m.distance / 1000).toFixed(1)} km away` : 'you'} · ${time(m.ts)}`;
      li.lastChild.textContent = m.text;
      log.append(li);
      log.scrollTop = log.scrollHeight;
    };
    ctx.cb.forEach(add);

    const offCb = hub.on('cb', add);
    const offPlayers = hub.on('players', ({ players }) => {
      const n = players.filter(p => p.inCbRange).length;
      inRange.textContent = `${n} driver${n === 1 ? '' : 's'} in range`;
    });

    root.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const input = root.querySelector('input');
      if (input.value.trim()) hub.send({ type: 'cb', text: input.value.trim() });
      input.value = '';
    };
    return () => { offCb(); offPlayers(); };
  }
};
