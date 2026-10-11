// SPDX-License-Identifier: AGPL-3.0-only
import { build, transform } from 'esbuild';
import { mkdir, readFile, writeFile, cp, rm, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';
import { buildCore } from './build-core.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const dir = join(root, 'dist');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 12);
const core = await buildCore(root);
await rm(dir, { recursive: true, force: true }); await mkdir(join(dir, 'assets'), { recursive: true });
await cp(join(root, 'public'), dir, { recursive: true });
const runtime = {};
async function asset(key, source, prefix) {
  const bytes = await readFile(join(root, source));
  const name = source.split('/').at(-1); const target = `/vendor/${prefix}-${hash(bytes)}/${name}`;
  await mkdir(dirname(join(dir, target)), { recursive: true }); await writeFile(join(dir, target), bytes); runtime[key] = target;
}
for (const [key, source, prefix] of [
  ['libcurl', 'node_modules/@mercuryworkshop/libcurl-transport/dist/index.js', 'libcurl'],
  ['epoxy', 'node_modules/@mercuryworkshop/epoxy-transport/dist/index.js', 'epoxy'],
]) await asset(key, source, prefix);
for (const [key, filename] of Object.entries({scramjet:'scramjet.js',wasm:'scramjet.wasm',controller:'controller.api.js',inject:'controller.inject.js',worker:'controller.sw.js'})) {
  const bytes=typeof core.outputs[key]==='string'?Buffer.from(core.outputs[key]):core.outputs[key];
  const target=`/vendor/source-${hash(bytes)}/${filename}`;
  await mkdir(dirname(join(dir,target)),{recursive:true});await writeFile(join(dir,target),bytes);runtime[key]=target;
}
// The published utils 0.0.3 expects core alpha.1/controller 0.0.13.
// Compile the downloaded source against our exact core/controller pair.
const utils = await build({
  entryPoints: [join(root, '../packages/utils/src/index.ts')], bundle: true, write: false,
  minify: true, format: 'iife', globalName: '$scramjetUtils', target: ['chrome110', 'firefox115', 'safari16.4'],
  define: { SCRAMJET_EXPECTED_VERSION: JSON.stringify(core.version), CONTROLLER_EXPECTED_VERSION: JSON.stringify(core.controller) },
  plugins: [{ name: 'runtime-globals', setup(api) {
    api.onResolve({ filter: /^@mercuryworkshop\/(scramjet|scramjet-controller|proxy-transports)$/ }, args => ({ path: args.path, namespace: 'globals' }));
    api.onLoad({ filter: /.*/, namespace: 'globals' }, args => ({ contents: args.path.endsWith('scramjet-controller') ? 'export const {ManagedPlugin, VERSION}=globalThis.$scramjetController;' : 'export const {versionInfo, ScramjetHeaders, BareResponse}=globalThis.$scramjet;', loader: 'js' }));
  } }],
});
const bytes = utils.outputFiles[0].contents;
runtime.utils = `/vendor/utils-${hash(bytes)}/scramjet-utils.js`;
await mkdir(dirname(join(dir, runtime.utils)), { recursive: true }); await writeFile(join(dir, runtime.utils), bytes);
const ui = await build({ entryPoints: [join(root, 'src/app.js')], outdir:join(dir,'assets'), entryNames:'app-[hash]', chunkNames:'feature-[hash]', splitting:true, bundle: true, write: false, minify: true, format: 'esm', target: ['chrome110', 'firefox115', 'safari16.4'], legalComments: 'inline' });
for (const file of ui.outputFiles) await writeFile(file.path,file.contents);
const entry=ui.outputFiles.find(file=>/\/app-[^/]+\.js$/.test(file.path));
if(!entry)throw new Error('Missing UI entry bundle');
const js=entry.contents,jsName=entry.path.split('/').at(-1);
let css = await readFile(join(root, 'src/style.css'), 'utf8');
css += '\n' + await readFile(join(root, 'src/pro.css'), 'utf8');
for (const subset of ['arabic', 'latin']) for (const weight of [400, 600, 700]) {
  const bytes = await readFile(join(root, `node_modules/@fontsource/vazirmatn/files/vazirmatn-${subset}-${weight}-normal.woff2`));
  const name = `vazirmatn-${subset}-${weight}-${hash(bytes)}.woff2`;
  await writeFile(join(dir, 'assets', name), bytes);
  css = css.replaceAll(`/assets/vazirmatn-${subset}-${weight}.woff2`, `/assets/${name}`);
}
css = (await transform(css, { loader: 'css', minify: true })).code;
const cssName = `style-${hash(css)}.css`; await writeFile(join(dir, 'assets', cssName), css);
const brand = {};
for (const [key, filename] of [['logo','emp29-logo.png'],['hero','emp29-hero.webp']]) {
  const bytes=await readFile(join(root,'public/brand',filename));
  const name=filename.replace(/\.(png|webp)$/,`-${hash(bytes)}.$1`);
  await writeFile(join(dir,'assets',name),bytes);brand[key]=`/assets/${name}`;
}
await rm(join(dir,'brand'),{recursive:true,force:true});
let html = await readFile(join(dir, 'index.html'), 'utf8'); html = html.replace('{{STYLE}}', `/assets/${cssName}`).replace('{{APP}}', `/assets/${jsName}`).replaceAll('{{LOGO}}',brand.logo).replace('{{HERO}}',brand.hero); await writeFile(join(dir, 'index.html'), html);
const sw = `// EMP29 v${pkg.version} – rebuilt on each release; never cache navigation.\nimportScripts(${JSON.stringify(runtime.worker)});\naddEventListener('fetch',e=>{if($scramjetController.shouldRoute(e))e.respondWith($scramjetController.route(e));});\n`;
await writeFile(join(dir, 'sw.js'), sw);
const manifest = { version: pkg.version, engine: core.version, controller: core.controller, coreRevision:core.revision, corePatches:core.patches, languages:['fa','en'], runtime, brand, upstreamCommit: core.commit, sourceBuilt:true, rewriterHash:hash(core.outputs.wasm), built: new Date().toISOString() };
await writeFile(join(dir, 'build.json'), JSON.stringify(manifest, null, 2));
async function compress(folder) {
  for (const item of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, item.name);
    if (item.isDirectory()) await compress(path);
    else if (/\.(js|css|html|svg|json|wasm)$/.test(item.name)) {
      const data = await readFile(path); if (data.length < 512) continue;
      await writeFile(path + '.br', brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 8 } }));
      await writeFile(path + '.gz', gzipSync(data, { level: 9 }));
    }
  }
}
await compress(dir);
console.log(`EMP29 ${pkg.version} built. UI JS: ${js.length} bytes; core: ${manifest.engine}.`);
