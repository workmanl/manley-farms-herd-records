# Manley Farms Herd Records

Free, local cattle records for one operation per browser profile. This repository contains **Phase 5, ownership and reports**, version 0.5.0, schema 1. CSV exports and imports, backup reminders, treatment/calving/animal print reports and the switching-away guide build on the existing herd, health and backup layers. It is local only.

**345 Node tests pass**, including all 20 withdrawal oracle cases and 60 new ownership/report tests. Browser checks, print checks and local commits are handed off to Claude and were not attempted in this phase. Nothing was pushed or deployed. See the [Phase 5 report](docs/phase5-report.md).

## Free forever

The official app is intended to remain free and donation-supported, with no account, subscription, paid tier or herd-size gate. No donation link or public source URL has been invented for this local build. AGPL permits commercial use and charging for compliant forks. Your herd records remain yours.

## Run locally

No build step, runtime package install, CDN, backend or remote asset is required. Serve the deployable `app/` directory:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory app
```

Open <http://127.0.0.1:8765/>. Use a stable localhost port and browser profile to retain the same origin and records. Double-clicking `index.html` with a `file://` URL is unsupported. Hosting elsewhere requires HTTPS and the complete `app/` directory unchanged.

The first ordinary use requires the unchecked acknowledgment to be selected and its receipt to commit locally. The bundled copy is **a draft for a lawyer's review, not legal advice or approved production terms**. Terms, source/license, export and recovery remain accessible without acceptance. The acknowledgment does not restrict the AGPL license grant.

## Offline readiness and browser support

All assets and data logic are local, but this phase has no service worker, manifest, install flow or offline cache guarantee. It does not display “Ready offline.” Those arrive in Phase 6. Serving the files locally works without an internet connection.

Requires ES modules, IndexedDB, Web Crypto, `structuredClone`, and modern `Intl` APIs including `supportedValuesOf`. Chromium, Safari, Firefox and Edge are intended targets. Real-browser, installed-context and physical-device acceptance remains outstanding. Automated tests use Node.js, fake-indexeddb and jsdom, not an actual browser rendering engine.

## Privacy and storage

Records live in IndexedDB `manley_herd_records`. Unsaved calf drafts use versioned, dataset-and-dam-scoped localStorage keys. Drafts are separate from committed records and are not included in JSON backups. A separate `manley_herd_records_recovery` database retains the most recent pre-migration snapshot. No herd fields are uploaded, no analytics are included, and a Content Security Policy blocks outgoing connection requests from the app shell. Serving the page still involves ordinary local or hosting asset requests.

Data is not encrypted by the app. Device/profile access and other scripts with the same origin can expose it. Browser clearing, private mode, eviction, device loss and software errors can destroy records. Persistent-storage permission reduces some eviction risk; it does not guarantee retention. There is no cloud recovery copy or automatic sync.

## Withdrawal and disclaimer

This is a recordkeeping tool, not veterinary, legal or regulatory advice. It has no drug database. Enter withdrawal instructions from the applicable label or your veterinarian and verify the actual records before making animal or product decisions. The app does not certify compliance or authorize slaughter or milk sale. It is not certified by BQA or any authority.

Records stay in your browser on your device unless you export them. You are responsible for verified backups outside the browser. There is no cloud recovery copy or guarantee against data loss. See the bundled [Terms of Use and Disclaimer](app/terms.txt) for storage limits, assumption of risk, warranty and liability notices.

The dashboard leads with separate Meat hold, Milk hold and Needs review counts. Counts overlap and retain sold/archived animals. It shows “Recorded interval elapsed,” never a clearance claim. Expand an animal to inspect contributing treatments. Record each commodity's instructions explicitly; blank is not zero, and zero needs confirmation. Date-only entries, open courses, unknowns, prohibited use and unresolved conditions require review. A detected backward clock change stays flagged until an audited operator review.

Treatment corrections and voids preserve original values with a reason and hold review. Batch treatment previews fixed recipients, then saves their individual records in one transaction. Before a departure, inspect current and conservative event-time results, record the intended destination and acknowledge the notice. Historical departure warnings remain in history. Phase 3 placeholders are recomputed with their original acknowledgment retained in revision history. See [Phase 4 report](docs/phase4-report.md) for interpretations and validation. Backup verification is not clinical review.

## Back up, verify and restore

1. Open **Backup & Settings**, download JSON and save the file outside this browser. A download request is recorded separately from your explicit confirmation that a file was saved.
2. Select the file under **Verify a backup**. It checks the exact envelope, checksum, counts, field types, IDs and references without changing any live store. Verification does not claim authenticity.
3. To restore, select a file and choose **Replace** or **Merge**, then preview. No records change during preview or cancellation.
4. Replacement requires downloading the exact current dataset and selecting that saved file for verification. It then commits the staged incoming dataset in one transaction. A stale preview, validation problem, quota or transaction failure leaves the original committed records intact.
5. Merge skips identical records. For each conflict choose current or incoming explicitly, with a correction reason for incoming values and hold-review evidence for clinical changes. Revalidate the choices before committing. No timestamp wins automatically. Incompatible relationships remain blocking errors instead of being silently discarded or matched by tag.

Replacement preserves imported terms receipts as history but clears active acceptance. Merge preserves only this browser's active acceptance and combines historical receipts. Imported backup receipts are cleared in active metadata. Metadata adjustments have separate revision rows. The synthetic fixture, restored at its fixed evaluation clock, needs no metadata adjustment and round-trips exactly.

Reminders appear after the first saved work, then when unbacked changes exist and the configured interval (default seven days) has passed. They are checked on launch, resume and after saves. Backup now requests a JSON download; Snooze delays the reminder one day. Confirming a saved backup checks that the downloaded content still matches live records. Verification stays read-only.

Keep an additional copy in a second location under your control. Rehearse restoration in a spare browser profile. Do not clear a failing browser's storage. Recovery mode is read-only and offers raw-record and pre-migration downloads for investigation with a compatible source release. Raw recovery artifacts are deliberately labeled separately from verified backup envelopes.

## Switching away

Open **Reports** for the locally bundled five-step switching guide, CSV tools and print previews. Export all 14 CSV tables, the scope manifest and the full data dictionary into one folder. Retain immutable IDs and foreign keys. The export uses quoted UTF-8 cells and reversible apostrophe formula protection. Standalone entity exports include an explicit scope manifest and are not complete backups.

For CSV import, choose one or more related tables, map columns, choose formula protection, dates, decimal convention and missing units, and preview. Review generated IDs, every row error, duplicates, same-ID conflicts, current-identity snapshot choices and prospective holds. Re-preview decisions, check the confirmation and commit once. New animal imports generate their identifier mirrors; corrections to existing identifiers or memberships require their related history rows in the same staged set. Full canonical sets, including operation, metadata and revisions, use the advanced merge/replace restore path and the existing safety-backup gate. Unknown parent links remain errors or explicit external references.

Print the treatment log, calving book by dates/season label, and individual animal card from accessible previews. Reports retain unknown holds and departure warnings. The treatment report uses landscape print styling; all reports contain the supplied disclaimer footer. Browser pagination and repeated-footer acceptance are pending Claude's print checks.

Keep a verified full JSON backup and this runnable source checkout. Copy exports to two locations under your control, compare counts and sample records, and rehearse restoration in a spare browser profile yearly. Back up after major work sessions and keep quarterly CSV archives. Map animals before dependent events in the destination system and reconcile parentage, weights and withdrawal instructions. Serve a retained release archive over HTTPS or localhost to restore JSON. No universal third-party importer compatibility is promised.

## Data and tests

See the [data dictionary](docs/data-dictionary.md), [architecture](docs/architecture.md), [synthetic sample fixture](tests/fixtures/sample-herd.json), [Phase 2 report](docs/phase2-report.md) [Phase 3 report](docs/phase3-report.md) [Phase 4 report](docs/phase4-report.md) and [Phase 5 report](docs/phase5-report.md).

```sh
npm ci
npm test
```

`fake-indexeddb` and `jsdom` are development-only dependencies. Neither is imported by the app. Node.js 22 or newer is recommended for the test environment. Tests cover schema/index contracts, structural and relational constraints, atomic rollback, stale revisions, append-only corrections, migration success/failure, backup verification, merge/replace and acknowledgment receipts. Phase 3 tests also exercise rendered forms, pedigree-cycle rejection, calf drafts and twins, weight conversion, search/paging, dated batch moves, breeding/checks, departures and app-wide theme persistence. Phase 4 adds the 20-case withdrawal oracle, boundary/DST/leap-day tests, health transactions, injected batch-write rollback, sticky clocks, sale previews and rendered health/filter controls. Phase 5 adds all-entity CSV round trips, mapping/conflict/atomicity checks, reminder timing with injected clocks, backup confirmation races, report assembly, print-footer packaging and rendered import/report controls. The test-only v2 migration is never imported by the deployable app.

To repeat the requested render checks when Chromium can launch:

```sh
npx -y playwright@latest install chromium
npx -y playwright@latest screenshot --browser chromium --viewport-size '390,844' --wait-for-timeout 1200 --full-page 'http://127.0.0.1:8765/#backup' docs/screens/backup-390x844.png
npx -y playwright@latest screenshot --browser chromium --viewport-size '1280,900' --wait-for-timeout 1200 --full-page 'http://127.0.0.1:8765/#backup' docs/screens/backup-1280x900.png
```

## Contributions, support and releases

Use plain ES modules, accessible HTML, local assets and synthetic data. Add migration and rollback fixtures for schema changes. Do not attach real herd records to public bug reports. Clinical changes require producer and qualified veterinary/BQA review before release. A public repository, verified contact route and public issue templates are not yet established.

Future release gates include test completion, actual browser/device checks, clinical and attorney review, a tagged source archive, matching static assets and a changelog. No production readiness, deployment or browser certification is claimed here. See [Phase 5 report](docs/phase5-report.md) for intended local commits and the browser/print handoff.

## License and warranty

Copyright (C) 2026 Scott Manley. Code and covered project documentation are licensed under **AGPL-3.0-only**. See [LICENSE](LICENSE), especially sections 15 and 16 on warranty and liability. The software is provided as is to the extent permitted by law. The official app is free and donation-supported. The license permits commercial use subject to its terms. Your herd records remain yours.

The complete, unmodified GNU AGPL v3 text is also bundled in `app/LICENSE`. System font fallbacks are used; no font or artwork license is implied. `fake-indexeddb` (Apache-2.0) and `jsdom` (MIT) are development tooling and are not bundled in the deployed app.
