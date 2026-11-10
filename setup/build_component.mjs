import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const chunks = [];
let size = 0;
for await (const chunk of process.stdin) {
  size += chunk.length;
  if (size > 1048576) throw new Error('Component build request is too large.');
  chunks.push(chunk);
}
let workspace;
try {
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (input.mode !== undefined && !['isolated', 'page'].includes(input.mode)) throw new Error('Component mode must be isolated or page.');
  const page = input.mode === 'page';
  const sourceCap = page ? 262144 : 131072;
  if (input.enabled !== true || !['typescript', 'javascript'].includes(input.language) || typeof input.source !== 'string' || Buffer.byteLength(input.source, 'utf8') > sourceCap || !input.source.trim()) throw new Error(`An explicitly enabled JavaScript or TypeScript component source of at most ${sourceCap / 1024} KiB is required.`);
  if (Object.keys(input).some(key => !['enabled', 'language', 'source', 'props', 'mode'].includes(key))) throw new Error('Unsupported component build field.');
  const props = input.props ?? {};
  if (!props || typeof props !== 'object' || Array.isArray(props) || Object.keys(props).length > 64) throw new Error('Props must be an object with at most 64 descriptors.');
  const types = { string: 'string', number: 'number', boolean: 'boolean', json: 'unknown' };
  const fields = [];
  for (const [name, descriptor] of Object.entries(props)) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,95}$/.test(name) || !descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor) || !Object.hasOwn(types, descriptor.type) || Object.keys(descriptor).some(key => !['type', 'required', 'default'].includes(key)) || (descriptor.required !== undefined && typeof descriptor.required !== 'boolean')) throw new Error('Invalid typed prop descriptor: ' + name);
    if (descriptor.default !== undefined && descriptor.type !== 'json' && (typeof descriptor.default !== descriptor.type || (descriptor.type === 'number' && !Number.isFinite(descriptor.default)))) throw new Error('Prop default has the wrong type: ' + name);
    fields.push(JSON.stringify(name) + (descriptor.required ? '' : '?') + ': ' + types[descriptor.type]);
  }
  workspace = await mkdtemp(join(tmpdir(), 'formweb-component-'));
  const sourcePath = join(workspace, 'component.ts');
  const context = 'interface FormWebComponentContext { host: HTMLElement; id: string; readonly reduced: boolean; theme(): "dark" | "light"; onTheme(fn: (mode: "dark" | "light") => void): () => void; token(name: string): string; asset(path: string): string; progress(scene?: string): number; onProgress(fn: (p: number) => void, scene?: string): () => void; onFrame(fn: (now: number) => void): () => void; visible(): boolean; onVisible(fn: (v: boolean) => void): () => void; size(): { width: number; height: number }; onResize(fn: (s: { width: number; height: number }) => void): () => void; variable(name: string): unknown; onVariable(name: string, fn: (v: unknown) => void): () => void; ready(): void }\n';
  const signature = page ? '(root: HTMLElement, props: FormWebComponentProps, ctx: FormWebComponentContext) => unknown' : '(root: HTMLElement, props: FormWebComponentProps) => void';
  const contract = '\ntype FormWebComponentProps = {' + fields.join('; ') + '};\n' + (page ? context : '') + 'const formwebMountContract: ' + signature + ' = mount;\nexport { formwebMountContract };\n';
  await writeFile(sourcePath, input.source + contract);
  await writeFile(join(workspace, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ES2022', moduleResolution: 'bundler', strict: true, noImplicitAny: input.language === 'typescript', noEmitOnError: true, isolatedModules: true, noResolve: true, types: [], typeRoots: [], lib: ['ES2022', 'DOM'], rootDir: workspace, outDir: join(workspace, 'out'), skipLibCheck: true, declaration: false, sourceMap: false }, files: [sourcePath] }));
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const compiler = join(root, 'frontend', 'node_modules', 'typescript', 'bin', 'tsc');
  const result = await new Promise((resolveResult, reject) => {
    const processHandle = spawn(process.execPath, [compiler, '--project', join(workspace, 'tsconfig.json'), '--pretty', 'false'], { cwd: workspace, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, TMPDIR: tmpdir() } });
    const output = [];
    let bytes = 0;
    const collect = chunk => { bytes += chunk.length; if (bytes <= 65536) output.push(chunk); else processHandle.kill(); };
    processHandle.stdout.on('data', collect);
    processHandle.stderr.on('data', collect);
    const timer = setTimeout(() => processHandle.kill(), 15000);
    processHandle.on('error', error => { clearTimeout(timer); reject(error); });
    processHandle.on('close', code => { clearTimeout(timer); resolveResult({ code, diagnostics: Buffer.concat(output).toString('utf8') }); });
  });
  if (result.code !== 0) {
    const diagnostics = result.diagnostics.split(workspace).join('[component]');
    process.stdout.write(JSON.stringify({ ok: false, diagnostics: diagnostics || 'Component compilation failed or exceeded its limit.' }) + '\n');
    process.exitCode = 1;
  } else {
    const javascript = await readFile(join(workspace, 'out', 'component.js'), 'utf8');
    const builtCap = page ? 524288 : 262144;
    if (Buffer.byteLength(javascript, 'utf8') > builtCap) throw new Error(`Compiled component exceeds ${builtCap / 1024} KiB.`);
    const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');
    process.stdout.write(JSON.stringify({ ok: true, component: { enabled: true, language: input.language, source: input.source, props, sourceDigest: digest(input.source), builtDigest: digest(javascript), javascript }, diagnostics: [] }) + '\n');
  }
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, diagnostics: error instanceof Error ? error.message : 'Invalid component build.' }) + '\n');
  process.exitCode = 1;
} finally {
  if (workspace) await rm(workspace, { recursive: true, force: true });
}
