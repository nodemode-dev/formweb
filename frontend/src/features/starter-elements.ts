import type { Site } from '../types';
import { DARK_INK, inkOn } from './contrast';
import { resolveColor } from './inspector/page-background';
import { LINE, MUTED } from './sections';

export type StarterPart = 'section' | 'heading' | 'paragraph' | 'button' | 'link' | 'form' | 'formLabel' | 'formInput' | 'formSubmit' | 'grid' | 'gridItem' | 'embed';

const ACCENT_FALLBACK = '#f97316';

export function starterStyles(site: Site): Record<StarterPart, Record<string, string>> {
  const accent = resolveColor(site, `var(--accent, ${ACCENT_FALLBACK})`);
  const filled = { background: `var(--accent, ${ACCENT_FALLBACK})`, color: inkOn(accent) ?? DARK_INK, 'font-weight': '600' };
  return {
    section: { display: 'flex', 'flex-direction': 'column', gap: '24px', padding: '64px', 'min-height': '240px' },
    heading: { 'font-size': '40px', 'line-height': '1.1', margin: '0', 'letter-spacing': '-1px' },
    paragraph: { 'font-size': '18px', 'line-height': '1.6', margin: '0', 'max-width': '640px', ...MUTED },
    button: { display: 'inline-flex', padding: '14px 24px', ...filled, 'border-radius': '8px', 'text-decoration': 'none', 'align-self': 'flex-start' },
    link: { color: 'inherit', 'font-size': '16px', 'text-decoration': 'underline', 'text-underline-offset': '3px' },
    form: { display: 'flex', 'flex-direction': 'column', gap: '16px', 'max-width': '480px', padding: '24px', border: LINE, 'border-radius': '12px' },
    formLabel: { 'font-size': '14px' },
    formInput: { padding: '14px', background: 'transparent', border: LINE, color: 'inherit', 'border-radius': '6px' },
    formSubmit: { padding: '14px', ...filled, border: '0', 'border-radius': '6px' },
    grid: { display: 'grid', 'grid-template-columns': 'repeat(3, minmax(0, 1fr))', gap: '24px', padding: '32px' },
    gridItem: { padding: '32px', border: LINE, 'border-radius': '12px', 'font-size': '20px' },
    embed: { display: 'flex', 'align-items': 'center', 'justify-content': 'center', width: '100%', 'min-height': '240px', padding: '24px', border: LINE, 'border-radius': '12px', 'font-size': '14px', overflow: 'hidden' }
  };
}
