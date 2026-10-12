# Application architecture

SPDX-License-Identifier: AGPL-3.0-only

`app/` is the complete static deployable directory. No bundler or runtime dependency is involved. Production schema is v1. `tests/fixtures/migration-v2.js` is deliberately outside `app/`.

## Modules

| Module          | Responsibility                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `contract.js`   | Frozen fields, types and exact index declarations transcribed from Phase 1                               |
| `validation.js` | Strict JSON shape, primitive, nested, relational and clinical instruction structure validation           |
| `database.js`   | Initial v1 creation, transaction serialization, revision audit, transitions, upgrades and recovery       |
| `backup.js`     | Canonical SHA-256 envelopes, read-only verification, private staged restore plans and atomic commits     |
| `terms-copy.js` | Exact first-run and full draft terms copy, checkbox label and stable hash input                          |
| `terms.js`      | Acceptance receipts, matching version/hash gate and storage capability reporting                         |
| `workflows.js`  | Phase 3 form commands, related-record staging, ADG, search/paging, history queries and local calf drafts |
| `herd-ui.js`    | Safely rendered herd screens and labeled forms, shared workflow submission, recovery and save feedback   |
| `app.js`        | Acknowledgment-gated tab routing, persisted app-wide theme and Backup & Settings controls                |

## Transaction boundary

All 14 stores are read within one IndexedDB transaction. Mutations apply to a cloned staged dataset, validate every relationship, check expected revisions against the live transaction snapshot, then enqueue only changed record deletions/additions. Deletions release changed unique index keys inside the same transaction; retained domain rows are not removed from the resulting dataset. No ordinary mutation API exposes deletion. History is archived or voided.

IndexedDB serializes overlapping readwrite transactions across connections. Resolving the mutation promise waits for `oncomplete`; aborted transactions reject. Validation performs no asynchronous work while the transaction is active. No network, digest or UI await can make a transaction auto-commit halfway through validation. A versionchange closes the old connection and disables the old tab's controls.

Current identifier replacements must preserve and close old rows, add reasoned new rows and update animals together. Primary group changes retain the old membership. Clinical changes require a hold review when safety-relevant inputs change. Revisions store complete before/after snapshots; metadata export bookkeeping alone may omit audit rows. Terms receipts cannot be removed through ordinary mutation.

This implementation validates a complete in-memory dataset per transaction. It writes changed records only. This favors correctness for the foundation; the 250,000-event scale target remains unbenchmarked and will require profiling and potentially narrower validation indexes in later work.

## Backup and restore

Export reads one readonly transaction, sorts store arrays by ID, leaves nested array order intact and hashes the envelope without `integrity`. The app records export bookkeeping only after the download request. Verify does not write, even a verification timestamp. Selecting a replacement safety file is an independent explicit verification step.

Preview plans keep the actual staged records in a private WeakMap. Public preview fields cannot replace or authorize mutated staged records. Commit rechecks the entire target dataset token inside the same readwrite transaction that applies the plan. Replacement requires a matching verified safety backup plus confirmation it was downloaded. Cancellation discards the UI plan and never writes.

Conflicts include singleton operation/metadata reconciliation. Merge retains the target singleton IDs and dataset ID. It never overwrites an existing revision row. Some combinations of incoming choices can be structurally incompatible, such as references to an unrelated source singleton's audit history. Those previews remain blocked with the validation reason; use a coherent set of choices or replacement after backup. IDs are never guessed or silently rewritten inside historical snapshots.

## Migrations and recovery

Initial v1 creation is one versionchange transaction that creates exactly 14 stores and seeds only operation/metadata. A dataset with invalid existing contents enters recovery, rather than being seeded again.

For an upgrade, sequential steps must exist. A destructive step requires the caller's downloaded-backup confirmation before proceeding. The framework snapshots all stores in a separate IndexedDB database named `<main name>_recovery` before opening the upgrade. This keeps the main schema exact and allows the snapshot to survive a failed main upgrade. The upgrade rechecks the source against the snapshot to catch writes during staging, transforms data synchronously, validates it, and commits schema/data together. Future migration definitions must make their format change, metadata history and validation explicit.

The test-only v2 step exercises index creation, sequential metadata history, migration transformation and rollback. It is not a supported production backup version. There is no v0 implicit mapping and production rejects v2 files without writes. With only production v1 there is no older supported backup migration to run yet; future old-backup adapters must invoke the same step transforms and validators as database upgrades.

Failure retains the previous main schema/data and a separate snapshot. Recovery blocks ordinary mutations and exports existing content without auto-reset. A newer database opens read-only and cannot be downgraded. Raw recovery downloads retain unvalidated contents and are not mislabeled as verified v1 backups. Reopening the matching compatible version can resume normal use after validation.

## Terms and security boundary

The required first-run paragraphs and checkbox label match Phase 1. Hash input is `TERMS_TEXT`: heading, paragraphs, checkbox label, full-terms heading and full terms, with explicit two-newline separators. The full terms are bundled verbatim as Markdown text and displayed as text, so there is no HTML injection. Version and exact UTF-8 text hash are recorded with UTC time, time zone and app version.

The gate is a local official-interface acknowledgment, not authentication or a tamper-proof ledger. Imported acceptance never establishes a new operator's consent. Replacement clears active acceptance and appends an audit row if metadata changed. Merge retains local acceptance and preserves historical receipts.

The main page's Content Security Policy permits only local assets and blocks connection requests, frames/objects through the default/object policies and form submissions. Imported text uses `textContent`, never `innerHTML`. No real herd data belongs in tests, screenshots or bug reports.

## Phase 3 workflow boundary

`prepareWorkflow(snapshot, action, input)` stages complete v1 rows and expected revisions. `commitWorkflow` awaits the existing repository mutation promise. Forms retain their opening snapshot for optimistic correction checks. No new IndexedDB stores or replacement persistence layer were added. All ordinary writes still pass the original relational validation and transaction code.

Animal corrections close old identifiers, create new current identifiers, and reconcile dated memberships with the animal row in one commit. A linked calf birth-date or parentage correction also updates the calving, its twin and linked weights, retaining original snapshots and recording each prior/new row. Group moves freeze the selected IDs before commit. A historical departure derives status from the latest recorded departure, so entering older history does not overwrite a newer disposition.

Events and animal cards query retained source rows, including identifiers, memberships, revisions, archived/voided rows and imported treatment history. Search normalizes text using the foundation's contract, includes all former identifiers, defaults to active animals and pages 25 results. Age is measured in calendar days relative to the farm-zone date; estimated DOB participates and unknown DOB does not match age/date filters.

Calving drafts use localStorage under `manley-herd-draft-v1:<datasetId>:calving:<damId>`. Input/change events retain the full form, including a stable delivery UUID. Saving persists the draft before beginning the transaction and removes it only after completion. Reopening a draft whose delivery UUID already exists shows the committed delivery instead of submitting it twice. Corrupt drafts require explicit discard. Drafts are local convenience state, excluded from authoritative backups. There is one draft per dam; simultaneous unsaved editing of the same dam in separate tabs is not a collaborative editing feature.

Phase 3 departures conservatively record both meat and milk as needs-review with the exact displayed placeholder notice and retained treatment IDs. This is not the Phase 4 clinical evaluator or a calculated event-time result. Phase 4 must add its current/event-time previews, clock rules and full withdrawal oracle without erasing these historical acknowledgments.

The application has no runtime dependencies. jsdom is used only by Node tests to execute real form submissions, focus/error behavior, safe text rendering, routing and settings persistence. It cannot validate layout, touch keyboards, screen readers or browser IndexedDB implementations.
