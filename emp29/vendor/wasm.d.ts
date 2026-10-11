/* tslint:disable */
/* eslint-disable */

export type JsRewriterOutput = {
	js: Uint8Array,
	map: Uint8Array,
	scramtag: string,
	errors: string[],
};


export class Rewriter {
  free(): void;
  [Symbol.dispose](): void;
  rewrite_js(jsconfig: object, jsflags: object, encode_url: object, js: string, base: string, url: string, module: boolean): JsRewriterOutput;
  rewrite_js_bytes(jsconfig: object, jsflags: object, encode_url: object, js: Uint8Array, base: string, url: string, module: boolean): JsRewriterOutput;
  constructor();
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_rewriter_free: (a: number, b: number) => void;
  readonly rewriter_new: () => [number, number, number];
  readonly rewriter_rewrite_js: (a: number, b: any, c: any, d: any, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number, number];
  readonly rewriter_rewrite_js_bytes: (a: number, b: any, c: any, d: any, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => [number, number, number];
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_externrefs: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
