# Contributing to EMP29 Scramjet

EMP29 is an independent customization of [MercuryWorkshop/Scramjet](https://github.com/MercuryWorkshop/scramjet). Documentation fixes, translations, UI accessibility improvements, reproducible performance data, and bug reports are welcome.

## Report a problem

1. Search [existing issues](https://github.com/solohkemp-tech/EMP29-Scramjet/issues) before opening a new one.
2. Include your operating system, Node.js version, browser, transport (Libcurl/Epoxy), local vs. HTTPS deployment, and exact reproduction steps.
3. Explain the expected and actual result; attach a minimal, sanitized example where possible.
4. Never post credentials, session cookies, private sites, personal data, or unredacted server logs.

**Security vulnerabilities:** Follow [SECURITY.md](SECURITY.md). Do not disclose active vulnerabilities in public issues.

## Pull requests

- Keep changes focused; explain what changed, why, and how it was tested.
- Run relevant checks from the `emp29` directory where feasible: `npm test` and `npm run check`.
- Preserve original copyright, licenses, upstream notices, and **AGPL-3.0-only** corresponding-source obligations.
- If changing generated distributions, document reproducible generation steps and keep source/runtime artifacts in sync.

Organic community feedback, issue reports and GitHub Stars are welcome. Automated/fake traffic and unsolicited mass promotion are not.
