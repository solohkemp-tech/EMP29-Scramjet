import { readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
for (const folder of ['src', 'lib', 'scripts', 'tests']) {
  for (const name of await readdir(folder)) if (/\.(m?js)$/.test(name)) execFileSync(process.execPath, ['--check', join(folder, name)], { stdio: 'inherit' });
}
execFileSync(process.execPath, ['--check', 'server.mjs'], { stdio: 'inherit' });
const manifest = JSON.parse(await readFile('dist/build.json', 'utf8'));
for (const path of Object.values(manifest.runtime)) if (!(await readFile('dist' + path)).length) throw new Error(`Empty runtime file: ${path}`);
const html = await readFile('dist/index.html', 'utf8'); if (html.includes('{{')) throw new Error('Unreplaced build placeholders');
console.log('Syntax and build assets verified.');
