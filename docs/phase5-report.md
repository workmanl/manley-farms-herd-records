# Phase 5 report

Date: 2026-10-12. App version: 0.5.0. Schema: 1. Local only.

Phase 5 ownership and reports are implemented on the existing layers. **345 Node tests pass, zero failures.** No browser launch, print check, Git commit, push or deployment was attempted. Claude owns the requested browser/print checks and local commits.

## What was built

| Area                 | Result                                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSV export           | Canonical quoted UTF-8/CRLF output for all 14 entities, stable immutable IDs and foreign keys, compact nested JSON cells, explicit dates/units, reversible apostrophe formula protection. Full exports retain archived, voided and revision rows.                                                                                                                     |
| Export sets          | Full set of 14 tables, `csv-manifest.json` and `data-dictionary.md`. The dictionary bundles the exact Phase 1 CSV contract and schema. Entity/date-filtered exports contain explicit filters, date basis, scope and row counts in their companion manifest.                                                                                                           |
| Templates            | Downloadable canonical headers for every store, independently checked against the frozen CSV contract text.                                                                                                                                                                                                                                                           |
| CSV import           | Multi-file staging, source-column mapping with target types/constraints, explicit formula mode, ISO/MDY/DMY dates, decimal convention, weight/dose/withdrawal unit defaults and source time zone. Preview shows canonical converted rows, errors, generated UUID mapping, same-ID conflicts, warnings and prospective current/event-time holds.                       |
| Import decisions     | Identical immutable IDs skip. Conflicting IDs require keep-current or audited correction with a reason and clinical hold review where applicable. New rows can be explicitly skipped. Duplicate tags require review and never merge animals. Duplicate farm IDs/RFID and unresolved foreign links block validation.                                                   |
| Atomicity            | Complete related sets validate together, including calving/weight and course/treatment cycles. One confirmed transaction checks the unchanged opening dataset and commits all changes. Failure leaves no partial rows. Public preview mutations cannot alter the private staged plan.                                                                                 |
| Advanced CSV restore | Operation, metadata and revisions are accepted only in a validated complete canonical set. Manifest/count/identity/history checks precede the existing merge/replace preview, conflict handling, consent rules and verified current-backup gate.                                                                                                                      |
| Backup reminders     | First saved work, then unbacked changes after the configured interval, default seven days. Checked on launch, resume and refresh after saves. Backup now requests JSON; Snooze records a one-day delay. Restore replacement retains the preexisting backup-and-verify gate. A pre-upgrade callback displays the backup reminder and can defer before schema mutation. |
| Backup receipts      | Export requested remains separate from user-confirmed saved backup and read-only file verification. Confirmation atomically rejects live data changes since the download request. Historical CSV imports create an audit receipt so old timestamps cannot hide new unbacked work.                                                                                     |
| Reports              | Accessible previews and browser Print / Save as PDF for treatment log, calving book by inclusive dates and season label, and individual animal card with retained history. Operation, range, generated UTC time, farm zone, units and legends are visible.                                                                                                            |
| Print rules          | Report-only area, black text on white, bordered tables, repeated headers, avoid split rows where practical, landscape treatment pages, and the exact supplied disclaimer in a fixed repeated footer with reserved margins. Current unresolved holds and historical departure warnings remain visible.                                                                 |
| Switching away       | Locally bundled five-step guide covering verified JSON/all CSV/dictionary, printed comparisons, two locations and backup cadence, destination mapping/reconciliation, and retained runnable source served over HTTPS/localhost.                                                                                                                                       |
| Reports tab          | Functional report, export, import and switching controls. Backup & Settings links to them. Imported content is rendered as text throughout. No runtime dependency, remote asset or new store was added.                                                                                                                                                               |

## Tests and evidence

Command: `node --test tests/*.test.js`.

| Result                      |     Count |
| --------------------------- | --------: |
| Total                       |       345 |
| Passed                      |       345 |
| Failed / skipped / canceled | 0 / 0 / 0 |
| Existing suite              |       285 |
| Added Phase 5 tests         |        60 |

Evidence: [phase5-test-results.txt](phase5-test-results.txt). The shell integration test was also extended to verify functional Reports routing, the first-work reminder, and preservation of an unsaved form across resume.

Tests cover every entity's exact field round trip and template header, a complete validated 14-table CSV restoration, ordinary all-entity imports with reciprocal relationships, leading-zero tags/long identifiers, Unicode, commas, embedded quotes/newlines and formula-looking text. Validation covers malformed CSV, explicit escaping, mapping, duplicate IDs, unknown parents, omitted existing-ID fields, conflicts, clinical review, generated-ID reuse, explicit skip, current-snapshot confirmation, full-set restrictions and inconsistent revision histories.

The mid-commit test injects a quota-like failure on the second animal write after the first has been queued, then compares every live store with the unchanged pre-import snapshot. Additional tests exercise private plans, stale previews, one-time confirmation, unchanged identical imports, old-timestamp imports, reminder interval/snooze boundaries with injected clocks, atomic backup confirmation, deferred schema upgrade, report row/range/unit/hold assembly, footer/CSS packaging and rendered import controls with script-shaped text. All 20 existing withdrawal oracle tests still pass.

Node syntax checks and `git diff --check` pass. The app remains vanilla ES modules with development-only fake-indexeddb and jsdom. DOM tests do not establish browser pagination, rendering or real-device acceptance.

## Interpretations and operational details

- Full CSV sets are explicit downloadable file links, one per canonical file, rather than a ZIP dependency or a browser-dependent burst of automatic downloads. Download all 16 files into one folder. JSON remains the authoritative integrity-checked backup; CSV never claims a source checksum.
- New imports may omit common metadata and nullable fields. Canonical exports always include every field. Required domain values stay required, with limited documented defaults such as unknown sex and date-only historical treatment precision. Existing immutable IDs require all columns to prevent omitted fields from silently clearing values.
- Unit choices fill missing units; they do not overwrite explicit per-row units. Decimal currency values remain strings. Ambiguous timed treatments require explicit UTC/local/offset context accepted by existing validation, not inferred browser date parsing. Nested clinical objects remain contract JSON cells.
- Missing event snapshots require an explicit current-identity confirmation or supplied historical snapshots. Unknown parent IDs remain errors; mapping the source text into damReference/sireReference is an explicit external-parent decision. No tag-based parent or identity guessing occurs.
- New animals receive missing identifier mirrors. Existing identifier/group changes require corresponding dated identifier/membership rows in the same staged import, because silently fabricating their history would be unsafe. Linked corrections still pass the original transition and relationship validators. The existing animal-edit workflow remains available for ordinary interactive corrections.
- Same-ID corrections preserve prior/new values with local revision increments. New canonical historical rows retain their own timestamps and revision values. Complete history imports additionally check that revision endpoints and adjacent supplied history agree with their targets.
- First saved session means the first committed user work, with the reminder shown on the resulting refresh and on later launch/resume. Seed rows, acceptance/clock bookkeeping and snooze-only revisions do not trigger it. Download alone and verification alone do not confirm backup completion. Confirmation requires a matching download from this session.
- “Season” is a report label attached to an explicit date range. There is no invented season entity. Range filters are inclusive. Calving and animal weight displays convert lb/kg while retaining original values and units. Treatment instructions retain their entered units.
- Current holds are calculated from retained source records at preview/print time. A treatment-date filter never hides a current hold from an older dose. Reports explicitly distinguish the filtered rows from the full-history hold section. Voided treatments remain printable but are excluded from current calculations by the existing engine. Historical departure acknowledgment text remains visible.
- Print layout uses named landscape pages and a fixed repeated footer. Actual browser repetition, clipping and pagination are unverified here because browser and print checks were explicitly assigned to Claude. Long records may split when they cannot fit one page despite the avoid-split rule. No browser guarantee is claimed.
- No production schema upgrade exists in this phase. The new pre-upgrade callback runs before writes and supports safe deferral/export. Phase 6 must connect its update UI to the backup gate when an actual new schema ships. The existing destructive-upgrade backup requirement and recovery snapshot remain intact.

## Browser and print handoff

Use synthetic records. Check Reports and Backup & Settings at 320px, 390px and desktop, 200% zoom, keyboard navigation and screen-reader labels. Exercise file selection, mappings, each date/decimal/formula choice, generated-ID downloads, error correction, duplicate decisions, clinical review, stale previews and atomic confirmation. Verify full-set download links and advanced merge/replace flow, saved-backup mismatch handling, reminder launch/resume/snooze and unsaved-form retention.

Print all three reports over multiple pages in the intended Chromium, Safari and Firefox targets. Confirm the exact disclaimer and operation/range/time context on every page, no clipped footer/content, repeated table headers, landscape treatment orientation, white background and black text, and hidden navigation/forms/donation controls. Include long notes, Unicode, leading-zero tags, twins/stillbirths, archived/voided rows, sold animals and unresolved holds. If an engine fails to repeat the fixed footer reliably, implement and verify explicit pagination for that engine before release, as required by the supplied disclaimer specification.

## What remains for Phase 6

- PWA manifest, scoped service worker, complete local precache including the new modules/dictionary/guide, install/update coordination and truthful offline readiness.
- Real browser/print and physical-device acceptance, storage/eviction behavior, keyboard/assistive technology/zoom and sunlight-field testing.
- Large-history performance profiling, including CSV staging/full set size, report pagination and the 500-active-head/long-history targets.
- A real schema-upgrade UI and matching backup confirmation if a future release introduces a schema change; none was introduced here.
- Release archive/manual packaging, clinical/BQA field review and attorney review of the existing draft notices. No certification or launch approval is claimed.

## Intended logical commits

1. `feat(csv): add portable exports and atomic mapped imports`
   - `app/lib/csv.js`, `app/lib/csv-dictionary.js`, CSV portions of `tests/ownership.test.js`.
   - Wire contract, complete sets/dictionary/templates, staged multi-entity previews, explicit decisions and existing transaction/restore integration.
2. `feat(backup): add reminder timing and verified-content confirmation`
   - `app/lib/reminders.js`, `app/lib/database.js`, backup/reminder app integration and tests.
   - First-work/interval/snooze behavior, historical-import receipt, atomic confirmation and pre-upgrade deferral hook.
3. `feat(reports): add print previews and ownership controls`
   - `app/lib/reports.js`, `app/lib/ownership-ui.js`, `app/app.js`, `app/index.html`, `app/styles.css`, DOM/shell/report tests.
   - Three reports, print footer/isolation, CSV UI and offline switching guide.
4. `docs(herd): document Phase 5 verification and local handoff`
   - Version/package files, source page, README, changelog, architecture, this report and test evidence.

Keep all intended commits local. Push and deployment are outside this task.

## Browser and print check (Claude, 2026-10-12)

Playwright render at 320, 390 and 1280: all five tabs. No horizontal overflow, no page or console errors, no external requests. The treatment log prints to Letter landscape PDF (docs/screens/phase5/report-print.pdf) with the operation, range, generated time, zone, units, legend and the full disclaimer footer. Badge updated to Phase 5. The checks ran on an empty herd.
