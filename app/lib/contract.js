// SPDX-License-Identifier: AGPL-3.0-only
// Frozen Phase 1 field and index definitions.
export const models = {
  Common: {
    id: {
      type: "UUID",
      note: "Immutable primary key.",
    },
    createdAt: {
      type: "Instant",
      note: "Creation clock reading.",
    },
    updatedAt: {
      type: "Instant",
      note: "Last mutation clock reading; not a conflict ordering authority.",
    },
    revision: {
      type: "Integer",
      note: ">=1; increment on each correction.",
    },
    archivedAt: {
      type: "Instant?",
      note: "Archive marker; never deletes history or suppresses holds.",
    },
    voidedAt: {
      type: "Instant?",
      note: "Void marker; reviewed correction required for clinical records.",
    },
  },
  operation: {
    name: {
      type: "Text",
      note: "Operation display name.",
    },
    contact: {
      type: "Text?",
      note: "Optional local contact details.",
    },
    timeZone: {
      type: "Zone",
      note: "IANA farm time zone.",
    },
    weightUnit: {
      type: "Enum",
      note: "lb  /  kg",
    },
    backupReminderDays: {
      type: "Integer",
      note: "1..365; default 7.",
    },
    backupSnoozedUntil: {
      type: "Instant?",
      note: "Snooze only; never marks backup complete.",
    },
    theme: {
      type: "Enum",
      note: "dark  /  sunlight  /  system",
    },
  },
  animals: {
    farmId: {
      type: "Text",
      note: "Required unique farm ID, including inactive animals.",
    },
    farmIdKey: {
      type: "Text",
      note: "Derived normalization of farmId.",
    },
    visualTag: {
      type: "Text?",
      note: "Current visual identifier, mirrored in identifiers.",
    },
    rfid: {
      type: "Text?",
      note: "Current electronic identifier text, mirrored in identifiers.",
    },
    breed: {
      type: "Text?",
      note: "Free text, unknown is null.",
    },
    sex: {
      type: "Enum",
      note: "female  /  male  /  steer  /  unknown",
    },
    birthDate: {
      type: "Date?",
      note: "Null exactly when birthDatePrecision=unknown.",
    },
    birthDatePrecision: {
      type: "Enum",
      note: "exact  /  estimated  /  unknown",
    },
    damId: {
      type: "UUID?",
      note: "FK animals, mutually exclusive with damReference.",
    },
    damReference: {
      type: "Text?",
      note: "External dam; null with unknown or local dam.",
    },
    sireId: {
      type: "UUID?",
      note: "FK animals, mutually exclusive with sireReference.",
    },
    sireReference: {
      type: "Text?",
      note: "External sire.",
    },
    status: {
      type: "Enum",
      note: "active  /  sold  /  culled  /  dead  /  archived",
    },
    currentGroupId: {
      type: "UUID?",
      note: "FK groups; current membership cache.",
    },
    pasture: {
      type: "Text?",
      note: "Current pasture text.",
    },
    notes: {
      type: "Text?",
      note: "Searchable notes.",
    },
  },
  identifiers: {
    animalId: {
      type: "UUID",
      note: "FK animals.",
    },
    type: {
      type: "Enum",
      note: "farm-id  /  visual-tag  /  rfid",
    },
    value: {
      type: "Text",
      note: "Original text, preserve zeros.",
    },
    normalizedValue: {
      type: "Text",
      note: "Derived comparison key.",
    },
    validFrom: {
      type: "Date?",
      note: "Unknown start allowed.",
    },
    validTo: {
      type: "Date?",
      note: "Null means current, not unknown end.",
    },
    replacementReason: {
      type: "Text?",
      note: "Required when replacing an identifier.",
    },
    activeRfidKey: {
      type: "Text?",
      note: "Derived normalizedValue only for current nonvoid RFID; otherwise null. Unique across all animal statuses.",
    },
  },
  groups: {
    name: {
      type: "Text",
      note: "Display name.",
    },
    type: {
      type: "Enum",
      note: "pasture  /  management-lot",
    },
    description: {
      type: "Text?",
      note: "Optional description.",
    },
  },
  memberships: {
    animalId: {
      type: "UUID",
      note: "FK animals.",
    },
    groupId: {
      type: "UUID",
      note: "FK groups.",
    },
    startDate: {
      type: "Date",
      note: "Inclusive.",
    },
    endDate: {
      type: "Date?",
      note: "Exclusive; null means current.",
    },
    pastureSnapshot: {
      type: "Text?",
      note: "Pasture at entry.",
    },
  },
  calvings: {
    damId: {
      type: "UUID",
      note: "FK animals.",
    },
    sireId: {
      type: "UUID?",
      note: "FK animals, XOR sireReference when known.",
    },
    sireReference: {
      type: "Text?",
      note: "External sire.",
    },
    birthDate: {
      type: "Date",
      note: "Actual or estimated date recorded on calves.",
    },
    calves: {
      type: "CalfOutcome[]",
      note: "One or more; unique calfId within and across nonvoid calvings.",
    },
    easeScore: {
      type: "Integer?",
      note: "1 unassisted, 2 easy assistance, 3 difficult assistance, 4 surgical, 5 abnormal presentation; null unknown.",
    },
    easeScaleVersion: {
      type: "Text",
      note: "Literal local-1. No registry equivalence.",
    },
    notes: {
      type: "Text?",
      note: "Operator notes.",
    },
    snapshots: {
      type: "Snapshot[]",
      note: "Nonempty; one for each involved animal, unique animalId. Preserve original values on corrections unless correcting the snapshot itself.",
    },
  },
  weights: {
    animalId: {
      type: "UUID",
      note: "FK animals.",
    },
    date: {
      type: "Date",
      note: "Measurement date.",
    },
    type: {
      type: "Enum",
      note: "birth  /  weaning  /  yearling  /  other",
    },
    value: {
      type: "Number",
      note: ">0.",
    },
    unit: {
      type: "Enum",
      note: "lb  /  kg",
    },
    calvingId: {
      type: "UUID?",
      note: "FK calvings for linked birth weight only.",
    },
    notes: {
      type: "Text?",
      note: "Operator notes.",
    },
    snapshots: {
      type: "Snapshot[]",
      note: "Nonempty; one for each involved animal, unique animalId. Preserve original values on corrections unless correcting the snapshot itself.",
    },
  },
  treatmentCourses: {
    animalId: {
      type: "UUID",
      note: "FK animals.",
    },
    product: {
      type: "Text",
      note: "Same product as all linked administrations.",
    },
    state: {
      type: "Enum",
      note: "open  /  closed",
    },
    finalAdministrationId: {
      type: "UUID?",
      note: "FK treatments; required for closed; null for open.",
    },
    instructionReference: {
      type: "Text?",
      note: "Course instruction reference.",
    },
    notes: {
      type: "Text?",
      note: "Operator notes.",
    },
    snapshots: {
      type: "Snapshot[]",
      note: "Nonempty; one for each involved animal, unique animalId. Preserve original values on corrections unless correcting the snapshot itself.",
    },
  },
  treatments: {
    animalId: {
      type: "UUID",
      note: "FK animals.",
    },
    courseId: {
      type: "UUID?",
      note: "FK treatmentCourses; null = single completed administration.",
    },
    batchId: {
      type: "UUID?",
      note: "Correlation only, no batch store or mutable group link.",
    },
    administrationDate: {
      type: "Date",
      note: "Entered local date, including date-only history.",
    },
    administrationAt: {
      type: "Instant?",
      note: "Null for date-only, required for instant precision.",
    },
    administrationPrecision: {
      type: "Enum",
      note: "instant  /  date-only",
    },
    enteredLocalTime: {
      type: "LocalDateTime?",
      note: "Required for instant; null for date-only.",
    },
    timeZone: {
      type: "Zone?",
      note: "Required for instant; historical date-only zone may be known.",
    },
    offsetMinutes: {
      type: "Integer?",
      note: "-840..840, local minus UTC; required for instant.",
    },
    product: {
      type: "Text",
      note: "User-supplied, no lookup.",
    },
    lot: {
      type: "Text?",
      note: "Unknown explicitly null.",
    },
    expiryDate: {
      type: "Date?",
      note: "If available.",
    },
    doseValue: {
      type: "Number?",
      note: ">0 when known; unknown needs documented notes.",
    },
    doseUnit: {
      type: "Text?",
      note: "Required with doseValue, e.g. mL; null together.",
    },
    route: {
      type: "Enum",
      note: "IM  /  SC  /  IV  /  oral  /  topical  /  intranasal  /  other  /  unknown",
    },
    routeOther: {
      type: "Text?",
      note: "Required exactly for other.",
    },
    injectionSite: {
      type: "Text?",
      note: "Unknown or non-injection null.",
    },
    reason: {
      type: "Text",
      note: "Treatment or vaccination reason.",
    },
    administrator: {
      type: "Text?",
      note: "Unknown allowed for imported history.",
    },
    veterinarian: {
      type: "Text?",
      note: "Name/reference, if applicable.",
    },
    instructionReference: {
      type: "Text?",
      note: "Overall source reference.",
    },
    meat: {
      type: "WithdrawalRule",
      note: "Required object, never implicit zero.",
    },
    milk: {
      type: "WithdrawalRule",
      note: "Required object, never implicit zero.",
    },
    notes: {
      type: "Text?",
      note: "Operator notes.",
    },
    snapshots: {
      type: "Snapshot[]",
      note: "Nonempty; one for each involved animal, unique animalId. Preserve original values on corrections unless correcting the snapshot itself.",
    },
  },
  breedings: {
    damId: {
      type: "UUID",
      note: "FK animals.",
    },
    method: {
      type: "Enum",
      note: "AI  /  natural",
    },
    sireId: {
      type: "UUID?",
      note: "FK animals, XOR sireReference when known.",
    },
    sireReference: {
      type: "Text?",
      note: "External sire or semen reference.",
    },
    serviceDate: {
      type: "Date?",
      note: "Required for AI; optional single natural service.",
    },
    exposureStart: {
      type: "Date?",
      note: "Required for natural interval when serviceDate null.",
    },
    exposureEnd: {
      type: "Date?",
      note: "Inclusive, null for ongoing exposure; null when serviceDate supplied.",
    },
    notes: {
      type: "Text?",
      note: "Operator notes.",
    },
    snapshots: {
      type: "Snapshot[]",
      note: "Nonempty; one for each involved animal, unique animalId. Preserve original values on corrections unless correcting the snapshot itself.",
    },
  },
  pregnancyChecks: {
    animalId: {
      type: "UUID",
      note: "FK animals.",
    },
    breedingId: {
      type: "UUID?",
      note: "FK breedings; same dam.",
    },
    date: {
      type: "Date",
      note: "Check date.",
    },
    method: {
      type: "Enum",
      note: "ultrasound  /  palpation  /  blood  /  other  /  unknown",
    },
    methodOther: {
      type: "Text?",
      note: "Required exactly for other.",
    },
    result: {
      type: "Enum",
      note: "pregnant  /  open  /  uncertain",
    },
    estimatedGestationDays: {
      type: "Integer?",
      note: ">=0; only pregnant.",
    },
    expectedCalvingDate: {
      type: "Date?",
      note: "Only pregnant, optional.",
    },
    examiner: {
      type: "Text?",
      note: "Person performing check.",
    },
    notes: {
      type: "Text?",
      note: "Operator notes.",
    },
    snapshots: {
      type: "Snapshot[]",
      note: "Nonempty; one for each involved animal, unique animalId. Preserve original values on corrections unless correcting the snapshot itself.",
    },
  },
  movements: {
    animalId: {
      type: "UUID",
      note: "FK animals.",
    },
    type: {
      type: "Enum",
      note: "purchase  /  cull-decision  /  sale  /  death  /  other-departure",
    },
    date: {
      type: "Date",
      note: "Event date, may be historical.",
    },
    source: {
      type: "Text?",
      note: "Required for purchase or explicitly explain unknown in notes.",
    },
    destination: {
      type: "Text?",
      note: "Required for sale/other-departure, or explicit unknown with notes.",
    },
    reason: {
      type: "Text?",
      note: "Reason for decision/departure.",
    },
    weightValue: {
      type: "Number?",
      note: ">0 when known.",
    },
    weightUnit: {
      type: "Enum?",
      note: "lb  /  kg, paired with weightValue.",
    },
    amount: {
      type: "Decimal?",
      note: "Nonnegative decimal string, paired with currency.",
    },
    currency: {
      type: "Currency?",
      note: "Three uppercase ISO 4217 letters.",
    },
    receiptReference: {
      type: "Text?",
      note: "User reference.",
    },
    holdAcknowledgment: {
      type: "HoldAcknowledgment?",
      note: "Required for sale; other departures require it if any holds/review at recording or event time.",
    },
    notes: {
      type: "Text?",
      note: "Operator notes.",
    },
    snapshots: {
      type: "Snapshot[]",
      note: "Nonempty; one for each involved animal, unique animalId. Preserve original values on corrections unless correcting the snapshot itself.",
    },
  },
  revisions: {
    entityType: {
      type: "Enum",
      note: "Any store name except revisions.",
    },
    entityId: {
      type: "UUID",
      note: "FK to record including retained void/archive records.",
    },
    priorValues: {
      type: "Object",
      note: "Complete previous record, including common metadata.",
    },
    newValues: {
      type: "Object",
      note: "Complete replacement record.",
    },
    changedAt: {
      type: "Instant",
      note: "Same as target updatedAt.",
    },
    operator: {
      type: "Text",
      note: "Local operator text.",
    },
    reason: {
      type: "Text",
      note: "Required correction explanation.",
    },
    holdReview: {
      type: "HoldReview?",
      note: "Required for any treatment/course void or correction that could shorten/remove a hold, including dates, rules, course linkage and directed release.",
    },
  },
  metadata: {
    singletonKey: {
      type: "Text",
      note: "Literal dataset, unique.",
    },
    format: {
      type: "Text",
      note: "Literal manley-herd-records.",
    },
    schemaVersion: {
      type: "Integer",
      note: "Literal 1.",
    },
    appVersion: {
      type: "Text",
      note: "SemVer, independent of schema.",
    },
    datasetId: {
      type: "UUID",
      note: "Stable across restore/transfer; merge retains target ID.",
    },
    migrationHistory: {
      type: "Migration[]",
      note: "Ordered successful schema upgrades; empty for new v1.",
    },
    lastExportAttemptAt: {
      type: "Instant?",
      note: "Download requested, not confirmed saved.",
    },
    lastUserConfirmedBackupAt: {
      type: "Instant?",
      note: "User confirms external copy saved.",
    },
    lastVerifiedBackupAt: {
      type: "Instant?",
      note: "File selected and structurally verified.",
    },
    lastObservedClockAt: {
      type: "Instant?",
      note: "Maximum trusted observed device clock; see clock rules.",
    },
    clockReviewRequired: {
      type: "Boolean",
      note: "Sticky after backward time detection.",
    },
    clockReviewedAt: {
      type: "Instant?",
      note: "Last explicit clock review.",
    },
    clockReviewReason: {
      type: "Text?",
      note: "Required with clockReviewedAt.",
    },
    termsAcknowledgments: {
      type: "TermsAcknowledgment[]",
      note: "Append-only historical acceptance receipts, preserved in backup.",
    },
    activeTermsVersion: {
      type: "Text?",
      note: "Local accepted version, null if not accepted.",
    },
  },
  Snapshot: {
    animalId: {
      type: "UUID",
      note: "FK animals.",
    },
    farmId: {
      type: "Text",
      note: "Identity at event time.",
    },
    visualTag: {
      type: "Text?",
      note: "Tag at event time.",
    },
    rfid: {
      type: "Text?",
      note: "RFID at event time.",
    },
    groupId: {
      type: "UUID?",
      note: "FK groups at event time.",
    },
    groupName: {
      type: "Text?",
      note: "Group at event time.",
    },
    pasture: {
      type: "Text?",
      note: "Pasture at event time.",
    },
  },
  WithdrawalRule: {
    state: {
      type: "Enum",
      note: "duration  /  unknown  /  not-applicable  /  prohibited  /  manual-review",
    },
    value: {
      type: "Number?",
      note: ">=0; required only for duration.",
    },
    unit: {
      type: "Enum?",
      note: "hours  /  days; required only for duration.",
    },
    source: {
      type: "Enum?",
      note: "label  /  vet; required except unknown.",
    },
    instructionText: {
      type: "Text?",
      note: "Entered instructions, including unresolved milkings or special conditions.",
    },
    instructionReference: {
      type: "Text?",
      note: "Label version or veterinarian reference; required except unknown.",
    },
    zeroConfirmedAt: {
      type: "Instant?",
      note: "Required only for explicit duration zero.",
    },
    directedReleaseAt: {
      type: "Instant?",
      note: "Veterinarian-directed release, subject to restrictions below.",
    },
    resolutionReason: {
      type: "Text?",
      note: "Required with directed release.",
    },
    resolvedAt: {
      type: "Instant?",
      note: "When the operator recorded the resolution.",
    },
    resolvedBy: {
      type: "Text?",
      note: "Operator text, not an authenticated identity.",
    },
  },
  CalfOutcome: {
    calfId: {
      type: "UUID",
      note: "FK animals, even for stillbirth with generated farm ID.",
    },
    outcome: {
      type: "Enum",
      note: "live  /  stillborn  /  died-after-birth  /  unknown",
    },
    birthWeightId: {
      type: "UUID?",
      note: "FK weights; reciprocal calvingId and calf animalId.",
    },
  },
  HoldAcknowledgment: {
    recordedAt: {
      type: "Instant",
      note: "When operator accepted notice.",
    },
    operator: {
      type: "Text",
      note: "Local operator text.",
    },
    intendedDestination: {
      type: "Text",
      note: "Truthful destination, including explicit unknown.",
    },
    eventTimeBasis: {
      type: "Enum",
      note: "exact  /  date-only-conservative",
    },
    evaluatedAt: {
      type: "Instant",
      note: "Clock reading at record time.",
    },
    meatStatus: {
      type: "Status",
      note: "Conservative event-time result.",
    },
    milkStatus: {
      type: "Status",
      note: "Conservative event-time result.",
    },
    treatmentIds: {
      type: "UUID[]",
      note: "All contributing treatment FKs at event time.",
    },
    noticeVersion: {
      type: "Text",
      note: "Literal departure-1.",
    },
    text: {
      type: "Text",
      note: "Snapshot of warning presented.",
    },
  },
  HoldReview: {
    reviewedAt: {
      type: "Instant",
      note: "Explicit review time.",
    },
    reviewedBy: {
      type: "Text",
      note: "Operator text.",
    },
    reason: {
      type: "Text",
      note: "Why shortening/void is justified.",
    },
    instructionReference: {
      type: "Text",
      note: "Evidence reference, veterinarian for directed releases.",
    },
  },
  Migration: {
    fromVersion: {
      type: "Integer",
      note: "Previous schema.",
    },
    toVersion: {
      type: "Integer",
      note: "Exactly fromVersion + 1.",
    },
    completedAt: {
      type: "Instant",
      note: "Completion time.",
    },
    appVersion: {
      type: "Text",
      note: "SemVer which migrated.",
    },
  },
  TermsAcknowledgment: {
    version: {
      type: "Text",
      note: "Exact displayed terms version, initially 2026-10-12-draft-1 for mockup only.",
    },
    acceptedAt: {
      type: "Instant",
      note: "Device UTC timestamp.",
    },
    timeZone: {
      type: "Zone",
      note: "Zone at acknowledgment.",
    },
    textSha256: {
      type: "Text",
      note: "64 lowercase hexadecimal SHA-256 of UTF-8 complete displayed terms copy.",
    },
    appVersion: {
      type: "Text",
      note: "SemVer of accepting app.",
    },
  },
};
export const indexes = {
  operation: [],
  animals: [
    ["byFarmId", "farmIdKey", true],
    ["byStatus", "status", false],
    ["byGroup", "currentGroupId", false],
    ["bySex", "sex", false],
    ["byBreed", "breed", false],
    ["byBirthDate", "birthDate", false],
    ["byDam", "damId", false],
  ],
  identifiers: [
    ["byAnimal", "animalId", false],
    ["byValue", "normalizedValue", false],
    ["byTypeValue", ["type", "normalizedValue"], false],
    ["byActiveRfid", "activeRfidKey", true],
  ],
  groups: [["byName", "name", false]],
  memberships: [
    ["byAnimalStart", ["animalId", "startDate"], false],
    ["byGroupStart", ["groupId", "startDate"], false],
  ],
  calvings: [
    ["byDate", "birthDate", false],
    ["byDamDate", ["damId", "birthDate"], false],
  ],
  weights: [
    ["byDate", "date", false],
    ["byAnimalDate", ["animalId", "date"], false],
    ["byCalving", "calvingId", false],
  ],
  treatmentCourses: [
    ["byAnimal", "animalId", false],
    ["byState", "state", false],
  ],
  treatments: [
    ["byDate", "administrationDate", false],
    ["byAnimalDate", ["animalId", "administrationDate"], false],
    ["byAnimalInstant", ["animalId", "administrationAt"], false],
    ["byCourse", "courseId", false],
    ["byBatch", "batchId", false],
  ],
  breedings: [
    ["byDam", "damId", false],
    ["byServiceDate", "serviceDate", false],
    ["byExposureStart", "exposureStart", false],
  ],
  pregnancyChecks: [
    ["byDate", "date", false],
    ["byAnimalDate", ["animalId", "date"], false],
    ["byBreeding", "breedingId", false],
  ],
  movements: [
    ["byDate", "date", false],
    ["byAnimalDate", ["animalId", "date"], false],
    ["byTypeDate", ["type", "date"], false],
  ],
  revisions: [
    ["byEntity", ["entityType", "entityId"], false],
    ["byChangedAt", "changedAt", false],
  ],
  metadata: [["bySingleton", "singletonKey", true]],
};
export const STORES = Object.keys(indexes);
