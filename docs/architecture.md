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

Phase 3 originally stored conservative departure placeholders. Phase 4 recomputes recognized placeholders from the retained records and farm-zone event date in audited movement corrections. Prior acknowledgment text, time, destination and values remain in revisions; the original receipt is not presented as a new operator acknowledgment.

The application has no runtime dependencies. jsdom is used only by Node tests to execute real form submissions, focus/error behavior, safe text rendering, routing and settings persistence. It cannot validate layout, touch keyboards, screen readers or browser IndexedDB implementations.


## Phase 4 health and calculation boundary

`withdrawal.js` is a DOM-free, persistence-free evaluator with an explicit `now` input. It returns both commodities, contributing records, reasons, exact release instants, rounded-up countdowns, overlapping animal counts and departure alerts. It uses elapsed UTC milliseconds; local time and explicit offsets are validated before entry. A closed course applies all recorded instructions from its final administration. A manual-review rule represents an unresolved conflict or non-time condition; arbitrary prose is not interpreted as clinical instructions.

`health.js` stages treatments, fixed-recipient batches, course changes, reviewed corrections/voids and clock review through the existing workflow/repository interface. No store, field or index was added. Clinical and departure commits compare their opening source records, clock-review flag and farm zone inside the transaction, preventing another tab's treatment change from invalidating a reviewed preview silently. Batch validation and writes occur in one transaction. Voiding a final dose reopens its course atomically.

`Repository.observeClock` updates metadata transactionally from the live high-water mark. Backward movement sets a sticky flag. Bookkeeping cannot clear it or move the high-water mark backward; an explicit audited review is required. `refreshHealth` observes the clock and handles legacy placeholders on launch, refresh and import. Resume and visible-minute handlers update derived panels without replacing unsaved forms. Dashboard panels explicitly use aria-live=off and do not update the status announcer during ticks.

`health-ui.js` renders the clinical forms, dashboard, animal withdrawal panels and sale previews with textContent. Event-time sale evaluation uses the earliest minute in the farm-zone calendar day and the recording clock separately, so historical evaluation does not fabricate a backward-device-clock incident. Same-day completed doses are conservatively included; treatments on later dates are excluded from event-time contributors. Current evaluation always uses all retained active treatments. Stored warnings remain after the interval elapses.

Animals include a shared-engine withdrawal filter. At widths through 650px, the filter form starts collapsed behind a labeled toggle with aria-expanded, aria-controls and an active-filter count. Desktop filters remain expanded through CSS. Browser layout and assistive-technology verification remain the next local handoff.
