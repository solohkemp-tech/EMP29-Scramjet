# EMP29 Pro 2.1.0 — validation

Date: 2026-10-11. Environment: Linux, Node.js 24.19.0, npm 11.9.0.

## Completed checks

- Built core, controller, worker and utilities from upstream `b14b709ac190b786dd03becbd0728ab72bdd3ad6` plus the identified EMP29 JavaScript changes. Fork revision `emp29-core-2.1.0` and SHA-256 hashes of the three changed core/controller source files appear in `emp29/dist/build.json`.
- Retained the already source-built Rust/WASM rewriter from the same upstream revision. Native `WebAssembly.validate` accepts it. Its SHA-256 and rebuild recipe remain in `emp29/vendor/provenance.json`; no Rust rewriter change is claimed for 2.1.
- `npm test`: **57 passed, 0 failed**. Coverage includes URL/import bounds, existing data migration, caching/privacy, real Wisp protocol probes, startup fallback and transport rollback, worker control, authentication, Origin rejection, rate/concurrency limits and static delivery.
- English checks execute the actual compiled ESM UI: home, main/Pro dialogs, accessible labels, errors, login while the shell is inert, LTR and locale formatting, language persistence, bookmarks/search, settings drafts, reading notes and workspace drafts. A catalog/source check verifies authored Persian messages have English coverage. Interpolated user content remains unchanged. A controlled engine fixture verifies changing language retains the same two live iframe elements and split-pane visibility.
- Actual compiled-core checks instrument native `WebAssembly.Module` construction, assert one compile over 25 rewrites, test re-initialization failure/recovery, share 20 concurrent controller/worker binary requests through one validated fetch, verify retry after HTTP/invalid-binary failures, exercise real Controller/service-worker RPC readiness and compare base64 round-trips at chunk boundaries and across all 600,393 WASM bytes.
- Existing DOM checks cover tab/panel controls, themes, bookmarks, unsafe navigation, workspaces, lazy deduplicated sessions, plain-text library escaping, site exceptions and shortcuts. Controlled lifecycle checks enforce the live-frame budget; the real bundled Readability extracts and saves a synthetic article. Core versions remain compatible, exported globals are rewritten, and URL rewriting survives a site overriding `String.startsWith`.
- Setup tests execute the real CLI: private `.env` permissions, hashed password, no password in console output and remote HTTP-origin rejection.
- `npm run check`: syntax and referenced build assets pass. Shell scripts and Python packaging syntax pass.
- `npm audit --omit=dev`: **0 reported vulnerabilities** at validation time. This is an advisory result, not a full security audit.
- Source/release ZIP checks verify integrity, corresponding source, licenses, original/web brand assets and no private `.env`, `node_modules`, `.git` or build caches.
- A separate release extraction is installed using `npm ci --omit=dev --ignore-scripts`: **6 packages**, without jsdom, Readability, sharp, esbuild or acorn. The real password-protected CLI starts, login/logout and protected routes pass, **26 assets** including both language manifests are delivered, WASM validates, the source ZIP downloads, and the local Wisp endpoint passes the app's protocol probe. `npm run doctor` passes **19 checks**, including fork source hashes, in development and the isolated extraction.

## Direct core comparison

`emp29/core-benchmark.json` records seven local batches, each with 25 rewrites over five fixtures (exported/global access and static/dynamic imports). The previous bundle was extracted from the delivered EMP29 2.0 archive. Both bundles use the identical WASM binary and context/flags. Every rewritten output matched byte for byte.

| Measurement | EMP29 2.0 baseline | EMP29 2.1 |
| --- | ---: | ---: |
| `WebAssembly.Module` constructions per 25 rewrites | 25 | 1 |
| Median elapsed time for this local batch | 10.013 ms | 7.254 ms |

This removes 24 redundant construction calls in this 25-script workload. It is a Node/V8 + jsdom microbenchmark; it excludes network, browser rendering, real site scripts and video. Timing varies by runtime, warm-up and hardware. No overall browser-speed multiplier or product ranking follows from these numbers. The unchanged Rust rewriter has no claimed throughput improvement.

Reproduce after `npm ci && npm run build`, providing a compiled baseline bundle:

```sh
node scripts/benchmark-core.mjs --baseline /absolute/path/to/previous/scramjet.js
```

Baseline bundle SHA-256: `cfa8a61a2b09bbdad0aa77d4347c17e3d179ffa17e8d8d3f237c7a90c2938098`. The baseline archive SHA-256 was `121cbf631cf1731aac88b6e6ba335e6386dd8225b9657a091840980bd4b9dab5`. Current bundle hash and comparison scope are recorded with the result. A new build may change the bundle hash because build timestamps are embedded.

## Build sizes

File sizes, not load-speed measurements. TLS transports/fonts are additional assets. Engine/transport bundles are deferred until navigation; Readability loads on demand. The bilingual catalog adds UI code.

| Asset | Raw bytes | Gzip bytes | Brotli bytes |
| --- | ---: | ---: | ---: |
| EMP29 UI entry JavaScript | 171,223 | 41,475 | 37,513 |
| Shared JavaScript helper | 577 | 361 | 326 |
| On-demand reading module | 34,264 | 11,496 | 11,085 |
| EMP29 CSS | 36,250 | 8,249 | 7,805 |
| Scramjet core JavaScript | 209,953 | 78,274 | 73,797 |
| Rewriter WASM | 600,393 | 210,404 | 177,480 |

Web hero: **22,586 bytes**; web logo: **57,219 bytes**. Original high-resolution artwork remains included. WASM SHA-256: `87d0153dfa17dc049173cdc8ece7975a804a3ab79613a4a3421f8a28e39612f2`.

## Not executed

- Screenshot/visual QA or real-browser navigation through live sites. jsdom does not implement Service Workers, real iframe site execution or media playback; controlled fixtures exercise those lifecycle boundaries.
- Deployment or testing on the user's remote server, live YouTube/video performance or normal/private-window differences.
- Windows/macOS startup, systemd installation, Docker execution or live Caddy/Nginx certificate setup.
- Compatibility with every upstream site, DRM, UDP/WebRTC or external custom Wisp endpoints.

No remote deployment, public hosting or GitHub push was performed. Automated checks and this microbenchmark do not replace real-browser acceptance tests on the destination server.
