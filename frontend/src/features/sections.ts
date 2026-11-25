import type { SiteNode } from '../types';

/**
 * Prebuilt sections and starter pages (FW-186). Each section is a small tree of ordinary engine nodes, so once inserted
 * it is edited like anything else on the canvas: no special block type, no lock. Colors inherit from the page and the
 * borders use a translucent neutral, so a section sits on a light or a dark site. Grids collapse to one column on the
 * mobile breakpoint. `sectionCommands` flattens a tree into node.add commands (parent before children) with fresh ids,
 * so the caller can send a whole insert, or a new page plus its sections, as one batch and one undo step.
 */
type Spec = { tag: string; name: string; text?: string; styles?: Record<string, string>; attrs?: Record<string, string>; mobile?: Record<string, string>; children?: Spec[] };
export type Command = { command: string; params: Record<string, unknown> };

export const LINE = '1px solid rgba(127, 127, 127, 0.28)';
const WRAP = { width: '100%', 'max-width': '1120px', margin: '0 auto', 'box-sizing': 'border-box' };
const BAND = { display: 'flex', 'flex-direction': 'column', gap: '32px', padding: '96px 24px', ...WRAP };
export const MUTED = { opacity: '0.72' };
const BUTTON = { display: 'inline-flex', 'align-items': 'center', padding: '14px 24px', background: 'var(--accent, #f97316)', color: '#111', 'border-radius': '8px', 'text-decoration': 'none', 'font-weight': '600' };
const GHOST = { ...BUTTON, background: 'transparent', color: 'inherit', border: LINE };
const CARD = { display: 'flex', 'flex-direction': 'column', gap: '12px', padding: '32px', border: LINE, 'border-radius': '12px' };
const H2 = { 'font-size': '40px', 'line-height': '1.1', 'letter-spacing': '-1px', margin: '0' };
const H3 = { 'font-size': '20px', 'line-height': '1.3', margin: '0' };
const P = { 'font-size': '17px', 'line-height': '1.6', margin: '0', ...MUTED };
const grid = (columns: number): Record<string, string> => ({ display: 'grid', 'grid-template-columns': `repeat(${columns}, minmax(0, 1fr))`, gap: '24px' });
const ONE = { 'grid-template-columns': '1fr' };

const heading = (content: string, styles: Record<string, string> = H2): Spec => ({ tag: 'h2', name: 'Heading', text: content, styles });
const para = (content: string): Spec => ({ tag: 'p', name: 'Paragraph', text: content, styles: P });
const link = (content: string, styles = BUTTON): Spec => ({ tag: 'a', name: 'Button', text: content, styles, attrs: { href: '#' } });
const card = (name: string, title: string, body: string): Spec => ({ tag: 'article', name, styles: CARD, children: [heading(title, H3), para(body)] });
const tier = (name: string, price: string, items: string[], featured = false): Spec => ({
  tag: 'article', name: `${name} plan`, styles: featured ? { ...CARD, border: '2px solid var(--accent, #f97316)' } : CARD,
  children: [heading(name, H3), { tag: 'p', name: 'Price', text: price, styles: { 'font-size': '36px', 'font-weight': '700', margin: '0' } },
    { tag: 'ul', name: 'Included', styles: { margin: '0', padding: '0 0 0 20px', display: 'flex', 'flex-direction': 'column', gap: '8px', ...MUTED }, children: items.map(item => ({ tag: 'li', name: 'Item', text: item })) },
    link('Choose ' + name, featured ? BUTTON : GHOST)]
});
const question = (q: string, a: string): Spec => ({ tag: 'details', name: 'Question', styles: { padding: '20px 0', 'border-bottom': LINE }, children: [{ tag: 'summary', name: 'Summary', text: q, styles: { 'font-size': '18px', 'font-weight': '600', cursor: 'pointer' } }, { tag: 'p', name: 'Answer', text: a, styles: { ...P, 'margin-top': '12px' } }] });

export const SECTIONS: { id: string; label: string; spec: Spec }[] = [
  { id: 'nav', label: 'Navigation bar', spec: { tag: 'header', name: 'Navigation bar', styles: { display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', gap: '24px', padding: '20px 24px', 'border-bottom': LINE, ...WRAP }, mobile: { 'flex-direction': 'column', 'align-items': 'flex-start' }, children: [
    { tag: 'a', name: 'Brand', text: 'Studio name', styles: { 'font-size': '20px', 'font-weight': '700', color: 'inherit', 'text-decoration': 'none' }, attrs: { href: '/' } },
    { tag: 'nav', name: 'Links', styles: { display: 'flex', gap: '24px', 'align-items': 'center', 'flex-wrap': 'wrap' }, children: [
      { tag: 'a', name: 'Link', text: 'Work', styles: { color: 'inherit', 'text-decoration': 'none' }, attrs: { href: '#' } },
      { tag: 'a', name: 'Link', text: 'About', styles: { color: 'inherit', 'text-decoration': 'none' }, attrs: { href: '#' } },
      link('Contact')]}]} },
  { id: 'hero', label: 'Hero', spec: { tag: 'section', name: 'Hero', styles: { ...BAND, 'align-items': 'flex-start', padding: '128px 24px' }, mobile: { padding: '64px 0' }, children: [
    { tag: 'p', name: 'Eyebrow', text: 'New this season', styles: { 'font-size': '13px', 'letter-spacing': '2px', 'text-transform': 'uppercase', margin: '0', ...MUTED } },
    { tag: 'h1', name: 'Headline', text: 'A clear promise in one line.', styles: { 'font-size': '64px', 'line-height': '1.05', 'letter-spacing': '-2px', margin: '0', 'max-width': '820px' }, mobile: { 'font-size': '40px', 'letter-spacing': '-1px' } },
    { ...para('One or two sentences that say who this is for and what changes for them.'), styles: { ...P, 'font-size': '20px', 'max-width': '640px' } },
    { tag: 'div', name: 'Actions', styles: { display: 'flex', gap: '12px', 'flex-wrap': 'wrap' }, children: [link('Get started'), link('Learn more', GHOST)] }]}, },
  { id: 'features', label: 'Feature grid', spec: { tag: 'section', name: 'Feature grid', styles: BAND, children: [
    heading('What you get'),
    { tag: 'div', name: 'Grid', styles: grid(3), mobile: ONE, children: [
      card('Feature', 'Fast to start', 'Describe the first benefit in a sentence or two.'),
      card('Feature', 'Easy to change', 'Describe the second benefit in a sentence or two.'),
      card('Feature', 'Built to last', 'Describe the third benefit in a sentence or two.')]}]} },
  { id: 'testimonial', label: 'Testimonial', spec: { tag: 'section', name: 'Testimonial', styles: { ...BAND, 'align-items': 'center', 'text-align': 'center' }, children: [
    { tag: 'blockquote', name: 'Quote', text: '"Replace this with a real quote from someone you worked with, in their own words."', styles: { 'font-size': '28px', 'line-height': '1.4', margin: '0', 'max-width': '760px' } },
    { tag: 'p', name: 'Attribution', text: 'Name Surname, Role at Company', styles: P }]} },
  { id: 'pricing', label: 'Pricing', spec: { tag: 'section', name: 'Pricing', styles: BAND, children: [
    heading('Simple pricing'),
    { tag: 'div', name: 'Plans', styles: grid(3), mobile: ONE, children: [
      tier('Starter', '$0', ['One project', 'Community help']),
      tier('Pro', '$19', ['Unlimited projects', 'Custom domain', 'Email help'], true),
      tier('Team', '$49', ['Everything in Pro', 'Shared workspace', 'Priority help'])]}]} },
  { id: 'faq', label: 'FAQ', spec: { tag: 'section', name: 'FAQ', styles: { ...BAND, 'max-width': '800px', gap: '8px' }, children: [
    { ...heading('Questions'), styles: { ...H2, 'margin-bottom': '24px' } },
    question('How do I get started?', 'Answer the question plainly in one or two sentences.'),
    question('Can I change plans later?', 'Answer the question plainly in one or two sentences.'),
    question('Do you offer refunds?', 'Answer the question plainly in one or two sentences.')]} },
  { id: 'cta', label: 'Call to action', spec: { tag: 'section', name: 'Call to action', styles: { ...BAND, 'align-items': 'center', 'text-align': 'center', border: LINE, 'border-radius': '16px', margin: '48px auto' }, children: [
    heading('Ready when you are'), para('Say what happens next and why it is worth doing now.'), link('Start now')]} },
  { id: 'contact', label: 'Contact form', spec: { tag: 'section', name: 'Contact', styles: { ...BAND, 'max-width': '640px' }, children: [
    heading('Get in touch'), para('Tell us a little about what you need and we will reply soon.'),
    { tag: 'form', name: 'Contact form', styles: { display: 'flex', 'flex-direction': 'column', gap: '12px' }, attrs: { name: 'contact' }, children: [
      { tag: 'label', name: 'Name label', text: 'Name', styles: { 'font-size': '14px' } },
      { tag: 'input', name: 'Name input', styles: { padding: '12px', border: LINE, 'border-radius': '8px', background: 'transparent', color: 'inherit' }, attrs: { name: 'name', type: 'text', required: 'true', 'aria-label': 'Name' } },
      { tag: 'label', name: 'Email label', text: 'Email', styles: { 'font-size': '14px' } },
      { tag: 'input', name: 'Email input', styles: { padding: '12px', border: LINE, 'border-radius': '8px', background: 'transparent', color: 'inherit' }, attrs: { name: 'email', type: 'email', required: 'true', 'aria-label': 'Email' } },
      { tag: 'label', name: 'Message label', text: 'Message', styles: { 'font-size': '14px' } },
      { tag: 'textarea', name: 'Message input', styles: { padding: '12px', border: LINE, 'border-radius': '8px', background: 'transparent', color: 'inherit', 'min-height': '120px' }, attrs: { name: 'message', 'aria-label': 'Message' } },
      { tag: 'button', name: 'Submit', text: 'Send message', styles: { ...BUTTON, border: '0', cursor: 'pointer', 'align-self': 'flex-start' }, attrs: { type: 'submit' } }]}]} },
  { id: 'footer', label: 'Footer', spec: { tag: 'footer', name: 'Footer', styles: { display: 'flex', 'justify-content': 'space-between', gap: '24px', 'flex-wrap': 'wrap', padding: '40px 24px', 'border-top': LINE, ...WRAP, ...MUTED }, mobile: { 'flex-direction': 'column' }, children: [
    { tag: 'p', name: 'Copyright', text: 'Studio name, all rights reserved.', styles: { margin: '0' } },
    { tag: 'nav', name: 'Footer links', styles: { display: 'flex', gap: '20px' }, children: [
      { tag: 'a', name: 'Link', text: 'Privacy', styles: { color: 'inherit' }, attrs: { href: '#' } },
      { tag: 'a', name: 'Link', text: 'Contact', styles: { color: 'inherit' }, attrs: { href: '#' } }]}]} }
];

export const STARTERS: { id: string; label: string; slug: string; sections: string[] }[] = [
  { id: 'landing', label: 'Landing page', slug: '/landing', sections: ['nav', 'hero', 'features', 'testimonial', 'cta', 'footer'] },
  { id: 'pricing', label: 'Pricing page', slug: '/pricing', sections: ['nav', 'pricing', 'faq', 'cta', 'footer'] },
  { id: 'contact', label: 'Contact page', slug: '/contact', sections: ['nav', 'contact', 'footer'] }
];

/** Starter sites for the New site dialog: every page is a list of sections, and the navigation bar links the pages. */
export const STARTER_SITES: { id: string; label: string; pages: { name: string; slug: string; sections: string[] }[] }[] = [
  { id: 'business', label: 'Business site', pages: [
    { name: 'Home', slug: '/', sections: ['nav', 'hero', 'features', 'testimonial', 'cta', 'footer'] },
    { name: 'Pricing', slug: '/pricing', sections: ['nav', 'pricing', 'faq', 'footer'] },
    { name: 'Contact', slug: '/contact', sections: ['nav', 'contact', 'footer'] }] },
  { id: 'product', label: 'Product launch', pages: [
    { name: 'Home', slug: '/', sections: ['nav', 'hero', 'features', 'pricing', 'faq', 'cta', 'footer'] },
    { name: 'Contact', slug: '/contact', sections: ['nav', 'contact', 'footer'] }] },
  { id: 'portfolio', label: 'Portfolio', pages: [
    { name: 'Home', slug: '/', sections: ['nav', 'hero', 'features', 'testimonial', 'footer'] },
    { name: 'About', slug: '/about', sections: ['nav', 'hero', 'cta', 'footer'] },
    { name: 'Contact', slug: '/contact', sections: ['nav', 'contact', 'footer'] }] }
];

/** node.add commands for one section under `parent`, parents first; returns the commands and the section's root id.
 *  `links` replaces the navigation bar's links with real page links (starter sites). */
export function sectionCommands(id: string, parent: string, fresh: (tag: string) => string, links?: { text: string; href: string }[]): { commands: Command[]; root: string } {
  const found = SECTIONS.find(item => item.id === id);
  if (!found) throw new Error(`Unknown section ${id}`);
  const entry = id === 'nav' && links ? { ...found, spec: { ...found.spec, children: [found.spec.children![0], { ...found.spec.children![1], children: links.map(item => ({ tag: 'a', name: 'Link', text: item.text, styles: { color: 'inherit', 'text-decoration': 'none' }, attrs: { href: item.href } })) }] } } : found;
  const commands: Command[] = [];
  const walk = (spec: Spec, under: string): string => {
    const node: SiteNode = { id: fresh(spec.tag), tag: spec.tag, name: spec.name, text: spec.text || '', children: [], attrs: { ...(spec.attrs || {}) }, styles: { ...(spec.styles || {}) }, breakpoints: spec.mobile ? { mobile: { ...spec.mobile } } : {} };
    commands.push({ command: 'node.add', params: { parent: under, node } });
    for (const child of spec.children || []) walk(child, node.id);
    return node.id;
  };
  const root = walk(entry.spec, parent);
  return { commands, root };
}
