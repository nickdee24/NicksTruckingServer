// Server-wide chat, separate from Convoy's built-in chat.
const time = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default {
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16v11H9l-5 4z"/></svg>',

  mount(root, ctx) {
    const { hub, config } = ctx;
    root.style.cssText = 'display:flex;flex-direction:column;height:100%';
    root.innerHTML = '<ul class="list" data-log style="flex:1;overflow:auto"></ul><form class="composer"><input placeholder="Say something…" maxlength="300"><button>Send</button></form>';
    const log = root.querySelector('[data-log]');

    const add = m => {
      const mine = m.from === config.playerName;
      const li = document.createElement('li');
      li.style.cssText = `display:flex;flex-direction:column;align-items:${mine ? 'flex-end' : 'flex-start'}`;
      li.innerHTML = '<span class="muted" style="font-size:11px;margin:0 4px 2px"></span><span class="card" style="max-width:75%"></span>';
      li.firstChild.textContent = `${m.from} · ${time(m.ts)}`;
      li.lastChild.textContent = m.text;
      if (mine) li.lastChild.style.background = 'color-mix(in srgb, var(--accent) 25%, var(--panel))';
      log.append(li);
      log.scrollTop = log.scrollHeight;
    };
    ctx.chat.forEach(add);
    const off = hub.on('chat', add);

    root.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const input = root.querySelector('input');
      if (input.value.trim()) hub.send({ type: 'chat', text: input.value.trim() });
      input.value = '';
    };
    return off;
  }
};
