// SPDX-License-Identifier: AGPL-3.0-only
import { models, STORES } from "./contract.js";
export const normalize = (value) =>
  value
    .normalize("NFC")
    .trim()
    .replace(/[A-Z]/g, (c) => c.toLowerCase());
export const same = (a, b) => canonical(a) === canonical(b);
export function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function requireThat(ok, message) {
  if (!ok) throw new Error(message);
}
const check = requireThat;
export const isUUID = (v) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    v,
  );
export const isDate = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
export const isInstant = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString() === v;
const semver = (v) =>
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
    v,
  );
export function exactKeys(object, keys, path) {
  check(
    object &&
      typeof object === "object" &&
      !Array.isArray(object) &&
      Object.keys(object).length === keys.length &&
      keys.every((k) => Object.hasOwn(object, k)),
    `${path}: missing or unknown fields`,
  );
}
const statuses = [
  "held",
  "needs-review",
  "elapsed",
  "not-applicable",
  "no-recorded-interval",
];
const validZones = new Set();
function primitive(value, descriptor, path) {
  let { type, note } = descriptor;
  if (type.endsWith("?")) {
    if (value === null) return;
    type = type.slice(0, -1);
  }
  if (type.endsWith("[]")) {
    check(Array.isArray(value), path + ": expected array");
    value.forEach((v, i) =>
      primitive(v, { type: type.slice(0, -2), note }, `${path}[${i}]`),
    );
    return;
  }
  if (models[type]) {
    shape(type, value, path);
    return;
  }
  let ok = false;
  switch (type) {
    case "Text":
      ok = typeof value === "string" && value.trim().length > 0;
      break;
    case "UUID":
      ok = isUUID(value);
      break;
    case "Date":
      ok = isDate(value);
      break;
    case "Instant":
      ok = isInstant(value);
      break;
    case "LocalDateTime":
      ok =
        typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value) &&
        isInstant(value + ".000Z");
      break;
    case "Zone":
      try {
        if (!validZones.has(value)) {
          new Intl.DateTimeFormat("en", { timeZone: value });
          validZones.add(value);
        }
        ok = typeof value === "string" && !/^[+-]/.test(value);
      } catch {}
      break;
    case "Integer":
      ok = Number.isSafeInteger(value);
      break;
    case "Number":
      ok = typeof value === "number" && Number.isFinite(value);
      break;
    case "Boolean":
      ok = typeof value === "boolean";
      break;
    case "Decimal":
      ok =
        typeof value === "string" && /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value);
      break;
    case "Currency":
      ok =
        typeof value === "string" &&
        /^[A-Z]{3}$/.test(value) &&
        Intl.supportedValuesOf("currency").includes(value);
      break;
    case "Status":
      ok = statuses.includes(value);
      break;
    case "Enum": {
      const values = path.endsWith(".entityType")
        ? STORES.filter((s) => s !== "revisions")
        : note
            .split(";")[0]
            .split(",")[0]
            .split(/\s+\/\s+/)
            .map((x) => x.trim());
      ok = values.includes(value);
      break;
    }
    case "Object":
      ok = value && typeof value === "object" && !Array.isArray(value);
      break;
  }
  check(ok, `${path}: invalid ${type}`);
}
const shapes = Object.fromEntries(
  Object.entries(models).map(([type, fields]) => {
    const full = STORES.includes(type)
      ? { ...models.Common, ...fields }
      : fields;
    return [type, { keys: Object.keys(full), entries: Object.entries(full) }];
  }),
);
export function shape(type, record, path = type) {
  const fields = shapes[type];
  exactKeys(record, fields.keys, path);
  for (const [key, desc] of fields.entries)
    primitive(record[key], desc, `${path}.${key}`);
  if (STORES.includes(type))
    check(record.revision >= 1, `${path}: revision must be positive`);
}
function rule(r, commodity) {
  if (r.state === "duration") {
    check(
      r.value !== null && r.value >= 0 && r.unit !== null,
      "duration value and unit required",
    );
    check(
      Number.isSafeInteger(r.value * (r.unit === "days" ? 86400000 : 3600000)),
      "duration must resolve to safe whole milliseconds",
    );
    check(
      (r.value === 0) === (r.zeroConfirmedAt !== null),
      "zero confirmation required only for zero",
    );
  } else
    check(
      r.value === null && r.unit === null && r.zeroConfirmedAt === null,
      "non-duration has no value/unit/zero",
    );
  if (r.state !== "unknown")
    check(
      r.source && r.instructionReference,
      "instruction source and reference required",
    );
  if (r.state === "not-applicable" && commodity === "meat")
    check(r.instructionText, "meat disposition required");
  const resolution = [r.resolutionReason, r.resolvedAt, r.resolvedBy];
  if (r.directedReleaseAt)
    check(
      ["unknown", "manual-review"].includes(r.state) &&
        r.source === "vet" &&
        r.instructionText &&
        r.instructionReference &&
        resolution.every(Boolean),
      "invalid directed release",
    );
  else
    check(
      resolution.every((x) => x === null),
      "partial directed release",
    );
}
export function validateRecord(type, r) {
  shape(type, r);
  const pair = (a, b) =>
    check(
      (r[a] === null) === (r[b] === null),
      `${type}: ${a}/${b} must be paired`,
    );
  if (r.snapshots) {
    check(r.snapshots.length > 0, "snapshots required");
    unique(
      r.snapshots.map((s) => s.animalId),
      "snapshot animal",
    );
  }
  if ("sireId" in r)
    check(!(r.sireId && r.sireReference), "sire link/reference exclusive");
  switch (type) {
    case "operation":
      check(
        r.backupReminderDays >= 1 && r.backupReminderDays <= 365,
        "backup days range",
      );
      break;
    case "animals":
      check(
        r.farmIdKey === normalize(r.farmId) && r.farmIdKey.length > 0,
        "farm ID normalization",
      );
      check(!(r.damId && r.damReference), "dam link/reference exclusive");
      check(
        (r.birthDate === null) === (r.birthDatePrecision === "unknown"),
        "birth date precision",
      );
      if (r.status === "archived")
        check(r.archivedAt, "archived status requires timestamp");
      break;
    case "identifiers":
      check(
        r.normalizedValue === normalize(r.value) &&
          r.normalizedValue.length > 0,
        "identifier normalization",
      );
      check(
        r.activeRfidKey ===
          (r.type === "rfid" && r.validTo === null && r.voidedAt === null
            ? r.normalizedValue
            : null),
        "active RFID key",
      );
      check(
        !r.validTo || !r.validFrom || r.validTo >= r.validFrom,
        "identifier dates",
      );
      if (r.validTo)
        check(r.replacementReason, "ended identifier needs reason");
      break;
    case "memberships":
      check(!r.endDate || r.endDate >= r.startDate, "membership dates");
      break;
    case "calvings":
      check(
        r.calves.length > 0 &&
          r.easeScaleVersion === "local-1" &&
          (r.easeScore === null || (r.easeScore >= 1 && r.easeScore <= 5)),
        "calving outcomes/ease",
      );
      unique(
        r.calves.map((x) => x.calfId),
        "calf",
      );
      break;
    case "weights":
      check(
        r.value > 0 && (!r.calvingId || r.type === "birth"),
        "weight must be positive; linked weights must be birth",
      );
      break;
    case "treatmentCourses":
      check(
        (r.state === "open") === (r.finalAdministrationId === null),
        "course final administration",
      );
      break;
    case "treatments": {
      pair("doseValue", "doseUnit");
      check(
        r.doseValue === null ? !!r.notes : r.doseValue > 0,
        "dose or unknown explanation required",
      );
      check(
        (r.route === "other") === (r.routeOther !== null),
        "routeOther condition",
      );
      if (r.administrationPrecision === "date-only")
        check(
          r.administrationAt === null &&
            r.enteredLocalTime === null &&
            r.offsetMinutes === null,
          "date-only timing",
        );
      else {
        check(
          r.administrationAt &&
            r.enteredLocalTime &&
            r.timeZone &&
            r.offsetMinutes !== null &&
            Math.abs(r.offsetMinutes) <= 840,
          "instant timing required",
        );
        check(
          r.administrationDate === r.enteredLocalTime.slice(0, 10),
          "administration date mismatch",
        );
        const shifted = new Date(
          Date.parse(r.administrationAt) + r.offsetMinutes * 60000,
        )
          .toISOString()
          .slice(0, 19);
        const parts = Object.fromEntries(
          new Intl.DateTimeFormat("en-CA", {
            timeZone: r.timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hourCycle: "h23",
          })
            .formatToParts(new Date(r.administrationAt))
            .map((p) => [p.type, p.value]),
        );
        const local = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
        check(
          shifted === r.enteredLocalTime && local === r.enteredLocalTime,
          "time zone/offset conflict or nonexistent local time",
        );
      }
      rule(r.meat, "meat");
      rule(r.milk, "milk");
      for (const commodity of ["meat", "milk"])
        if (r[commodity].directedReleaseAt && r.administrationAt)
          check(
            r[commodity].directedReleaseAt >= r.administrationAt,
            "directed release precedes administration",
          );
      break;
    }
    case "breedings":
      check(
        r.serviceDate
          ? r.exposureStart === null && r.exposureEnd === null
          : r.method === "natural" && r.exposureStart !== null,
        "service or natural interval required",
      );
      check(
        !r.exposureEnd || r.exposureEnd >= r.exposureStart,
        "exposure date range",
      );
      break;
    case "pregnancyChecks":
      check(
        (r.method === "other") === (r.methodOther !== null),
        "methodOther condition",
      );
      check(
        r.estimatedGestationDays === null || r.estimatedGestationDays >= 0,
        "gestation range",
      );
      check(
        r.result === "pregnant" ||
          (r.estimatedGestationDays === null && r.expectedCalvingDate === null),
        "only pregnant has gestation/due date",
      );
      break;
    case "movements":
      pair("weightValue", "weightUnit");
      pair("amount", "currency");
      check(r.weightValue === null || r.weightValue > 0, "movement weight");
      if (r.amount !== null)
        check(
          (r.amount.split(".")[1]?.length || 0) <=
            new Intl.NumberFormat("en", {
              style: "currency",
              currency: r.currency,
            }).resolvedOptions().maximumFractionDigits,
          "currency precision",
        );
      if (r.type === "purchase")
        check(r.source || r.notes, "purchase source or explanation");
      if (["sale", "other-departure"].includes(r.type))
        check(r.destination || r.notes, "destination or explanation");
      if (r.type === "sale")
        check(r.holdAcknowledgment, "sale hold acknowledgment required");
      if (r.holdAcknowledgment) {
        check(
          r.holdAcknowledgment.noticeVersion === "departure-1",
          "departure notice version",
        );
        unique(r.holdAcknowledgment.treatmentIds, "acknowledged treatment");
      }
      break;
    case "metadata":
      check(
        r.singletonKey === "dataset" &&
          r.format === "manley-herd-records" &&
          r.schemaVersion === 1 &&
          semver(r.appVersion),
        "metadata version/format",
      );
      pair("clockReviewedAt", "clockReviewReason");
      for (const receipt of r.termsAcknowledgments)
        check(
          /^[0-9a-f]{64}$/.test(receipt.textSha256) &&
            semver(receipt.appVersion),
          "terms hash/app version",
        );
      check(
        !r.activeTermsVersion ||
          r.termsAcknowledgments.some(
            (a) => a.version === r.activeTermsVersion,
          ),
        "active terms receipt missing",
      );
      r.migrationHistory.forEach((m, i) =>
        check(
          m.toVersion === m.fromVersion + 1 &&
            (i === 0 ||
              m.fromVersion === r.migrationHistory[i - 1].toVersion) &&
            semver(m.appVersion),
          "sequential migration history",
        ),
      );
      break;
    case "revisions":
      check(
        r.revision === 1 && r.archivedAt === null && r.voidedAt === null,
        "revisions are immutable",
      );
      validateRecord(r.entityType, r.priorValues);
      validateRecord(r.entityType, r.newValues);
      check(
        r.priorValues.id === r.entityId &&
          r.newValues.id === r.entityId &&
          r.newValues.revision === r.priorValues.revision + 1 &&
          r.newValues.createdAt === r.priorValues.createdAt &&
          r.changedAt === r.newValues.updatedAt,
        "revision provenance",
      );
      if (needsHoldReview(r.entityType, r.priorValues, r.newValues))
        check(r.holdReview, "clinical correction needs hold review");
      break;
  }
}
export function needsHoldReview(type, a, b) {
  const keys =
    type === "treatments"
      ? [
          "voidedAt",
          "animalId",
          "administrationAt",
          "administrationDate",
          "administrationPrecision",
          "enteredLocalTime",
          "offsetMinutes",
          "timeZone",
          "courseId",
          "meat",
          "milk",
          "product",
        ]
      : type === "treatmentCourses"
        ? [
            "voidedAt",
            "animalId",
            "state",
            "finalAdministrationId",
            "product",
            "instructionReference",
          ]
        : [];
  return keys.some((k) => !same(a[k], b[k]));
}
function unique(values, label) {
  check(new Set(values).size === values.length, `duplicate ${label}`);
}
export function validateDataset(
  stores,
  { acknowledgeDuplicateTags = false, acknowledgeParentSex = false } = {},
) {
  exactKeys(stores, STORES, "stores");
  const maps = {};
  for (const type of STORES) {
    check(Array.isArray(stores[type]), `${type}: array required`);
    stores[type].forEach((r) => validateRecord(type, r));
    unique(
      stores[type].map((r) => r.id),
      type + " ID",
    );
    maps[type] = new Map(stores[type].map((r) => [r.id, r]));
  }
  check(
    stores.operation.length === 1 && stores.metadata.length === 1,
    "exactly one operation and metadata required",
  );
  const fk = (type, id) => {
    check(
      id === null || maps[type].has(id),
      `missing ${type} reference: ${id}`,
    );
    return maps[type].get(id);
  };
  const warnings = [];
  unique(
    stores.animals.map((a) => a.farmIdKey),
    "farm ID",
  );
  unique(
    stores.identifiers
      .filter((i) => i.activeRfidKey !== null)
      .map((i) => i.activeRfidKey),
    "active RFID",
  );
  const tags = stores.identifiers
    .filter((i) => i.type === "visual-tag" && !i.validTo && !i.voidedAt)
    .map((i) => i.normalizedValue);
  if (new Set(tags).size !== tags.length) {
    warnings.push("Duplicate current visual tags require acknowledgment.");
    check(
      acknowledgeDuplicateTags,
      "duplicate visual tags require acknowledgment",
    );
  }
  for (const [type, rows] of Object.entries(stores))
    for (const r of rows) {
      for (const key of ["animalId", "damId", "sireId"])
        if (key in r) fk("animals", r[key]);
      for (const key of ["groupId", "currentGroupId"])
        if (key in r) fk("groups", r[key]);
      for (const [key, target] of [
        ["calvingId", "calvings"],
        ["breedingId", "breedings"],
        ["courseId", "treatmentCourses"],
        ["finalAdministrationId", "treatments"],
      ])
        if (key in r) fk(target, r[key]);
      for (const s of r.snapshots || []) {
        fk("animals", s.animalId);
        fk("groups", s.groupId);
      }
      if (r.snapshots) {
        const involved =
          type === "calvings"
            ? [r.damId, r.sireId, ...r.calves.map((c) => c.calfId)]
            : [r.animalId || r.damId, r.sireId];
        check(
          involved
            .filter(Boolean)
            .every((id) => r.snapshots.some((s) => s.animalId === id)),
          `${type}: missing involved animal snapshot`,
        );
      }
      if (type === "revisions") fk(r.entityType, r.entityId);
      if (r.holdAcknowledgment)
        for (const id of r.holdAcknowledgment.treatmentIds)
          check(
            fk("treatments", id).animalId === r.animalId,
            "hold treatment belongs to another animal",
          );
    }
  const groupBy = (rows, key) => {
    const map = new Map();
    for (const row of rows) {
      const k = row[key];
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(row);
    }
    return map;
  };
  const identifiersByAnimal = groupBy(stores.identifiers, "animalId"),
    membershipsByAnimal = groupBy(stores.memberships, "animalId"),
    movementsByAnimal = groupBy(stores.movements, "animalId"),
    treatmentsByCourse = groupBy(stores.treatments, "courseId");
  const visited = new Set(),
    visiting = new Set();
  function visit(a) {
    if (visited.has(a.id)) return;
    check(!visiting.has(a.id), "pedigree cycle");
    visiting.add(a.id);
    for (const k of ["damId", "sireId"])
      if (a[k]) visit(maps.animals.get(a[k]));
    visiting.delete(a.id);
    visited.add(a.id);
  }
  for (const a of stores.animals) {
    visit(a);
    for (const [key, sex] of [
      ["damId", "female"],
      ["sireId", "male"],
    ])
      if (a[key] && maps.animals.get(a[key]).sex !== sex) {
        warnings.push(`Review parent sex: ${a.farmId}`);
        check(acknowledgeParentSex, "parent sex requires review");
      }
    const ids = (identifiersByAnimal.get(a.id) || []).filter(
      (i) => i.animalId === a.id && !i.validTo && !i.voidedAt,
    );
    for (const [type, key] of [
      ["farm-id", "farmId"],
      ["visual-tag", "visualTag"],
      ["rfid", "rfid"],
    ]) {
      const current = ids.filter((i) => i.type === type);
      check(
        a[key] === null
          ? current.length === 0
          : current.length === 1 && current[0].value === a[key],
        "current identifier must mirror animal",
      );
    }
    const memberships = (membershipsByAnimal.get(a.id) || [])
      .filter((m) => m.animalId === a.id && !m.voidedAt)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    for (let i = 1; i < memberships.length; i++)
      check(
        memberships[i - 1].endDate &&
          memberships[i - 1].endDate <= memberships[i].startDate,
        "overlapping memberships",
      );
    const current = memberships.filter((m) => m.endDate === null);
    check(
      a.currentGroupId === null
        ? current.length === 0
        : current.length === 1 &&
            current[0].groupId === a.currentGroupId &&
            current[0].pastureSnapshot === a.pasture,
      "current group/pasture must mirror membership",
    );
    const departures = (movementsByAnimal.get(a.id) || [])
      .filter(
        (m) =>
          m.animalId === a.id &&
          !m.voidedAt &&
          ["sale", "death", "other-departure"].includes(m.type),
      )
      .sort((x, y) => x.date.localeCompare(y.date));
    if (departures.length && a.status !== "archived")
      check(
        a.status ===
          { sale: "sold", death: "dead", "other-departure": "culled" }[
            departures.at(-1).type
          ],
        "movement status mismatch",
      );
    if (
      !departures.length &&
      (movementsByAnimal.get(a.id) || []).some(
        (m) => m.animalId === a.id && !m.voidedAt && m.type === "cull-decision",
      ) &&
      a.status !== "archived"
    )
      check(a.status === "active", "cull decision must leave active");
  }
  const calves = [];
  for (const c of stores.calvings)
    for (const outcome of c.calves) {
      const a = fk("animals", outcome.calfId);
      const w = fk("weights", outcome.birthWeightId);
      if (!c.voidedAt) calves.push(a.id);
      check(
        a.birthDate === c.birthDate &&
          a.damId === c.damId &&
          a.sireId === c.sireId &&
          a.sireReference === c.sireReference,
        "calf parentage/birth date mismatch",
      );
      if (outcome.outcome === "stillborn")
        check(a.status === "dead", "stillborn calf must be dead");
      if (w)
        check(
          w.calvingId === c.id &&
            w.animalId === a.id &&
            w.date === c.birthDate &&
            w.type === "birth",
          "birth weight reciprocal links",
        );
    }
  unique(calves, "calf birth event");
  for (const w of stores.weights)
    if (w.calvingId)
      check(
        maps.calvings
          .get(w.calvingId)
          .calves.some(
            (c) => c.calfId === w.animalId && c.birthWeightId === w.id,
          ),
        "orphan linked birth weight",
      );
  unique(
    stores.weights
      .filter((w) => w.type === "birth" && !w.voidedAt)
      .map((w) => w.animalId),
    "birth weight",
  );
  for (const t of stores.treatments)
    if (t.courseId) {
      const c = maps.treatmentCourses.get(t.courseId);
      check(
        c.animalId === t.animalId && c.product === t.product,
        "course animal/product mismatch",
      );
    }
  for (const c of stores.treatmentCourses)
    if (c.finalAdministrationId) {
      const doses = (treatmentsByCourse.get(c.id) || []).filter(
        (t) => t.courseId === c.id && !t.voidedAt,
      );
      const final = maps.treatments.get(c.finalAdministrationId);
      for (const dose of doses)
        for (const commodity of ["meat", "milk"])
          if (dose[commodity].directedReleaseAt && final.administrationAt)
            check(
              dose[commodity].directedReleaseAt >= final.administrationAt,
              "directed release precedes final administration",
            );
      check(
        doses.includes(final) &&
          doses.every(
            (t) =>
              (t.administrationAt || t.administrationDate) <=
              (final.administrationAt || final.administrationDate),
          ),
        "course final dose must be latest nonvoid administration",
      );
    }
  for (const p of stores.pregnancyChecks)
    if (p.breedingId)
      check(
        maps.breedings.get(p.breedingId).damId === p.animalId,
        "pregnancy breeding animal mismatch",
      );
  return { warnings };
}
