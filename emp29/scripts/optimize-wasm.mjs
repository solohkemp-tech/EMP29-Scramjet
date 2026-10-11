// SPDX-License-Identifier: AGPL-3.0-only
import binaryen from 'binaryen';
import { readFile, writeFile } from 'node:fs/promises';
if(!process.argv[2]||!process.argv[3])throw new Error('Usage: node scripts/optimize-wasm.mjs INPUT OUTPUT');
const input=await readFile(process.argv[2]);
const module=binaryen.readBinary(input);
// Preserve input features: enabling every experimental proposal can make
// Binaryen emit instructions that current browsers cannot execute.
binaryen.setOptimizeLevel(3);binaryen.setShrinkLevel(1);module.optimize();
module.runPasses(['strip-debug']);
if(!module.validate())throw new Error('Optimized WASM failed Binaryen validation');
const bytes=module.emitBinary();module.dispose();
if(!WebAssembly.validate(bytes))throw new Error('Optimized WASM failed runtime validation');
await writeFile(process.argv[3],bytes);
console.log(`WASM optimized: ${input.length} -> ${bytes.length} bytes`);
