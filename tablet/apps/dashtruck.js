// DashTruck inside the tablet. Set "dashTruckUrl" in config.json to the address DashTruck shows you.
// DashTruck reads the game itself, so it only has data while ETS2 is running.
export default {
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-5"/><circle cx="12" cy="16" r="1.5"/></svg>',

  mount(root, { config }) {
    const url = config.dashTruckUrl;
    if (!url) {
      root.innerHTML = '<p class="muted">Add "dashTruckUrl" to tablet/config.json to show DashTruck here.</p>';
      return;
    }
    root.style.padding = '0';
    root.innerHTML = `
      <div data-msg class="muted" style="padding:16px">Loading DashTruck… If nothing appears, start ETS2 (DashTruck runs inside the game) or check the address in config.json.</div>
      <iframe style="width:100%;height:100%;border:0;display:block" allow="fullscreen"></iframe>`;
    const frame = root.querySelector('iframe');
    frame.onload = () => root.querySelector('[data-msg]')?.remove();
    frame.src = url;
    return () => { root.style.padding = ''; };
  }
};
