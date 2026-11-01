// The live map inside the tablet.
export default {
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',

  mount(root, { config }) {
    root.style.padding = '0';
    const frame = document.createElement('iframe');
    frame.src = `/map/?name=${encodeURIComponent(config.playerName)}`;
    frame.style.cssText = 'width:100%;height:100%;border:0;display:block';
    root.append(frame);
    return () => { root.style.padding = ''; };
  }
};
