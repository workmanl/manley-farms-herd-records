# Contributing

Thank you for helping farmers keep dependable records. Use [GitHub issues](https://github.com/workmanl/manley-farms-herd-records/issues) and pull requests through the maintainers via GitHub. Read [SECURITY.md](SECURITY.md) for private vulnerability reporting and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community expectations.

Use synthetic cattle only. Never upload real herd backups, names, destinations, clinical records or identifying screenshots. Include app version, browser/OS, steps, expected and actual behavior and a minimal redacted or synthetic example. Flag data-loss and withdrawal defects prominently. A backup checksum is not a clinical review.

## Development

Use Node.js 22 or newer, `npm ci` and `npm test`. Run the separate `npm run test:scale` when performance changes warrant it. Serve locally with `node scripts/serve.mjs`. The app is vanilla JavaScript ES modules, semantic HTML and local CSS/assets, with no runtime dependencies or build step. Do not introduce remote scripts, fonts, telemetry or record uploads.

Keep language clear for farmers. Do not use em dashes. Controls need labels, keyboard access, visible focus, adequate contrast, 48px touch targets and narrow-screen/zoom support. Test both themes and do not rely on color alone. Render imported values as text and preserve CSV formula protection.

Data changes must preserve stable IDs, references, revisions and committed records. Use transactions for related writes. Schema changes require sequential migrations, old-backup fixtures, rollback/recovery and stale-tab tests. Never silently reset storage, delete history, treat blank as zero or overwrite conflicts by timestamp. Keep application and schema versions separate.

Withdrawal or treatment changes need independent producer and qualified veterinarian/BQA review before release. Add concrete boundary, repeated-dose, unknown, prohibited, open-course, clock and commodity tests as applicable. Recorded interval elapsed is never clearance. Do not add unverified certification or endorsement claims.

After changing any app asset, run `node scripts/build-pwa.mjs` and `npm test`. Update relevant documentation and changelog. Describe the problem, resulting behavior, validation and any remaining review gates in the PR. Use the supplied template. Contributions retain AGPL-3.0-only terms; no CLA granting proprietary relicensing is required.

## Upgrade and Wave 1 review

Read [docs/release.md](docs/release.md) before preparing a release and [docs/wave1-report.md](docs/wave1-report.md) for the current browser checklist. Seed a synthetic record on the old release in a throwaway persistent Playwright profile before updating. After the authorized update, run check against the same base URL and profile. Exact record fields, store contents, database version, app version and zero page errors are required. A mismatch exits 1 and stops the release. `scripts/release.mjs --upgrade-check BASE_URL PROFILE_DIR OUT_DIR` runs this gate before packaging; packaging alone is not the gate.

The live smoke script also takes `BASE_URL OUT_DIR`. Browser checks cover 390x844 and 320x568, both themes, every guided step, all three backup lights, sharing and download fallbacks, cancelled shares and weekly storage retries. The Playwright pin is new; the maintainer must install it and complete its lockfile entries before `npm ci` can be used for this release.
