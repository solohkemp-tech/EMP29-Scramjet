// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, stat, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPassword } from '../lib/auth.mjs';
const script = fileURLToPath(new URL('../scripts/setup.mjs', import.meta.url));
async function runSetup(cwd, responses) {
  return new Promise((resolve, reject) => {
    const child=spawn(process.execPath,[script],{cwd,stdio:['pipe','pipe','pipe']});
    let output='',errors='',index=0;
    const deadline=setTimeout(()=>{child.kill();reject(new Error('Setup did not finish'));},5000);
    child.stdout.on('data',chunk=>{
      output+=chunk;
      while(index<responses.length && output.includes(responses[index][0])) {
        child.stdin.write(responses[index][1]+'\n');index++;
      }
    });
    child.stderr.on('data',chunk=>{errors+=chunk;});
    child.once('error',error=>{clearTimeout(deadline);reject(error);});
    child.once('exit',code=>{clearTimeout(deadline);resolve({code,output,errors});});
  });
}
test('interactive setup saves only a password hash with private permissions', async()=>{
  const cwd=await mkdtemp(join(tmpdir(),'emp29-setup-'));
  const password='example-test-password-29';
  try {
    const result=await runSetup(cwd,[['Public HTTPS origin','https://browser.example.com'],['Local port','3030'],['Choose an access password',password],['Repeat the password',password]]);
    assert.equal(result.code,0,result.errors);
    const contents=await readFile(join(cwd,'.env'),'utf8');
    assert.match(contents,/EMP29_ORIGIN=https:\/\/browser.example.com/);
    assert.match(contents,/TRUST_PROXY=true/);
    assert.equal(contents.includes(password),false);
    assert.equal(result.output.includes(password),false);
    const hash=contents.match(/EMP29_PASSWORD_HASH=(.+)/)[1];
    assert.equal(await verifyPassword(password,hash),true);
    if(process.platform!=='win32')assert.equal((await stat(join(cwd,'.env'))).mode&0o777,0o600);
  }finally{await rm(cwd,{recursive:true,force:true});}
});
test('interactive setup rejects a remote HTTP origin without writing configuration',async()=>{
  const cwd=await mkdtemp(join(tmpdir(),'emp29-setup-'));
  try {
    const result=await runSetup(cwd,[['Public HTTPS origin','http://browser.example.com']]);
    assert.equal(result.code,1);
    assert.match(result.errors,/HTTPS origin/);
    assert.equal(await access(join(cwd,'.env')).then(()=>true,()=>false),false);
  }finally{await rm(cwd,{recursive:true,force:true});}
});
