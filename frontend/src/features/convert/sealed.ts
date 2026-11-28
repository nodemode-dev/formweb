import type { Source } from './measure';

/** Bounds on what the sealed frame may hand back; anything past them is dropped, never trusted. */
export const SEALED = { ms: 5000, quiet: 300, rules: 4000, ruleChars: 65536, cssChars: 524288, elements: 5000, attrs: 64, nameChars: 64, valueChars: 4096, built: 1000, snapChars: 1048576, snapElements: 300 } as const;

export interface Sealed { html: string; css: string; built: [number, number][]; snapshot: string; width: number; height: number }

const MARK = 'data-fws-i';
const OWN = 'data-fws-own';
const SKIP_ATTRS = new Set(['src', 'srcset', 'href', 'action', 'formaction', 'poster', 'data', 'xlink:href', 'background', 'srcdoc', MARK, OWN]);
const NAME = /^[a-z][a-z0-9_:-]*$/;
const POLICY = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src 'none'; object-src 'none'; connect-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; manifest-src 'none'; form-action 'none'; base-uri 'none'";

let open: (() => void) | null = null;

/** Removes the sealed frame of a conversion still running, as when the selection or the page changes. */
export function cancelSealed(): void { open?.(); }

/** The page's own elements, in document order, each with its index: the same walk is used to mark and to apply. */
function parse(html: string): { doc: Document; list: Element[] } {
  const doc = new DOMParser().parseFromString(`<!doctype html><html><head></head><body>${html}</body></html>`, 'text/html');
  return { doc, list: Array.from(doc.body.querySelectorAll('*')) };
}

const attrsOf = (el: Element): string => Array.from(el.attributes).filter(attr => !attr.name.toLowerCase().startsWith('on')).map(attr => ` ${attr.name}="${attr.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`).join('');

const inline = (text: string, tag: string): string => text.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`).replace(/<!--/g, '<\\!--');

/** FormWeb's measuring script: it takes its own references first, leaves the document, waits for the page to go quiet
 * and posts one message of plain data. It runs before any page script. */
function measuring(id: string): string {
  return `(function(){"use strict";
var ID=${JSON.stringify(id)},B=${JSON.stringify(SEALED)},W=window,P=W.parent,D=document,ap=Reflect.apply,pm=P.postMessage,st=W.setTimeout,ct=W.clearTimeout,now=Date.now,MO=W.MutationObserver,
qsa=Document.prototype.querySelectorAll,ga=Element.prototype.getAttribute,ha=Element.prototype.hasAttribute,gcs=W.getComputedStyle,
an=Object.getOwnPropertyDescriptor(Element.prototype,'attributes').get,ch=Object.getOwnPropertyDescriptor(Element.prototype,'children').get,
pe=Object.getOwnPropertyDescriptor(Node.prototype,'parentElement').get,sh=Object.getOwnPropertyDescriptor(Document.prototype,'styleSheets').get,
cr=Object.getOwnPropertyDescriptor(CSSStyleSheet.prototype,'cssRules').get,on=Object.getOwnPropertyDescriptor(StyleSheet.prototype,'ownerNode').get,
ct2=Object.getOwnPropertyDescriptor(CSSRule.prototype,'cssText').get,ad=Object.getOwnPropertyDescriptor(Document.prototype,'adoptedStyleSheets'),
tn=Object.getOwnPropertyDescriptor(Element.prototype,'localName').get,oh=Object.getOwnPropertyDescriptor(Element.prototype,'outerHTML').get,
ael=EventTarget.prototype.addEventListener,asl=Array.prototype.slice,acc=Array.prototype.concat,ssl=String.prototype.slice,S=String,N=Number,
nm=Object.getOwnPropertyDescriptor(Attr.prototype,'name').get,vl=Object.getOwnPropertyDescriptor(Attr.prototype,'value').get,start=now(),sent=false,timer=0,me=D.currentScript;
if(me)me.remove();
function post(){if(sent)return;sent=true;var out={id:ID,rules:[],elements:[],built:[],snapshot:"",width:0,height:0},chars=0;
try{var sheets=ap(asl,ap(sh,D,[]),[]);if(ad&&ad.get)sheets=ap(acc,sheets,[ap(asl,ap(ad.get,D,[])||[],[])]);
for(var s=0;s<sheets.length&&out.rules.length<B.rules;s++){var node=null;try{node=ap(on,sheets[s],[]);}catch(e){}if(node&&ap(ha,node,[${JSON.stringify(OWN)}]))continue;
var list;try{list=ap(cr,sheets[s],[]);}catch(e){continue;}for(var r=0;r<list.length&&out.rules.length<B.rules;r++){var text=ap(ct2,list[r],[]);if(text.length>B.ruleChars||chars+text.length>B.cssChars)continue;chars+=text.length;out.rules[out.rules.length]=text;}}
var marked=ap(qsa,D,["[${MARK}]"]);for(var i=0;i<marked.length&&i<B.elements;i++){var el=marked[i],at=ap(an,el,[]),pairs=[];
for(var a=0;a<at.length&&a<B.attrs;a++)pairs[pairs.length]=[ap(ssl,S(ap(nm,at[a],[])),[0,B.nameChars]),ap(ssl,S(ap(vl,at[a],[])),[0,B.valueChars])];
var built=0,kids=ap(ch,el,[]);for(var k=0;k<kids.length;k++)if(!ap(ha,kids[k],["${MARK}"])&&ap(tn,kids[k],[])!=="script")built++;
var index=N(ap(ga,el,["${MARK}"]));out.elements[out.elements.length]=[index,pairs];if(built&&out.built.length<B.built)out.built[out.built.length]=[index,built];}
}catch(e){}
try{ap(pm,P,[out,"*"]);}catch(e){}}
function later(){if(sent)return;ct(timer);var left=B.ms-500-(now()-start);timer=st(post,Math.max(0,Math.min(B.quiet,left)));}
st(post,B.ms-500);
ap(ael,W,["load",function(){later();try{new MO(later).observe(D.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});}catch(e){}}]);
})();`;
}

function frameDocument(source: Source, id: string): { srcdoc: string; doc: Document; list: Element[] } {
  const { doc, list } = parse(source.html);
  list.forEach((el, index) => el.setAttribute(MARK, String(index)));
  doc.body.querySelectorAll('style').forEach(el => el.setAttribute(OWN, ''));
  for (const el of Array.from(doc.body.querySelectorAll('img, source, video, audio, input, link, iframe, frame, object, embed'))) {
    for (const name of ['src', 'srcset', 'href', 'data', 'poster']) el.removeAttribute(name);
  }
  doc.body.querySelectorAll('script').forEach(el => el.remove());
  const script = source.module ? `<script type="module">${inline(source.js, 'script')}</script>` : `<script>${inline(source.js, 'script')}</script>`;
  const srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${POLICY}"><script>${measuring(id)}</script><style ${OWN}>${inline(source.css, 'style')}</style></head><body${attrsOf(doc.body)}>${doc.body.innerHTML}${script}</body></html>`;
  return { srcdoc, ...parse(source.html) };
}

const isPlain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const str = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;
const int = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;

/** The strict reading of the frame's one message: known keys, bounded counts and lengths, plain values only. */
export function check(data: unknown, id: string, count: number): { rules: string[]; elements: [number, [string, string][]][]; built: [number, number][]; snapshot: string; width: number; height: number } | null {
  if (!isPlain(data) || data.id !== id) return null;
  const rules: string[] = [];
  let chars = 0;
  if (Array.isArray(data.rules)) for (const rule of data.rules.slice(0, SEALED.rules)) {
    if (!str(rule, SEALED.ruleChars) || chars + rule.length > SEALED.cssChars) continue;
    chars += rule.length;
    rules.push(rule);
  }
  const elements: [number, [string, string][]][] = [];
  const seen = new Set<number>();
  if (Array.isArray(data.elements)) for (const item of data.elements.slice(0, SEALED.elements)) {
    if (!Array.isArray(item) || item.length !== 2 || !int(item[0], count - 1) || seen.has(item[0]) || !Array.isArray(item[1])) continue;
    seen.add(item[0]);
    const pairs: [string, string][] = [];
    for (const pair of item[1].slice(0, SEALED.attrs)) if (Array.isArray(pair) && pair.length === 2 && str(pair[0], SEALED.nameChars) && str(pair[1], SEALED.valueChars)) pairs.push([pair[0], pair[1]]);
    elements.push([item[0], pairs]);
  }
  const built: [number, number][] = [];
  if (Array.isArray(data.built)) for (const item of data.built.slice(0, SEALED.built)) if (Array.isArray(item) && item.length === 2 && int(item[0], count - 1) && int(item[1], 100000)) built.push([item[0], item[1]]);
  return { rules, elements, built, snapshot: str(data.snapshot, SEALED.snapChars) ? data.snapshot : '', width: int(data.width, 1600) ? data.width : 0, height: int(data.height, 4000) ? data.height : 0 };
}

/**
 * Runs the section's script in a sealed frame (scripts only, opaque origin, no network) and returns the section as it
 * stood after the script ran: its own elements with the classes and attributes they had then, and the stylesheet the
 * document had then. Null when the frame said nothing usable in time; the caller then measures without running.
 */
export function runSealed(source: Source): Promise<Sealed | null> {
  open?.();
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  const { srcdoc, doc, list } = frameDocument(source, id);
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('csp', POLICY);
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.referrerPolicy = 'no-referrer';
  frame.className = 'fw-convert-frame';
  return new Promise(resolve => {
    let timer = 0;
    const close = (result: Sealed | null): void => {
      window.removeEventListener('message', listen);
      clearTimeout(timer);
      frame.remove();
      if (open === stop) open = null;
      resolve(result);
    };
    const stop = (): void => close(null);
    const listen = (event: MessageEvent): void => {
      if (event.source !== frame.contentWindow || !frame.contentWindow) return;
      const found = check(event.data, id, list.length);
      if (!found) return;
      close(after(doc, list, found));
    };
    window.addEventListener('message', listen);
    timer = window.setTimeout(stop, SEALED.ms + 500);
    open = stop;
    frame.srcdoc = srcdoc;
    document.body.append(frame);
  });
}

function after(doc: Document, list: Element[], found: NonNullable<ReturnType<typeof check>>): Sealed {
  for (const [index, pairs] of found.elements) {
    const el = list[index];
    const now = new Map(pairs.map(([name, value]) => [name.toLowerCase(), value]));
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (!SKIP_ATTRS.has(name) && !name.startsWith('on') && !now.has(name)) el.removeAttribute(attr.name);
    }
    for (const [name, value] of now) {
      if (SKIP_ATTRS.has(name) || name.startsWith('on') || name.startsWith('data-fwk') || !NAME.test(name)) continue;
      if (el.getAttribute(name) !== value) el.setAttribute(name, value);
    }
  }
  return { html: (doc.body.attributes.length ? `<body${attrsOf(doc.body)}>` : '') + doc.body.innerHTML, css: found.rules.join('\n'), built: found.built, snapshot: found.snapshot, width: found.width, height: found.height };
}
