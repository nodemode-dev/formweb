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
  download: '<path d="M12 3v12m-5-5 5 5 5-5M3 17v4h18v-4"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  trash: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  component: '<path d="m12 2 10 10-10 10L2 12 12 2ZM7 12l5-5 5 5-5 5-5-5Z"/>',
  moon: '<path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7l0-7Z"/>'
};
export type Icon = keyof typeof paths;
export function icon(name: Icon): HTMLElement {
  const wrapper = document.createElement('span');
  wrapper.className = 'icon';
  wrapper.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  return wrapper;
}
