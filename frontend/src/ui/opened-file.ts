type Bridge = { core?: { invoke(command: string): Promise<unknown> } };

export function watchOpenedFiles(open: (file: Blob) => Promise<void>): void {
  const core = (window as unknown as { __TAURI__?: Bridge }).__TAURI__?.core;
  if (!core) return;
  let busy = false;
  const take = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      for (;;) {
        const data = await core.invoke('take_opened_file');
        if (!(data instanceof ArrayBuffer) || !data.byteLength) break;
        await open(new Blob([data]));
      }
    } catch {
      return;
    } finally {
      busy = false;
    }
  };
  window.addEventListener('formweb-open-file', () => void take());
  void take();
}
