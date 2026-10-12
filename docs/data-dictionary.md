# IndexedDB schema v1

Contract frozen for Phase 2 on 2026-10-12. Product authority: the project specification. This is a design contract, not implemented storage or clinical approval. Clinical and legal launch reviews remain required. All fixture names, products, instructions and people are fictional. Never use the fixture durations as treatment advice.

## Storage and primitive conventions

Database `manley_herd_records`, IndexedDB version **1**. Exactly the 14 stores below. Every store uses `keyPath: "id"`, `autoIncrement: false`. One operation and one metadata record per dataset, each with its own UUID. Their singleton cardinality is validated in every import/transaction. No deletion on archive, sale, storage pressure or elapsed withdrawal.

All listed fields are required JSON keys. A suffix `?` allows JSON null; no field omission, undefined, NaN, Infinity or empty-string substitute for unknown. Arrays may be empty unless specified; array elements cannot be null. Objects reject unknown keys in v1. Text is nonempty Unicode unless null is permitted. Keep original identifier spelling; do not coerce tags to numbers. UUID is a lowercase canonical RFC 4122 UUID string (v4 for new records; fixture v5 values valid). Integer means safe JSON integer. Number means finite JSON number. Decimal is a nonnegative base-10 string matching `^(0|[1-9][0-9]*)(\.[0-9]+)?$`, with no exponent or locale separator. Currency precision is validated for the selected ISO 4217 currency, not rounded silently. Monetary arithmetic uses decimal, not binary floats.

Date is a real Gregorian `YYYY-MM-DD`. Instant is UTC `YYYY-MM-DDTHH:mm:ss.sssZ`. LocalDateTime is `YYYY-MM-DDTHH:mm:ss` without an offset. Zone is a valid IANA zone, e.g. America/Los_Angeles or Etc/UTC. Store local date/time, selected zone and signed offset together; reject nonexistent DST times and require explicit offset selection for ambiguous ones. Imported legacy instant/offset conflicts must be resolved in preview. Do not guess. Status means `held`, `needs-review`, `elapsed`, `not-applicable`, or `no-recorded-interval`.

Comparison normalization for farm IDs and identifier values is Unicode NFC, trim outer whitespace, and ASCII A-Z to a-z; preserve all other characters, punctuation and internal whitespace. Persist derived keys but always regenerate and validate them on import. Normalization collisions require explicit resolution. Search uses the same normalization, scans notes as text, and includes former identifiers. Nullable index keys are omitted by IndexedDB. All indexes use `multiEntry:false`. Index names and key paths below are exact. Uniqueness marked only where specified; foreign keys and partial/interval constraints are enforced in the data layer, not natively by IndexedDB.

## Common fields on every store

| Field | Type | Meaning / constraint |
|---|---|---|
| `id` | UUID | Immutable primary key. |
| `createdAt` | Instant | Creation clock reading. |
| `updatedAt` | Instant | Last mutation clock reading; not a conflict ordering authority. |
| `revision` | Integer | >=1; increment on each correction. |
| `archivedAt` | Instant? | Archive marker; never deletes history or suppresses holds. |
| `voidedAt` | Instant? | Void marker; reviewed correction required for clinical records. |

## Store `operation`

Common fields plus:

| Field | Type | Meaning / constraint |
|---|---|---|
| `name` | Text | Operation display name. |
| `contact` | Text? | Optional local contact details. |
| `timeZone` | Zone | IANA farm time zone. |
| `weightUnit` | Enum | lb  /  kg |
| `backupReminderDays` | Integer | 1..365; default 7. |
| `backupSnoozedUntil` | Instant? | Snooze only; never marks backup complete. |
| `theme` | Enum | dark  /  sunlight  /  system |

Indexes:

None beyond primary key.

## Store `animals`

Common fields plus:

| Field | Type | Meaning / constraint |
|---|---|---|
| `farmId` | Text | Required unique farm ID, including inactive animals. |
| `farmIdKey` | Text | Derived normalization of farmId. |
| `visualTag` | Text? | Current visual identifier, mirrored in identifiers. |
| `rfid` | Text? | Current electronic identifier text, mirrored in identifiers. |
| `breed` | Text? | Free text, unknown is null. |
| `sex` | Enum | female  /  male  /  steer  /  unknown |
| `birthDate` | Date? | Null exactly when birthDatePrecision=unknown. |
| `birthDatePrecision` | Enum | exact  /  estimated  /  unknown |
| `damId` | UUID? | FK animals, mutually exclusive with damReference. |
| `damReference` | Text? | External dam; null with unknown or local dam. |
| `sireId` | UUID? | FK animals, mutually exclusive with sireReference. |
| `sireReference` | Text? | External sire. |
| `status` | Enum | active  /  sold  /  culled  /  dead  /  archived |
| `currentGroupId` | UUID? | FK groups; current membership cache. |
| `pasture` | Text? | Current pasture text. |
| `notes` | Text? | Searchable notes. |

Indexes:

- `byFarmId`: keyPath `"farmIdKey"`, unique=true.
- `byStatus`: keyPath `"status"`, unique=false.
- `byGroup`: keyPath `"currentGroupId"`, unique=false.
- `bySex`: keyPath `"sex"`, unique=false.
- `byBreed`: keyPath `"breed"`, unique=false.
- `byBirthDate`: keyPath `"birthDate"`, unique=false.
- `byDam`: keyPath `"damId"`, unique=false.

## Store `identifiers`

Common fields plus:

| Field | Type | Meaning / constraint |
|---|---|---|
| `animalId` | UUID | FK animals. |
| `type` | Enum | farm-id  /  visual-tag  /  rfid |
| `value` | Text | Original text, preserve zeros. |
| `normalizedValue` | Text | Derived comparison key. |
| `validFrom` | Date? | Unknown start allowed. |
| `validTo` | Date? | Null means current, not unknown end. |
| `replacementReason` | Text? | Required when replacing an identifier. |
| `activeRfidKey` | Text? | Derived normalizedValue only for current nonvoid RFID; otherwise null. Unique across all animal statuses. |

Indexes:

- `byAnimal`: keyPath `"animalId"`, unique=false.
- `byValue`: keyPath `"normalizedValue"`, unique=false.
- `byTypeValue`: keyPath `["type", "normalizedValue"]`, unique=false.
- `byActiveRfid`: keyPath `"activeRfidKey"`, unique=true.

## Store `groups`

Common fields plus:

| Field | Type | Meaning / constraint |
|---|---|---|
| `name` | Text | Display name. |
| `type` | Enum | pasture  /  management-lot |
| `description` | Text? | Optional description. |

Indexes:

- `byName`: keyPath `"name"`, unique=false.

## Store `memberships`

Common fields plus:

| Field | Type | Meaning / constraint |
|---|---|---|
| `animalId` | UUID | FK animals. |
| `groupId` | UUID | FK groups. |
| `startDate` | Date | Inclusive. |
| `endDate` | Date? | Exclusive; null means current. |
| `pastureSnapshot` | Text? | Pasture at entry. |

Indexes:

- `byAnimalStart`: keyPath `["animalId", "startDate"]`, unique=false.
- `byGroupStart`: keyPath `["groupId", "startDate"]`, unique=false.

## Store `calvings`

Common fields plus:

| Field | Type | Meaning / constraint |
|---|---|---|
| `damId` | UUID | FK animals. |
| `sireId` | UUID? | FK animals, XOR sireReference when known. |
| `sireReference` | Text? | External sire. |
| `birthDate` | Date | Actual or estimated date recorded on calves. |
| `calves` | CalfOutcome[] | One or more; unique calfId within and across nonvoid calvings. |
| `easeScore` | Integer? | 1 unassisted, 2 easy assistance, 3 difficult assistance, 4 surgical, 5 abnormal presentation; null unknown. |
| `easeScaleVersion` | Text | Literal local-1. No registry equivalence. |
| `notes` | Text? | Operator notes. |
| `snapshots` | Snapshot[] | Nonempty; one for each involved animal, unique animalId. Preserve original values on corrections unless correcting the snapshot itself. |

Indexes:

- `byDate`: keyPath `"birthDate"`, unique=false.
- `byDamDate`: keyPath `["damId", "birthDate"]`, unique=false.

## Store `weights`

Common fields plus:

| Field | Type | Meaning / constraint |
|---|---|---|
| `animalId` | UUID | FK animals. |
| `date` | Date | Measurement date. |
| `type` | Enum | birth  /  weaning  /  yearling  /  other |
| `value` | Number | >0. |
| `unit` | Enum | lb  /  kg |
| `calvingId` | UUID? | FK calvings for linked birth weight only. |
| `notes` | Text? | Operator notes. |
| `snapshots` | Snapshot[] | Nonempty; one for each involved animal, unique animalId. Preserve original values on corrections unless correcting the snapshot itself. |

Indexes:

- `byDate`: keyPath `"date"`, unique=false.
- `byAnimalDate`: keyPath `["animalId", "date"]`, unique=false.
- `byCalving`: keyPath `"calvingId"`, unique=false.

## Store `treatmentCourses`

Common fields plus:

| Field | Type | Meaning / constraint |
|---|---|---|
| `animalId` | UUID | FK animals. |
| `product` | Text | Same product as all linked administrations. |
| `state` | Enum | open  /  closed |
| `finalAdministrationId` | UUID? | FK treatments; required for closed; null for open. |
| `instructionReference` | Text? | Course instruction reference. |
| `notes` | Text? | Operator notes. |
| `snapshots` | Snapshot[] | Nonempty; one for each involved animal, unique animalId. Preserve original values on corrections unless correcting the snapshot itself. |

Indexes:

- `byAnimal`: keyPath `"animalId"`, unique=false.
- `byState`: keyPath `"state"`, unique=false.

## Store `treatments`

Common fields plus:

| Field | Type | Meaning / constraint |
|---|---|---|
| `animalId` | UUID | FK animals. |
| `courseId` | UUID? | FK treatmentCourses; null = single completed administration. |
| `batchId` | UUID? | Correlation only, no batch store or mutable group link. |
| `administrationDate` | Date | Entered local date, including date-only history. |
| `administrationAt` | Instant? | Null for date-only, required for instant precision. |
| `administrationPrecision` | Enum | instant  /  date-only |
| `enteredLocalTime` | LocalDateTime? | Required for instant; null for date-only. |
| `timeZone` | Zone? | Required for instant; historical date-only zone may be known. |
| `offsetMinutes` | Integer? | -840..840, local minus UTC; required for instant. |
| `product` | Text | User-supplied, no lookup. |
| `lot` | Text? | Unknown explicitly null. |
| `expiryDate` | Date? | If available. |
| `doseValue` | Number? | >0 when known; unknown needs documented notes. |
| `doseUnit` | Text? | Required with doseValue, e.g. mL; null together. |
| `route` | Enum | IM  /  SC  /  IV  /  oral  /  topical  /  intranasal  /  other  /  unknown |
| `routeOther` | Text? | Required exactly for other. |
| `injectionSite` | Text? | Unknown or non-injection null. |
| `reason` | Text | Treatment or vaccination reason. |
| `administrator` | Text? | Unknown allowed for imported history. |
| `veterinarian` | Text? | Name/reference, if applicable. |
| `instructionReference` | Text? | Overall source reference. |
| `meat` | WithdrawalRule | Required object, never implicit zero. |
| `milk` | WithdrawalRule | Required object, never implicit zero. |
| `notes` | Text? | Operator notes. |
| `snapshots` | Snapshot[] | Nonempty; one for each involved animal, unique animalId. Preserve original values on corrections unless correcting the snapshot itself. |

Indexes:

- `byDate`: keyPath `"administrationDate"`, unique=false.
- `byAnimalDate`: keyPath `["animalId", "administrationDate"]`, unique=false.
- `byAnimalInstant`: keyPath `["animalId", "administrationAt"]`, unique=false.
- `byCourse`: keyPath `"courseId"`, unique=false.
- `byBatch`: keyPath `"batchId"`, unique=false.

## Store `breedings`

Common fields plus:

| Field | Type | Meaning / constraint |
|---|---|---|
| `damId` | UUID | FK animals. |
| `method` | Enum | AI  /  natural |
| `sireId` | UUID? | FK animals, XOR sireReference when known. |
| `sireReference` | Text? | External sire or semen reference. |
| `serviceDate` | Date? | Required for AI; optional single natural service. |
| `exposureStart` | Date? | Required for natural interval when serviceDate null. |
| `exposureEnd` | Date? | Inclusive, null for ongoing exposure; null when serviceDate supplied. |
| `notes` | Text? | Operator notes. |
| `snapshots` | Snapshot[] | Nonempty; one for each involved animal, unique animalId. Preserve original values on corrections unless correcting the snapshot itself. |

Indexes:

- `byDam`: keyPath `"damId"`, unique=false.
- `byServiceDate`: keyPath `"serviceDate"`, unique=false.
- `byExposureStart`: keyPath `"exposureStart"`, unique=false.

## Store `pregnancyChecks`

Common fields plus:

| Field | Type | Meaning / constraint |
|---|---|---|
| `animalId` | UUID | FK animals. |
| `breedingId` | UUID? | FK breedings; same dam. |
| `date` | Date | Check date. |
| `method` | Enum | ultrasound  /  palpation  /  blood  /  other  /  unknown |
| `methodOther` | Text? | Required exactly for other. |
| `result` | Enum | pregnant  /  open  /  uncertain |
| `estimatedGestationDays` | Integer? | >=0; only pregnant. |
| `expectedCalvingDate` | Date? | Only pregnant, optional. |
| `examiner` | Text? | Person performing check. |
| `notes` | Text? | Operator notes. |
| `snapshots` | Snapshot[] | Nonempty; one for each involved animal, unique animalId. Preserve original values on corrections unless correcting the snapshot itself. |

Indexes:

- `byDate`: keyPath `"date"`, unique=false.
- `byAnimalDate`: keyPath `["animalId", "date"]`, unique=false.
- `byBreeding`: keyPath `"breedingId"`, unique=false.

## Store `movements`

Common fields plus:

| Field | Type | Meaning / constraint |
|---|---|---|
| `animalId` | UUID | FK animals. |
| `type` | Enum | purchase  /  cull-decision  /  sale  /  death  /  other-departure |
| `date` | Date | Event date, may be historical. |
| `source` | Text? | Required for purchase or explicitly explain unknown in notes. |
| `destination` | Text? | Required for sale/other-departure, or explicit unknown with notes. |
| `reason` | Text? | Reason for decision/departure. |
| `weightValue` | Number? | >0 when known. |
| `weightUnit` | Enum? | lb  /  kg, paired with weightValue. |
| `amount` | Decimal? | Nonnegative decimal string, paired with currency. |
| `currency` | Currency? | Three uppercase ISO 4217 letters. |
| `receiptReference` | Text? | User reference. |
| `holdAcknowledgment` | HoldAcknowledgment? | Required for sale; other departures require it if any holds/review at recording or event time. |
| `notes` | Text? | Operator notes. |
| `snapshots` | Snapshot[] | Nonempty; one for each involved animal, unique animalId. Preserve original values on corrections unless correcting the snapshot itself. |

Indexes:

- `byDate`: keyPath `"date"`, unique=false.
- `byAnimalDate`: keyPath `["animalId", "date"]`, unique=false.
- `byTypeDate`: keyPath `["type", "date"]`, unique=false.

## Store `revisions`

Common fields plus:

| Field | Type | Meaning / constraint |
|---|---|---|
| `entityType` | Enum | Any store name except revisions. |
| `entityId` | UUID | FK to record including retained void/archive records. |
| `priorValues` | Object | Complete previous record, including common metadata. |
| `newValues` | Object | Complete replacement record. |
| `changedAt` | Instant | Same as target updatedAt. |
| `operator` | Text | Local operator text. |
| `reason` | Text | Required correction explanation. |
| `holdReview` | HoldReview? | Required for any treatment/course void or correction that could shorten/remove a hold, including dates, rules, course linkage and directed release. |

Indexes:

- `byEntity`: keyPath `["entityType", "entityId"]`, unique=false.
- `byChangedAt`: keyPath `"changedAt"`, unique=false.

## Store `metadata`

Common fields plus:

| Field | Type | Meaning / constraint |
|---|---|---|
| `singletonKey` | Text | Literal dataset, unique. |
| `format` | Text | Literal manley-herd-records. |
| `schemaVersion` | Integer | Literal 1. |
| `appVersion` | Text | SemVer, independent of schema. |
| `datasetId` | UUID | Stable across restore/transfer; merge retains target ID. |
| `migrationHistory` | Migration[] | Ordered successful schema upgrades; empty for new v1. |
| `lastExportAttemptAt` | Instant? | Download requested, not confirmed saved. |
| `lastUserConfirmedBackupAt` | Instant? | User confirms external copy saved. |
| `lastVerifiedBackupAt` | Instant? | File selected and structurally verified. |
| `lastObservedClockAt` | Instant? | Maximum trusted observed device clock; see clock rules. |
| `clockReviewRequired` | Boolean | Sticky after backward time detection. |
| `clockReviewedAt` | Instant? | Last explicit clock review. |
| `clockReviewReason` | Text? | Required with clockReviewedAt. |
| `termsAcknowledgments` | TermsAcknowledgment[] | Append-only historical acceptance receipts, preserved in backup. |
| `activeTermsVersion` | Text? | Local accepted version, null if not accepted. |

Indexes:

- `bySingleton`: keyPath `"singletonKey"`, unique=true.

## Nested value types

### `Snapshot`

| Field | Type | Meaning / constraint |
|---|---|---|
| `animalId` | UUID | FK animals. |
| `farmId` | Text | Identity at event time. |
| `visualTag` | Text? | Tag at event time. |
| `rfid` | Text? | RFID at event time. |
| `groupId` | UUID? | FK groups at event time. |
| `groupName` | Text? | Group at event time. |
| `pasture` | Text? | Pasture at event time. |

### `WithdrawalRule`

| Field | Type | Meaning / constraint |
|---|---|---|
| `state` | Enum | duration  /  unknown  /  not-applicable  /  prohibited  /  manual-review |
| `value` | Number? | >=0; required only for duration. |
| `unit` | Enum? | hours  /  days; required only for duration. |
| `source` | Enum? | label  /  vet; required except unknown. |
| `instructionText` | Text? | Entered instructions, including unresolved milkings or special conditions. |
| `instructionReference` | Text? | Label version or veterinarian reference; required except unknown. |
| `zeroConfirmedAt` | Instant? | Required only for explicit duration zero. |
| `directedReleaseAt` | Instant? | Veterinarian-directed release, subject to restrictions below. |
| `resolutionReason` | Text? | Required with directed release. |
| `resolvedAt` | Instant? | When the operator recorded the resolution. |
| `resolvedBy` | Text? | Operator text, not an authenticated identity. |

### `CalfOutcome`

| Field | Type | Meaning / constraint |
|---|---|---|
| `calfId` | UUID | FK animals, even for stillbirth with generated farm ID. |
| `outcome` | Enum | live  /  stillborn  /  died-after-birth  /  unknown |
| `birthWeightId` | UUID? | FK weights; reciprocal calvingId and calf animalId. |

### `HoldAcknowledgment`

| Field | Type | Meaning / constraint |
|---|---|---|
| `recordedAt` | Instant | When operator accepted notice. |
| `operator` | Text | Local operator text. |
| `intendedDestination` | Text | Truthful destination, including explicit unknown. |
| `eventTimeBasis` | Enum | exact  /  date-only-conservative |
| `evaluatedAt` | Instant | Clock reading at record time. |
| `meatStatus` | Status | Conservative event-time result. |
| `milkStatus` | Status | Conservative event-time result. |
| `treatmentIds` | UUID[] | All contributing treatment FKs at event time. |
| `noticeVersion` | Text | Literal departure-1. |
| `text` | Text | Snapshot of warning presented. |

### `HoldReview`

| Field | Type | Meaning / constraint |
|---|---|---|
| `reviewedAt` | Instant | Explicit review time. |
| `reviewedBy` | Text | Operator text. |
| `reason` | Text | Why shortening/void is justified. |
| `instructionReference` | Text | Evidence reference, veterinarian for directed releases. |

### `Migration`

| Field | Type | Meaning / constraint |
|---|---|---|
| `fromVersion` | Integer | Previous schema. |
| `toVersion` | Integer | Exactly fromVersion + 1. |
| `completedAt` | Instant | Completion time. |
| `appVersion` | Text | SemVer which migrated. |

### `TermsAcknowledgment`

| Field | Type | Meaning / constraint |
|---|---|---|
| `version` | Text | Exact displayed terms version, initially 2026-10-12-draft-1 for mockup only. |
| `acceptedAt` | Instant | Device UTC timestamp. |
| `timeZone` | Zone | Zone at acknowledgment. |
| `textSha256` | Text | 64 lowercase hexadecimal SHA-256 of UTF-8 complete displayed terms copy. |
| `appVersion` | Text | SemVer of accepting app. |

## Relational and transaction invariants

- All FKs resolve within the dataset, including archived/voided targets. Never resolve by tag alone. Every parent link must be cycle-free and not self-referential; an external reference is not a fabricated animal. Unknown parent uses two nulls. Animal sex changes do not erase parentage; flag inconsistent role/sex for explicit review.
- The one current identifier of each type mirrors animals. Farm IDs remain globally unique including archived animals; historical identifier values may repeat. Replacing tags closes the old identifier and adds the new one with reason. Duplicate current visual tags require explicit preview acknowledgment, not automatic merge. Current RFID is globally unique across retained animals until explicitly ended. Only nonvoid identifiers with validTo=null populate activeRfidKey.
- An animal has at most one current primary group. Membership intervals are nonoverlapping half-open calendar intervals. Group changes close the old membership and create the new one, updating animal currentGroupId/pasture atomically. Archived groups retain history. Membership changes do not change treatment recipients or snapshots.
- Creating a calf commits animals, identifiers, calving (or additional twin entry), optional birth weight and revisions of an existing calving atomically. Each calf links to one birth event. Birth weight is recorded once with reciprocal calving/calves links. Stillborn calf gets an internal animal record and farm ID, status dead; no made-up tag or weight. Birth date agrees across calf, calving and linked weight. A twin is two calves in one calving, not two deliveries.
- Breeding is either a single serviceDate or a natural exposure interval, never both. Exposure end >= start. Pregnancy check breeding belongs to the same animal. Date ranges and membership/identifier end dates cannot precede their starts.
- A cull-decision leaves status active. Sale sets sold, death sets dead, and other-departure sets culled. Corrections reconcile status transactionally from reviewed movement history. Archive is a separate deliberate status change with archivedAt; no hold is hidden by any status. A sale can be recorded despite warnings, with the acknowledgment below.
- Every mutation of an existing domain record increments revision, checks expected previous revision, and appends prior/new values to revisions in the same transaction. First creation is revision 1 without a revision row. Metadata clock/export bookkeeping increments metadata revision but need not create audit rows; terms acceptance, clock review and operation changes do. Revisions themselves are append-only, revision=1, archivedAt=voidedAt=null, and cannot target other revisions. Clock readings can move backward, so updatedAt is never a merge winner or uniqueness key.
- Clinical corrections that could shorten a hold require holdReview even when a software recomputation happens to show no shorter date. Voiding a final dose requires selecting a valid final dose or reopening the course in the same transaction. Keep prior values and notice history. Revision history is neither authenticated nor tamper-proof.
- Batch save freezes selected animal IDs and creates individual treatments with one shared batchId in one transaction, each with its own snapshots and optional animal-specific courseId. No batch store. Courses never span animals or products. No future scheduled dose is a completed treatment. A future administrationAt causes a review/error until the clock or entry is corrected, never a calculated release.

## Withdrawal rule and dashboard contract

A duration requires nonnegative value, hours/days, label/vet source and instruction reference. Zero also requires zeroConfirmedAt. Non-duration rules have value=unit=zeroConfirmedAt=null. Unknown may have no source; manual-review and prohibited retain the known instruction/source. Not-applicable means no relevant commodity marketed, and milk not-applicable specifically means no marketed milk from this animal. It never authorizes product use. No default milk state by sex or breed. Meat not-applicable needs an explicit documented disposition; changing marketing intent requires rule review before a countdown can be shown.

A directed release is allowed only for unknown or manual-review and requires source=vet, instructionText, instructionReference, resolutionReason, resolvedAt and resolvedBy, all supplied together. It documents veterinarian direction, not a user override of prohibited use. Prohibited cannot be cleared through directedReleaseAt. A mistaken prohibited entry requires a reviewed correction with evidence; the software cannot legalize a prohibited use. For a known duration, any shortening requires a reviewed correction of the actual instructions. Date-only duration stays unresolved until timing is corrected or it is changed to a veterinarian-directed manual-review resolution with audit history. No implicit conversion of milkings to hours.

For a closed course, finalAdministrationId must reference its latest nonvoid administration. For each commodity, apply each applicable nonvoid administration's rule at that final instant, retaining the maximum duration or later directed release; this conservatively preserves a longer earlier instruction. A directed release predating any relevant dose is invalid and returns Needs review. Conflicting instructions remain Needs review until explicitly reconciled by reviewed correction. Open courses keep each applicable commodity Needs review even if earlier intervals elapsed. Not-applicable-only commodities remain Not applicable unless prohibited/manual-review/unknown applicability conflicts exist. Every contributing record remains expandable. Standalone administrations use their own instant.

For each animal and commodity: any unresolved applicable instruction, open applicable course, missing time, future administration, or prohibited use wins over calculated expiry. Label is **Needs review**, release is null and countdown is absent, with all reasons listed. Otherwise use the maximum applicable release. Before it, label **Hold**, and at/after it, **Recorded interval elapsed**. A resolved directed release may supply a release instant without a timed historic dose if the veterinarian explicitly addressed the unknown timing. No applicable records gives **No recorded interval**, never elapsed. All records explicitly not-applicable gives **Not applicable**. Voided treatments do not calculate but remain visible in history and revisions.

Counts: meat hold = distinct animals whose meat status is held OR needs-review. Milk hold uses the same rule independently. Needs review = union of animals with either commodity needs-review. These counts overlap and must not be added. Include departed and archived animals in these safety counts; show status badges. One row per animal per commodity, expand products and reasons. An elapsed result is not a safety or compliance certification.

Elapsed-time arithmetic: days × 24 × 3,600,000 or hours × 3,600,000 in milliseconds, requiring a safe whole-millisecond result. Release = anchor + interval. Compare exact milliseconds before display rounding. Positive remaining time is rounded UP to whole minutes, then shown as `Xd Yh Zm` with zero leading components omitted. Exactly zero shows elapsed, never “0 days held.” Calculate on launch, resume, relevant mutation/import and every visible minute. Show timestamp and zone. No closed-app notification promise.

If device wall clock is below lastObservedClockAt, persist clockReviewRequired=true. Do not silently clear when time catches up. Suppress release claims for every animal with applicable nonvoid treatment history, including previously elapsed intervals; count them as review in each applicable commodity. Animals with no treatments or only not-applicable stay outside those commodity counts. Operator must check the clock and record clockReviewedAt/reason before resetting the high-water clock to reviewed now. Restore/merge always recomputes and flags a newer imported observation. Offline software cannot detect every clock error or verify true time.

For sale/departure preview, recompute at recording time and conservatively at the earliest possible event time. A date-only event uses the start of its farm-zone calendar day; equality at release is elapsed. HoldAcknowledgment stores the event-time status and contributors, while the UI also shows current results. Persist the original warning text. Show **Departure recorded with holds/review** whenever the stored event-time acknowledgment contained either status, even after the interval later elapses. Current holds continue to count for sold/archived animals. Acknowledgment records notice, never permission to sell a regulated commodity.

## Acknowledgment and local state

The first-run checkbox starts unchecked. Before first ordinary use, acceptance and its receipt commit locally, including version, date/time, zone, app version and hash of the exact terms text. The draft version is not production-approved legal copy. Read-only terms, source/license, export and recovery remain available when acceptance is absent or declined. Keep historical receipts on terms updates and require a fresh acknowledgment of changed production terms. Restored receipts provide provenance, never consent by a new operator: on replacement restore reset activeTermsVersion to null; on merge preserve only the target browser's current acceptance. Do not import someone else's active acceptance. No authenticated identity is implied.

## Backup JSON envelope

All top-level keys are required, and v1 rejects unknown top-level/store keys. Arrays for all 14 stores are required even when empty. This is the authoritative lossless transfer format; CSV is documented separately.

| Key | Type | Exact meaning |
|---|---|---|
| format | Text | `manley-herd-records` |
| schemaVersion | Integer | `1` |
| appVersion | Text | Exporting application SemVer |
| datasetId | UUID | Same as metadata.datasetId |
| exportedAt | Instant | Snapshot/export request time, not proof of saved backup |
| counts | Object | Every store name mapped to its nonnegative integer array length |
| stores | Object | Every store name mapped to a full record array |
| integrity | Object | `algorithm: "SHA-256"`, `canonicalization: "herd-json-v1"`, `value: <64 lowercase hex>` |

Checksum serialization `herd-json-v1`: remove only the top-level integrity member; recursively sort object keys by Unicode code point (all contract keys ASCII); retain array order; serialize compact UTF-8 JSON without BOM, spaces or final newline; use literal non-ASCII characters, standard JSON control escaping, and ECMAScript JSON.stringify finite-number rendering (negative zero becomes 0). Slash is not escaped. Record arrays export sorted by id ascending; nested array order is meaningful and preserved. Hash those bytes with SHA-256. Values must already meet schema constraints. This detects accidental change, not authenticity. The fixture uses integers only, so its Python serialization matches that definition.

Export a single consistent readonly transaction snapshot of all stores including revisions/voids/archives. Export bookkeeping is recorded afterward and is not retroactively inserted into that snapshot. Reject Farm Records crop files, wrong format, counts/checksum mismatch, bad dates/enums/types/IDs/FKs/cycles and newer schema without writing. Old schema migration is sequential; no v0 implicit mapping. Do not reset on failure. Before replace, download and verify the existing dataset backup. Stage and validate all incoming records before an atomic commit. Identical ID plus content skips; differing content/revision needs explicit choice with local revision history, not timestamp wins. Operation/metadata singletons need special preview reconciliation so a merge never creates a second operation. Import order is immaterial within a staged validated transaction. After restore reset device-local acceptance as above, preserve receipt history and annotate those metadata adjustments in revisions. Export/download/verification receipts refer to the target device only; imported historical values are retained in the audit snapshot but reset to null in active metadata until confirmed locally.

## Fixture

[sample fixture](../tests/fixtures/sample-herd.json) is a complete checksummed v1 envelope, not a seed database to install automatically. Fixed evaluation time: **2026-10-12T12:00:00.000Z**, display zone Etc/UTC. Twelve animals, one twin delivery, one stillbirth, an external sire, historical tag, group change, purchase, cull decision, sale with held withdrawal, mixed-unit weights, breeding/check, batch, repeated course, open course, correction and all five rule states. Fixture metadata has no accepted terms.

Expected counts at that instant: **meat hold 6, milk hold 1, needs review 5**. Meadow 002 is held for meat; Meadow 003 unknown meat; Meadow 004 prohibited meat; Meadow 005 unresolved milkings; Meadow 006 date-only meat; Meadow 007 sold while held; Meadow 008 open meat course. Meadow 001 has elapsed meat and explicit confirmed zero milk. Meadow 005 has a veterinarian-directed elapsed meat resolution. Other animals have no recorded interval. All products are named Demo and all sources are fictional.
