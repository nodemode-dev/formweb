import { onLanguage } from '../i18n';

function px(value: string): number { return parseFloat(value) || 0; }

function natural(box: HTMLElement): number {
  const gap = px(getComputedStyle(box).columnGap);
  let total = 0;
  let count = 0;
  for (const child of Array.from(box.children) as HTMLElement[]) {
    const style = getComputedStyle(child);
    if (style.display === 'none' || style.position === 'absolute') continue;
    total += child.getBoundingClientRect().width;
    count += 1;
  }
  return total + gap * Math.max(0, count - 1);
}

function menuNatural(menubar: HTMLElement, two: boolean): number {
  if (document.documentElement.classList.contains('has-native-menus')) return 0;
  const buttons = Array.from(menubar.children) as HTMLElement[];
  const gap = px(getComputedStyle(menubar).columnGap);
  let total = 0;
  for (const button of buttons) total += button.getBoundingClientRect().width + (two ? 4 : 0);
  return total + gap * Math.max(0, buttons.length - 1);
}

function textWidth(context: CanvasRenderingContext2D, node: HTMLElement, text: string): number {
  const style = getComputedStyle(node);
  context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  return context.measureText(text).width;
}

export function watchFit(app: HTMLElement, topbar: HTMLElement, inspector: HTMLElement): void {
  const brand = topbar.querySelector<HTMLElement>('.brand');
  const menubar = topbar.querySelector<HTMLElement>('.fw-menubar');
  const tools = topbar.querySelector<HTMLElement>('.fw-title-tools');
  const actions = topbar.querySelector<HTMLElement>('.top-actions');
  const tabs = inspector.querySelector<HTMLElement>('.inspector-tabs');
  const context = document.createElement('canvas').getContext('2d');
  const fitTop = (): void => {
    if (!brand || !menubar || !tools || !actions || !topbar.clientWidth) return;
    const style = getComputedStyle(topbar);
    const room = topbar.clientWidth - px(style.paddingLeft) - px(style.paddingRight);
    const two = app.classList.contains('fw-top2');
    const need = brand.getBoundingClientRect().width + menuNatural(menubar, two) + natural(tools) + natural(actions) + px(style.columnGap) * 4;
    const fits = need <= room;
    if (app.classList.contains('fw-top2') === fits) app.classList.toggle('fw-top2', !fits);
  };
  const fitInspector = (): void => {
    if (!tabs || !context || !inspector.clientWidth || !tabs.clientWidth) return;
    const tabStyle = getComputedStyle(tabs);
    const room = tabs.clientWidth - px(tabStyle.paddingLeft) - px(tabStyle.paddingRight) - px(tabStyle.columnGap) * 3;
    let tabNeed = 0;
    for (const node of Array.from(tabs.children) as HTMLElement[]) {
      const style = getComputedStyle(node);
      const range = document.createRange();
      range.selectNodeContents(node);
      tabNeed += range.getBoundingClientRect().width + px(style.paddingLeft) + px(style.paddingRight) + 2;
    }
    const wantTabs = tabNeed > room + 0.5;
    if (inspector.classList.contains('fw-tabs2') !== wantTabs) inspector.classList.toggle('fw-tabs2', wantTabs);
    const reset = inspector.querySelector<HTMLElement>('.fw-reset');
    const section = inspector.querySelector<HTMLElement>('.inspector-section');
    const grid = inspector.querySelector<HTMLElement>('.form-grid');
    if (!reset || !section || !grid) return;
    const resetStyle = getComputedStyle(reset);
    const resetNeed = textWidth(context, reset, reset.textContent || '') + px(resetStyle.paddingLeft) + px(resetStyle.paddingRight) + 2;
    const gap = px(getComputedStyle(grid).columnGap);
    const sectionStyle = getComputedStyle(section);
    const column = (inspector.clientWidth - 1 - 16 - px(sectionStyle.paddingLeft) - px(sectionStyle.paddingRight) - gap) / 2;
    let word = 0;
    for (const label of Array.from(inspector.querySelectorAll<HTMLElement>('.form-grid > .field:not(.full) .field-label'))) {
      for (const node of Array.from(label.childNodes)) {
        if (node.nodeType !== 3) continue;
        for (const piece of (node.textContent || '').split(/\s+/)) if (piece) word = Math.max(word, textWidth(context, label, piece));
      }
    }
    const wantOne = word + gap + resetNeed > column;
    if (inspector.classList.contains('fw-fields1') !== wantOne) inspector.classList.toggle('fw-fields1', wantOne);
  };
  const fit = (): void => { fitTop(); fitInspector(); };
  fit();
  const observer = new ResizeObserver(fit);
  observer.observe(topbar);
  observer.observe(inspector);
  if (tabs) observer.observe(tabs);
  for (const node of [brand, tools, actions, ...Array.from(menubar?.children || [])]) if (node) observer.observe(node);
  onLanguage(fit);
  void document.fonts?.ready.then(fit);
  document.fonts?.addEventListener('loadingdone', fit);
}
