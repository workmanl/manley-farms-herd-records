// SPDX-License-Identifier: AGPL-3.0-only
// Form commands build related rows; the Phase 2 repository owns validation and commit.
import { prepareHealth, healthBasis } from "./health.js";
import {
  departurePreview,
  departureText,
  DEPARTURE_NOTICE,
  evaluateWithdrawal,
  isHold,
} from "./withdrawal.js";
export { DEPARTURE_NOTICE };
import { common } from "./database.js";
import { normalize, requireThat as check, isDate } from "./validation.js";
export const EASE = [
  ["", "Unknown"],
  ["1", "1 · Unassisted"],
  ["2", "2 · Easy assistance"],
  ["3", "3 · Difficult assistance"],
  ["4", "4 · Surgical delivery"],
  ["5", "5 · Abnormal presentation"],
];
const nullable = (v) => (v === undefined || v === null || v === "" ? null : v);
const number = (v) => (nullable(v) === null ? null : Number(v));
const fields = (data, names) =>
  Object.fromEntries(names.split(" ").map((k) => [k, nullable(data[k])]));
const find = (s, store, id) => {
  const r = s[store].find((r) => r.id === id);
  check(r, `${store}: record not found. Reload records.`);
  return r;
};
export const farmDate = (zone, now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
export function animalSnapshot(s, a) {
  return {
    animalId: a.id,
    farmId: a.farmId,
    visualTag: a.visualTag,
    rfid: a.rfid,
    groupId: a.currentGroupId,
    groupName: s.groups.find((g) => g.id === a.currentGroupId)?.name || null,
    pasture: a.pasture,
  };
}
export function prepareWorkflow(
  s,
  action,
  input,
  now = new Date().toISOString(),
) {
  if (
    [
      "treatment",
      "batch-treatment",
      "treatment-void",
      "course",
      "clock-review",
    ].includes(action)
  )
    return prepareHealth(s, action, input, now);
  const changes = [];
  const add = (store, record) => {
    changes.push({ store, record, expectedRevision: null });
    return record;
  };
  const edit = (store, prior, patch) => {
    const record = {
      ...prior,
      ...patch,
      updatedAt: now,
      revision: prior.revision + 1,
    };
    changes.push({ store, record, expectedRevision: prior.revision });
    return record;
  };
  const date = input.effectiveDate || input.date || input.birthDate;
  const reason = input.revisionReason || `Record ${action}`;
  const snaps = (ids) =>
    [...new Set(ids.filter(Boolean))].map((id) =>
      animalSnapshot(s, find(s, "animals", id)),
    );
  const membership = (a, prior, effectiveDate) => {
    if (
      prior &&
      a.currentGroupId === prior.currentGroupId &&
      a.pasture === prior.pasture
    )
      return;
    const old =
      prior &&
      s.memberships.find(
        (m) => m.animalId === a.id && !m.endDate && !m.voidedAt,
      );
    if (old || a.currentGroupId)
      check(isDate(effectiveDate), "Choose the effective group date.");
    if (old) edit("memberships", old, { endDate: effectiveDate });
    if (a.currentGroupId) {
      const group = find(s, "groups", a.currentGroupId);
      check(
        !group.archivedAt && !group.voidedAt,
        "Choose an active group or pasture.",
      );
      add("memberships", {
        ...common(now),
        animalId: a.id,
        groupId: a.currentGroupId,
        startDate: effectiveDate,
        endDate: null,
        pastureSnapshot: a.pasture,
      });
    }
  };
  const animal = (data, prior = null, effectiveDate = date) => {
    const patch = {
      ...fields(
        data,
        "farmId visualTag rfid breed birthDate damId damReference sireId sireReference currentGroupId pasture notes",
      ),
      sex: data.sex || "unknown",
      birthDatePrecision: data.birthDatePrecision || "unknown",
      status: data.status || "active",
    };
    check(
      typeof patch.farmId === "string" && patch.farmId.trim(),
      "Enter a farm ID.",
    );
    patch.farmIdKey = normalize(patch.farmId);
    patch.archivedAt =
      patch.status === "archived" ? prior?.archivedAt || now : null;
    const a = prior
      ? edit("animals", prior, patch)
      : add("animals", { ...common(now), ...patch });
    for (const [field, type] of [
      ["farmId", "farm-id"],
      ["visualTag", "visual-tag"],
      ["rfid", "rfid"],
    ]) {
      if (prior && prior[field] === a[field]) continue;
      const old =
        prior &&
        s.identifiers.find(
          (i) =>
            i.animalId === a.id && i.type === type && !i.validTo && !i.voidedAt,
        );
      if (prior)
        check(isDate(effectiveDate), "Choose the effective identifier date.");
      if (old)
        edit("identifiers", old, {
          validTo: effectiveDate,
          replacementReason: reason,
          activeRfidKey: null,
        });
      if (a[field] !== null)
        add("identifiers", {
          ...common(now),
          animalId: a.id,
          type,
          value: a[field],
          normalizedValue: normalize(a[field]),
          validFrom: effectiveDate || null,
          validTo: null,
          replacementReason: prior ? reason : null,
          activeRfidKey: type === "rfid" ? normalize(a[field]) : null,
        });
    }
    membership(a, prior, effectiveDate);
    return a;
  };
  let result;
  if (action === "animal") {
    const prior = input.id ? find(s, "animals", input.id) : null;
    if (prior)
      check(
        input.revisionReason?.trim(),
        "Enter a revision reason for this correction.",
      );
    result = animal(input, prior);
    // A birth correction is one audited change across the complete delivery.
    const birth =
      prior &&
      s.calvings.find(
        (c) => !c.voidedAt && c.calves.some((x) => x.calfId === prior.id),
      );
    const birthKeys = ["birthDate", "damId", "sireId", "sireReference"];
    if (birth && birthKeys.some((k) => result[k] !== prior[k])) {
      check(
        result.birthDate && result.damId,
        "A recorded calving needs a birth date and herd dam. Correct the linked delivery together.",
      );
      const patch = Object.fromEntries(birthKeys.map((k) => [k, result[k]]));
      const originalIds = new Set(birth.snapshots.map((x) => x.animalId));
      const snapshots = [
        ...birth.snapshots,
        ...snaps(
          [result.damId, result.sireId].filter(
            (id) => id && !originalIds.has(id),
          ),
        ),
      ];
      edit("calvings", birth, { ...patch, snapshots });
      for (const calf of birth.calves) {
        if (calf.calfId !== prior.id)
          edit("animals", find(s, "animals", calf.calfId), {
            ...patch,
            damReference: null,
            birthDatePrecision: result.birthDatePrecision,
          });
        if (calf.birthWeightId)
          edit("weights", find(s, "weights", calf.birthWeightId), {
            date: result.birthDate,
          });
      }
    }
  } else if (action === "group") {
    const prior = input.id ? find(s, "groups", input.id) : null;
    if (prior) check(input.revisionReason?.trim(), "Enter a revision reason.");
    const patch = {
      name: input.name,
      type: input.type,
      description: nullable(input.description),
      archivedAt: input.archived ? prior?.archivedAt || now : null,
    };
    result = prior
      ? edit("groups", prior, patch)
      : add("groups", { ...common(now), ...patch });
  } else if (action === "move") {
    check(input.animalIds?.length, "Select at least one animal.");
    check(
      new Set(input.animalIds).size === input.animalIds.length,
      "An animal was selected twice.",
    );
    check(isDate(input.date), "Choose a valid move date.");
    for (const id of input.animalIds) {
      const prior = find(s, "animals", id);
      const patch = {
        currentGroupId: nullable(input.groupId),
        pasture: nullable(input.pasture),
      };
      check(
        prior.currentGroupId !== patch.currentGroupId ||
          prior.pasture !== patch.pasture,
        `${prior.farmId} is already in this group and pasture.`,
      );
      const next = edit("animals", prior, patch);
      membership(next, prior, input.date);
    }
  } else if (action === "calving") {
    check(
      input.dateConfirmed === true,
      "Confirm the birth date before saving.",
    );
    check(
      input.calves?.length > 0 && input.calves.length <= 2,
      "Enter one calf or twins.",
    );
    check(
      !s.calvings.some((c) => c.id === input.eventId),
      "This delivery is already committed. Open the dam history before entering another.",
    );
    const dam = find(s, "animals", input.damId);
    check(
      dam.sex === "female" || input.acknowledgeParentSex,
      "Review dam sex before recording calving.",
    );
    const c = {
      ...common(now),
      ...fields(input, "damId sireId sireReference birthDate notes"),
      calves: [],
      easeScore: number(input.easeScore),
      easeScaleVersion: "local-1",
      snapshots: [],
    };
    if (input.eventId) c.id = input.eventId;
    for (const data of input.calves) {
      const calf = animal(
        {
          ...data,
          farmId: data.farmId || `CALF-${crypto.randomUUID()}`,
          birthDate: c.birthDate,
          birthDatePrecision: input.birthDatePrecision || "exact",
          damId: dam.id,
          sireId: c.sireId,
          sireReference: c.sireReference,
          status: ["stillborn", "died-after-birth"].includes(data.outcome)
            ? "dead"
            : "active",
        },
        null,
        c.birthDate,
      );
      let w = null;
      if (nullable(data.weight) !== null)
        w = add("weights", {
          ...common(now),
          animalId: calf.id,
          date: c.birthDate,
          type: "birth",
          value: number(data.weight),
          unit: data.unit,
          calvingId: c.id,
          notes: null,
          snapshots: [animalSnapshot(s, calf)],
        });
      c.calves.push({
        calfId: calf.id,
        outcome: data.outcome || "live",
        birthWeightId: w?.id || null,
      });
      c.snapshots.push(animalSnapshot(s, calf));
    }
    c.snapshots.push(...snaps([dam.id, c.sireId]));
    result = add("calvings", c);
  } else if (["weight", "breeding", "pregnancy", "movement"].includes(action)) {
    const a = find(s, "animals", input.animalId);
    let row = {
      ...common(now),
      notes: nullable(input.notes),
      snapshots: snaps([a.id, action === "breeding" ? input.sireId : null]),
    };
    if (action === "weight")
      result = add("weights", {
        ...row,
        animalId: a.id,
        date: input.date,
        type: input.type,
        value: number(input.value),
        unit: input.unit,
        calvingId: null,
      });
    if (action === "breeding") {
      check(
        a.sex === "female" || input.acknowledgeParentSex,
        "Review dam sex before recording breeding.",
      );
      result = add("breedings", {
        ...row,
        damId: a.id,
        method: input.method,
        ...fields(
          input,
          "sireId sireReference serviceDate exposureStart exposureEnd",
        ),
      });
    }
    if (action === "pregnancy") {
      check(
        a.sex === "female" || input.acknowledgeParentSex,
        "Review animal sex before recording a pregnancy check.",
      );
      result = add("pregnancyChecks", {
        ...row,
        animalId: a.id,
        ...fields(
          input,
          "breedingId date method methodOther result expectedCalvingDate examiner",
        ),
        estimatedGestationDays: number(input.estimatedGestationDays),
      });
    }
    if (action === "movement") {
      const departed = {
        sale: "sold",
        death: "dead",
        "other-departure": "culled",
      }[input.type];
      let holdAcknowledgment = null;
      if (departed) {
        check(
          input.acknowledgeDeparture === true,
          "Review and acknowledge the departure notice.",
        );
        check(
          input.destination?.trim(),
          "Enter the intended destination, or explicitly enter Unknown.",
        );
        const preview = departurePreview(s, a.id, input.date, now);
        holdAcknowledgment = {
          recordedAt: now,
          evaluatedAt: now,
          operator: "Local operator",
          intendedDestination: input.destination,
          eventTimeBasis: "date-only-conservative",
          meatStatus: preview.event.meat.status,
          milkStatus: preview.event.milk.status,
          treatmentIds: preview.treatmentIds,
          noticeVersion: "departure-1",
          text: departureText(preview),
        };
      }
      result = add("movements", {
        ...row,
        animalId: a.id,
        ...fields(
          input,
          "type date source destination reason amount currency receiptReference",
        ),
        weightValue: number(input.weightValue),
        weightUnit: nullable(input.weightUnit),
        holdAcknowledgment,
      });
      // Historical entries must not overwrite the status of a later departure.
      const latest = [
        ...s.movements.filter(
          (m) =>
            m.animalId === a.id &&
            !m.voidedAt &&
            ["sale", "death", "other-departure"].includes(m.type),
        ),
        ...(departed ? [result] : []),
      ]
        .sort((x, y) => x.date.localeCompare(y.date))
        .at(-1);
      if (latest && a.status !== "archived")
        edit("animals", a, {
          status: { sale: "sold", death: "dead", "other-departure": "culled" }[
            latest.type
          ],
        });
    }
  } else throw new Error("Unknown herd workflow.");
  return {
    changes,
    result,
    options: {
      reason,
      ...(action === "movement" ? { expectedHealth: healthBasis(s) } : {}),
      acknowledgeDuplicateTags: input.acknowledgeDuplicateTags === true,
      acknowledgeParentSex: input.acknowledgeParentSex === true,
    },
  };
}
export async function commitWorkflow(repo, snapshot, action, input) {
  const plan = prepareWorkflow(snapshot, action, input);
  if (
    action === "weight" &&
    plan.changes.length === 1 &&
    plan.result.type !== "birth"
  )
    await repo.appendWeight(plan.result);
  else await repo.mutate(plan.changes, plan.options);
  return plan.result;
}
export function adg(first, second, unit = "lb") {
  const valid = (w) =>
    w &&
    !w.voidedAt &&
    isDate(w.date) &&
    Number.isFinite(w.value) &&
    w.value > 0 &&
    ["lb", "kg"].includes(w.unit);
  if (
    !valid(first) ||
    !valid(second) ||
    !["lb", "kg"].includes(unit) ||
    (first.animalId && second.animalId && first.animalId !== second.animalId)
  )
    return { text: "Not enough data" };
  const [start, end] = [first, second].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const days = (Date.parse(end.date) - Date.parse(start.date)) / 86400000;
  if (days <= 0) return { text: "Not enough data" };
  const convert = (w) =>
    w.unit === unit
      ? w.value
      : unit === "kg"
        ? w.value * 0.45359237
        : w.value / 0.45359237;
  const value = (convert(end) - convert(start)) / days;
  return {
    value,
    days,
    unit,
    start,
    end,
    text: `${value.toFixed(2)} ${unit}/day`,
  };
}
export function searchAnimals(s, filters = {}) {
  const f = filters,
    query = normalize(f.query || "");
  const withdrawal = f.withdrawal
    ? new Map(
        evaluateWithdrawal(s, {
          now: f.now || new Date().toISOString(),
        }).animals.map((r) => [r.animal.id, r]),
      )
    : null;
  const former = new Map();
  for (const i of s.identifiers)
    if (!i.voidedAt)
      former.set(i.animalId, [...(former.get(i.animalId) || []), i.value]);
  const rows = s.animals
    .filter((a) => {
      if (withdrawal) {
        const row = withdrawal.get(a.id);
        const matches =
          f.withdrawal === "meat-hold"
            ? isHold(row.meat.status)
            : f.withdrawal === "milk-hold"
              ? isHold(row.milk.status)
              : f.withdrawal === "needs-review"
                ? row.needsReview
                : [row.meat.status, row.milk.status].includes(f.withdrawal);
        if (!matches) return false;
      }
      if (
        f.status
          ? a.status !== f.status
          : !f.includeInactive && a.status !== "active"
      )
        return false;
      if (
        (f.sex && a.sex !== f.sex) ||
        (f.breed && normalize(a.breed || "") !== normalize(f.breed)) ||
        (f.damId && a.damId !== f.damId) ||
        (f.groupId && a.currentGroupId !== f.groupId)
      )
        return false;
      if ((f.birthFrom || f.birthTo) && !a.birthDate) return false;
      if (
        (f.birthFrom && a.birthDate < f.birthFrom) ||
        (f.birthTo && a.birthDate > f.birthTo)
      )
        return false;
      if (nullable(f.minAgeDays) !== null || nullable(f.maxAgeDays) !== null) {
        if (!a.birthDate || !isDate(f.asOf)) return false;
        const age = (Date.parse(f.asOf) - Date.parse(a.birthDate)) / 86400000;
        if (
          (nullable(f.minAgeDays) !== null && age < Number(f.minAgeDays)) ||
          (nullable(f.maxAgeDays) !== null && age > Number(f.maxAgeDays))
        )
          return false;
      }
      return (
        !query ||
        [
          a.farmId,
          a.visualTag,
          a.rfid,
          a.notes,
          ...(former.get(a.id) || []),
        ].some((v) => v && normalize(v).includes(query))
      );
    })
    .sort(
      (a, b) => a.farmId.localeCompare(b.farmId) || a.id.localeCompare(b.id),
    );
  const pageSize = Math.max(1, Math.min(100, Number(f.pageSize) || 25));
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.max(1, Math.min(pages, Number(f.page) || 1));
  return {
    total: rows.length,
    herdTotal: s.animals.length,
    page,
    pages,
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
  };
}
export function events(s, { animalId, type, from, to, limit } = {}) {
  const stores = [
    "animals",
    "identifiers",
    "memberships",
    "calvings",
    "weights",
    "breedings",
    "pregnancyChecks",
    "movements",
    "treatments",
    "treatmentCourses",
    "revisions",
    "groups",
  ];
  const involved = (store, r) =>
    store === "animals"
      ? [r.id]
      : [
          r.animalId,
          r.damId,
          r.sireId,
          ...(r.calves || []).map((c) => c.calfId),
          ...(r.snapshots || []).map((x) => x.animalId),
        ];
  const rows = [];
  const compare = (a, b) =>
    b.date.localeCompare(a.date) || a.record.id.localeCompare(b.record.id);
  for (const store of stores) {
    if (type && store !== type) continue;
    for (const record of s[store]) {
      const date =
        record.date ||
        record.birthDate ||
        record.serviceDate ||
        record.exposureStart ||
        record.administrationDate ||
        record.startDate ||
        record.validFrom ||
        record.changedAt ||
        record.createdAt;
      if ((from && date.slice(0, 10) < from) || (to && date.slice(0, 10) > to))
        continue;
      if (
        limit &&
        rows.length >= limit &&
        compare({ date, record }, rows.at(-1)) >= 0
      )
        continue;
      const animalIds =
        store === "revisions"
          ? involved(record.entityType, record.newValues)
          : involved(store, record);
      if (animalId && !animalIds.includes(animalId)) continue;
      rows.push({ store, record, date, animalIds });
      if (limit) {
        rows.sort(compare);
        if (rows.length > limit) rows.pop();
      }
    }
  }
  return limit ? rows : rows.sort(compare);
}
// Small, versioned, dataset-scoped local form drafts. These are not herd records or backups.
export function draftStore(storage, datasetId) {
  const key = (name) => `manley-herd-draft-v1:${datasetId}:${name}`;
  return {
    save(name, data) {
      storage.setItem(key(name), JSON.stringify({ version: 1, data }));
    },
    load(name) {
      const raw = storage.getItem(key(name));
      if (!raw) return null;
      let value;
      try {
        value = JSON.parse(raw);
      } catch {
        throw new Error(
          "The local draft is unreadable. Start a new draft explicitly.",
        );
      }
      check(
        value.version === 1 && value.data && typeof value.data === "object",
        "Unsupported local draft. Start a new draft explicitly.",
      );
      return value.data;
    },
    clear(name) {
      storage.removeItem(key(name));
    },
  };
}
