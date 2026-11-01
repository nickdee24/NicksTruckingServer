// Server news, edited in hub/data/news.json.
export default {
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/></svg>',

  mount(root) {
    root.innerHTML = '<ul class="list"></ul>';
    fetch('/api/news').then(r => r.json()).then(items => {
      root.firstChild.replaceChildren(...items.map(n => {
        const li = document.createElement('li');
        li.className = 'card';
        li.innerHTML = '<div style="display:flex;gap:8px;align-items:center"><span class="pill accent"></span><span class="muted" style="font-size:12px"></span></div><h3 style="margin:8px 0 4px;font-size:16px"></h3><p style="margin:0;line-height:1.5"></p>';
        li.querySelector('.pill').textContent = n.tag;
        li.querySelector('.muted').textContent = new Date(n.date).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
        li.querySelector('h3').textContent = n.title;
        li.querySelector('p').textContent = n.body;
        return li;
      }));
    });
  }
};
