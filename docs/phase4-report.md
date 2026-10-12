# Phase 4 report

Date: 2026-10-12. App version: 0.4.0. Schema: 1. Local only.

Health and the withdrawal dashboard are implemented on the existing validation, transaction, revision, backup and herd layers. **285 tests pass, zero failures**, including all 20 withdrawal oracle cases. No browser launch, commit, push or deployment was attempted. No runtime dependencies or remote assets were added.

## What was built

| Area | Result |
|---|---|
| Treatment entry | Animal, local administration date/time and precision, original zone and explicitly selected UTC offset, product/vaccine, lot/serial, expiry, dose/unit, route/site, reason, administrator and label/veterinarian reference. Instant input rejects DST gaps and requires an offset for repeated hours. Date-only history remains explicit. |
| Commodity instructions | Independent meat and milk rules with duration, unknown, not-applicable, prohibited and manual-review states. Blank is not zero. Zero requires an unchecked confirmation. Entered units are retained; calculations normalize days to 24 hours. Documented veterinarian-directed release is available for unknown/manual-review only. |
| Courses | Start an open course with an administration, add completed doses, review and close with the latest nonvoid final dose, or reopen with evidence. Open applicable courses stay in Needs review. Earlier longer instructions remain controlling when applied from the final dose. |
| Batch treatment | Preview recipients by farm ID, confirm selection, then create individual records/snapshots with a shared UUID in one commit. Changing selection resets confirmation. New courses are individual to each selected animal. The command layer also supports animal-specific existing course IDs. |
| Corrections and voids | Explicit reason, reviewer, evidence reference and confirmation; complete prior/new values retained by the existing revision system. Voiding a final dose reopens the course in the same transaction. No history is deleted. |
| Withdrawal engine | `app/lib/withdrawal.js`, pure and deterministic with explicit clock input. Exact millisecond comparisons, minute-ceiling display, latest commodity release, review precedence, directed release evidence, future-input flags, sold/archived inclusion and persistent stored departure warnings. |
| Dashboard | Leads with Meat hold, Milk hold and Needs review counts. Each animal appears once per category; categories overlap. Tag/farm ID, group/pasture, status, products, last administration, controlling release and remaining time are shown. Expand contributing records and instructions. Exact supplied notice, calculation timestamp/zone and local terms link included. |
| Clock and refresh | Transactional high-water observation, sticky backward-clock flag and audited explicit reset. Launch, resume, mutation/import and visible-minute recalculation. Ticks update derived panels, retain expanded contributors and leave unsaved forms intact. No tick updates to the status announcer; panels use aria-live=off. |
| Departures | Current and conservative event-time preview before sale, intended destination and acknowledgment required. Stores event-time statuses/contributors and warning text. Source-record or farm-zone changes invalidate stale saves. Known Phase 3 placeholders are recomputed with original acknowledgment values preserved in revisions. |
| Animal workflows | Treatment action enabled, treatment/hold history visible, course controls, correction/void links and shared-engine withdrawal filters. Phone filters start collapsed through 650px with a Filters toggle and active-filter count; desktop filters stay open. |

Schema 1, its 14 stores, indexes, backup envelope and original sample fixture remain unchanged. Existing backups use the same import path. New directed-release checks reject releases before a known relevant administration rather than displaying an elapsed interval.

## Test results

Command: `npm test`, which runs `node --test tests/*.test.js`. Development-only fake-indexeddb and jsdom remain the only package dependencies. Evidence: [phase4-test-results.txt](phase4-test-results.txt).

| Result | Count |
|---|---:|
| Total tests | 285 |
| Passed | 285 |
| Failed | 0 |
| Skipped / canceled / todo | 0 / 0 / 0 |
| Prior suite | 235 |
| Added tests | 50 |
| Primary numbered oracle cases | 20 |

Two prior placeholder expectations were updated to implemented behavior: the shell now shows Meat hold, and an untreated departing animal has No recorded interval rather than the Phase 3 blanket Needs review value. The remaining existing assertions continue to pass.

### All 20 oracle cases

Every numbered row is an independent named Node test in `tests/withdrawal.test.js`, asserting meat state/release/countdown, milk state, overlapping counts, calculation timestamp/zone and unchanged input. Companion tests cover mutation and boundary assertions.

| Case | Oracle behavior | Status |
|---|---|---|
| 01 | 48-hour interval, still held one minute and one millisecond before release | PASS |
| 02 | Exact release and one millisecond after are Recorded interval elapsed | PASS |
| 03 | Repeat closed course anchors both administrations to final dose | PASS |
| 04 | Open course remains Needs review despite elapsed prior interval | PASS |
| 05 | Latest product controls; earlier elapsed contributor stays expandable | PASS |
| 06 | Five-day meat interval and 36-hour milk interval are independent | PASS |
| 07 | Unknown meat/milk override known elapsed interval; counts 1/1/1 | PASS |
| 08 | Confirmed zero differs from explicit not-applicable; missing confirmation rejected | PASS |
| 09 | Prohibited use never times out; directed-release shortcut rejected | PASS |
| 10 | Date-only unresolved; reviewed correction preserves prior missing time | PASS |
| 11 | Six milkings remain a non-time condition, with independent elapsed meat | PASS |
| 12 | Documented veterinarian release resolves unknown timing; incomplete evidence fails | PASS |
| 13 | Spring DST uses 24 elapsed hours; nonexistent input rejected | PASS |
| 14 | Fall DST uses 24 elapsed hours; both repeated-hour offsets are explicit | PASS |
| 15 | Leap day preserved; invalid non-leap date rejected | PASS |
| 16 | Backward clock review is sticky, survives reopening and needs audited reset | PASS |
| 17 | Shortening requires review; prior/new values, reason and undo correction retained | PASS |
| 18 | Reviewed void removes only its calculation; other product controls and history remains | PASS |
| 19 | Date-only sale stores event-time hold despite current elapsed result; alert persists | PASS |
| 20 | Longer earlier course instruction controls; unresolved conflicts and independent milk hold covered | PASS |

The supplied 12-animal fixture evaluates at 2026-10-12 12:00Z to **6 meat hold / 1 milk hold / 5 needs review**, exactly as specified.

Additional tests cover a failure injected during the second batch treatment write, rollback with no partial records, invalid recipients/rules, course final-dose validation, correction/void review enforcement, stale batch/sale previews, audited placeholder recomputation, whitespace versus zero, farm-zone departure boundaries, future completed-dose rejection, safe rendered treatment forms, tick announcements/expanded details, sale preview acknowledgment reset, batch selection confirmation and filter toggle/count behavior. Module syntax and Git whitespace checks also pass.

## Rule interpretations

- A day is exactly 24 elapsed hours. Positive time rounds upward to whole minutes only after exact comparisons. A hold of 48 hours from 2026-10-01 10:00Z releases at 2026-10-03 10:00Z and is held one minute before.
- Same-course durations need not match. All apply from the latest final administration, preserving the maximum. An actual instruction conflict is recorded explicitly as manual-review with its text; the engine does not attempt to infer veterinary conflicts from prose. Reviewed corrections document reconciliation.
- Empty retained courses have no known commodity applicability or final dose, so they conservatively produce review in both commodities. Not-applicable-only recorded commodities stay outside hold counts, including during a clock warning.
- Historical departures evaluate the earliest instant of the farm-zone calendar day. Same-day completed doses remain included conservatively; later-date doses are excluded from event-time contributors. The recording clock is separate from the historical evaluation time, avoiding false backward-clock detection. Current results use all retained treatments.
- Phase 3 placeholders are recognized by their original notice prefix. They receive an audited correction, retaining the original acknowledgment timestamp, destination and prior complete notice in revision history. Recalculation uses the retained treatment records; it does not invent a new human acknowledgment. Other historical acknowledgment warnings are preserved.
- All treatment corrections and course state changes require review, even when the proposed arithmetic would lengthen a hold. This follows the existing conservative clinical-edit gate. Corrections retain original identity/group snapshots.
- No physical schema migration is needed. Derived results are recomputed, not stored as independent clinical truth. Clock bookkeeping writes are serialized against current metadata; explicit resets create revisions.

## Browser handoff and remaining work

Claude will perform browser checks and local commits. This phase claims Node storage and DOM interaction verification only. Check 320px, 390px, 650px and desktop layouts, dark/sunlight themes, 200% zoom, keyboard/focus and screen-reader behavior. Walk through single and batch entry, date-only history, repeated DST-hour input, course closing/reopening, shortening/void review, sale preview/date changes, imported placeholders, backward-clock review, minute/resume refresh and phone Filters behavior. Confirm no horizontal overflow, remote requests or console errors. Use synthetic data only.

Phase 5 remains CSV import/export and templates, backup reminders and verification/merge/replace workflow completion, treatment log/calving book/animal-card print reports, and the switching-away guide. Reuse the engine and preserve unresolved and historical departure warnings in reports. Do not treat structural backup validation as clinical review. Phase 6 still owns PWA installation/update/offline readiness, physical-device/accessibility acceptance and scale testing. Clinical and legal launch review remain the existing release gates.

## Intended logical commits

1. `feat(health): add pure withdrawal engine and complete oracle coverage`
   - `app/lib/withdrawal.js`, `tests/withdrawal.test.js`.
   - Commodity precedence, course arithmetic, elapsed-time boundaries, clock/departure results and the 20-case oracle.
2. `feat(health): add audited treatment workflows and departure integration`
   - `app/lib/health.js`, `app/lib/database.js`, `app/lib/validation.js`, `app/lib/workflows.js`, `tests/health.test.js`, `tests/workflows.test.js`.
   - Atomic batches, courses, corrections/voids, clock review, stale-preview guards and legacy placeholder reconciliation.
3. `feat(ui): add withdrawal dashboard and health entry screens`
   - `app/lib/health-ui.js`, `app/lib/herd-ui.js`, `app/app.js`, `app/styles.css`, `app/index.html`, rendered UI/shell tests.
   - Dashboard, treatment/course/sale forms, minute/resume refresh, animal history and responsive Filters toggle.
4. `docs(herd): document Phase 4 verification and local handoff`
   - Version/package files, source page, README, changelog, architecture, this report and test evidence.

No Git write was attempted. Keep all commits local; push and deployment are outside this task.

## Browser check (Claude, 2026-10-12)

Playwright render at 320, 390 and 1280: Dashboard (withdrawal panel), Animals and Events. No horizontal overflow, no page or console errors, no external requests. Screens are in docs/screens/phase4/. The header badge was corrected from Phase 3 to Phase 4. The screenshots show an empty herd; a populated walk-through comes in phase 6 device testing.
