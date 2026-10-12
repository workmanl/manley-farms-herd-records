// SPDX-License-Identifier: AGPL-3.0-only
import { common } from "./database.js";
import { requireThat as check, isInstant } from "./validation.js";
import {
  enteredInstant,
  localParts,
  departurePreview,
  departureText,
} from "./withdrawal.js";
const nullable = (v) => (v === "" || v === undefined ? null : v);
export function healthBasis(s) {
  return {
    ...Object.fromEntries(
      ["animals", "treatments", "treatmentCourses", "movements"].map((key) => [
        key,
        [...s[key]].sort((a, b) => a.id.localeCompare(b.id)),
      ]),
    ),
    timeZone: s.operation[0].timeZone,
    clockReviewRequired: s.metadata[0].clockReviewRequired,
  };
}
function snapshot(s, a) {
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
export function captureRule(data, prefix, now) {
  if (data[prefix] && typeof data[prefix] === "object")
    return structuredClone(data[prefix]);
  const get = (name) => nullable(data[`${prefix}:${name}`]);
  const state = get("state");
  check(
    state,
    `Choose an explicit ${prefix} withdrawal state. Blank is not zero.`,
  );
  const rule = Object.fromEntries(
    "source instructionText instructionReference directedReleaseAt resolutionReason resolvedAt resolvedBy"
      .split(" ")
      .map((k) => [k, get(k)]),
  );
  rule.state = state;
  rule.value =
    state === "duration" &&
    get("value") !== null &&
    String(get("value")).trim() !== ""
      ? Number(get("value"))
      : null;
  rule.unit = state === "duration" ? get("unit") : null;
  rule.zeroConfirmedAt =
    state === "duration" && rule.value === 0 && get("zeroConfirmed") === true
      ? now
      : null;
  for (const key of ["directedReleaseAt", "resolvedAt"])
    if (rule[key]) {
      const value = rule[key].replace(/:(\d{2})Z$/, ":$1.000Z");
      check(
        isInstant(value),
        "Directed release and resolution times must be valid UTC ISO timestamps ending in Z.",
      );
      rule[key] = value;
    }
  return rule;
}
export function prepareHealth(s, action, input, now) {
  const changes = [];
  const add = (store, record) => {
    changes.push({ store, record, expectedRevision: null });
    return record;
  };
  const edit = (store, prior, patch) => {
    check(prior, "Record not found. Reload.");
    const record = {
      ...prior,
      ...patch,
      updatedAt: now,
      revision: prior.revision + 1,
    };
    changes.push({ store, record, expectedRevision: prior.revision });
    return record;
  };
  const reason = input.revisionReason?.trim();
  const review =
    input.holdReview ||
    (input.reviewConfirmed === true
      ? {
          reviewedAt: now,
          reviewedBy: input.reviewedBy,
          reason,
          instructionReference: input.reviewReference,
        }
      : null);
  let result;
  if (action === "clock-review") {
    check(
      reason && input.reviewConfirmed === true,
      "Check the device clock and explicitly confirm your review with a reason.",
    );
    result = edit("metadata", s.metadata[0], {
      lastObservedClockAt: now,
      clockReviewRequired: false,
      clockReviewedAt: now,
      clockReviewReason: reason,
    });
  } else if (action === "course") {
    const prior = s.treatmentCourses.find((c) => c.id === input.id);
    check(
      prior && reason && review,
      "Course changes require a correction reason and hold review.",
    );
    result = edit("treatmentCourses", prior, {
      state: input.state,
      finalAdministrationId:
        input.state === "closed" ? input.finalAdministrationId : null,
      instructionReference: nullable(input.instructionReference),
      notes: nullable(input.notes),
    });
  } else if (action === "treatment-void") {
    const prior = s.treatments.find((t) => t.id === input.id);
    check(
      prior && !prior.voidedAt && reason && review,
      "Voiding requires a reason and explicit hold review.",
    );
    result = edit("treatments", prior, { voidedAt: now });
    const course = s.treatmentCourses.find(
      (c) => c.finalAdministrationId === prior.id,
    );
    if (course)
      edit("treatmentCourses", course, {
        state: "open",
        finalAdministrationId: null,
      });
  } else {
    const prior = input.id ? s.treatments.find((t) => t.id === input.id) : null;
    if (input.id)
      check(
        prior && !prior.voidedAt && reason && review,
        "Treatment corrections require a reason and explicit hold review.",
      );
    const ids = prior ? [prior.animalId] : input.animalIds || [input.animalId];
    check(
      ids.length && ids.every(Boolean) && new Set(ids).size === ids.length,
      "Choose each treated animal once.",
    );
    if (action === "batch-treatment")
      check(
        input.batchConfirmed === true,
        "Preview the selected animals and confirm the batch.",
      );
    const batchId =
      prior?.batchId ||
      (action === "batch-treatment" ? crypto.randomUUID() : null);
    const rows = [];
    for (const id of ids) {
      const animal = s.animals.find((a) => a.id === id);
      check(animal, "Selected animal not found.");
      const patch = Object.fromEntries(
        "product lot expiryDate doseUnit routeOther injectionSite reason administrator veterinarian instructionReference notes"
          .split(" ")
          .map((k) => [k, nullable(input[k])]),
      );
      patch.doseValue =
        nullable(input.doseValue) === null ? null : Number(input.doseValue);
      patch.route = input.route || "unknown";
      patch.administrationPrecision = input.administrationPrecision;
      patch.administrationDate = input.administrationDate;
      patch.timeZone = nullable(input.timeZone);
      patch.enteredLocalTime =
        input.administrationPrecision === "instant"
          ? input.enteredLocalTime?.length === 16
            ? input.enteredLocalTime + ":00"
            : input.enteredLocalTime
          : null;
      patch.offsetMinutes =
        input.administrationPrecision === "instant" &&
        nullable(input.offsetMinutes) !== null
          ? Number(input.offsetMinutes)
          : null;
      patch.administrationAt =
        input.administrationPrecision === "instant"
          ? enteredInstant(
              patch.enteredLocalTime,
              patch.timeZone,
              nullable(input.offsetMinutes),
            )
          : null;
      check(
        patch.administrationAt
          ? patch.administrationAt <= now
          : patch.administrationDate <=
              localParts(now, patch.timeZone || s.operation[0].timeZone).slice(
                0,
                10,
              ),
        "A future dose is not a completed treatment.",
      );
      patch.meat = captureRule(input, "meat", now);
      patch.milk = captureRule(input, "milk", now);
      let courseId = nullable(input.courseIds?.[id] || input.courseId);
      if (input.newCourse === true) {
        check(
          !prior && !courseId,
          "Choose a new course or an existing course.",
        );
        const c = add("treatmentCourses", {
          ...common(now),
          animalId: id,
          product: patch.product,
          state: "open",
          finalAdministrationId: null,
          instructionReference: patch.instructionReference,
          notes: null,
          snapshots: [snapshot(s, animal)],
        });
        courseId = c.id;
      }
      if (courseId && !input.newCourse) {
        const c = s.treatmentCourses.find((c) => c.id === courseId);
        check(
          c && !c.voidedAt && c.animalId === id && c.product === patch.product,
          "Course must belong to this animal and product.",
        );
        check(
          prior || c.state === "open",
          "Reopen and review the course before adding another dose.",
        );
      }
      Object.assign(patch, { animalId: id, courseId, batchId });
      const row = prior
        ? edit("treatments", prior, patch)
        : add("treatments", {
            ...common(now),
            ...patch,
            snapshots: [snapshot(s, animal)],
          });
      rows.push(row);
    }
    result = action === "batch-treatment" ? rows : rows[0];
  }
  return {
    changes,
    result,
    options: {
      reason: reason || "Record treatment",
      holdReview: action === "clock-review" ? null : review,
      expectedHealth: healthBasis(s),
      acknowledgeDuplicateTags: input.acknowledgeDuplicateTags === true,
      acknowledgeParentSex: input.acknowledgeParentSex === true,
    },
  };
}
// Preserve the original Phase 3 acknowledgment in revisions, replacing only the
// known placeholder with event-time arithmetic. Other historical warnings stay intact.
export function placeholderCorrections(s, now) {
  return s.movements
    .filter((m) =>
      m.holdAcknowledgment?.text.startsWith(
        "Withdrawal calculations are not available until Phase 4.",
      ),
    )
    .map((m) => {
      const p = departurePreview(s, m.animalId, m.date, now);
      return {
        store: "movements",
        expectedRevision: m.revision,
        record: {
          ...m,
          updatedAt: now,
          revision: m.revision + 1,
          holdAcknowledgment: {
            ...m.holdAcknowledgment,
            meatStatus: p.event.meat.status,
            milkStatus: p.event.milk.status,
            treatmentIds: p.treatmentIds,
            text: `${departureText(p)}\nRecomputed Phase 3 placeholder. Original acknowledgment retained in correction history.`,
          },
        },
      };
    });
}
export async function refreshHealth(repo, now = new Date().toISOString()) {
  // A concurrent clock observation can conflict. Re-read rather than overwriting it.
  await repo.observeClock(now);
  let s = await repo.snapshot();
  const changes = placeholderCorrections(s, now);
  if (changes.length) {
    await repo.mutate(changes, {
      reason: "Recompute Phase 3 withdrawal placeholders",
      expectedHealth: healthBasis(s),
      acknowledgeDuplicateTags: true,
      acknowledgeParentSex: true,
    });
    s = await repo.snapshot();
  }
  return s;
}
