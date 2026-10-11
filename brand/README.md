# EMP29 visual identity

Original art created specifically for EMP29 with the built-in image generator on 2026-10-11. The supplied brand/contact is EMP29 / https://t.me/emp29. Scramjet attribution remains separate in the application.

Design direction: a geometric mint E, an orbital ring and graphite details; the matching landscape artwork uses a glass E sculpture, mint illumination and a dark obsidian background. The mark has a transparent background; the hero is opaque. No third-party logo was used as a reference.

| File | Purpose |
| --- | --- |
| `EMP29-logo-original.png` | Original transparent 1280 × 1280 mark |
| `EMP29-hero-original.png` | Original 1672 × 941 landscape artwork |
| `../emp29/public/brand/emp29-logo.png` | Web logo at 256 × 256 |
| `../emp29/public/brand/emp29-hero.webp` | Optimized 960 × 540 hero |
| `../emp29/public/icon-192.png`, `icon-512.png` | Opaque install icons with a safe inset |
| `../emp29/public/favicon.png` | 32 × 32 favicon |

From `emp29/`, run `npm ci`, `npm run brand`, then `npm run build` to regenerate web exports. Original artwork is retained. The build adds content hashes to the web logo/hero paths. Icon sizes are generated from the original mark, with padding and an opaque background for maskable installation.
