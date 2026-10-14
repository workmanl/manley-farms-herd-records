# Round 3 local candidate: paper and numbers

Version: 1.7.0-beta.1. Date: 2026-10-13.

Not field tested. No schema change. Records, holds and withdrawal wording are unchanged. "Recorded interval elapsed" still never means safe. No 205-day weight. No default gestation length. No target rates.

## What changed

- Reports opens with twelve big buttons: Treatment log, Calving book, Animal card, Herd book, Open cows, Expected calving, Cull list, Barn hold sheet, Blank chute sheet, Blank calving sheet, Herd numbers and Calf sales. The old report list and the button "Print / Save as PDF" stay.
- Herd book, open cows, cull list, barn holds and the blank sheets use the current herd. Date boxes do not hide those rows. Expected calving, herd numbers and calf sales use the dates you pick. A group filter applies to the new sheets and the numbers. The old three reports ignore the group, so their rows stay the same.
- Herd numbers sit on the Reports page and in a printout. Each line says how it was counted. Exposed cows are females with a breeding record in the dates. Calved-of-exposed counts those same cows who also calved in the dates. Other calvings are named apart. Pregnancy uses the latest check in the dates. The calving interval is the average gap between a cow's own calving dates when the later birth is in the dates. Weaning weight is the actual average. The line always says "Actual weaning weights. No age adjustment."
- Calf sales add the sale amounts already saved on calf movements. Each currency stays on its own line. Price per pound uses the sale weight. A missing weight says "Weight not entered." A cow's own sale is not a calf sale. Voided sales and purchases stay out.
- Every printout adds a saved-copy line, such as "Saved copy: Herd backup 2026-10-12.json, 1 animal." The day is the farm clock. The terms line stays last. Times on the page use the farm clock. The animal card still draws the weight line, and a dam's card lists her calves' sales.
- Blank chute and calving sheets are twelve empty lines. They are not saved records. The barn hold sheet still says a finished wait is not permission to sell meat or milk.
- Counting rules are written in docs/data-dictionary.md. Money uses exact decimal text, never a rounded float.

The site header and footer are unchanged.

## Before and after

- Before: Reports had three printouts. Times could show a world-clock stamp. An animal card could dump a raw record. There was no herd book, no open-cow list, no cull list, no barn sheet, no blank sheet, no herd numbers and no calf-sale total.
- After: The same three printouts remain, with farm-clock times and a saved-copy line. Nine more printouts and an on-screen numbers card use only records you already saved.

## What to check in the browser

- Reports, both themes, text 17 and 22, widths 320 and 390. The twelve buttons wrap. None sit past the screen edge. Tap Herd book. The preview title is Herd book. Tap Barn hold sheet. The page includes "Recorded interval elapsed is not permission for slaughter or milk sale."
- Herd numbers. With no dates, the window reads "All saved dates." Type a season and a date range. The counts change only for numbers, expected calving and calf sales. Open cows stay a current list.
- Calf sales. Two currencies on one cow stay on two lines. A sale with no weight says the weight was not entered.
- Print / Save as PDF still opens the print dialog. The last line is still the terms line.
- The old address stays read-only. These sheets do not save a record.

## Local checks

- npm test: 493 of 493 pass. New tests: tests/herd-stats.test.js (8).
- node scripts/build-pwa.mjs, then node scripts/release.mjs. Both dist/herd-origin and dist/moved were built. Release reported no further app file changes. Precache 1.7.0-beta.1:2089724375582e98aff9.
- Screen rules, local files only, Chromium launched:
  - HERD_SERVE_DIR=dist/herd-origin node tests/ui-rules.mjs https://herd.manleyfarms.com/ /tmp/ui-3
  - HERD_SERVE_DIR=dist/moved node tests/ui-rules.mjs https://manleyfarms.com/tools/herd-records/ /tmp/ui-3-moved --moved
  - Both printed UI RULES PASSED.
- A separate local Chromium pass opened Reports on dist/herd-origin at 320 and 390, sunlight and dark, text 17 and 22. Shelf buttons were at least 48px, the page did not scroll sideways, Herd book and Barn hold sheet rendered, and the preview had no raw braces and no UTC stamp. Shots: /tmp/ui-3/reports-*.png. Safari was not opened.

## Deferred

- This commit sits on local 1.6.0-beta.1 (fafdbf2). Live main is already 1.6.1-beta.1 (438e3a8). That line keeps the update prompt outside the closed help, puts each family name on its own line, quiets empty states, and disables group jobs until an animal is picked. This commit does not contain those fixes. Merge them in and keep them. Version files, CHANGELOG and app/precache.js will overlap. After the merge, run node scripts/build-pwa.mjs again, then the tests and both screen rules. Main's screen rule expects the update line outside the collapsed help. This branch still has the older check.
- The live footer address was not requested. The printed terms line is the one already in the app.
- Not field tested. No claim that these rates match a breed association or a sale barn.
