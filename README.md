# Manley Farms Herd Records

Free, local cattle records for one operation per browser profile. This repository contains **Phase 2, the durable foundation**, version 0.2.0, schema 1. It has not been pushed or deployed. Dashboard, Animals, Events and Reports are placeholders. Backup & Settings is implemented.

Requested screenshots at 390×844 and 1280×900 could not be captured because this workspace blocks Chromium startup. See [render-check evidence](docs/screens/README.md). No screenshot or browser visual verification is claimed.

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

Requires ES modules, IndexedDB, Web Crypto, `structuredClone`, and modern `Intl` APIs including `supportedValuesOf`. Chromium, Safari, Firefox and Edge are intended targets. Real-browser, installed-context and physical-device acceptance remains outstanding. Automated storage tests use Node.js and fake-indexeddb, not an actual browser engine.

## Privacy and storage

Records live in IndexedDB `manley_herd_records`. A separate `manley_herd_records_recovery` database retains the most recent pre-migration snapshot. No herd fields are uploaded, no analytics are included, and a Content Security Policy blocks outgoing connection requests from the app shell. Serving the page still involves ordinary local or hosting asset requests.

Data is not encrypted by the app. Device/profile access and other scripts with the same origin can expose it. Browser clearing, private mode, eviction, device loss and software errors can destroy records. Persistent-storage permission reduces some eviction risk; it does not guarantee retention. There is no cloud recovery copy or automatic sync.

## Withdrawal and disclaimer

This is a recordkeeping tool, not veterinary, legal or regulatory advice. It has no drug database. Enter withdrawal instructions from the applicable label or your veterinarian and verify the actual records before making animal or product decisions. The app does not certify compliance or authorize slaughter or milk sale. It is not certified by BQA or any authority.

Records stay in your browser on your device unless you export them. You are responsible for verified backups outside the browser. There is no cloud recovery copy or guarantee against data loss. See the bundled [Terms of Use and Disclaimer](app/terms.txt) for storage limits, assumption of risk, warranty and liability notices.

Phase 2 preserves and validates treatment fields and correction evidence. It does not display withdrawal calculations, counts, countdowns or clearance claims. Clinical workflows, time-dependent departure warnings and the full withdrawal oracle belong to Phase 4. Do not treat a successful backup validation as clinical review.

## Back up, verify and restore

1. Open **Backup & Settings**, download JSON and save the file outside this browser. A download request is recorded separately from your explicit confirmation that a file was saved.
2. Select the file under **Verify a backup**. It checks the exact envelope, checksum, counts, field types, IDs and references without changing any live store. Verification does not claim authenticity.
3. To restore, select a file and choose **Replace** or **Merge**, then preview. No records change during preview or cancellation.
4. Replacement requires downloading the exact current dataset and selecting that saved file for verification. It then commits the staged incoming dataset in one transaction. A stale preview, validation problem, quota or transaction failure leaves the original committed records intact.
5. Merge skips identical records. For each conflict choose current or incoming explicitly, with a correction reason for incoming values and hold-review evidence for clinical changes. Revalidate the choices before committing. No timestamp wins automatically. Incompatible relationships remain blocking errors instead of being silently discarded or matched by tag.

Replacement preserves imported terms receipts as history but clears active acceptance. Merge preserves only this browser's active acceptance and combines historical receipts. Imported backup receipts are cleared in active metadata. Metadata adjustments have separate revision rows. The synthetic fixture, restored at its fixed evaluation clock, needs no metadata adjustment and round-trips exactly.

Keep an additional copy in a second location under your control. Rehearse restoration in a spare browser profile. Do not clear a failing browser's storage. Recovery mode is read-only and offers raw-record and pre-migration downloads for investigation with a compatible source release. Raw recovery artifacts are deliberately labeled separately from verified backup envelopes.

## Switching away

Keep a verified full JSON backup and this runnable source checkout. Restore on another local/static origin and compare counts and sample IDs before adopting that working copy. CSV export/import, printed reports and the complete switching guide are later-phase work. JSON is the current authoritative lossless format. No universal third-party importer compatibility is promised.

## Data and tests

See the [data dictionary](docs/data-dictionary.md), [architecture](docs/architecture.md), [synthetic sample fixture](tests/fixtures/sample-herd.json) and [Phase 2 report](docs/phase2-report.md).

```sh
npm ci
npm test
```

Only `fake-indexeddb` is a devDependency. Node.js 22 or newer is recommended for the test environment. Tests cover schema/index contracts, structural and relational constraints, atomic rollback, stale revisions, append-only corrections, migration success/failure, backup verification, merge/replace and acknowledgment receipts. The test-only v2 migration is never imported by the deployable app.

To repeat the requested render checks when Chromium can launch:

```sh
npx -y playwright@latest install chromium
npx -y playwright@latest screenshot --browser chromium --viewport-size '390,844' --wait-for-timeout 1200 --full-page 'http://127.0.0.1:8765/#backup' docs/screens/backup-390x844.png
npx -y playwright@latest screenshot --browser chromium --viewport-size '1280,900' --wait-for-timeout 1200 --full-page 'http://127.0.0.1:8765/#backup' docs/screens/backup-1280x900.png
```

## Contributions, support and releases

Use plain ES modules, accessible HTML, local assets and synthetic data. Add migration and rollback fixtures for schema changes. Do not attach real herd records to public bug reports. Clinical changes require producer and qualified veterinary/BQA review before release. A public repository, verified contact route and public issue templates are not yet established.

Future release gates include test completion, actual browser/device checks, clinical and attorney review, a tagged source archive, matching static assets and a changelog. No production readiness, deployment or browser certification is claimed here. See [local completion commands](docs/local-completion.md) for the requested commits blocked by this workspace's read-only `.git` permission.

## License and warranty

Copyright (C) 2026 Scott Manley. Code and covered project documentation are licensed under **AGPL-3.0-only**. See [LICENSE](LICENSE), especially sections 15 and 16 on warranty and liability. The software is provided as is to the extent permitted by law. The official app is free and donation-supported. The license permits commercial use subject to its terms. Your herd records remain yours.

The complete, unmodified GNU AGPL v3 text is also bundled in `app/LICENSE`. System font fallbacks are used; no font or artwork license is implied. `fake-indexeddb` is Apache-2.0 licensed development tooling and is not bundled in the deployed app.
