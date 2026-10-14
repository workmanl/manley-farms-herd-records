# Origin move, 1.3.0-beta.1

The main app is built for https://herd.manleyfarms.com/. The old address stays at https://manleyfarms.com/tools/herd-records/ with the same worker path and scope. Schema stays at 1. Records never move or get removed on their own.

## Local outputs

Run `npm test`, `npm run pwa:inventory`, then `npm run release`.

- `dist/herd-origin/`: upload its contents at the new origin's document root. It includes `.htaccess`, `robots.txt` and `sitemap.xml` from `hosting/herd-origin/`.
- `dist/moved/`: upload its contents at the old app path. It has its own manifest, move flag and complete precache inventory.
- `dist/manley-farms-herd-records-1.3.0-beta.1-herd-origin.zip` and `dist/manley-farms-herd-records-1.3.0-beta.1-moved.zip`: deploy archives, with files at the document root level.
- The static ZIP retains the prior `app/` wrapper for compatibility. The source ZIP includes both build scripts and hosting files. `dist/SHA256SUMS` covers all four archives, with a checksum file for each archive too.

The one deploy setting is `app/lib/deploy-config.js`. The inventory script writes that config from `HERD_BASE_PATH` and `HERD_ORIGIN` when supplied. The default path is `/`. The release script builds the moved copy with the old path and origin. It leaves `app/` bytes alone and checks the source inventory before packaging.

## Claude's exact deploy order

1. **Stage the new origin.** Review and tag the release through the usual release process. Upload the contents of `dist/herd-origin/` to the dedicated origin's document root. Include the dotfile. Keep the HTTPS origin free of analytics, tag managers and third-party scripts. Do not upload any other main-site page or script there. `DirectoryIndex index.html` takes priority over SiteGround's Default.html.
2. **Verify.** Check HTTPS and the response headers on index.html, sw.js, precache.js and app.js. The header CSP must match the meta policy plus `frame-ancestors 'none'`. Check the canonical URL, manifest identity and scope, source/help links and bundled fonts/logo. At 390x844 and 320x568, check both themes, the welcome restore path, 48px controls, print/export, Ready offline and an offline reload. Use a throwaway profile to restore a known file and compare its records. Check HTTP redirects to HTTPS and no-cache on index.html, sw.js and precache.js. Only names with content hashes get immutable caching. Check robots.txt and sitemap.xml. Do not continue if any check fails.
3. **Seed on the old live site, while it is still 1.1.1.** Use fresh throwaway profiles and keep the same receipt folder for the check:

   ```sh
   node tests/move-check.mjs seed https://manleyfarms.com/tools/herd-records/ https://herd.manleyfarms.com/ /tmp/herd-move-old-profile /tmp/herd-move-new-profile /tmp/herd-move-evidence
   ```

   This calls the existing seed path, saves UPG777 with exact known fields and stores the full expected record. Never use a farmer's profile. If old tabs have unsaved forms or calf drafts, finish them on the old release before accepting its update. Do not clear drafts to force the update.
4. **Deploy the moved build.** Upload `dist/moved/` contents over the old app files, including sw.js and precache.js. Keep the old path and service-worker scope. Do not set an HTTP 301 or any host redirect from the old app path. Existing installs must load the moved worker through their normal Update when ready flow. Keep the prior release for rollback; do not clear site storage or old caches.
5. **Run the gate.** Reuse the seed's exact profile and receipt folder:

   ```sh
   node tests/move-check.mjs check https://manleyfarms.com/tools/herd-records/ https://herd.manleyfarms.com/ /tmp/herd-move-old-profile /tmp/herd-move-new-profile /tmp/herd-move-evidence
   ```

   It accepts the worker update, checks the exact old record and stores, checks the visible move banner and read-only flag, attempts a blocked new record, calls the same verified Save a copy download path, then verifies and restores those bytes at the new origin through the existing preview/commit path. It compares the exact seeded fields and all record stores and fails on page errors. A non-zero exit stops the release. It writes move-copy.json and move-pass.json as evidence. Also check an empty old profile: it must show the moved message and open the new address. Check a populated old profile offline, print and CSV exports, share cancellation, file verification and the manual removal confirmation. The automated gate does not remove its old records.
6. **Update the Tools card and sitemap.** Only after the gate passes, point the main-site Tools card and sitemap at https://herd.manleyfarms.com/. Keep the old path working for old installs and saved links. The main-site changes are a separate repository handoff and are not in these outputs.

## Safety and behavior

Old-address records are read-only at the repository and transaction layers. Restore, settings and new entries cannot write there. Reports, CSV exports, viewing and verified Save a copy stay available, even without a current terms receipt. The old build does not update the clock or backup receipt fields. News signup is off and CSP allows only local connections. Main-site header, nav and footer links are absolute; assets stay bundled.

An empty old profile opens the new origin only when it is healthy and has no draft. All herd record stores count, including archives and herd revisions. Terms and settings receipts alone do not count as a herd. A damaged or newer database stays in recovery and never redirects. The unchanged worker handshake waits for every tab to be safe; unsaved forms, drafts and restore plans veto an update.

Manual removal stays hidden until a picked file is verified and matches the current old records. It asks whether the user restored and checked the herd at the new address. On confirmation it rechecks that copy in the same transaction, refuses if a draft remains, removes old records and leaves a fresh empty database. This is the only removal path. A share or requested download alone does not unlock it. No automatic reset, deleteDatabase or cache deletion was added.

## Verification and remaining checks

Local unit tests cover base config, absolute site links, empty-old redirect, read-only writes, same-path Save a copy and restore round trip, cancelled shares, no automatic removal, manual removal gates, hosting headers and both packaged inventories. All 447 local unit tests pass, including the existing tests. The 10,000-animal, 250,000-event scale test also passes with a lossless full backup/restore round trip; this is Node evidence, not a device claim. Both output inventories and archive checksums are regenerated.

No git command, network request, browser session or deploy was run in this build task. Claude still owns staging, browser review, the live gate and deploy. Physical iPhone Safari/Home Screen and Android share/offline behavior are untested here. The new host's actual Apache headers, HTTPS and installed-app update behavior need live verification. The old origin still shares the main site's trust boundary until each farmer moves their records.
