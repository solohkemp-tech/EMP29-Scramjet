# Attribution

EMP29 is a modified distribution of MercuryWorkshop Scramjet, licensed AGPL-3.0-only. Upstream source and authorship are retained in the repository and `UPSTREAM_README.md`.

Client transport distributions are obtained from their unmodified pinned npm packages:

- `@mercuryworkshop/libcurl-transport` 2.0.5 — AGPL-3.0-only; https://github.com/MercuryWorkshop/CurlTransport
- `@mercuryworkshop/epoxy-transport` 3.0.1 — AGPL-3.0-only; https://github.com/MercuryWorkshop/epoxy-transport
- `@mercuryworkshop/wisp-js` 0.5.0 — LGPL-3.0-or-later; https://github.com/MercuryWorkshop/wisp-js
- Vazirmatn 5.3.0 — SIL Open Font License; https://github.com/rastikerdar/vazirmatn
- `@mozilla/readability` 0.6.0 — Apache-2.0; https://github.com/mozilla/readability; loaded on demand for article text extraction.

The associated license texts are retained in this directory. Package-specific dependency versions and upstream metadata are recorded in `emp29/package-lock.json`. Runtime transports are shipped unchanged; source can be obtained from the upstream repositories above. Embedded TLS implementations retain their upstream notices within the transport packages.

EMP29 additions: Persian interface, app server, workspace plugins, configuration, build scripts and documentation. Contact supplied for this distribution: https://t.me/emp29.
