import { commands, upload } from '../../api';
import { element, value } from '../../ui/dom';
import { t } from '../../i18n';
import type { InspectorContext } from './context';
import type { SiteNode } from '../../types';

const FLAGS: [string, string][] = [['autoplay', 'Autoplay'], ['muted', 'Muted'], ['loop', 'Loop'], ['playsinline', 'Plays inline'], ['controls', 'Controls']];

export interface MediaHandle {
  update(node: SiteNode): void;
  insertVideo(): void;
}

function picker(accept: string): HTMLInputElement {
  const node = element('input');
  node.type = 'file';
  node.accept = accept;
  node.hidden = true;
  document.body.append(node);
  return node;
}

export function installMedia(ctx: InspectorContext): MediaHandle {
  const block = ctx.section(ctx.panes.content, 'Media');
  ctx.panes.content.insertBefore(block, ctx.anchors.afterAttributes.nextElementSibling);
  let current: SiteNode | undefined;

  const videoBox = element('div', 'fw-ext-group');
  const flags = element('div', 'form-grid fw-media-flags');
  const flagBoxes = new Map<string, HTMLInputElement>();
  for (const [name, label] of FLAGS) {
    const box = element('input');
    box.type = 'checkbox';
    box.dataset.attr = name;
    box.addEventListener('change', () => void ctx.run(() => ctx.nodePatch({ attrs: { [name]: box.checked ? '' : null } })));
    const wrap = element('label', 'checkbox-field');
    wrap.append(box, element('span', '', t(label)));
    flagBoxes.set(name, box);
    flags.append(wrap);
  }
  const videoGrid = element('div', 'form-grid');
  const preload = ctx.select([{ id: '', name: t('Auto') }, { id: 'none', name: 'none' }, { id: 'metadata', name: 'metadata' }, { id: 'auto', name: 'auto' }]);
  preload.addEventListener('change', () => void ctx.run(() => ctx.nodePatch({ attrs: { preload: preload.value || null } })));
  const poster = ctx.input('/api/assets/...');
  poster.addEventListener('change', () => void ctx.run(() => ctx.nodePatch({ attrs: { poster: poster.value.trim() || null } })));
  const posterInput = picker('image/png,image/jpeg,image/webp,image/gif');
  const videoInput = picker('video/mp4,video/webm,.mp4,.webm');
  const posterButton = ctx.button(t('Upload poster'), 'image', () => posterInput.click());
  const videoButton = ctx.button(t('Upload video'), 'upload', () => { videoInput.dataset.mode = 'src'; videoInput.click(); });
  const videoActions = element('div', 'fw-ext-actions');
  videoActions.append(videoButton, posterButton);
  videoGrid.append(ctx.field(t('Preload'), preload, true), ctx.field(t('Poster image'), poster, true));
  videoBox.append(flags, videoGrid, videoActions, element('p', 'micro', t('Autoplay works only with Muted on. Videos never play on the canvas; use Preview or the published site. MP4 or WebM, up to 64 MiB.')));

  const imageBox = element('div', 'fw-ext-group');
  const imageGrid = element('div', 'form-grid');
  const srcset = ctx.input('/api/assets/a.webp 480w, /api/assets/b.webp 960w');
  srcset.addEventListener('change', () => void ctx.run(() => ctx.nodePatch({ attrs: { srcset: srcset.value.trim() || null } })));
  const sizes = ctx.input('(min-width: 800px) 50vw, 100vw');
  sizes.addEventListener('change', () => void ctx.run(() => ctx.nodePatch({ attrs: { sizes: sizes.value.trim() || null } })));
  const decoding = ctx.select([{ id: '', name: t('Auto') }, { id: 'async', name: 'async' }, { id: 'sync', name: 'sync' }, { id: 'auto', name: 'auto' }]);
  decoding.addEventListener('change', () => void ctx.run(() => ctx.nodePatch({ attrs: { decoding: decoding.value || null } })));
  const priority = ctx.select([{ id: '', name: t('Auto') }, { id: 'high', name: 'high' }, { id: 'low', name: 'low' }, { id: 'auto', name: 'auto' }]);
  priority.addEventListener('change', () => void ctx.run(() => ctx.nodePatch({ attrs: { fetchpriority: priority.value || null } })));
  imageGrid.append(ctx.field(t('Source set'), srcset, true), ctx.field(t('Sizes'), sizes, true), ctx.field(t('Decoding'), decoding), ctx.field(t('Fetch priority'), priority));
  imageBox.append(imageGrid, element('p', 'micro', t('Each source set entry is a URL and a width such as 480w or a density such as 2x. Sizes tells the browser how wide the image is drawn.')));
  block.append(videoBox, imageBox);
  videoBox.hidden = true;
  imageBox.hidden = true;
  block.hidden = true;

  posterInput.addEventListener('change', () => void ctx.run(async () => {
    const file = posterInput.files?.[0];
    posterInput.value = '';
    if (!file || !current) return;
    ctx.status(t('Uploading poster...'));
    const asset = await upload(file);
    await ctx.nodePatch({ attrs: { poster: asset.url } });
    ctx.status(t('Poster attached.'));
  }));
  let insertParent = '';
  videoInput.addEventListener('change', () => void ctx.run(async () => {
    const file = videoInput.files?.[0];
    const mode = videoInput.dataset.mode;
    videoInput.value = '';
    if (!file) return;
    ctx.status(t('Uploading video...'));
    const asset = await upload(file);
    if (mode === 'insert') {
      const made = ctx.makeNode('video', file.name, '', { width: '100%', 'aspect-ratio': '16 / 9', 'object-fit': 'cover', background: '#000', 'border-radius': '12px' }, { src: asset.url, controls: '', preload: 'metadata', playsinline: '' });
      await commands([{ command: 'node.add', params: { parent: insertParent || ctx.insertionParent(), node: made } }]);
      ctx.selectNode(made.id);
      ctx.showLayers();
      ctx.status(t('Video inserted. The operation is one undo step.'));
    } else if (current) {
      await ctx.nodePatch({ attrs: { src: asset.url } });
      ctx.status(t('Video attached. It is bundled in site exports.'));
    }
  }));

  return {
    insertVideo() {
      insertParent = ctx.insertionParent();
      videoInput.dataset.mode = 'insert';
      videoInput.click();
    },
    update(node) {
      current = node;
      const video = node.tag === 'video';
      const image = node.tag === 'img';
      const show = video || image;
      if (block.hidden === show) block.hidden = !show;
      if (videoBox.hidden === video) videoBox.hidden = !video;
      if (imageBox.hidden === image) imageBox.hidden = !image;
      for (const [name, box] of flagBoxes) {
        const on = name in node.attrs;
        if (box.checked !== on) box.checked = on;
      }
      value(preload, node.attrs.preload || '');
      value(poster, node.attrs.poster || '');
      value(srcset, node.attrs.srcset || '');
      value(sizes, node.attrs.sizes || '');
      value(decoding, node.attrs.decoding || '');
      value(priority, node.attrs.fetchpriority || '');
    }
  };
}
