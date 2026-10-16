const paths = {
  select: '<path d="m5 3 13 7-6 2-2 6L5 3Z"/>',
  direct: '<path d="m6 4 11 6-5 2-2 5L6 4Z" fill="currentColor"/><rect x="15" y="15" width="5" height="5" rx="0.5"/>',
  pen: '<path d="m12 19 7-7-3-9-9 3 2 9 3 4Zm0 0-2-2m1-3 3-3"/><circle cx="12" cy="12" r="1.5"/>',
  curvature: '<path d="M4 18c4-12 8 4 16-10"/><circle cx="4" cy="18" r="1.5"/><circle cx="20" cy="8" r="1.5"/>',
  add: '<path d="M6 17c3-9 9-9 12 0"/><path d="M18 3v6m-3-3h6"/>',
  remove: '<path d="M6 17c3-9 9-9 12 0"/><path d="M15 6h6"/>',
  convert: '<path d="M5 18 12 6l7 12"/><path d="m8.5 12 3.5 3 3.5-3"/>',
  rect: '<rect x="4" y="5" width="16" height="14" rx="1"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="8" ry="6.5"/>',
  polygon: '<path d="m12 3 8 6-3 10H7L4 9l8-6Z"/>',
  star: '<path d="m12 3 2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.2 6.4 20.3l1.2-6.3L3 9.6l6.3-.8L12 3Z"/>',
  line: '<path d="M5 19 19 5"/>',
  arc: '<path d="M5 19C5 11 11 5 19 5"/>',
  spiral: '<path d="M12 12a2 2 0 1 1 2 2 4 4 0 1 1-4-4 6 6 0 1 1 6 6"/>',
  scissors: '<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="m8 8.5 12 8M8 15.5l12-8"/>',
  round: '<path d="M5 19V9a4 4 0 0 1 4-4h10"/>',
  inverted: '<path d="M5 19v-6a4 4 0 0 0 4-4V5h10"/>',
  chamfer: '<path d="M5 19V9l4-4h10"/>',
  unite: '<path d="M4 4h10v6h6v10H10v-6H4V4Z"/>',
  minusFront: '<path d="M4 4h10v6h-4v4H4V4Z"/><path d="M10 14h10v6H10v-6Z" stroke-dasharray="2 2"/><path d="M14 10h6v4h-6" stroke-dasharray="2 2"/>',
  intersect: '<path d="M4 4h10v6h6v10H10v-6H4V4Z" stroke-dasharray="2 2"/><path d="M10 10h4v4h-4z" fill="currentColor"/>',
  exclude: '<path d="M4 4h10v6h6v10H10v-6H4V4Z"/><path d="M10 10h4v4h-4z" stroke-dasharray="2 2"/>',
  divide: '<path d="M4 4h10v6h6v10H10v-6H4V4Z"/><path d="M10 10v4h4v-4h-4Z"/>',
  trim: '<path d="M4 4h10v6H10v4H4V4Z"/><path d="M10 14h10V10h-6"/>',
  merge: '<path d="M4 4h10v6h6v10H10v-6H4V4Z"/><path d="M10 10h4v4h-4z" opacity="0.5"/>',
  crop: '<path d="M4 4h10v10H4z" stroke-dasharray="2 2"/><path d="M10 10h10v10H10z"/>',
  minusBack: '<path d="M10 10h10v10H10z"/><path d="M4 4h10v6M4 4v10h6" stroke-dasharray="2 2"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M3 17v4h18v-4"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/>',
  join: '<path d="M4 12h6m4 0h6"/><circle cx="12" cy="12" r="1.5"/>',
  average: '<path d="M5 6h14M5 18h14M12 6v12"/>',
  simplify: '<path d="M3 15c3-10 5 6 8-3s6 3 10-6"/>',
  offset: '<path d="M6 17V8a3 3 0 0 1 3-3h9"/><path d="M3 20V8a6 6 0 0 1 6-6h12" opacity="0.6"/>',
  outline: '<path d="M4 8c4-6 12 6 16 0M4 16c4-6 12 6 16 0"/>',
  bake: '<path d="M5 19V9a4 4 0 0 1 4-4h10"/><path d="M14 14h6m-3-3v6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>'
};

export type VectorIcon = keyof typeof paths;

export function vectorIcon(name: VectorIcon): HTMLElement {
  const wrapper = document.createElement('span');
  wrapper.className = 'icon';
  wrapper.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  return wrapper;
}
