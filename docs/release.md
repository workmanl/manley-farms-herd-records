# Release gate

A packaged ZIP is not approval to deploy. No record or database schema changes are part of 1.2.0-beta.1. Schema stays at 1.

The owner decision on 2026-10-13 (TG 9414 and TG 9418) amended the spec's email-capture non-goal: optional news signup stays.

## Dependency setup by the release maintainer

Playwright is pinned to 1.56.1 in package.json. It was not installed during this local, offline implementation. The existing lockfile's release version was updated, but Playwright package entries are still pending. Run `npm install` in an authorized network session to resolve the pinned dependency and update package-lock.json. Install the Chromium browser with `npx playwright install chromium`. Review and commit the resulting lockfile. After that, contributors can use `npm ci`.

## Before the update

Use only synthetic test records and throwaway browser profiles. Never use a farmer's normal browser profile. Keep the profile, seed receipt and output folder across both commands. The base URL must end in `/`. It can be a different origin on a later release, but seed and check for one release must use the same URL.

```sh
node tests/live-upgrade-check.mjs seed https://manleyfarms.com/tools/herd-records/ /tmp/herd-upgrade-profile /tmp/herd-upgrade-evidence 1
```

This creates animal UPG777 through the existing audited write path, with known values for sex, breed, birth date, tag, electronic tag, pasture and notes. It writes the full expected record and all non-metadata stores to upgrade-seed.json. Seed fails if the profile already has animals, if the database version is wrong, if a field is wrong, or if the page raises an error. A controlled service worker is required.

For every migration wave, also seed a second profile with the complete sample herd:

```sh
node tests/live-upgrade-check.mjs seed https://manleyfarms.com/tools/herd-records/ /tmp/herd-fixture-profile /tmp/herd-fixture-evidence 1 1.2.0-beta.1 --fixture
```

The seed command records the actual old app version. The explicit app version is used by check mode. The fixture profile exercises restore through the existing checked replacement path, then adds the same UPG777 seed. For a future schema migration, adapt the expected store transforms and validation before changing this strict gate. Do not weaken assertions to hide legitimate or unexpected differences.

## Local review

```sh
node scripts/build-pwa.mjs
npm test
node scripts/serve.mjs
```

In a second terminal, after installing Playwright:

```sh
node tests/ui-rules.mjs http://127.0.0.1:8765/tools/herd-records/ /tmp/herd-wave1-ui
node tests/live-smoke-check.mjs http://127.0.0.1:8765/tools/herd-records/ /tmp/herd-smoke
```

Create the smoke output folder first. Inspect every screenshot in both themes. Complete the device and fallback checklist in wave1-report.md. The UI script seeds synthetic data in isolated profiles, checks every guided flow, saves all steps, checks all three backup states, tests 48px controls and fails on overlap, horizontal scrolling or page errors. It does not save unfinished treatment forms.

About Herd Records in Backup shows the app version and installed offline build version, including the precache digest. Compare them with the expected release and app/precache.js.

## After the authorized update

Claude owns browser review, commits, the live upgrade gate and deployment. Using the exact profile and evidence folder from seed:

```sh
node tests/live-upgrade-check.mjs check https://manleyfarms.com/tools/herd-records/ /tmp/herd-upgrade-profile /tmp/herd-upgrade-evidence 1 1.2.0-beta.1
```

Check asks the service worker for an update, uses Update when ready if needed, reloads, and prints the full surviving record, database version and page errors. It asserts every known field, the entire seeded record, every non-metadata store, expected app version, active service worker and zero page errors. Metadata is excluded from the store comparison because the normal clock check changes its device-local fields. Any mismatch exits 1. The seed must come from an older release. A successful check writes upgrade-pass.json and a screenshot.

Release packaging can run this same gate and abort before writing ZIPs:

```sh
node scripts/release.mjs --upgrade-check https://manleyfarms.com/tools/herd-records/ /tmp/herd-upgrade-profile /tmp/herd-upgrade-evidence
```

Plain `npm run release` only packages local files and validates asset hashes. It does not perform a live gate, contact a server or authorize deployment. Do not treat packaging success as upgrade-survival evidence. For a migration, run and pass both profiles. If the gate fails, stop the release, retain the profiles and evidence, and investigate. Never clear storage as a repair.
