import { traceBitmap, type TraceOptions } from './trace';

interface Job { pixels: ArrayBuffer; width: number; height: number; options: TraceOptions }

self.onmessage = (event: MessageEvent<Job>) => {
  const { pixels, width, height, options } = event.data;
  try {
    const result = traceBitmap(new Uint8ClampedArray(pixels), width, height, options, value => self.postMessage({ type: 'progress', value }));
    self.postMessage({ type: 'done', result });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Tracing failed.' });
  }
};
