# Phase 3 report

Date: 2026-10-12. App version: 0.3.0. Schema: 1. Local only.

Phase 3 herd workflows are implemented on the Phase 2 foundation. **235 tests pass, zero failures.** No commit, Chromium launch, push or deployment was attempted, following the task instructions. Browser and device verification remain for the next local session.

## What was built

| Area | Result |
|---|---|
| Animals | Create and correct farm ID, visual tag, RFID text, breed, sex, exact/estimated/unknown DOB, local or external parents, status, group/pasture and notes. Corrections require a reason. Former identifiers and complete prior/new revision values remain stored. |
| Search and list | Farm ID, current/former tags, RFID and notes; status, inactive inclusion, sex, breed, age in calendar days, DOB range, dam and group filters. Matching/total counts, clear filters and 25-row pages. |
| Animal card | Identity, parentage, current group and pasture, notes, full dated history, former identifiers, memberships, event snapshots and corrections. Prominent Add calf, Weight, Breeding, Move/Sale, group move and pregnancy-check actions. Treatment is visibly a Phase 4 placeholder. |
| Calving | Fast entry from a dam, tag and sex, farm-zone birth-date default with explicit confirmation, optional weight/ease/sire/notes, twins in one delivery, and stillbirth/died-after-birth outcomes. An untagged calf receives a generated unique farm ID, while missing tag, weight and sex remain unknown. |
| Atomic birth records | Calves, identifiers, one calving and optional reciprocal birth weights commit together through `Repository.mutate`. A linked calf birth-date or parentage correction also corrects its delivery, twin and linked weight dates with revisions, preserving original snapshots. |
| Draft recovery | Versioned local calf draft per dataset and dam, retained on input/change and before commit. Stable delivery UUID recognizes an interrupted save that already committed. Draft deletion happens after commit. Unreadable drafts require explicit discard. |
| Weights and ADG | Birth/weaning/yearling/other weights in lb or kg. Two selected measurements, output-unit selection, endpoints and elapsed calendar days. Exact conversion uses 1 lb = 0.45359237 kg. Missing/same-day/invalid endpoints show “Not enough data.” Negative gain is allowed. |
| Breeding | AI or natural service, local sire or external/semen reference, service date or exposure interval including an ongoing interval, and notes. |
| Pregnancy checks | Date, method including other/unknown, pregnant/open/uncertain result, optional gestation and due date, examiner, linked breeding and notes. Invalid pairings and another animal's breeding link are rejected. |
| Groups and pastures | Create, rename and archive with revision reasons. Individual and batch moves freeze animal IDs and atomically close/open dated memberships. Batch entry displays selected identities. Archived groups retain history and cannot receive new memberships. |
| Movements | Purchase/source, active cull decision, sale, death and other departure, with destination/reason, optional weight, decimal amount/currency, receipt and notes. Departed animals and their records remain. Older departure entries do not overwrite a later recorded status. |
| Events | Chronological retained records, including identifiers, groups, memberships, clinical history imported through the foundation, and revisions. Filter by type/date, with counts and 25-event pages. Complete source values remain expandable. |
| Dashboard | Current counts for active, sold, culled, dead and archived animals, total records, recent activity and a clearly labeled Phase 4 withdrawal placeholder. |

`app/lib/workflows.js` stages workflow commands and provides queries, ADG and drafts. `app/lib/herd-ui.js` renders the screens and submits through those commands. The schema, validation, transaction, revision and backup implementations were retained. The only foundation-module edit is the application-version constant; schema stays at v1 with no migration.

## Test results

Command: `npm test`, which runs `node --test tests/*.test.js`.

Environment: Node.js 22.23.3, npm 10.9.9, fake-indexeddb 6.2.4, jsdom 26.1.0. Both packages are development-only; deployable app modules import no package or remote asset.

| Result | Count |
|---|---:|
| Total tests | 235 |
| Passed | 235 |
| Failed / skipped / canceled | 0 / 0 / 0 |
| Existing foundation/contract tests | 147 |
| Added Phase 3 tests | 88 |

The existing dependency-contract assertion now explicitly permits development-only jsdom and checks all deployable JavaScript modules for connection/injection sinks. No runtime dependency allowance was added.

New tests cover every workflow's valid commits and invalid input, atomic rollback, revisions and stale edits, duplicate identifiers and parent-sex review, pedigree cycles, twins, stillbirth, linked birth corrections, ADG specification cases, calendar-day DST arithmetic, negative gain, search/former tags/leading zeros, age and group filters, pagination including a 500-animal query, group archival and batch moves, source and departure history, malformed drafts, draft recovery and interrupted committed saves.

DOM tests execute the actual rendered form submit handlers, including UI pedigree-cycle rejection, focused errors, numeric input modes, safe text rendering, selected batch previews and no early success/double submission. A shell integration test executes `app.js`, accepts the gate, creates an animal through nested routing and saves sunlight mode through Settings before navigating back to Animals. A post-commit view-refresh error is explicitly reported as committed, preventing a false “Not saved” message.

Full output: [phase3-test-results.txt](phase3-test-results.txt). Module syntax checks and `git diff --check` passed. The original fixture and 14-store schema tests still pass. These are Node and DOM checks, not browser rendering or real IndexedDB-engine acceptance tests.

## Field UX decisions

- Keep the Farm Records palette, system fonts, 48px primary controls, 8px action spacing, 16px form text, visible focus, explicit labels and responsive single-column fields. Forms and record details wrap long identifiers and text for narrow widths.
- Sticky Save / Save and next actions use safe-area padding. Very short viewports release the sticky panel into normal flow to leave room for entry with a keyboard. Save and next opens another entry for the current animal/dam, or another new animal.
- Save status is persistent and announced with `aria-live`. Controls disable while committing. Failures preserve values and focus the status message; success is announced only after the mutation promise resolves. Navigation focuses the new screen heading.
- Calf entry keeps weight, outcome, generated-ID override, sire and notes behind labeled details. The date-confirmation checkbox starts unchecked again after draft recovery. The documented local ease scale is 1 unassisted, 2 easy assistance, 3 difficult assistance, 4 surgical delivery, 5 abnormal presentation, plus unknown, with no registry-equivalence claim.
- Age filters explicitly use calendar days and the displayed farm-zone date. Unknown DOB is excluded from age/date filters; estimated DOB participates and stays labeled on the card.
- Duplicate-tag and parent-sex review are explicit, unchecked acknowledgments. Farm IDs and current RFID cannot be duplicated. Current tags and parent options show identities for review.
- Settings persists dark, sunlight or system mode through the existing operation record. Sunlight mode applies across screens. Fixed white secondary-link text and pale keyboard-focus outlines on the light theme. Calculated representative contrast ratios are 4.86:1 for white/brand buttons, 11.48:1 for dark card text, 14.75:1 for sunlight card text and 7.42:1 for sunlight links. This is not a claim of full WCAG conformance.
- Dates are explicit calendar dates. Monetary entry remains decimal text, preserving the foundation's currency-precision checks. Tags and RFID never pass through numeric coercion.

## Phase 4 boundary

Treatment entry, vaccinations, courses, batch treatments, clinical corrections and the full meat/milk withdrawal evaluator remain Phase 4. Implement the supplied withdrawal oracle, current/event-time departure calculations, unknown/prohibited/manual conditions, clock high-water review, visible-minute/resume recalculation and persistent departure warnings without removing historical acknowledgments.

For this phase, every new departure explicitly presents the Phase 4 limitation and requires acknowledgment plus intended destination, including an explicit “Unknown” when appropriate. Both stored commodities are conservatively marked `needs-review`; retained treatment IDs and the displayed warning are preserved. This is a manual-review placeholder, not a calculated event-time result. No departure or empty dashboard is presented as clearance.

CSV, printable reports, backup reminder prompts, service worker/install/update coordination, large-history profiling, clinical/legal launch review and public release remain their later phases. Calf drafts are local convenience state and are excluded from JSON backups. One draft per dam is supported; concurrent editing of the same unsaved dam draft in multiple tabs is not a collaborative editor.

## Browser handoff

No browser layout, 200% zoom, touch-keyboard, VoiceOver/TalkBack or physical-device acceptance is claimed. The existing screenshots document Phase 2 only. In the next permitted local session, verify Phase 3 at 320px, 390px and desktop widths in dark and sunlight modes. Walk through animal create/correct, a recovered twin/stillbirth draft, weight ADG selections, natural exposure and pregnancy checks, batch moves and sale acknowledgment. Check horizontal overflow, sticky actions with a keyboard, focus after errors, reload recovery, another-tab stale corrections and explicit inactive inclusion. Use only synthetic data. Keep the work local.

## Intended logical commits

No Git write was attempted. Suggested local commit boundaries:

1. `feat(herd): add transactional workflows, history queries and calf drafts`
   - `app/lib/workflows.js`, the version constant, `tests/workflows.test.js`.
   - Animal/identifier/membership and event commands, linked birth correction, ADG, search, history and draft helpers.
2. `feat(ui): add herd screens and accessible field entry`
   - `app/lib/herd-ui.js`, `app/app.js`, `app/index.html`, `app/styles.css`.
   - Gated routing, list/card/events/dashboard, entry forms, draft recovery and sunlight fixes.
3. `test(herd): verify Phase 3 forms and document local handoff`
   - `tests/herd-ui.test.js`, `tests/app-shell.test.js`, updated contract test, package manifests/lock, source page, README, changelog, architecture, this report and test evidence.
   - Development-only DOM tooling and complete local verification/handoff documentation.

Commit locally after browser review. Do not push or deploy under this task's authorization.

## Browser check (Claude, 2026-10-12)

Playwright render at 320, 390 and 1280: Dashboard, Animals and Events. No horizontal overflow, no page or console errors, no external requests. Screens are in docs/screens/phase3/; the script is tests/render-check-phase3.mjs. Follow-up for phase 4: on phones the Animals filter panel fills the first screen, so collapse it behind a Filters toggle.
