# Dashboard redesign

2026-10-13 | 1.1.0-beta.1 | Schema 1 | Local build for browser review

## What changed and why

Your herd now gives a first-time farmer a clear starting point: a friendly greeting, six large snapshot tiles, seven quick actions, Today checks, a prominent animal search, recent animals and five recent records. Earthy theme tokens, rounded cards, local line SVG icons and generous touch targets keep the interface in the Manley Farms family. Dark and sunlight themes remain available. Motion respects reduced-motion preferences.

The dashboard uses the shared withdrawal evaluator. Meat hold, milk hold and needs-a-check counts include departed and archived animals, and may overlap. Unknown timing and unresolved instructions remain holds. Detailed contributors and all existing safety language remain available under All hold details and recorded intervals. The plain-language hold explanation is available through the question-mark disclosure. Last backup means user-confirmed backup, not a download request.

Guided forms adapt the existing animal, calving, treatment, weight, move, breeding, pregnancy and departure forms. Their original collection, draft persistence, validation and commitWorkflow calls remain authoritative. Ordinary weights still use the existing indexed appendWeight path. There is no parallel write implementation. Required and common questions appear one at a time, followed by a review screen exposing all optional fields and duplicate/parent review controls. Clinical forms have more questions because instruction and timing data must remain explicit. Back retains answers; Cancel returns home; Enter advances questions. Native invalid events expose the failing question and announce errors. Dates and breeding service date default to today. Group selections reuse the most recent recorded membership when available. Treatment timing and withdrawal durations are not guessed.

Demo cattle live in manley_herd_records_demo, with their own dataset ID and dataset-scoped drafts. Real records stay in manley_herd_records. A persistent DEMO banner identifies every demo screen. The demo has its own terms acknowledgment. Users can return to real records or delete only the practice database. Demo backup, import, report and export panels are unavailable to prevent practice exports being mixed into real records. Switching clears pending backup/restore state and refuses dirty forms.

## Screen-by-screen

- Your herd: greeting, six clickable tiles, optional welcome, seven quick actions, Today and Find an animal side by side on wide screens, then recent activity and detailed hold disclosure. Phones use two-column snapshot and action tiles; Today and Find stack vertically. Desktop uses six compact snapshot tiles and four action columns.
- New herd: three steps to add an animal, record something and back up. Optional Try it with sample cattle opens the isolated demo. Existing landing introduction, public beta notices and terms acknowledgment remain intact.
- Quick animal picker: Type a tag or name searches the existing paged query. At most 25 matching cards render. Narrow the search to find animals beyond those first 25. Breeding also offers a pregnancy-check choice.
- Guided question: large input, question count, progress dots, Back and Next, original warnings and persistent save/error status. Optional fields appear on final review. Treatment durations, original timing, instructions, and departure review remain explicit.
- Review: all original fields are available before Save record. Saves retain the existing atomic transaction semantics. Calving retains draft recovery, twins and linked birth weights.
- Today: a clock-review warning when required, aggregated missing-information checks, up to five individual hold reminders with farm-zone release date/time, and an external-backup reminder. Links open original animal or clock review screens. The aggregate tile provides access to all holds, beyond the bounded Today list.
- Recent animals: four visited or recently involved animals, falling back to a four-row paged query. This list is session-local, not new schema data.
- Recent activity: five records using the existing bounded events selection. Treatment undo opens the existing audited void flow requiring reason and hold review. Animal records link to the existing correction form. Other record types retain their existing history behavior without invented undo writes.
- Backup and settings, reports, detail screens and the landing introduction retain their existing behavior. Demo transfer panels instead explain the isolation rule.

## Verification

- npm test: **385 passed, 0 failed, 0 skipped**. Includes all 373 prior tests and 12 new dashboard tests. Release tests now expect 1.1.0-beta.1.
- npm run test:scale: **1 passed, 0 failed** with 10,000 animals, 500 active animals and 250,000 historical records. New dashboard-model check confirms full evaluator coverage and bounded attention items.
- Scale timings in the Node/fake-indexeddb proxy: launch 3,119 ms; dashboard model 709 ms; common search 12 ms; ordinary committed weight p95 0.331 ms; full backup 4,590 ms; full restore 37,864 ms. These are data/model timings, not browser rendering or phone latency.
- node scripts/build-pwa.mjs regenerated 34 hash-verified local shell assets. Schema remains 1. No dependencies, remote assets or analytics were added.
- Evidence: dashboard-test-results.txt, dashboard-scale-results.txt and the existing scale runner's phase6-performance.json output.

The application already loads a validated full snapshot at launch. This update does not introduce another database-wide read or store new derived records. Dashboard searches use existing paged searchAnimals queries; recent activity uses events with limit 5; rendered attention and animal cards are bounded. The original full-snapshot architecture and full-history validation for multi-record saves remain. The scale check does not establish DOM latency or a paged-storage architecture that the existing app does not have.

## Claude browser checks

No browser checks were performed here, as requested. Do not treat DOM tests as visual acceptance.

At **390px**, and also **320px**, check fresh landing and terms, empty welcome, populated home, all seven quick actions, keyboard opening, progress dots, Back, Enter, review and errors. Check that original treatment and departure warnings remain readable during every question. Clinical guides intentionally take more questions than basic calf or weight entry. Verify twins rebuild the guide while preserving both calves and the local draft. Confirm no unexpected save occurs before final review.

At **1280px**, inspect the six snapshot tiles, action grid, Today/search columns, focus order, long tags, long reasons and the detailed hold disclosure. Verify every tile's filter, including departed holds and year-of-birth filtering, and confirm the last-backup tile opens the existing backup panel.

In **sunlight**, inspect contrast, all warnings, focus rings, enabled/disabled controls, input values and the thin SVG icons. Also check dark mode, reduced motion, 200 percent zoom, VoiceOver/TalkBack names and announcements, and sticky controls with a phone keyboard.

Check demo terms, global DEMO banner, every demo action, return to real data, blocked transfer panels, delete/recreate and another open demo tab blocking deletion. Verify real data is unchanged throughout. Demo mode is session-local; reopening the app starts with the real database.

Check treatment undo requires the original evidence and review. Verify elapsed recorded intervals never appear as clearance. Let holds expire with the dashboard visible, resume the app and inspect refreshed counts. Derived refresh preserves a dashboard containing keyboard focus; check focus retention and refresh behavior closely.

Repeat the existing offline shell/install/update checks with the regenerated inventory. Capture new screenshots at 390px and 1280px for empty, populated and sunlight dashboards plus a treatment guide. README screenshot notes identify these as pending, not completed.

## Intended commit messages

1. feat(dashboard): add friendly herd snapshot quick actions and daily checks
2. feat(forms): guide existing herd workflows through accessible questions
3. feat(demo): isolate removable practice cattle from real herd records
4. test(dashboard): verify counts guided saves isolation and scale behavior
5. docs(release): prepare 1.1.0-beta.1 dashboard guide and browser handoff

No git commands, deployment, network access or browser automation were used. All changes remain local for Claude's review and release work.

## Polish pass

2026-10-13 | Local only, release remains 1.1.0-beta.1

- Expanded the isolated demo to 18 animals in three pastures: named cows, a bull, steers, heifers and four calves born this year with linked mothers and birth weights. Rosie and two steers have weight histories for daily gain. Added breeding, pregnancy check, a six-animal pasture move and one sale through the existing workflow saves. The original three-animal demo upgrades while retaining its animal IDs. Reopening the populated demo does not seed duplicate records.
- Sample treatment dates use the day the demo is created. Exactly one animal has a timed active meat hold, one family milk cow has a timed active milk hold, and one animal needs a check because the treatment time is missing. The shared evaluator drives Today. The missing-time animal also counts in meat holds, as required by the existing conservative safety rules. Invented sample instructions are clearly marked DEMO ONLY and are not real treatment guidance.
- Recent activity now shows five farmer-facing sentences with local icons and relative dates. Births, weights, treatments, breeding, pregnancy checks, sales and grouped pasture moves appear; identity, identifier and system revision rows do not. Candidate selection is bounded per event type. The Events tab and full technical records are unchanged. Treatment undo still opens the original evidence and hold-review flow.
- Removed the second dashboard demo banner. The persistent banner has a heading, separate explanation and spaced action row. Return remains primary; Delete demo herd uses a transparent secondary danger style. Existing action groups and dashboard grids retain explicit spacing.
- Added numbered progress and dots to the animal picker. Selected-animal forms continue at Step 2 with the same total; adding an animal begins at Step 1. Review is included in the step count. Back, validation and existing save paths remain intact.
- Simplified quick-action labels for parents, breeding, treatment dates, who gave a treatment, shot location and wait times. Dashboard language uses pregnancy check and recorded wait times. Original safety notices, timing requirements and audited undo wording remain intact. No em dashes were introduced.
- Verification: 392 tests passed, zero failures or skips. Seven added regression tests cover sample content, isolation and legacy upgrade, hold timing and expiry, readable activity, picker progress, banner and button hierarchy, and plain copy with safety wording retained. Precache rebuilt with `node scripts/build-pwa.mjs`: 34 local assets. The 10,000-animal, 250,000-record scale test also passed, including lossless backup and restore. Test output is in dashboard-test-results.txt and dashboard-scale-results.txt.

No git, deployment or network access was used. No new browser visual acceptance is claimed for this pass.
