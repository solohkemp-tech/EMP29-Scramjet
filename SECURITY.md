# EMP29 deployment and data boundaries

The packaged server defaults to loopback. Public binding requires a password or an explicit `EMP29_PUBLIC=true` choice. HTTPS deployment uses a fixed origin and a trusted reverse proxy; enable `TRUST_PROXY` only behind that proxy.

Passwords use salted scrypt hashes; login verification is bounded to four concurrent jobs and eight attempts per IP per minute. Opaque session cookies expire after twelve hours, use HttpOnly and SameSite=Strict, and use Secure on HTTPS. Login/logout and WebSocket upgrades enforce origin. The server limits WebSocket counts, headers and request bodies. The shell sets a minimal CSP compatible with the WASM/proxy runtime; it is not a comprehensive content sandbox.

The internal Wisp server allows public DNS destinations on TCP ports 80/443. Direct IPs, non-public addresses, IPv6 private/loopback ranges and UDP are rejected. DNS results are validated and pinned for a bounded period. External Wisp endpoints have their own policies and must be trusted by the operator.

Site code is rewritten by experimental Scramjet and runs in proxy frames on this application's origin. This does not provide the security isolation of native browser profiles. Workspaces share a cookie jar; they separate organization, not identities. No VPN, anonymity or fingerprint-protection claim is made.

Preferences, bookmarks, browsing history, saved sessions and reading notes stay in browser storage. Backups contain saved article text and notes, and are plaintext. Backups exclude the login password and site cookies. Diagnostics omit complete page URLs/query strings, credentials and response bodies; they include destination hosts, timing/status and aggregate server/transport information.

The app cache only stores bounded, explicitly public static assets, not HTML, authenticated responses, APIs or video/audio streams. The server-provided source ZIP excludes `.env`, dependency directories and build caches. Preserve the license/attribution files and regenerate corresponding source after changes.

For findings, use the supplied contact https://t.me/emp29. Report the version and reproduction steps without credentials or private backups. Production dependency advisory checks passed at the recorded build time; no independent security audit has been performed.
