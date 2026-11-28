const XHTML = 'http://www.w3.org/1999/xhtml';
export const PICTURE = { width: 1600, height: 4000, bytes: 512 * 1024, elements: 300, styleChars: 8192, ms: 4000 } as const;
const TAGS = new Set(['div', 'span', 'p', 'ul', 'ol', 'li', 'a', 'b', 'i', 'em', 'strong', 'small', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'section', 'article', 'header', 'footer', 'nav', 'main', 'aside', 'button', 'label', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'time', 'code', 'pre', 'br', 'hr', 'sup', 'sub', 'mark', 'figure', 'figcaption', 'blockquote', 'dl', 'dt', 'dd']);

/** Sizes of the pictures made in this session, so the canvas reserves their box before they paint. */
export const pictureSizes = new Map<string, [number, number]>();

function safeStyle(text: string): boolean {
  if (text.length > PICTURE.styleChars) return false;
  const low = text.toLowerCase();
  if (low.includes('expression') || low.includes('@import') || low.includes('javascript:') || low.includes('\\') || low.includes('<')) return false;
  for (let at = low.indexOf('url('); at !== -1; at = low.indexOf('url(', at + 4)) {
    let from = at + 4;
    while (low[from] === ' ' || low[from] === '"' || low[from] === '\'') from++;
    if (!low.startsWith('data:image/', from)) return false;
  }
  return true;
}

/** A clean copy of the frame's hostile markup: allowed element names and checked style text only. */
function clean(snapshot: string, width: number, height: number): Element | null {
  const source = new DOMParser().parseFromString(`<!doctype html><html><head></head><body>${snapshot}</body></html>`, 'text/html');
  const out = document.implementation.createDocument(XHTML, 'div', null);
  const root = out.documentElement;
  root.setAttribute('style', `width:${width}px;height:${height}px;overflow:hidden;margin:0;font-family:system-ui,sans-serif`);
  let count = 0;
  const walk = (from: Node, to: Element): boolean => {
    for (const child of Array.from(from.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) { to.append(out.createTextNode(child.nodeValue || '')); continue; }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const el = child as Element;
      if (!TAGS.has(el.localName)) continue;
      if (++count > PICTURE.elements) return false;
      const copy = out.createElementNS(XHTML, el.localName);
      const style = el.getAttribute('style');
      if (style && safeStyle(style)) copy.setAttribute('style', style);
      to.append(copy);
      if (!walk(el, copy)) return false;
    }
    return true;
  };
  return walk(source.body, root) && count > 0 ? root : null;
}

/** Draws the frame's serialised copy to a PNG, or answers null: any failure leaves the conversion as it was. */
export async function picture(snapshot: string, width: number, height: number): Promise<Blob | null> {
  try {
    if (!snapshot || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > PICTURE.width || height > PICTURE.height) return null;
    const root = clean(snapshot, width, height);
    if (!root) return null;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="0" y="0" width="${width}" height="${height}">${new XMLSerializer().serializeToString(root)}</foreignObject></svg>`;
    const image = new Image(width, height);
    const loaded = new Promise<boolean>(resolve => {
      const timer = setTimeout(() => resolve(false), PICTURE.ms);
      image.onload = () => { clearTimeout(timer); resolve(true); };
      image.onerror = () => { clearTimeout(timer); resolve(false); };
    });
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    if (!(await loaded)) return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    return blob && blob.size <= PICTURE.bytes ? blob : null;
  } catch {
    return null;
  }
}
