# Round 2 local candidate: know what is coming

Version: 1.6.0-beta.1. Date: 2026-10-13.

Not field tested. No schema change. Records, holds and withdrawal wording are unchanged. "Recorded interval elapsed" still never means safe. No gestation length was assumed.

## What changed

- Today shows cows with a saved due date, a missing date, or a check that is not sure yet. The Due soon tile counts due dates within 30 days, including dates already past. Animals, Who is due, lists this month and every open check. Open cows, males, steers, sold cows and cows who calved after the check are left off. A later breeding replaces a stale due line on the screen only. The saved check is not edited.
- A pregnancy check asks "About how many days until she calves?" That answer becomes the due date only when the result is pregnant and no due date was typed. Days already in calf stay a separate answer and are not turned into a due date.
- The animal card shows three rows of family, then each calf with birth weight, weaning weight, twin and stillborn. A family loop stops. A parent typed as outside text is not a link.
- Work a group starts from a tag search or a group. Treat and Move open the existing batch forms with those animals checked. Weigh and wean share the day, then save one animal at a time. An empty weight is not a save. Next animal skips. Sell shows that animal's hold notice and requires the check for that animal. A stopped run keeps only the animals already saved.
- The animal card draws a weight line in the page. Group cards show average daily gain with the existing calendar-day rule. Mixed pounds and kilograms use the same factor as that rule. One weight, or two weights on the same day, says Not enough data. No 205-day adjustment.

The site header and footer are unchanged.

## Before and after

- Before: Home had no due count. A pregnancy check could store a due date or days already in calf, and nothing turned the farmer's own days-until answer into a date. The animal card listed parents and did not list calves or a weight line. Batch treat and batch move were separate forms with no shared pass.
- After: Home has a Due soon count and up to five due lines in Today. The animal card shows family, calves and a weight line. Add a record links to Work a group, which walks the picked animals.

## What to check in the browser

- Home, both themes, text 17 and 22, widths 320 and 390. Due soon is the seventh count. Tap it. A cow with a saved due date reads like "Rosie 215: calf due in 12 days." A pregnant cow with no date reads "Due date not entered." The lines wrap. The page does not scroll sideways.
- Pregnancy check. Leave the due date blank, type how many days, choose pregnant, and save. The due date is that many days after the check. Type both a date and a number of days. The typed date stays. Choose open. No due date is saved.
- Open a cow. Family is three rows that wrap on a narrow phone. Calves show birth and weaning. The weight line stays inside the card.
- Add, Work a group. Pick two animals. Weigh. Skip the first. Save a weight on the second. Only the second has a new weight. Sell one animal without the hold check. Nothing new is saved. Check the notice and save. That animal is sold.
- The old address stays read-only for Work a group, batch treat and new records. The due list and the animal card can still be read.

## Local checks

- npm test: 485 of 485 pass. New tests: tests/calendar.test.js, tests/pedigree.test.js, tests/chart.test.js, tests/chute.test.js.
- node scripts/build-pwa.mjs, then node scripts/release.mjs. Both dist/herd-origin and dist/moved were built. Release reported no further app file changes. Precache 1.6.0-beta.1:fb239281f9065831f881.
- Screen rules, local files only, Chromium launched:
  - HERD_SERVE_DIR=dist/herd-origin node tests/ui-rules.mjs https://herd.manleyfarms.com/ /tmp/ui-2
  - HERD_SERVE_DIR=dist/moved node tests/ui-rules.mjs https://manleyfarms.com/tools/herd-records/ /tmp/ui-2-moved --moved
  - Both printed UI RULES PASSED.

## Deferred

- Herd numbers, per-cow sales and the printout shelf are the next round. The weight line from this round stays in place for those reports.
- No 205-day adjusted weight. No default gestation length.
- A keyboard tag reader can type into the group search. A Bluetooth reader was not added.
- Not field tested. No claim that a producer can finish a chute pass in a set number of seconds.
