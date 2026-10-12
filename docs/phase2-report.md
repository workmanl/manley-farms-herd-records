# Phase 2 report

Date: 2026-10-12. App version: 0.2.0. Production schema: 1. Local only.

The foundation and app-shell source are implemented, and all 147 automated tests pass. The Codex workspace could not launch Chromium or write to .git. Claude completed both afterwards: the render checks pass at 390x844 and 1280x900 (see docs/screens/README.md), and the three logical commits were made locally. No push, deployment or public release occurred.

## What was built

- `app/` contains plain HTML/CSS and vanilla ES modules with no build step, runtime dependency, CDN, remote font or remote asset. It uses the Farm Records palette and system fonts, with dark, sunlight and system themes.
- IndexedDB database `manley_herd_records` has exactly the 14 specified stores, UUID key paths and named indexes, including unique normalized farm IDs, active RFID and singleton metadata.
- Shared validation checks exact fields, nullability, enums, primitive types, actual dates, original local/UTC/time-zone consistency, normalized identifiers, foreign keys, parent cycles, current identifier mirrors, membership intervals, calving/weight reciprocity, course/final-dose relationships, breeding/check relationships, movement status, monetary precision and correction evidence.
- Ordinary mutations stage and validate related records in one serialized readwrite transaction. Expected revisions prevent stale-tab overwrites. Only transaction completion reports success. Changed rows are written individually; historical records are retained. Identifier replacements and group moves preserve closed interval rows.
- Corrections append complete prior/new values, operator, reason and applicable clinical hold review. Terms receipt history is append-only. Revisions cannot target other revisions or be overwritten through ordinary mutations.
- Sequential upgrade infrastructure creates v1, retains a durable pre-migration snapshot in a separate recovery database, gates destructive upgrades on a downloaded-backup confirmation, aborts failures atomically and exposes read-only recovery. A test-only v2 migration exercises transformation, new-index rollback and metadata migration history. Versionchange closes old tabs. Unsupported newer databases are never downgraded or reset.
- JSON export uses the documented envelope, per-store counts and SHA-256 over `herd-json-v1` canonical bytes from one consistent readonly transaction. Verification checks the envelope, checksum, counts, IDs, types and references without any database writes.
- Restore stages a private plan, previews counts and conflicts, requires explicit merge decisions, and commits atomically after checking the target has not changed. Replace requires a matching saved-and-verified current-records backup. Merge preserves target dataset identity and local consent. No timestamp wins a conflict automatically.
- Backup & Settings offers download, saved-backup confirmation, read-only verification, replace/merge preview, conflict decisions, storage usage, persistent-storage request and operation settings. Dashboard, Animals, Events and Reports remain honest placeholders.
- First-run acknowledgment uses the exact supplied paragraphs and checkbox copy, starts unchecked and only grants ordinary UI access after the receipt commits. Receipts include UTC time, zone, draft terms version, exact text hash and app version. Terms/source/export/recovery remain accessible without acknowledgment. Replacement does not import active consent.
- The exact persistent footer, full draft terms, full unmodified AGPL v3 text, source/license view, README, changelog, data dictionary, architecture notes, test fixture and `.gitignore` are included.

## Test results

Command: `npm test` (`node --test tests/*.test.js`). Environment: Node.js 22.23.3, npm 10.9.9, fake-indexeddb 6.2.4, macOS arm64.

| Result | Count |
|---|---:|
| Tests | 147 |
| Passed | 147 |
| Failed | 0 |
| Skipped | 0 |
| Canceled | 0 |
| Named invalid-constraint cases | 91 |
| Per-store required-field/unknown-key cases | 14 |

The remaining tests exercise the independent frozen-dictionary/index comparison, complete round trip, read-only verification, transaction and injected quota failures, multiple connections, concurrent/stale corrections, append-only history, exact receipt/license packaging, merge choices, safety backups, stale restore previews, migrations, recovery, DST ambiguity, identifier/group transitions and future-dose handling.

The Phase 1 fixture in `tests/fixtures/sample-herd.json` is byte-identical to its source. At the deterministic fixture clock, export/verify/restore into two fresh databases preserves every field, nested value, ID and all 92 records across 14 stores. The comparison includes inactive animals and the original correction. Separate tests confirm that restoring consent/backup receipts or future clock observations produces the required auditable local metadata adjustments.

The final run completed with 147 passes and zero failures. Full output is retained in [test-results.txt](test-results.txt). Module syntax checks passed. The localhost HTTP server returned 200 for the app shell. These are not browser execution or visual tests.

## Render checks and commits: blocked

Playwright latest resolved to 1.64.0. Chromium 156.0.8078.4, browser revision 1248, installed into temporary tooling storage. The requested screenshot CLI was run at both 390×844 and 1280×900 against the local app. Both launches failed before page creation. Chromium logged a denied macOS Mach-port registration:

```text
bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer:
Permission denied (1100)
```

No PNGs exist, and no visual inspection or real-browser interaction pass is claimed. The browser-control inventory had no usable browser surface, and Safari inspection returned `cgWindowNotFound`. [docs/screens/README.md](screens/README.md) records the evidence and repeat commands. This environment does not allow escalation; no sandbox workaround was attempted.

The requested first logical commit was attempted. Both staging and commit failed because `.git` is read-only and Git could not create `.git/index.lock`. No commit was created. All implementation files remain local and uncommitted. [local-completion.md](local-completion.md) contains the intended logical commits, each ending with the exact requested co-author trailer. Nothing was pushed or deployed.

## Deviations, interpretations and limits

| Area | Implementation and reason |
|---|---|
| Stores, fields, indexes and backup wire format | No physical v1 schema or envelope deviations. The independent dictionary test checks all declarations. |
| Pre-migration snapshot location | Separate `<database>_recovery` database with one snapshot store, rather than a fifteenth main store. This preserves the exact 14-store contract and survives main-upgrade rollback. It remains browser-local and is not an external backup. |
| Restore staging | An immutable private in-memory plan followed by one IndexedDB commit, rather than extra persistent staging stores. Closing during preview loses only the preview. An interrupted commit cannot partially replace the dataset. |
| Verify receipt | Verification intentionally writes nothing, including `lastVerifiedBackupAt`, to honor this phase's explicit no-writes requirement. The field remains in the contract for a separately authorized bookkeeping workflow. |
| Full fixture preservation vs local receipt resets | Exact round trip is proved for the supplied unaccepted fixture at its fixed evaluation clock. Other backups can require schema-mandated consent, receipt and clock adjustments, preserved in revision snapshots and tested separately. |
| Future backup migrations | Production supports only schema 1 and rejects v0/v2. The v2 fixture is test-only. There is no supported pre-v1 backup to migrate; future production old-backup support must use the same sequential transform/validation steps. |
| Merge incompatibilities | Every same-ID conflict is explicit. Cross-dataset singleton audit references and incoherent per-record choices can remain blocking validation errors. They are not silently reassigned, discarded or overwritten. Use coherent choices or a verified replacement. |
| Clinical and temporal semantics | Treatment and warning structures are validated and preserved, including required sale acknowledgment and clinical correction evidence. The full withdrawal evaluator, computed truth of historical departure warnings, automatic clock high-water updates and dashboard refresh remain Phase 4 work. Backup verification does not certify those clinical calculations. |
| Scale | Validation stages the full dataset in memory, while writes touch changed rows only. The 20-year/250,000-event performance target has not been benchmarked. |
| Terms and typography | Exact draft legal copy is bundled and visibly labeled unreviewed. System font fallbacks avoid remote or unlicensed font assets. No attorney/producer/veterinary review is claimed. |
| Required completion evidence | Screenshots and commits are incomplete due to the environment restrictions above. Automated tests passing does not remove either gap. |

## What remains for Phase 3

- Animal list/detail/create/correct flows, parentage and explicit inconsistent-sex review.
- Current/former identifier entry, duplicate-tag preview, groups and membership transitions.
- Atomic calf/twin/stillbirth entry and linked birth weights through the foundation API.
- Weight history and ADG with unit conversion and explicit endpoints.
- Breeding and pregnancy-check workflows.
- Purchases, cull decisions and departures, integrated with later clinical warning calculations.
- Search, filters, paging, useful validation messages and preserved local form drafts.

Later phases still own the full withdrawal oracle and dashboard, CSV, reports, backup reminder prompts, PWA caching/install/update coordination, real devices, accessibility/field testing, scale benchmarks, clinical and legal review, and public release preparation. Browser verification and the requested local commits should be completed as soon as the necessary local permissions are available.
