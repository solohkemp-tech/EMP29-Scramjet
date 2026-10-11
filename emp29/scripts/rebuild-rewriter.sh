#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Optional developer step. Normal installation uses the included compiled WASM.
set -euo pipefail
cd "$(dirname "$0")/.."
task_app="$(pwd)"
task_target="${CARGO_TARGET_DIR:-$task_app/.rust-target}"
export CARGO_TARGET_DIR="$task_target"
export RUSTFLAGS='-Zlocation-detail=none -Zfmt-debug=none'
cd ../packages/core/rewriter
cargo +nightly-2026-10-11 build --release --locked --target wasm32-unknown-unknown \
  -Z build-std=panic_abort,std -Z build-std-features=optimize_for_size \
  --no-default-features -p wasm -j 4
cd "$task_app"
if [[ "$(wasm-bindgen --version)" != 'wasm-bindgen 0.2.105' ]]; then
  echo 'Install wasm-bindgen-cli 0.2.105 to match Cargo.lock.' >&2
  exit 1
fi
wasm-bindgen --target web --out-dir vendor --out-name wasm "$task_target/wasm32-unknown-unknown/release/wasm.wasm"
node scripts/optimize-wasm.mjs vendor/wasm_bg.wasm vendor/scramjet.wasm
echo 'Rewriter rebuilt. Run npm run build, then npm test.'
