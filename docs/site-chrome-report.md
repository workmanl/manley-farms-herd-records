# Site chrome update

2026-10-13 | 1.1.1-beta.1 | Schema 1 | Local only

The app now bundles the site's logo at images/logo.png and uses header.site-header, .nav-wrap, .brand and nav.nav-links. The primary links follow the current home and Tools hub order: Home, Tools, Dashboard, Products, Blog, About. Tools has aria-current="page". All site paths are relative to /tools/herd-records/. No site asset or script is loaded from outside the app directory.

The five app tabs sit immediately below the header in a single horizontally scrollable strip. The app identity and version follow the tabs. The SEO introduction, returning-user collapse, beta notices, terms acknowledgment and app routing remain intact. On phones the site links form two rows of three, keeping About alongside Blog and Products. The supplied references have no menu toggle.

The footer uses the Farm Records .footer structure, all nine site links, contact address and exact closing wording, plus one small line for terms, source/license and the required advice disclaimer. Shared footer.css is copied into styles.css, including its mobile grid and 44px link targets. The references contain no copyright line, so none was invented. Farm Records and the home/Tools pages have different footer credits and link orders. This update uses the requested Farm Records closing wording and the current home link order, avoiding unrelated NASA data attribution in a local herd tool.

## Fonts

DM Sans and Inter variable Latin WOFF2 files and their original SIL OFL 1.1 licenses are bundled in app/fonts/. Local @font-face rules use font-display: swap, DM Sans weights 100 1000 and Inter weights 100 900. DM Sans is assigned to the logo wordmark, headings and navigation; Inter is assigned to body text. System fallbacks remain available while fonts load. Both families are listed in source.html, README.md and THIRD_PARTY.md. Font binaries and licenses are hash-inventoried for offline use. No remote font requests are made.

## Verification and browser handoff

npm test: 400 passed, 0 failed, 0 skipped. Shell tests verify the separate landmarks, Tools active state and tab placement. Contract tests assert the exact home/Tools navigation snapshot, full footer link set, logo identity, contact, local runtime assets and scroll/print rules. Release tests verify 1.1.1-beta.1 across metadata, package lock, app and hashed inventory. node scripts/build-pwa.mjs regenerated the local inventory including the logo, fonts, licenses and optional signup module. Browser review remains for Claude.

At 390px, check both dark and sunlight themes: logo and wordmark fit; site nav is two balanced rows with About on the second row; app tabs scroll without page overflow; keyboard focus reveals every tab; terms and source footer links remain readable; footer site links use three columns. Check the open landing intro and the collapsed returning-user view.

At 1280px, check the centered 1100px header content, 36px logo, nav order and active Tools appearance, tab alignment, footer spacing and contact. Compare against Farm Records and the home/Tools references with the differences above in mind. Verify skip-link focus, tab switching, print preview hiding site chrome, and Ready offline after a fresh install/update and reopening without signal. Confirm requests stay within the app directory during ordinary app use. The optional news form sends a capture request only on explicit submit. Site links navigate out only when selected.

No git, deploy, network request or changes to the site checkout were made.
