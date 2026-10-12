# Phase 6 report

2026-10-12 | App 0.6.0 | Schema 1 | Local only

Phase 6 is implemented on the existing layers. **367 standard Node tests and one separate full-scale test pass**, with no failures or skipped tests. No browser check, commit, push or deployment was attempted. Claude owns browser verification and local commits; Scott owns physical-device acceptance.

## What was built

- Manifest with stable `/tools/herd-records/` ID, scope and start URL, standalone display, Farm Records colors, local regular SVG/192px/512px PNG icons and a separate 512px maskable PNG. The simple barn/H artwork uses only local geometry. System fonts avoid external font requests.
- A service worker with a release-hash cache name qualified by application and scope. Its generated inventory covers all 30 app files other than the self-referential inventory program. Every response must match SHA-256 before the release is staged. The inventory program is an installed worker dependency. Shell, terms, license, source page, field help, icons and every runtime module are available locally.
- Scoped cached navigation fallback and cache-only inventoried assets. Other origins, sister-app paths, non-GET and non-inventory requests are untouched. No cache deletion exists, including older Herd Records caches. Records remain in IndexedDB; calf drafts remain in their existing localStorage keys.
- Ready offline appears only when an installed/active worker answers a complete cache hash check. Deletion, corruption, failed installation and incomplete staging cannot claim readiness. Checks recur on resume.
- Install guidance for iOS Safari Share / Add to Home Screen, Android Chrome, desktop Chrome/Edge, Mac Safari and ordinary Firefox use. The cached field guide explains preparation, entries, backup/restore, context separation and recovery.
- Online-gated registration/update checks. Update when ready is offered only for a complete waiting release. The worker coordinates scoped tabs, requests unanimous readiness, verifies the client roster again and activates. Dirty forms, persistent calf drafts, active operations, restore previews and unresponsive older tabs defer. Ready tabs freeze during coordination; a veto/timeout unlocks them. Reload requires the matching preparation token and activated worker state, with no unconditional controllerchange reload.
- Schema-changing releases require selection and validation of a saved current backup. A release/schema/content-hash receipt is rechecked while tabs are frozen and the existing pre-upgrade gate checks it against the source snapshot. Sequential migration, durable recovery snapshot and transactional abort remain in the foundation; a post-migration read verifies persisted records before ordinary use. Production stays schema 1 and introduces no migration transform.
- Backup/restore progress for reading, validation/checksum, preview and every 2,000 staged writes. Final completion follows transaction completion. Fixed an existing restore-preview call that supplied an extra argument in the restore-mode position.
- Accessibility fixes, paged withdrawal categories, deterministic fixture generation and scale optimizations described below. No runtime dependency or schema/index change was introduced.

## Verification

| Suite | Passed | Failed | Skipped |
|---|---:|---:|---:|
| `npm test` / `node --test tests/*.test.js` | 367 | 0 | 0 |
| `npm run test:scale` / `node --test tests/scale.perf.mjs` | 1 | 0 | 0 |

The standard suite retains all 345 earlier tests, including the withdrawal oracle, migration rollback, restore safety and atomicity cases, and adds 22 cases. New checks cover manifest/icon validity, exact inventory and byte hashes, scope isolation, interrupted downloads, cache readiness/corruption, unanimous update coordination and veto, dirty form/draft gating, offline startup without update requests, browser guidance, resource URL/request audit, computed contrast, labels/zoom/reduced-motion rules, fixture determinism, bounded activity ordering, launch snapshot consumption, indexed weight validation and transfer progress.

Evidence: [standard test output](phase6-test-results.txt), [scale output](phase6-scale-results.txt), [machine-readable timings](phase6-performance.json). Node syntax and `git diff --check` pass. Service-worker tests execute the real worker source in a Node harness with fake clients and CacheStorage. They do not establish browser lifecycle behavior. No Playwright or real-service-worker acceptance is claimed.

The resource audit finds zero third-party request URLs or remote runtime imports. The unmodified AGPL license and embedded data dictionary retain inert reference URLs, and SVG retains its namespace URI. These strings are not network requests. CSP permits same-origin assets and worker installation; application data modules contain no fetch, beacon, socket or upload path. Real network inspection remains on the browser checklist.

## Twenty-year fixture and performance

Environment: Node v22.23.3, macOS arm64, fake-indexeddb 6.2.4. These are **Node proxies**, not Android, browser painting or filesystem durability measurements.

The deterministic generator produces 10,000 lifetime animals, exactly 500 active, and 250,000 events: 160,000 weights, 40,000 breedings, 25,000 historical date-only treatments and 25,000 revisions. Event dates span 2006-10-13 through 2026-10-12. Identifiers and singleton records are additional. Revisions retain before/after values; historical treatments deliberately retain unresolved timing. No real herd data is used.

| Measurement | Final time | Budget / interpretation |
|---|---:|---|
| Fixture setup, excluded from launch | 27,720 ms | Test database population |
| Cold repository open through dashboard data | 2,976 ms | 3,000 ms device target; very little proxy margin |
| Common farm-ID search | 3 ms | 300 ms |
| Ordinary committed non-birth weight save, p95 of 20 | 0.337 ms | 500 ms; fake-indexeddb has no disk fsync |
| Full checksum-backed JSON export | 4,418 ms | 60,000 ms |
| Full verified replacement preview and atomic restore | 38,668 ms | 60,000 ms |
| Backup plus restore combined | 43,086 ms | Below 60,000 ms even combined |
| Independent re-export/checksum comparison | 5,842 ms | Exact count and checksum match |

Launch includes repository open, full dataset validation, clock observation, withdrawal evaluation and recent-activity selection. It excludes DOM rendering. Search operates on the loaded snapshot, as the UI does. Save includes workflow preparation and actual transaction completion; it excludes subsequent UI refresh. Restore includes verification, private staging, target safety backup and atomic write, but excludes human file selection and review. The fixture setup is outside all acceptance timings.

Initial launch was 4,006 ms. Optimizations group relational/withdrawal lookups by animal, cache immutable shape declarations and validated time zones, update clocks using metadata alone, combine launch validation/clock/snapshot into one transaction and select bounded recent activity without sorting the entire history. Withdrawal categories now page 25 animals, retaining full counts and all archived/departed holds. The independent non-birth weight path validates shape and every foreign key in one bounded transaction and retains duplicate/recovery guards. Calving, treatments, corrections and other multi-record workflows continue to use the original full-dataset transactional validation. **Their scale p95 is not established by this weight-save benchmark.** Do not generalize this result to all saves or to Android storage.

CPU-heavy serialization/validation still runs on the main thread. Progress is phase-based and per-write during commit; Node does not prove continuous animation or responsive device rendering during those phases. Real-device profiling, especially other save types and peak memory, remains necessary.

Commands:

```sh
npm test
npm run test:scale
node scripts/generate-scale.mjs /tmp/herd-twenty-year.json
```

The generated JSON is raw fixture stores, not an integrity-backed backup envelope. The scale test uses the production export/restore APIs to create and verify actual backup envelopes. It runs separately because setup and round trip take about 80 seconds and allocate hundreds of MB.

## Accessibility findings and fixes

| Finding | Fix / evidence |
|---|---|
| Pale review/error colors could remain on sunlight cards | Both states now use a theme-specific error token and text labels |
| Color values scattered across selectors | Shared link, focus, error and button-ink tokens; computed tests read CSS variables in both themes |
| Long-history dashboard could render thousands of cards | 25-row category/departure/elapsed pagination with explicit names, full counts and focus returned to the page label |
| Form errors had visible text but no programmatic association | Forms describe their status; failed fields receive error descriptions, native invalid fields receive aria-invalid; failed saves keep focusable persistent summaries |
| Reduced-motion preference was not explicit | Animation/transition removal and automatic scrolling override under reduced motion |
| Long labels/fieldset minimum widths risked narrow layouts | Zero minimum flex/grid widths, wrapping controls/headings/legends, narrow fieldset padding and existing single-column layout |
| Countdown refresh could replace focused withdrawal controls | Derived refresh preserves a panel containing keyboard focus; calculation time remains visible |
| Status noise risk | Periodic withdrawal panels remain aria-live=off; transfer percentages are labeled rather than live-announced; offline/update status uses polite announcements |

Computed minimum normal-text contrast across ink/muted/warning/error/link against background/card is **8.67:1 dark** and **6.93:1 sunlight**. White brand-button text is **4.86:1**. Minimum border/focus contrast against page/card surfaces is **4.28:1 dark** and **4.39:1 sunlight**, above the 3:1 control threshold. The tested text pairs exceed 4.5:1, including large text's lower 3:1 threshold.

Static controls have accessible names; dynamic forms continue the existing explicit-label helpers. Primary targets remain at least 48px, form text 16px, and zoom is unrestricted. Source/DOM checks establish the rules and associations, not WCAG certification. Actual 320px layout, 200% zoom, keyboard obstruction, touch, VoiceOver and TalkBack remain browser/device checks.

## Release maintenance and local hosting

Run `npm run pwa:inventory` after any app edit. The checked-in output runs without a build step. For forks: `HERD_BASE_PATH=/your/path/ node scripts/build-pwa.mjs`. Keep the deployment directory aligned with the manifest path. Use `node scripts/serve.mjs` for localhost at the production path. Uploads/deployment were not performed.

The cache version is derived from all inventoried asset bytes, including the service worker. Mixed files fail verification instead of installing a partial release. Future schema changes must update the schema declaration in the inventory generator and PWA module and provide sequential migrations. Old caches are retained intentionally; automatic cache retention cleanup is not implemented.

## Scott's real-device checklist

Record exact OS/browser versions, device model, available storage and whether each test uses a browser tab or installed app. Use synthetic records and preserve a verified backup before testing recovery.

- **iPhone Safari:** open online, wait for Ready offline, Share > Add to Home Screen, then verify the installed context's herd. Check VoiceOver, 320px-equivalent reflow, text zoom, safe-area controls, keyboard overlap, sunlight theme and one-handed calf entry. Repeat storage/backup tests in both Safari and installed contexts.
- **Android Chrome:** repeat installation, browser/installed record checks and TalkBack. Use a documented midrange device for cold offline launch, search, 20+ saves across calf/treatment/weight workflows, full backup/restore timing, memory and progress responsiveness.
- **Desktop Chrome, Edge, Firefox and Safari:** ordinary browser use is required everywhere; install where supported. Check keyboard-only navigation, visible/unobscured focus, 200% zoom, 320px viewport, both themes and reduced motion. Confirm static and dynamic control names and that countdowns do not chatter.
- After Ready offline, enable **airplane mode**, close/reopen and add a **calf and treatment offline**, plus a weight. Confirm Saved on this device, reopen history, calculate ADG and inspect unresolved/known holds. Prepare all three reports without reconnection.
- **Back up offline:** save JSON outside the browser, select it to verify, and explicitly confirm saved. Restore into a spare profile/installed context. Preview counts/conflicts, retain a verified current-records safety backup for replacement, commit, and compare records/revisions/holds. Confirm cancel and failures preserve the original dataset.
- **Update:** stage a changed local release, interrupt one asset download, and prove the old release reopens offline. Retry with a dirty form, a retained calf draft, two tabs, an unresponsive older tab and a newly opened tab during coordination. Activation/reload must defer until every tab is ready. Repeat the test-only migration success/failure scenario with a saved-backup gate and recovery export.
- Inspect real network traffic through install, entry, export, restore, reports and updates. Only local/same-origin shell requests should occur; no herd fields or third-party requests. Confirm Farm Records caches and data are unchanged. Test cache removal separately from database removal and verify that Ready offline disappears when completeness fails.
- Check Letter/A4 multipage reports in at least two print engines, including long notes, unresolved holds, twins, revisions and departed animals. Confirm repeated disclaimer/footer, headings and no clipping. Browser checks with populated data are still required.

## What remains for Phase 7

- Claude's real service-worker/offline/update and populated-browser checks, Scott's physical-device/assistive-technology/field checks, and fixes for any findings.
- Establish real-device save latency for all ordinary workflows, not only the indexed weight path; profile memory and main-thread transfer pauses. General multi-record saves still read and validate full history.
- Producer and qualified veterinary/BQA review of fields, calculation semantics and reports; attorney review of the existing draft terms.
- Release/manual/source archive, checksums, support/contribution/security documentation, tagged-release rehearsal, fork-origin restore and eventual authorized site integration. No public launch approval is claimed.

## Intended logical commits

1. `feat(pwa): add isolated verified shell, local icons and field help`
   - Worker, inventory generator/output, manifest, icons, guide and local path-aware server.
2. `feat(pwa): coordinate safe updates and migration backup gates`
   - PWA client, app integration, receipt checks, post-migration verification and worker/DOM lifecycle tests.
3. `fix(field): improve contrast, error associations and large-history navigation`
   - Theme tokens, motion/reflow/focus rules, form associations, paged withdrawal lists and accessibility tests.
4. `perf(herd): benchmark twenty-year history and bound common queries`
   - Generator, scale suite/evidence, grouped validators/evaluator, launch transaction, recent activity, ordinary weight transaction and transfer progress.
5. `docs(herd): record Phase 6 evidence and device handoff`
   - Version/package files, README, changelog, architecture, this report and test evidence.

All work remains local and uncommitted. Do not push or deploy as part of this handoff.

## Real offline check (Claude, 2026-10-12)

Playwright Chromium at 390x844. app/ is served at https://herd.test/tools/herd-records/ through context routing, which also covers service worker fetches.

- The service worker installed and took control, and the app showed "Ready offline".
- With the network set offline, a reload rendered the full shell (header, nav, dashboard) from the cache.
- No page errors and no external requests.

Script: tests/offline-check.mjs. Screenshot: docs/screens/phase6/offline-390.png. Real phones (iPhone Safari, Android Chrome) are still on Scott's device checklist.
