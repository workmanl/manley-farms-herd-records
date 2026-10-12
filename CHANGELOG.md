# Changelog

## 0.3.0 / 2026-10-12 / schema 1 / local only

- Added animal create/correct, former identifiers, pedigree links/references, dated memberships, search, filters and paging on the Phase 2 transaction layer.
- Added atomic calf/twin/stillbirth entry, interruption recovery and linked birth corrections, weights and unit-aware calendar-day ADG, breeding and pregnancy checks.
- Added group/pasture create/rename/archive, individual and batch moves, source/cull/sale/death/departure records, full dated history and Events filters.
- Added current herd counts, explicit Phase 4 treatment/withdrawal placeholders, sticky field actions, validation/save focus and sunlight contrast fixes.
- Extended Node coverage with workflow, DOM form and shell integration tests. Runtime remains dependency-free; jsdom is development-only.
- No Chromium launch, Git commit, push or deployment attempted. See docs/phase3-report.md for results and local handoff.

## 0.2.0 / 2026-10-12 / schema 1 / local only

- Added the 14-store IndexedDB foundation with exact indexes, strict structural/relational validation, atomic writes and optimistic revision checks across tabs.
- Added append-only correction history, identifier/group transition validation, v1 initialization and a test-only v2 migration with retained snapshots and recovery mode.
- Added canonical SHA-256 JSON backups, read-only verification, previewed merge/replace and staged atomic restoration.
- Added the Farm Records app shell and functional Backup & Settings, persistent-storage reporting, sunlight/system themes and local draft-terms acknowledgment.
- Bundled the complete AGPL-3.0-only license, exact disclaimer copy, synthetic fixture and data dictionary.
- Browser screenshots and local Git commits remain blocked by environment permissions. No push or deployment occurred. See the Phase 2 report for test counts and limitations.

No animal entry, clinical dashboard, CSV, report generation, service worker or install flow is claimed in this release.
