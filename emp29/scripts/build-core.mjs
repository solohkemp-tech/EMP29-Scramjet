// SPDX-License-Identifier: AGPL-3.0-only
import { build, transform } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
export async function buildCore(root) {
  const commit = 'b14b709ac190b786dd03becbd0728ab72bdd3ad6';
  const pkg = JSON.parse(await readFile(join(root, '../packages/core/package.json'),'utf8'));
  const controllerPkg = JSON.parse(await readFile(join(root, '../packages/controller/package.json'),'utf8'));
  const common = { bundle:true, write:false, minify:true, platform:'browser', nodePaths:[join(root,'node_modules')], target:['chrome110','firefox115','safari16.4'], tsconfigRaw:{compilerOptions:{alwaysStrict:false,useDefineForClassFields:true}} };
  const core = await build({ ...common, entryPoints:[join(root,'../packages/core/src/index.ts')], format:'esm', metafile:true,
    alias:{'@rewriters':join(root,'../packages/core/src/shared/rewriters'),'@client':join(root,'../packages/core/src/client'),'@':join(root,'../packages/core/src')},
    inject:[join(root,'src/core-log.js')],
    define:{ VERSION:JSON.stringify(pkg.version), COMMITHASH:JSON.stringify(commit.slice(0,7)), BUILDDATE:JSON.stringify(new Date().toISOString()), REWRITERWASM:'undefined' },
    plugins:[{name:'upstream-build-inputs',setup(api){
      api.onResolve({filter:/rewriter\/wasm\/out\/wasm\.js$/},()=>({path:join(root,'vendor/wasm.js')}));
      // Apply the exact runtime changes in upstream's pnpm htmlparser2 patch,
      // in memory; npm ci remains reproducible and node_modules is untouched.
      api.onLoad({filter:/htmlparser2\/dist\/Parser\.js$/},async args=>{
        let contents=await readFile(args.path,'utf8');
        if(!contents.includes('this.foreignContext = [ForeignContext.None]'))throw new Error('Unexpected htmlparser2 input; update the upstream patch explicitly.');
        contents=contents.replace('const reNameEnd = ', 'function getInitialForeignContext(value){return value === "svg" ? ForeignContext.Svg : value === "math" ? ForeignContext.MathML : ForeignContext.None;}\nconst reNameEnd = ')
          .replace('this.foreignContext = [ForeignContext.None]','this.foreignContext = [getInitialForeignContext(options.startingForeignContext)]')
          .replace('this.foreignContext.unshift(ForeignContext.None)','this.foreignContext.unshift(getInitialForeignContext(this.options.startingForeignContext))');
        return {contents,loader:'js'};
      });
    }}],
  });
  const exportNames=Object.values(core.metafile.outputs)[0].exports;
  if(!exportNames.includes('ScramjetClient'))throw new Error('Missing core exports');
  const coreBytes=(await transform(core.outputFiles[0].text,{format:'iife',globalName:'$scramjet',minify:true})).code;
  const globalsPlugin={name:'source-globals',setup(api){
    api.onResolve({filter:/^@mercuryworkshop\/scramjet$/},args=>({path:args.path,namespace:'core-global'}));
    api.onResolve({filter:/^@mercuryworkshop\/rpc$/},()=>({path:join(root,'../packages/rpc/index.ts')}));
    api.onLoad({filter:/.*/,namespace:'core-global'},()=>({contents:`export const {${exportNames.join(',')}}=globalThis.$scramjet;`,loader:'js'}));
  }};
  const outputs={scramjet:coreBytes};
  for(const [key,name] of [['controller','index'],['inject','inject'],['worker','sw']]){
    const result=await build({...common,entryPoints:[join(root,`../packages/controller/src/${name}.ts`)],format:'iife',globalName:'$scramjetController',
      define:{SCRAMJET_EXPECTED_VERSION:JSON.stringify(pkg.version),CONTROLLER_VERSION:JSON.stringify(controllerPkg.version)},plugins:[globalsPlugin]});
    outputs[key]=result.outputFiles[0].contents;
  }
  outputs.wasm=await readFile(join(root,'vendor/scramjet.wasm'));
  if(!WebAssembly.validate(outputs.wasm))throw new Error('Invalid compiled rewriter WASM');
  const revision = 'emp29-core-2.1.0';
  const patches = {};
  for (const source of ['packages/core/src/shared/rewriters/wasm.ts','packages/controller/src/index.ts','packages/controller/src/wasm-payload.ts']) {
    patches[source] = createHash('sha256').update(await readFile(join(root,'..',source))).digest('hex');
  }
  return { outputs, version:pkg.version, controller:controllerPkg.version, commit, revision, patches };
}
