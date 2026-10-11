# EMP29 Pro 2.1.0 — 2026-10-11

- Added complete Persian/English UI selection in the header, login and settings, with live RTL/LTR, localized dates/numbers, accessible labels and backend error messages. Language persists in existing preferences and backups; user text and open frames remain intact.
- Removed repeated `WebAssembly.Module` construction from the JavaScript rewrite path. Seven controlled comparisons against the 2.0 bundle each performed 25 rewrites over five script fixtures: module construction fell from 25 to 1 with identical output.
- Shared one validated WASM fetch between controller initialization and concurrent worker-payload requests, with retryable failed downloads and bounded binary-to-base64 conversion.
- Corrected Controller readiness: frames are rejected until both service-worker readiness and initialization complete. Kept the Rust rewriter binary and upstream compatibility versions unchanged.
- Recorded fork revision `emp29-core-2.1.0` and patch hashes in the build manifest. Added an English release guide and a reproducible local core comparison script.
- Expanded automated checks to 57 passing tests, covering English, live drafts/user content, frame preservation, real compiled core/controller behavior and binary integrity.

These are measured changes to specific code paths. Browser/site/video speed and an overall performance multiplier have not been measured.

# EMP29 Pro 2.0.0 — 2026-10-11

- Added eight named workspaces, tab moves, link copying, workspace hibernation and twelve saved sessions with atomic, deduplicated lazy restoration.
- Expanded to 24 tabs and added a configurable live-frame budget that protects visible/split/pinned/loading/playing frames; fixed concurrent startup admission and reduced-budget eviction.
- Added two-pane browsing and an on-demand Mozilla Readability module, a bounded plain-text reading library, notes, search and Markdown export.
- Added per-site domain-filter exceptions and observed response/block/cache counters.
- Added automatic startup transport fallback, validated Wisp probes, two optional alternate endpoints, bounded startup waits and a manual transport switch that keeps the old transport on failure.
- Added an original mint E/orbit logo, matching hero art, WebP delivery and install icons.
- Added bounded concurrent scrypt verification, shell CSP, indexing controls, HTTPS HSTS, a release doctor, migration/research/comparison documentation and updated CI packaging.
- Expanded to 44 passing automated tests; tested the real local Wisp handshake and the compiled ESM UI. Preserved v1 preferences and data keys.

The Rust/JavaScript Scramjet core remains the source-built `b14b709` revision from 1.0.0. This release improves the product and connection lifecycle; no unmeasured core-speed multiplier is claimed.

# EMP29 1.0.0 — 2026-10-11

- Added a complete Persian RTL browsing shell with EMP29 identity and Telegram @emp29, local fonts, responsive styles, themes and accessible dialog controls.
- Added bounded tabs, pin/reopen/restore/suspend, address search, bookmarks, history, command palette, settings backup, cookie/cache tools and connection diagnostics.
- Added two TLS transports, optional tracker/domain filtering, explicitly public static-asset caching and balanced/lean/video presets.
- Added a same-origin Wisp server with optional scrypt login, expiring cookies, origin checks, upgrade/login limits, public DNS filtering and IPv6 handling.
- Delayed navigation until the current Service Worker actually controls the page and transport WASM is initialized; isolated runtime repair from unrelated browser data.
- Rebuilt core/controller/utilities from GitHub commit `b14b709ac190b786dd03becbd0728ab72bdd3ad6`, including exported-declaration rewriting and URL rewrite hardening absent from the older npm release.
- Compiled fresh Rust rewriter WASM with wasm-bindgen 0.2.105 and Binaryen 132; included build provenance and a rebuild recipe.
- Added content-hashed engine/UI/font paths, Brotli/Gzip delivery, validators, byte ranges and strict missing-file handling.
- Added Node startup scripts, password setup, systemd/reverse-proxy examples, Docker files, Persian install instructions, automated tests and an authenticated source download.

Upstream source is preserved in `packages/` and `UPSTREAM_README.md`. No deployment to a user server is included in this release.
