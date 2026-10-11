// SPDX-License-Identifier: AGPL-3.0-only
import {readFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {configuration} from '../server.mjs';
const checks=[];
try{
  const [major,minor]=process.versions.node.split('.').map(Number);
  checks.push({check:'Node.js 22.16+',ok:major>22||major===22&&minor>=16,value:process.versions.node});
  const config=configuration();
  const build=JSON.parse(await readFile('dist/build.json','utf8'));
  checks.push({check:'release build',ok:build.version===JSON.parse(await readFile('package.json','utf8')).version,value:build.version});
  checks.push({check:'core revision',ok:build.coreRevision==='emp29-core-2.1.0',value:build.coreRevision});
  checks.push({check:'interface languages',ok:JSON.stringify(build.languages)===JSON.stringify(['fa','en'])});
  for(const [source,expected] of Object.entries(build.corePatches||{})){
    const actual=createHash('sha256').update(await readFile('../'+source)).digest('hex');
    checks.push({check:'core source '+source,ok:actual===expected});
  }
  for(const [name,path] of Object.entries({...build.runtime,...build.brand}))checks.push({check:'asset '+name,ok:await access('dist'+path).then(()=>true,()=>false)});
  const wasm=await readFile('dist'+build.runtime.wasm);checks.push({check:'valid WASM',ok:WebAssembly.validate(wasm)});
  checks.push({check:'source download',ok:await access('dist/source.zip').then(()=>true,()=>false)});
  console.log(JSON.stringify({brand:'EMP29 Pro',version:build.version,listen:config.host+':'+config.port,origin:config.origin||'localhost',passwordProtected:!!config.passwordHash,checks},null,2));
  if(checks.some(check=>!check.ok))process.exitCode=1;
}catch(error){console.error('EMP29 preflight failed: '+error.message);process.exitCode=1;}
