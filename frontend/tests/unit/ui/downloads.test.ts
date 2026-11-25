import { afterEach, describe, expect, it } from 'vitest';
import { shellSentence } from '../../../src/ui/downloads';
import { setLanguage } from '../../../src/i18n';

afterEach(async () => { await setLanguage('en'); });

describe('the sentence for a Show in folder the desktop shell could not do', () => {
  it('names the file and the folder it was moved out of', () => {
    expect(shellSentence({ code: 'download.moved', file: 'site-export.zip', folder: '/home/ada/Downloads', detail: '' })).toBe('site-export.zip is no longer in /home/ada/Downloads. It was moved or deleted.');
  });

  it('is in the editor language, with the file and folder as the shell gave them', async () => {
    await setLanguage('de');
    const said = shellSentence({ code: 'download.moved', file: 'site-export.zip', folder: '/home/ada/Downloads', detail: '' });
    expect(said).toContain('site-export.zip');
    expect(said).toContain('/home/ada/Downloads');
    expect(said).not.toContain('It was moved or deleted');
  });

  it('says when nothing has been saved yet', () => {
    expect(shellSentence({ code: 'download.none', file: '', folder: '', detail: '' })).toBe('No file has been saved yet.');
  });

  it('keeps the system reason when the file manager did not start', () => {
    expect(shellSentence({ code: 'download.reveal-failed', file: 'a.zip', folder: '/tmp', detail: 'No such file or directory (os error 2)' })).toBe('The file manager could not show a.zip: No such file or directory (os error 2)');
  });

  it('shows a plain message from an older shell as it came', () => {
    expect(shellSentence('Something else went wrong.')).toBe('Something else went wrong.');
  });
});
