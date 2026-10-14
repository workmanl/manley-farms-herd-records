# Wave 1 implementation report

Prepared locally for 1.2.0-beta.1 on 2026-10-13. Schema remains 1 with the same 14 stores. No git command, network request, dependency install or deployment was performed by the implementation agent.

## What changed

- M2: live-upgrade-check.mjs now accepts a base URL, seeds known values through commitWorkflow, records exact expected values in a receipt, and fails on field changes, missing records, changed stores, wrong database or app versions, missing service worker or page errors. It prints the exact full record. A second fixture profile is supported. Release packaging has an explicit gate option that aborts before creating ZIPs. live-smoke-check.mjs uses the same URL convention and fails on smoke mismatches. Playwright is pinned at 1.56.1. About shows the offline build digest.
- M4: printed terms point to bundled terms.txt. Tests scan every URL printed by all three report types and require a matching app file.
- M5: signup stays by the owner's 2026-10-13 decision. CSP permits only the existing capture endpoint for third-party connections. Privacy text names northwestmediasystems.com. Signup and its footer link are hidden on entry routes. No new network call was added.
- 1.1: Save a copy on Home and Backup uses the existing exportBackup and verifyBackup code. Files are prepared and verified before the tap so navigator.share runs before any await. JSON is tried first, then the same bytes as text/plain, then download. The filename is Herd backup YYYY-MM-DD.json or .txt. Demo exports stay disabled. A resolved share records the existing guarded confirmation receipt. A cancelled share records nothing. Failed or unavailable sharing downloads without claiming a saved copy.
- 1.2: a backup light shows red, yellow or green with words as well as color. A trusted share or read-back check can turn it green only when no newer work exists and the copy is recent. A download marked saved by hand is not proof. The three metadata timestamps stay separate. Counts and a short Why disclosure are shown. Device-local share proof and last-copy counts use one versioned, guarded localStorage key.
- 1.3: persist is requested after the first saved animal and after successful sharing or copy verification. It never runs on page load. Refusals and thrown requests wait a week. Missing, throwing or denied storage APIs cannot undo a record save. Results appear in the backup light. The old storage button now starts a copy, so it follows the same save path.
- 1.4: iPhone and iPad Safari tab detection includes desktop-style iPad agents. Standalone apps and other browsers do not show the warning. The warning gives three Home Screen steps and says the contexts keep separate records. Nothing moves or clears records automatically.
- 1.5: Check my copy compares the verified file with current herd content in one transaction and changes only its check receipt. Bookkeeping fields are excluded from this comparison. Practice a restore builds the existing restore preview, checks the matching copy and never calls commitRestore. Home gives a monthly practice reminder based on device-local state.
- 1.6: backup and restore messages use plain words. Restore conflicts show text fields instead of raw JSON and raw record IDs. All backup, update, mapped CSV and full-set CSV file reads check the 50 MB cap before file.text. New form text and import cells have a 10,000-character cap. Existing stored records and JSON restores keep the unchanged validators, so old long notes remain valid.
- 1.7: guided forms use a flex column with a scrolling question area above an action bar in its own space. Each step scrolls its question into view. Site-header stickiness is disabled during entry. New herds default to Sunlight; existing users keep their theme. Home has a sun or moon theme switch.
- Tests cover share resolve, AbortError, JSON-to-text retry, no share API, canShare false, share failure, guarded receipts, file-byte verification and restore with identical store hashes. Tests also cover every backup color, storage retries, Safari agent combinations, practice preview, old and damaged copies, large-file rejection without reads, old long notes, both-theme guide behavior, report URLs, CSP, signup hiding and deliberate upgrade-gate failures.

## Local verification

- npm test: 436 tests passed, zero failures.
- node scripts/build-pwa.mjs: 45 local assets, release 1.2.0-beta.1:9bdb7fd503bbcfbd8112.
- Syntax checks passed for app/app.js and all three browser-check scripts.
- Network-source scan finds only the existing service-worker asset fetch and the existing opt-in signup. No herd upload path was added.
- persist appears only in device-safety.js, called through saved-animal or copy paths. No request runs at startup.
- The em-dash scan found no matches in app, docs, tests, scripts, README, CONTRIBUTING, CHANGELOG or package files.
- Backup-copy lint checks short sentences, forbidden technical labels and an estimated Flesch-Kincaid grade at or below 6 for the new primary safety messages.

## Not done and why

- The origin move kit and moving banner are excluded until Scott chooses the origin. M1 hosting changes, origin isolation and HTTP response headers are outside this local repo task. Export and restore pieces are ready to reuse.
- Playwright and browser binaries were not installed because this task forbids network and npm install. package-lock.json has the new release version but still needs Playwright dependency entries from Claude's authorized install. Do not run npm ci before completing that install and lockfile update.
- No browser screenshots, native share sheets, live update test or real-device checks were run. Claude owns those checks. Chromium cannot prove iPhone behavior. Safari storage, iPhone and Android sharing, VoiceOver, TalkBack, gloves and outdoor use are untested on devices. No best or easiest claim is made.
- This is Wave 1. Full treatment-flow shortening, all-app wording, text-size choices and the rest of Wave 2 remain on the roadmap. No treatment safety rules or legal terms were changed.

## Exactly what Claude must check

1. Install the pinned Playwright dependency, complete package-lock.json and install Chromium. Run npm test, node scripts/build-pwa.mjs, npm test again if app assets changed, and the local server. Run tests/ui-rules.mjs with the local base URL and evidence folder. Inspect every saved screenshot at 390x844 and 320x568 in Sunlight and dark. Do not claim browser acceptance from the unit tests.
2. At both sizes and in both themes, inspect red, yellow and green backup lights. Confirm the words, check mark, counts, Why disclosure and 48px buttons. Confirm no horizontal scroll, clipped text or hidden question. Test the theme switch, then reload. An existing dark herd must stay dark; a new profile must start in Sunlight.
3. Walk every guided flow: add animal, weight, move, calf, breeding, pregnancy check, sold or died, and treatment. Check each step's label and control against both the header and action bar. Check the meat-rule dropdown that previously failed. Check keyboard focus, review, Back, Cancel, a long note, browser zoom and the on-screen keyboard. No browser save is required for the scripted layout walk. Manually save a synthetic calf and treatment to verify the unchanged commit path.
4. On iPhone Safari and Android, tap Save a copy from Home and Backup. Check that the sheet opens on the first tap and the file goes to Files or a chosen app. Verify the actual file with Check my copy, then restore it into a separate empty profile and compare all store hashes. Confirm plain filenames and the animal and treatment summary.
5. Cancel the share sheet. Inspect metadata before and after: lastExportAttemptAt, lastUserConfirmedBackupAt and lastVerifiedBackupAt must all remain unchanged. The light must not turn green. Repeat with a newer record added after the prior copy.
6. Exercise every share fallback using browser mocks before app load: canShare rejects application/json but accepts text/plain; canShare rejects both; navigator.share is absent; share throws an error other than AbortError. Confirm .txt shares contain the same verified bytes, downloads work, and no fallback download is counted as a confirmed copy. Restore both file types. Test concurrent work in another tab while the sheet is open: the app must refuse a stale confirmation.
7. Open a new empty profile with mocked storage.persisted false. Confirm zero persist calls on load. Save the first animal and confirm one call after the write completes. Return to Home and inspect the storage note. Refuse the request, save a copy and confirm no second call within a week. Advance the test clock past a week and confirm the next successful copy retries. Test granted, missing and throwing APIs. Also test blocked localStorage: record saves and sharing must still work.
8. On iPhone and iPad Safari tabs, check the red Home Screen warning and three steps. In a real Home Screen app, confirm the warning is gone and restore a saved copy if that context is empty. Confirm the warning is absent in desktop Safari, Android, iOS Chrome and iOS Firefox. Mark device results separately from Chromium mocks.
9. Use Practice a restore with a matching file. Confirm the file is previewed, the message says no herd records changed and all non-metadata stores stay byte-for-byte the same. Try an older valid file, a tampered file, an unrelated file and a file over 50 MB. Confirm plain errors, no write and no read of the oversized file. Check new-entry text limits and that an existing long note still opens.
10. Print every report type. Confirm all printed URLs target bundled terms.txt and work on the live site. Review the beta and safety footer. Open a record-entry route and confirm signup and its footer link are absent. On Home, confirm signup stays available, names the receiving domain and sends only its existing opt-in payload. Inspect the hosting CSP separately: an old broad HTTP-header policy may still need tightening by the deploy owner.
11. Before deployment, seed the exact-record profile on the old live release as documented in release.md. After the authorized deployment, use the same profile and URL for check. Retain the printed exact record, DB version 1, zero-page-error output, receipt and screenshot. Run the parametrized smoke check and verify the app version and offline digest in About. A failure stops the release. Do not clear the seed profile to make it pass.
12. Before field acceptance, run VoiceOver and TalkBack on add calf and treatment, then offline use outdoors with gloves. Record those checks or leave them explicitly untested.

## Intended commit messages

- test: enforce exact-record upgrade survival and parametrized smoke gates
- fix: repair printed terms and narrow owner-approved news signup
- feat: add verified save-copy sharing and truthful backup health
- feat: add automatic storage requests and read-only copy practice
- fix: keep guided questions clear and default new herds to Sunlight
- docs: prepare 1.2.0-beta.1 inventory and browser release handoff

Claude can combine messages where shared app wiring makes a split impractical. No commits were created here.
