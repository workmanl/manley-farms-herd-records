# Wave 2 local candidate: Easy at the chute

Version: 1.4.0-beta.1. Date: 2026-10-13.

## Changes

- Home puts Find an animal and four add actions ahead of the backup card, herd totals and history. More holds the other work.
- A fixed 56px bottom bar has Home, Animals, Add and Backup. Add includes all quick actions and the existing group treatment form. Events and Reports remain available through More and Home links.
- The site header is a non-sticky 56px bar. Returning users do not see the public introduction above their work. The offline chip says Works offline only after the worker confirms readiness.
- Treatment uses six grouped answer screens, animal selection and a sentence review. Dose and unit stay together. Meat and milk each have their own screen and heading. The original field names, validators, withdrawal engine and commit path remain in use.
- Now uses the farm clock. Earlier today clears the time for entry. Pick a day and time keeps an editable time field. Clock offsets are derived from the farm zone. A repeated hour requires a first/second choice. A missing clock time is rejected. Changing a repeated time clears its prior choice. Opening a correction preserves its saved timing.
- Same as last time is an explicit tap for product, dose unit, route, site and person. It never copies dose amount, animal or timing. Meat and milk each have a separate tap that shows the old product, state, number, unit and source. A different product blocks that suggestion. Vet-directed release and resolution fields are excluded from reuse.
- Preferences and the last treatment use the existing versioned device key, with storage failures caught. Demo saves do not update real-herd treatment suggestions. No IndexedDB store or schema changed.
- Field labels and option text use plain words in copy.js. Raw instant, date-only and withdrawal codes are mapped to words. The farm clock is a city picker. Human dates replace technical clock strings in holds and printouts. Day-only dates keep their entered day across zones. Full record JSON in history is behind For helpers.
- Long clinical safety notices remain available under Why. The terms introduction, full terms, terms hash and legal checkbox wording are unchanged. A short first-run summary sits above them.
- Errors appear within forms with alerts. Guided forms do not use reportValidity or native validation bubbles. Reviews use sentences and keep Back available.
- Saves name the animal and say Saved on this phone. The app holds the banner for six seconds. Change it goes directly to the audited treatment correction or animal correction where available. Other record types go to the existing Reports/CSV correction tools. No alternate record writer or hard-delete path was added.
- Backup has Normal, Large and Extra large text choices at 17, 19 and 22px. This is a device preference. Both themes and all existing offline assets remain bundled.

## Screen counts

Counts include animal selection when used and the final review. Optional details do not add Next screens. Before counts were reconstructed from the original guide's required/essential-field list against the same local forms. The treatment count agrees with the recorded UX audit.

| Flow | Before | After |
| --- | ---: | ---: |
| Add an animal | 10 | 10 |
| Weight | 7 | 4 |
| Move pasture or group | 6 | 4 |
| Single calving | 9 | 4 |
| Treatment | 26 | 8 |
| Breeding | 6 | 6 |
| Pregnancy check | 6 | 6 |
| Sold or died | 7 | 7 |

Starting from an animal page skips the selection screen. Extra details and twins remain available. No claim is made that a producer has met the 30-second weight or 90-second treatment target.

## Local checks

- npm test: 463 of 463 unit tests pass. The full output is recorded in wave2-test-results.txt.
- Existing withdrawal oracle cases, fixtures, correction history, recovery, backup, move-origin and offline-worker tests still run in the full suite.
- New tests cover grouped/full-form treatment equivalence across every rule state and both timing precisions, an actual guided save, correction timing preservation, repeated and skipped hours, quarter-hour zones, explicit wait acceptance, mismatched products, storage failure, flow budgets, work order, text preferences, copy lint detectors and mapped labels/options.
- Copy lint checks jargon, raw option codes, parenthetic labels, long sentences, a heuristic reading grade and long dashes. It covers the new copy vocabulary and mapped fields. It is not proof that every composed sentence or farmer-entered value reads at grade 6. The complete rendered-copy audit is still an acceptance check below.
- tests/ui-rules.mjs is syntax checked and expanded to both phone sizes, both themes and Normal/Extra large. It checks navigation geometry, launch action visibility, text size, overflow, each grouped field's scroll position above the action bar, screen budgets and review safety wording. Browser execution was not performed in this local-only task.
- node scripts/build-pwa.mjs regenerates the inventory. node scripts/release.mjs builds dist/herd-origin and dist/moved plus the ZIPs and checksums. Release tests check read-only moved behavior and origin-specific inventories.
- Runtime connection scan: only the existing service-worker fetch for local static assets remains. No new outside request or dependency was added.

## Remaining release gates and limits

No git commands, network access, staging, live upgrade check or deployment were performed. These are assigned to Claude by the task.

The roadmap requires owner and veterinarian/BQA review before releasing changed treatment wording. No such review is claimed here. Existing clinical rules, the complete clinical notice and legal terms remain intact. Packaging this candidate is not clinical sign-off or permission to deploy.

The broad grade-6 requirement needs a complete rendered-copy sweep, including old recovery, import, conflict and helper screens. The local lint coverage is narrower than that requirement. Treat this as an open acceptance item, not a verified all-copy pass. The existing CSV correction tools also remain more involved than a one-screen edit for weights and other non-treatment events.

Real-phone installation, share sheets, VoiceOver, TalkBack, sunlight, gloves and timed producer tasks remain untested. No easiest/best claim is added. No later-wave features or schema work were included.

## Claude browser checklist

1. Stage the herd-origin output on its own test origin. Run `node tests/ui-rules.mjs STAGED_URL OUTPUT_DIR`. Inspect all screenshots at 390x844 and 320x568, both themes, 17px and 22px.
2. Confirm the unscrolled Home shows search and all four main actions. Check the 56px bar, focus, thumb reach, 48px targets, gaps and no horizontal scroll. Tap all four destinations. Check More, Events and Reports.
3. Walk all eight guides. Inspect every grouped field by scrolling its pane. Check Back, Enter, optional details, twins and the review. Treatment must total eight screens; weight, move and single calving four.
4. Record a treatment in the synthetic herd. Test Now, Earlier today, a chosen past time, both repeated-hour choices and a skipped hour. Day-only history must still need review. Inspect the actual saved fields and holds.
5. Save another treatment. Confirm blank wait values before any tap. Tap Same as last time and prove wait fields remain blank. Inspect and separately accept each displayed wait suggestion. Change the product and prove the old wait button cannot copy its answers. Test zero wait confirmation and vet review states.
6. Check errors with keyboard and screen reader. Confirm no native bubbles, named questions, announced errors and focus on each new heading.
7. Save each record type. Confirm tag, six-second banner and Change it destination. Treatment and animal changes must retain audit history. Check the existing CSV correction route for other events.
8. Audit all rendered copy, including first run, help, imports, conflicts, recovery, reports and errors. Exempt unchanged legal text and farmer-entered text from the reading score. Inspect For helpers disclosures. Do not count the vocabulary lint as a full copy audit.
9. Change text size, reload, and verify it persists. Repeat 320px reflow checks at Extra large. Check both themes and sunlight contrast.
10. Stage the moved output at its expected path and run the checker with `--moved`. Verify search, history, reports, save-copy and restore handoff work, all entry paths stay read-only, and the snapshot is unchanged.
11. Obtain the roadmap's owner and vet/BQA wording review. Run the live upgrade gate using the prior-release synthetic profile, then follow the established deploy/update/check sequence. Require exact seeded fields, expected version/schema and no page errors. No clear-storage workaround.
12. On iPhone and Android, reopen offline, inspect installed/tab behavior and run the screen-reader and field checklist. Record timed tasks and help requests before claiming the chute speed targets.

## Intended commit messages

- `feat: put herd work first with bottom navigation and device text sizes`
- `feat: group treatment entry and require explicit reuse of wait answers`
- `fix: show plain labels, farm clock times and clear save feedback`
- `test: cover wave 2 flow budgets, timing safety and phone navigation`
- `release: prepare 1.4.0-beta.1 dual-origin builds and wave 2 handoff`

These are proposed messages only. No commit, tag or push was made.

## Fold fix

Moved the offline/update panel after main work. Its compact summary remains visible; installation guidance, long failure text and update controls live inside closed details. At 17px Home shows all seven quick actions. At 19px and 22px it shows four plus More, with live text-size changes refreshing the layout. Tightened launch spacing while keeping 48px search and 56px action targets. Restored the header logo, which Wave 2 CSS had hidden; its relative `images/logo.png` URL stays within the app base and is bundled in both release outputs.

Added unit coverage for status placement, closed failure details and larger-text actions, and browser assertions for logo loading, visibility and base-path resolution. All 465 unit tests pass. Both required build and release scripts succeed at 1.4.0-beta.1. The local served UI check could not start Chromium: the sandbox denied its Mach-port registration before any page loaded. The alternate in-app browser is unavailable. The 320x568 and 390x844 visual matrix therefore still needs a browser run; no passing geometry result is claimed. No git, deployment or network access was used.

## Fit at 320 x 22px

Moved the question heading inside the scrolling fields pane for every guided flow. Duplicate label text is visually hidden while its wrapping label continues to name the control. Grouped questions retain distinct field labels. The tag/group question now says "What date did this tag and group start?" Guided labels replace identifiers, membership, effective, precision, administration and offset with plain words.

Step changes, initial layout and control focus scroll the active control into view. At heights up to 650px, the action bar uses 48px buttons, hides the initial "Not saved." line and reduces status spacing. Claude's saved-text-size Home fix remains intact. Added unit coverage for question placement, duplicate-label hiding, accessible labels and plain wording. All 466 Node tests pass. The PWA build and local release packaging succeed at 1.4.0-beta.1.

Attempted the full UI matrix against dist/herd-origin using HERD_SERVE_DIR. Chromium failed before loading a page because the sandbox denied macOS Mach-port registration. The 320x568 geometry assertions therefore remain unverified in this session. No deployment, commit or version change was made.
