# Phase 7 report

2026-10-13 | App 1.0.0-beta.1 | Schema 1 | Public beta prepared locally

The local release preparation is complete. **373 automated tests pass**, with zero failures, skips or cancellations. This is a public beta candidate with incomplete clinical, device and legal review. No git command, repository creation, tagging, browser check, deployment or network service contact was performed in this phase. The site checkout was read for patterns and donation destinations, but not edited.

## Changes

- Set package and lockfile versions, the runtime APP_VERSION, visible badge, source guide, changelog and structured data to 1.0.0-beta.1. Backup envelopes use the runtime version. Schema remains 1. Historical release entries and synthetic fixture provenance retain their original versions.
- Precache identity now combines the beta version with the content hash. It is `1.0.0-beta.1:935517afa9eaa46033b9`, retaining byte-based cache isolation and mixed-release rejection. The regenerated inventory covers 31 shell assets, including the new landing module. No runtime dependency or build step was introduced.
- Finalized the Terms of Use and Disclaimer with a public beta notice, effective date October 13, 2026, and terms version `2026-10-13-beta-1`. The complete bundled acknowledgment text matches terms.txt exactly. Earlier acknowledgments do not count for these revised terms; exports and recovery remain accessible before acknowledgment.
- Preserved no-warranty/as-is, liability limitations and mandatory-rights exceptions, assumption of risk, no professional advice/relationship, no certification/endorsement, local-storage/backups, license rights and availability clauses. Strengthened explicit withdrawal compliance responsibility and label/veterinarian instruction duties. Recorded interval elapsed never means safe for slaughter or milk. Added Washington State governing law and severability. The README states that terms are not lawyer-reviewed and Manley Farms is not a law firm; that note is outside the terms text.
- Completed the README, CONTRIBUTING, SECURITY, Contributor Covenant 2.1 conduct policy, four issue templates/config and PR template. Private vulnerabilities route to GitHub Security Advisories, with no invented email. `REPO_URL` remains the required repository placeholder.
- Added static landing copy, Home > Tools > Herd Records breadcrumb, H1/answer, dashboard CTA, withdrawal explanation, operation-specific fit, three-step installation, ownership/backups, all eight FAQs and source/license/donation links. Copy says clinical review and the multi-device field pilot have not been completed. Header/footer links and colors follow the local Manley Farms tools patterns using only bundled CSS and system fonts.
- The introduction is a native details element. It starts open for new users, collapses on opening the app CTA, and collapses during dataset refresh when any non-singleton record exists, including archived animals and event-only data. Metadata and operation initialization alone do not collapse it. Returning records use the existing dashboard route; all introduction and FAQ content stays in the DOM. Terms reacknowledgment still applies where necessary.
- Added meta description, canonical and matching Open Graph URL, plus SoftwareApplication, SoftwareSourceCode and FAQPage JSON-LD. The offer is zero USD, feature claims reflect implemented workflows, and all visible FAQ answers match the parsed schema exactly. No image, rating or review claim is invented. The placeholder must be replaced before public schema/link validation.
- Reused the existing optional Other donation destination from both local Tools and Farm Records pages. It is navigation on explicit action, not a remote runtime resource. No analytics, remote font, shared site script or outside-directory app asset is loaded.
- Added `scripts/release.mjs` and `npm run release`. It validates inventory/version/hash agreement before writing archives through the system zip executable. App bytes are not rewritten. It removes a previous output ZIP before packaging so obsolete entries cannot survive a rebuild. Source exclusions cover node_modules, dist, repository metadata, local tooling/credentials, test-output directories, generated scale fixtures and the Phase 6 scale result/timing artifacts. Generators, scale tests and synthetic sample fixtures remain in the source archive. Symlinks are rejected rather than followed.
- Prepared the Tools card, sitemap URL block and placement notes in `release/site-integration/`. None was applied to the site checkout.

## Verification and artifacts

Commands run locally:

```sh
node scripts/build-pwa.mjs
npm test
node scripts/release.mjs
```

[Recorded test output](phase7-test-results.txt): **373 passed / 0 failed / 0 skipped**. Phase 6 had 367 standard tests. Six new tests cover version agreement, parsed FAQ equality, SEO/schema fields and absence of ratings/images, final terms/protections, introduction collapse, and actual archive content/checksum/exclusion/stale-shell behavior. Existing shell integration and runtime-resource audits were extended. The resource audit distinguishes inert metadata and explicit navigation from automatically loaded resources, while requiring all app resource paths to remain bundled.

The existing PWA tests still prove exact inventory hashes, real worker-source cache completeness/corruption and update coordination using local harnesses. The new packaging test builds in a temporary directory, compares every extracted static entry with its app bytes, checks both archive hashes, retains public dotfiles, excludes simulated private/scale outputs, and rejects a modified help file with a stale inventory. It performs no network access.

Prepared files:

- `dist/manley-farms-herd-records-1.0.0-beta.1-static.zip`: complete unchanged app/ directory; extract and copy its contents to the hosting directory.
- `dist/manley-farms-herd-records-1.0.0-beta.1-source.zip`: runnable source, documentation, license, fixtures and tooling, with the exclusions above.
- `dist/manley-farms-herd-records-1.0.0-beta.1-static-SHA256SUMS` and `dist/manley-farms-herd-records-1.0.0-beta.1-source-SHA256SUMS`: separate checksum files.
- `dist/SHA256SUMS`: both archive checksums for one verification command.

Final local archive inspection confirmed both ZIPs pass `unzip -t`, static paths/bytes match app/, source includes repository templates/docs/report, and source exclusions and external SHA-256 checksums match. Output is ignored in .gitignore.

The scale benchmark was not rerun because there was no data-path or performance change. This phase did not establish browser layout, CSP/structured-data interpretation in a crawler, real service-worker lifecycle, print pagination, assistive technology or physical-device durability. Previous evidence remains identified in the Phase 6 report; it is not new beta acceptance.

## Remaining pre-launch gates and handoff

1. Qualified veterinarian/BQA and producer review of treatment fields, withdrawal semantics and report wording. Resolve any calculation or false-clearance finding. Do not claim approval, certification or endorsement.
2. Multi-device field pilot with real operators, including iPhone Safari, midrange Android Chrome and desktop browser targets. Verify offline calf/treatment/weight entry, storage separation, backups, cross-device/origin restoration, update interruption/coordination, sunlight use and assistive technology. Establish actual save latency for ordinary multi-record workflows and large-history memory/transfer behavior.
3. Lawyer review of the terms, including Washington governing law, identity, enforceability and limitations. No lawyer review has occurred.
4. Staged beta browser checks at narrow/desktop widths and zoom, two-engine Letter/A4 reports, real network inspection, fresh install/offline reopen/update/recovery and isolation from Farm Records. Prepare a synthetic source-archive restore on another origin with the original site unavailable.
5. Create the GitHub repository, replace every REPO_URL placeholder, enable private vulnerability reporting and verify source/security links. Regenerate inventory, rerun tests and repackage after replacement. The current archives contain placeholders and are local candidates, not final publication artifacts.
6. Make the intended commits, tag the reviewed matching release, publish source/static archives and checksums, then apply the prepared site integration and perform the separately authorized FTP deployment. Set sitemap lastmod to the publication date. Verify the live version, offline readiness, backup/export/restore and cache scope. Retain compatible prior release assets and record the deployed commit/version.

## Intended commits

1. `feat(release): prepare public beta version and withdrawal disclaimers`
   - Package/runtime version, beta notices, finalized terms and exact acknowledgment copy, source/help guidance and changelog.
2. `feat(landing): add static herd introduction and search metadata`
   - Static landing/FAQ/schema, header/footer patterns, collapse module/app integration, styles and regenerated content-hash inventory.
3. `docs(community): add contribution security and issue guidance`
   - Finished README, contribution/security/conduct policies and issue/PR templates.
4. `build(release): package verified static and source beta archives`
   - Dependency-free packager, release command/output exclusion, release tests and adapted shell/resource audits.
5. `docs(release): prepare site integration and beta handoff`
   - Site snippets/placement notes, this report and test evidence.

All changes remain local for the release operator’s commits and publication work. No review gate is represented as completed.
