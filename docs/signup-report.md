# Optional news signup and fonts

2026-10-13 | 1.1.1-beta.1 | Schema 1 | Local only

The public introduction contains the optional Get Herd Records news card immediately after the FAQ and before source/license links. The requested title, body and button copy are retained. A small footer link opens the same form, scrolls to it and focuses the email field without changing the active app tab. There is no dashboard form, popup, account requirement or email gate. Privacy links point to /privacy/.

## Submission and privacy

The mechanism follows the local Manley Farms homepage reference: an explicit form submit sends a JSON POST to https://northwestmediasystems.com/api/capture.php. The exact payload is {email, brand: 'manleyfarms', source: 'herd_records_signup', metadata: {path, appVersion}}. Path is pathname only. The module has no repository or record input. Credentials and referrer are omitted and redirects rejected. It sends no herd records, IDs, counts, query strings or fragments.

Initialization, input, focus and opening the form do not send anything. Duplicate submits are ignored while a request is pending. The labeled email input uses type=email, autocomplete=email and required validation. Invalid input, offline attempts, success and failure are announced in a polite atomic status region. Offline text is "You're offline. Try again when you have signal." No attempt is queued or automatically retried. Success is "You're on the list." HTTP errors, invalid JSON and network failure show a plain retry message; controls are restored afterward.

The app CSP connect-src permits exactly 'self' and https://northwestmediasystems.com. All other directives retain their existing scope. The service worker already exits before respondWith for POST or cross-origin requests, so no worker change was necessary. Tests execute its real source to verify capture requests are untouched.

Landing ownership copy, help, README, terms section 6 in both terms sources, and architecture privacy wording disclose host page/asset requests and elective mailing-list email transmission. They preserve the statement that herd records are never sent. App and schema versions are unchanged. The terms receipt hashes the updated displayed text, so an older receipt does not accept different wording merely because the beta terms version is retained.

## Fonts and inventory

Local DM Sans variable Latin uses weights 100 1000; Inter uses 100 900. Both @font-face rules use font-display: swap. DM Sans styles the logo wordmark, headings and navigation. Inter styles body text. Original SIL OFL 1.1 licenses remain with the fonts, and both families are listed in source.html, README and THIRD_PARTY.md. The regenerated precache inventory hashes all 40 assets, including both font binaries, both font licenses and the signup module.

## Verification and browser handoff

npm test: 400 passed, 0 failed, 0 skipped. Six added tests cover placement and footer reveal, no request without submit, exact allowlisted payload, email validation, offline and error states, narrow CSP, fonts/licenses, privacy disclosures and real service worker exclusion. Existing tests continue to check inventory hashes, terms agreement, routing and packaging.

Claude owns browser checking and deployment. Check 390px and desktop in both themes, font rendering after an offline reopen, returning-user collapsed intro, footer form reveal and keyboard focus, status announcements, and form wrapping. Check actual capture behavior, CORS and success/error responses during authorized browser review. Confirm ordinary app use never contacts capture.php and inspect a submitted payload for only the stated keys. Endpoint availability and browser behavior were not checked in this local-only task. No git, deployment or network commands were used.
