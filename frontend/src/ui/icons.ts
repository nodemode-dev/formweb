const paths = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  undo: '<path d="M8 5 3 10l5 5M3 10h10a7 7 0 0 1 7 7"/>',
  redo: '<path d="m16 5 5 5-5 5m5-5H11a7 7 0 0 0-7 7"/>',
  desktop: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  tablet: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M11 18h2"/>',
  mobile: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  layers: '<path d="m12 3 10 6-10 6L2 9l10-6Zm-9 11 9 6 9-6M3 18l9 5 9-5"/>',
  page: '<path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8m-8 4h6"/>',
  box: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
  text: '<path d="M4 5V3h16v2m-8-2v18M8 21h8"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 5-7 4 5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  eye: '<path d="M2 12c5-9 15-9 20 0-5 9-15 9-20 0Z"/><circle cx="12" cy="12" r="3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-5 2 2-16"/>',
  save: '<path d="M4 3h13l4 4v14H3V3h1Zm3 0v6h10V3M7 21v-8h10v8"/>',
  folder: '<path d="M3 6h7l2 3h9v11H3V6Z"/>',
  history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  chevronLeft: '<path d="m15 5-7 7 7 7"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M3 17v4h18v-4"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  trash: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  component: '<path d="m12 2 10 10-10 10L2 12 12 2ZM7 12l5-5 5 5-5 5-5-5Z"/>',
  moon: '<path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7l0-7Z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/>',
  chevronsLeft: '<path d="m11 17-5-5 5-5m7 10-5-5 5-5"/>',
  chevronsRight: '<path d="m13 17 5-5-5-5M6 17l5-5-5-5"/>',
  panelLeft: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  panelRight: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
  wand: '<path d="m4 20 11-11m2-6v3m3 1h-3m3 4-2-2M13 3l2 2"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/>',
  sliders: '<path d="M4 6h10m4 0h2M4 12h4m4 0h8M4 18h12m4 0h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.6 7.6 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.4 1 2-3.4Z"/>'
};
export type Icon = keyof typeof paths;
export function icon(name: Icon): HTMLElement {
  const wrapper = document.createElement('span');
  wrapper.className = 'icon';
  wrapper.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  return wrapper;
}
