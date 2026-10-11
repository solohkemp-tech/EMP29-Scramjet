# EMP29 Pro 2.1 · Scramjet

EMP29 is a personal web browsing application built on MercuryWorkshop Scramjet, with original EMP29 artwork and [Telegram @emp29](https://t.me/emp29). [راهنمای فارسی](README.md).

## Start locally

Install Node.js 24 LTS (minimum 22.16), extract the release, and open a terminal in `EMP29_Scramjet/emp29`:

```sh
npm ci --omit=dev --ignore-scripts
npm run doctor
npm start
```

Open **http://localhost:3030**. The release includes compiled assets and matching source; Rust is not required for installation. For a password-protected installation, run `npm run setup` before starting. Leave the domain prompt empty for local use. Keep the generated `.env` private. Stop with Ctrl+C.

Select **English** from the header or login screen, or select your interface language in Settings. The choice persists and is included in backups. Language switches do not reload active pages. Your titles, workspace names, articles and notes keep their original text. Dates and counters use the selected locale; the installed-app manifest has a matching language variant.

## Features

- 24 tabs in eight named workspaces; pinning, reopening, lazy restoration, link copying and resource controls. Workspaces share site cookies and logins.
- Twelve saved sessions with bounded, deduplicated restoration into the current workspace.
- Two-pane browsing; both visible tabs are protected from timed suspension.
- On-demand Mozilla Readability, a 15-article plain-text library, notes, search and Markdown export.
- Bookmarks, local history, JSON backup/restore, four search providers, a command palette, themes, accents and reduced motion.
- Libcurl/Epoxy startup fallback, real Wisp protocol probes, two optional alternate Wisp endpoints and a manual transport switch with rollback on failure. Existing requests, forms and payments are not automatically replayed.
- Optional domain filtering, site exceptions and observed request/block/cache counters. Bounded caching excludes private responses, HTML, API traffic and media streams.
- A same-origin Wisp server, scrypt password hashing, expiring login sessions, Origin and concurrency limits, private-network destination filtering and production configuration examples.

Data stays in this browser and does not sync across devices. Backups contain preferences, bookmarks, workspaces, saved sessions and reading content; they omit site cookies, browsing history and login passwords. Application installation does not enable offline proxy browsing.

## Core improvements in 2.1

The upstream base is `b14b709ac190b786dd03becbd0728ab72bdd3ad6`. The fork revision is `emp29-core-2.1.0`; source patch hashes are included in `emp29/dist/build.json`.

The JavaScript rewrite path now initializes its WASM module once instead of constructing a module for every script. A controlled local comparison against EMP29 2.0 ran seven batches of 25 rewrites over five fixtures. Construction count fell from 25 to 1 per batch, and every rewritten output matched. Controller and worker initialization also share one validated binary download. Download failures remain retryable, base64 conversion uses bounded chunks, and frame creation waits for controller readiness.

The Rust rewriter binary is unchanged. The microbenchmark excludes network traffic, real site execution, browser rendering and video. It does not establish a browser-speed multiplier. Full results and limitations are in [VALIDATION.md](VALIDATION.md) and `emp29/core-benchmark.json`.

## Deploy or upgrade

Use a domain with valid HTTPS for remote access: browsers require a secure context for Service Workers. Host the app at the domain root. Configure the internal server on loopback and forward HTTP/WebSocket traffic through your HTTPS reverse proxy. `EMP29_ORIGIN` must match the public origin exactly.

```sh
cd /opt/emp29/emp29
npm ci --omit=dev --ignore-scripts
npm run setup
npm run doctor
```

Setup accepts your HTTPS origin, password and port. Samples are in `emp29/deploy/`: Caddy, Nginx and systemd. `sudo bash deploy/install-systemd.sh` installs and enables the systemd service; review the example for your host. Docker Compose is also included. These deployment mechanisms have not been executed on your server.

For an upgrade, export a backup, stop the service, retain the previous directory, extract the new version and transfer the existing `.env`. Install production dependencies, run doctor and restart. Retaining the same origin preserves local browser data. Old preferences default to Persian. The scoped Repair connection tool can refresh this app's Service Worker/cache if an old installation remains stuck. See [RELEASE.md](RELEASE.md).

## Development and licensing

```sh
cd emp29
npm ci
npm run build
npm test
npm run check
python3 scripts/package-release.py --output /absolute/path/EMP29_Scramjet_v2.1.0.zip
npm run doctor
```

Rebuild and repackage after changing the source so `/source.zip` matches the running build. See `emp29/vendor/provenance.json` for the Rust binary and `emp29/scripts/rebuild-rewriter.sh` for the optional Rust rebuild recipe.

EMP29 and its corresponding-source download are distributed under **AGPL-3.0-only**. The Mozilla Readability license is included separately. Keep required notices and provide the corresponding source when making a modified service available to users. The original upstream guide is [UPSTREAM_README.md](UPSTREAM_README.md).

Automated validation covers 57 scenarios. Real browser screenshots, live website/media compatibility and deployment on your remote server remain untested; Scramjet is an experimental rewriting engine.
