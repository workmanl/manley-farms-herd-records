# Round 1 local candidate: icons and phone polish

Version: 1.5.0-beta.1. Date: 2026-10-13.

Not field tested. No schema change. Records, holds and withdrawal wording are unchanged. "Recorded interval elapsed" still never means safe.

## What changed

- One original icon set, drawn in the app. Each icon is a 24px grid with a 1.75 stroke. Icons sit on the Home tiles, the bottom bar, stat cards, Today, recent activity, animal rows, event rows and empty states. Icon buttons keep a text name.
- Spacing uses a 4 and 8 scale. Cards share one radius and a light shadow. Headings use the bundled DM Sans. Body text uses the bundled Inter. Primary, secondary and danger buttons each have one style. Sunlight primary buttons stay dark green so they still read on a light page.
- Home opens with a short greeting, a find box and icon tiles for the seven jobs. At text size 22, four tiles show and More holds the other three. More stays closed. The backup status sits under the tiles. A full backup card above the tiles pushed the jobs below the bottom bar on a 320 by 568 screen.
- Three tiles show a short word: Treat, Move and Breeding. The button name is still the full phrase, and Help keeps the long names.
- Guided questions show a progress bar. The old dot marks stay in the page so step counts still match, and they are clipped from view. A short fade runs between steps. Phones that ask for less motion get no fade.
- Animal and event lists are rows with a leading icon. On a hold and Needs a check are badges.
- The old course sentence is now "Keep this dose open for more doses later?"
- Closed sections stay closed. Links inside More no longer paint while More is shut. Today actions stay on one line. Home links such as Reports use the full row so words are not cut.

The site header and footer are unchanged.

## Before and after

- Before: Home tiles were words only. The icon drawing was in the page, and the style hid it. Tile text sat in the top corner. Padding and button colors did not match from card to card. Today actions could break a word in the middle on a narrow phone.
- After: Each job tile has an icon and a name. Cards, rows and buttons follow one scale. Hold buttons read "Review hold" on one line. Find and the first tiles sit above the bottom bar at 320 and 390, in both themes, at text sizes 17 and 22.

## What to check in the browser

- Home, sunlight and dark, text 17 and 22, widths 320 and 390. The find box and the visible job tiles sit above the bottom bar. More is one row. Open More and confirm Move, Breeding and Sold or died are there.
- Open Treat. The bar fills as you go forward. Back keeps the answer. The review still says a finished wait is not a safe-to-sell check.
- Animals. A row has an icon. A held animal shows On a hold. An animal that needs a check shows Needs a check.
- The old address stays read-only. Saving a copy still works. Adding a record does not.

## Local checks

- npm test: 470 of 470 pass, including tests/round1.test.js.
- node scripts/build-pwa.mjs, then node scripts/release.mjs. Both dist/herd-origin and dist/moved were built. Release reported no further app file changes.
- Screen rules, local files only, Chromium launched:
  - HERD_SERVE_DIR=dist/herd-origin node tests/ui-rules.mjs https://herd.manleyfarms.com/ /tmp/ui-1
  - HERD_SERVE_DIR=dist/moved node tests/ui-rules.mjs https://manleyfarms.com/tools/herd-records/ /tmp/ui-1-moved --moved
  - Both printed UI RULES PASSED.

## Deferred

- No gestation length was added. Due lists, pedigree, chute mode, charts, herd numbers and printouts are the next rounds.
- The backup status is under the job tiles, not above them, so the first screen can keep the jobs on a short phone.
- Not field tested. No claim that a producer can finish a weight or a treatment in a set number of seconds.
