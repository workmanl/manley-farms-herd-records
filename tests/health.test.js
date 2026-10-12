// SPDX-License-Identifier: AGPL-3.0-only
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { IDBFactory } from "fake-indexeddb";
import { openRepository } from "../app/lib/database.js";
import { prepareWorkflow } from "../app/lib/workflows.js";
import { evaluateWithdrawal, departurePreview } from "../app/lib/withdrawal.js";
import { captureRule, refreshHealth } from "../app/lib/health.js";
const fixture = JSON.parse(
  fs.readFileSync(new URL("./fixtures/sample-herd.json", import.meta.url)),
).stores;
const now = "2026-10-04T10:00:00.000Z";
const review = {
  reviewConfirmed: true,
  reviewedBy: "Demo reviewer",
  revisionReason: "Correct synthetic instructions",
  reviewReference: "Demo evidence",
};
async function save(repo, action, input, time = now) {
  const p = prepareWorkflow(await repo.snapshot(), action, input, time);
  await repo.mutate(p.changes, p.options);
  return p.result;
}
async function setup() {
  const r = await openRepository({ factory: new IDBFactory() });
  const a = await save(r, "animal", { farmId: "A", sex: "female" });
  const s = await r.snapshot(),
    op = s.operation[0];
  await r.mutate(
    [
      {
        store: "operation",
        record: {
          ...op,
          timeZone: "Etc/UTC",
          revision: op.revision + 1,
          updatedAt: now,
        },
        expectedRevision: op.revision,
      },
    ],
    { reason: "Synthetic zone" },
  );
  return { r, a };
}
function treatment(a, patch = {}) {
  const t = structuredClone(fixture.treatments[0]);
  delete t.id;
  return {
    ...t,
    animalId: a.id,
    courseId: null,
    batchId: null,
    administrationDate: "2026-10-01",
    administrationAt: "2026-10-01T10:00:00.000Z",
    administrationPrecision: "instant",
    enteredLocalTime: "2026-10-01T10:00:00",
    timeZone: "Etc/UTC",
    offsetMinutes: 0,
    product: "Demo product",
    meat: { ...t.meat, state: "duration", value: 5, unit: "days" },
    milk: {
      ...t.meat,
      state: "not-applicable",
      value: null,
      unit: null,
      instructionText: "No marketed milk",
    },
    ...patch,
  };
}
async function rejectsUnchanged(r, action, input, pattern) {
  const before = await r.snapshot();
  await assert.rejects(save(r, action, input), pattern);
  assert.deepEqual(await r.snapshot(), before);
}
test("batch preview confirmation, immutable recipient records, shared batch ID and atomic invalid member rollback", async () => {
  const { r, a } = await setup();
  const b = await save(r, "animal", { farmId: "B" });
  const input = {
    ...treatment(a),
    animalIds: [a.id, b.id],
    batchConfirmed: true,
  };
  await rejectsUnchanged(
    r,
    "batch-treatment",
    { ...input, batchConfirmed: false },
    /Preview/,
  );
  await rejectsUnchanged(
    r,
    "batch-treatment",
    { ...input, animalIds: [a.id, crypto.randomUUID()] },
    /not found/,
  );
  await rejectsUnchanged(
    r,
    "batch-treatment",
    {
      ...input,
      milk: { ...input.milk, state: "duration", value: null, unit: "hours" },
    },
    /duration/,
  );
  const rows = await save(r, "batch-treatment", input);
  assert.equal(rows.length, 2);
  assert.equal(new Set(rows.map((t) => t.batchId)).size, 1);
  assert.equal(new Set(rows.map((t) => t.id)).size, 2);
  const s = await r.snapshot();
  assert.deepEqual(
    new Set(s.treatments.map((t) => t.animalId)),
    new Set([a.id, b.id]),
  );
  assert.ok(s.treatments.every((t) => t.snapshots[0].animalId === t.animalId));
  r.close();
});
test("course stays held until latest final dose is selected and closed; void final reopens atomically", async () => {
  const { r, a } = await setup();
  const t = await save(r, "treatment", treatment(a, { newCourse: true }));
  assert.equal(
    evaluateWithdrawal(await r.snapshot(), { now: "2026-10-12T10:00:00.000Z" })
      .animals[0].meat.status,
    "needs-review",
  );
  const second = await save(
    r,
    "treatment",
    treatment(a, {
      courseId: t.courseId,
      administrationDate: "2026-10-02",
      enteredLocalTime: "2026-10-02T10:00:00",
    }),
  );
  const close = {
    ...review,
    id: t.courseId,
    state: "closed",
    finalAdministrationId: second.id,
    instructionReference: "Demo course",
  };
  await rejectsUnchanged(
    r,
    "course",
    { ...close, finalAdministrationId: t.id },
    /latest/,
  );
  await rejectsUnchanged(
    r,
    "course",
    { ...close, reviewConfirmed: false },
    /review/,
  );
  await save(r, "course", close);
  assert.equal(
    evaluateWithdrawal(await r.snapshot(), { now }).animals[0].meat.releaseAt,
    "2026-10-07T10:00:00.000Z",
  );
  await rejectsUnchanged(
    r,
    "treatment",
    treatment(a, { courseId: t.courseId }),
    /Reopen/,
  );
  await save(r, "treatment-void", { id: second.id, ...review });
  const s = await r.snapshot();
  assert.equal(s.treatmentCourses[0].state, "open");
  assert.equal(s.treatmentCourses[0].finalAdministrationId, null);
  assert.ok(s.treatments.find((t) => t.id === second.id).voidedAt);
  assert.equal(
    evaluateWithdrawal(s, { now }).animals[0].meat.status,
    "needs-review",
  );
  r.close();
});
test("oracle 17: shortening correction and undo retain prior/new values, reason and holdReview", async () => {
  const { r, a } = await setup();
  const t = await save(r, "treatment", treatment(a));
  const shorter = { ...t, meat: { ...t.meat, value: 2 } };
  await rejectsUnchanged(r, "treatment", shorter, /review/);
  assert.equal(
    evaluateWithdrawal(await r.snapshot(), { now }).animals[0].meat.releaseAt,
    "2026-10-06T10:00:00.000Z",
  );
  const corrected = await save(r, "treatment", { ...shorter, ...review });
  let s = await r.snapshot();
  assert.equal(
    evaluateWithdrawal(s, { now }).animals[0].meat.status,
    "elapsed",
  );
  const revision = s.revisions.find((v) => v.entityId === t.id);
  assert.equal(revision.priorValues.meat.value, 5);
  assert.equal(revision.newValues.meat.value, 2);
  assert.equal(revision.holdReview.instructionReference, "Demo evidence");
  await save(r, "treatment", {
    ...corrected,
    meat: t.meat,
    ...review,
    revisionReason: "Undo incorrect correction",
  });
  s = await r.snapshot();
  assert.equal(s.revisions.filter((v) => v.entityId === t.id).length, 2);
  assert.equal(evaluateWithdrawal(s, { now }).animals[0].meat.status, "held");
  r.close();
});
test("oracle 18: void requires review, preserves history and reveals next controlling product", async () => {
  const { r, a } = await setup();
  const first = await save(r, "treatment", treatment(a));
  await save(
    r,
    "treatment",
    treatment(a, { product: "Demo B", meat: { ...first.meat, value: 4 } }),
  );
  await rejectsUnchanged(
    r,
    "treatment-void",
    { id: first.id, revisionReason: "Void" },
    /review/,
  );
  await save(r, "treatment-void", { id: first.id, ...review });
  const s = await r.snapshot();
  assert.equal(s.treatments.length, 2);
  assert.equal(
    evaluateWithdrawal(s, { now }).animals[0].meat.releaseAt,
    "2026-10-05T10:00:00.000Z",
  );
  assert.equal(s.revisions.filter((v) => v.entityId === first.id).length, 1);
  r.close();
});
test("oracle 10: correction of date-only history requires review and preserves missing original time", async () => {
  const { r, a } = await setup();
  const t = await save(
    r,
    "treatment",
    treatment(a, {
      administrationPrecision: "date-only",
      enteredLocalTime: null,
      offsetMinutes: null,
      meat: { ...treatment(a).meat, value: 2 },
    }),
  );
  assert.equal(t.administrationAt, null);
  await save(r, "treatment", {
    ...t,
    administrationPrecision: "instant",
    enteredLocalTime: "2026-10-01T23:00:00",
    offsetMinutes: 0,
    ...review,
  });
  const s = await r.snapshot();
  assert.equal(
    evaluateWithdrawal(s, { now }).animals[0].meat.releaseAt,
    "2026-10-03T23:00:00.000Z",
  );
  assert.equal(
    s.revisions.find((v) => v.entityId === t.id).priorValues.administrationAt,
    null,
  );
  r.close();
});
test("blank is not zero; zero requires explicit confirmation; prohibited directed release and future entries rejected", async () => {
  assert.throws(() => captureRule({}, "meat", now), /Blank/);
  const { r, a } = await setup();
  const t = treatment(a);
  for (const meat of [
    { ...t.meat, value: null },
    { ...t.meat, value: 0, zeroConfirmedAt: null },
    {
      ...t.meat,
      state: "prohibited",
      value: null,
      unit: null,
      directedReleaseAt: now,
    },
  ])
    await rejectsUnchanged(r, "treatment", { ...t, meat });
  await rejectsUnchanged(
    r,
    "treatment",
    {
      ...t,
      administrationDate: "2026-10-05",
      enteredLocalTime: "2026-10-05T10:00:00",
    },
    /future/,
  );
  await rejectsUnchanged(
    r,
    "treatment",
    {
      ...t,
      administrationPrecision: "date-only",
      administrationDate: "2026-10-05",
    },
    /future/,
  );
  const zero = await save(r, "treatment", {
    ...t,
    meat: { ...t.meat, value: 0, zeroConfirmedAt: now },
  });
  assert.equal(
    evaluateWithdrawal(await r.snapshot(), { now }).animals[0].meat.status,
    "elapsed",
  );
  assert.equal(zero.meat.value, 0);
  r.close();
});
test("oracle 19: sale records event-time hold, current elapsed, destination and acknowledgment", async () => {
  const { r, a } = await setup();
  const t = treatment(a);
  await save(r, "treatment", {
    ...t,
    meat: { ...t.meat, value: 48, unit: "hours" },
  });
  const sale = {
    animalId: a.id,
    type: "sale",
    date: "2026-10-03",
    destination: "Demo Holding Farm",
    acknowledgeDeparture: true,
  };
  await rejectsUnchanged(
    r,
    "movement",
    { ...sale, acknowledgeDeparture: false },
    /acknowledge/,
  );
  await rejectsUnchanged(
    r,
    "movement",
    { ...sale, destination: "" },
    /destination/,
  );
  const preview = departurePreview(await r.snapshot(), a.id, sale.date, now);
  assert.equal(preview.event.meat.status, "held");
  assert.equal(preview.current.meat.status, "elapsed");
  const m = await save(r, "movement", sale);
  assert.equal(m.holdAcknowledgment.meatStatus, "held");
  assert.equal(m.holdAcknowledgment.eventTimeBasis, "date-only-conservative");
  assert.equal(m.holdAcknowledgment.intendedDestination, "Demo Holding Farm");
  assert.match(
    m.holdAcknowledgment.text,
    /Current meat: Recorded interval elapsed/,
  );
  assert.equal(
    evaluateWithdrawal(await r.snapshot(), { now }).animals[0].departureAlert,
    true,
  );
  r.close();
});
test("stale batch or departure preview rejects concurrent treatment changes without writes", async () => {
  const { r, a } = await setup();
  const s = await r.snapshot();
  const sale = prepareWorkflow(
    s,
    "movement",
    {
      animalId: a.id,
      type: "sale",
      date: "2026-10-03",
      destination: "Demo",
      acknowledgeDeparture: true,
    },
    now,
  );
  const batch = prepareWorkflow(
    s,
    "batch-treatment",
    { ...treatment(a), animalIds: [a.id], batchConfirmed: true },
    now,
  );
  await save(r, "treatment", treatment(a));
  const before = await r.snapshot();
  await assert.rejects(r.mutate(sale.changes, sale.options), /changed/);
  await assert.rejects(r.mutate(batch.changes, batch.options), /changed/);
  assert.deepEqual(await r.snapshot(), before);
  r.close();
});
test("oracle 16: clock observation persists across relaunch and catch-up; reviewed reset is audited", async () => {
  const { r, a } = await setup();
  const t = treatment(a);
  await save(r, "treatment", {
    ...t,
    meat: { ...t.meat, value: 48, unit: "hours" },
  });
  await r.observeClock(now);
  await r.observeClock("2026-10-04T09:00:00.000Z");
  await r.observeClock("2026-10-05T10:00:00.000Z");
  let s = await r.snapshot();
  assert.equal(s.metadata[0].clockReviewRequired, true);
  assert.deepEqual(evaluateWithdrawal(s, { now }).counts, {
    meat: 1,
    milk: 0,
    review: 1,
  });
  assert.equal(s.metadata[0].lastObservedClockAt, "2026-10-05T10:00:00.000Z");
  await rejectsUnchanged(
    r,
    "clock-review",
    { revisionReason: "Check" },
    /confirm/,
  );
  await save(r, "clock-review", {
    revisionReason: "Checked against independent clock",
    reviewConfirmed: true,
  });
  s = await r.snapshot();
  assert.equal(s.metadata[0].clockReviewRequired, false);
  assert.equal(s.metadata[0].lastObservedClockAt, now);
  assert.equal(
    evaluateWithdrawal(s, { now }).animals[0].meat.status,
    "elapsed",
  );
  assert.deepEqual(evaluateWithdrawal(s, { now }).counts, {
    meat: 0,
    milk: 0,
    review: 0,
  });
  assert.ok(
    s.revisions.some(
      (v) => v.entityType === "metadata" && v.newValues.clockReviewedAt === now,
    ),
  );
  r.close();
});
test("Phase 3 placeholders recompute once with original acknowledgment retained in audit", async () => {
  const { r, a } = await setup();
  const m = await save(r, "movement", {
    animalId: a.id,
    type: "sale",
    date: "2026-10-03",
    destination: "Demo",
    acknowledgeDeparture: true,
  });
  const legacy = {
    ...m,
    revision: m.revision + 1,
    updatedAt: now,
    holdAcknowledgment: {
      ...m.holdAcknowledgment,
      meatStatus: "needs-review",
      milkStatus: "needs-review",
      text: "Withdrawal calculations are not available until Phase 4. Original notice",
    },
  };
  await r.mutate(
    [{ store: "movements", record: legacy, expectedRevision: m.revision }],
    { reason: "Synthetic legacy fixture" },
  );
  let s = await refreshHealth(r, now);
  const fixed = s.movements[0];
  assert.equal(fixed.holdAcknowledgment.meatStatus, "no-recorded-interval");
  assert.equal(
    fixed.holdAcknowledgment.recordedAt,
    m.holdAcknowledgment.recordedAt,
  );
  assert.ok(
    s.revisions.some(
      (v) =>
        v.entityId === m.id &&
        v.priorValues.holdAcknowledgment.text ===
          legacy.holdAcknowledgment.text,
    ),
  );
  const count = s.revisions.length;
  s = await refreshHealth(r, now);
  assert.equal(s.revisions.length, count);
  r.close();
});

test("batch write failure after the first administration aborts the whole transaction", async () => {
  const { r, a } = await setup(),
    b = await save(r, "animal", { farmId: "B" }),
    before = await r.snapshot();
  const plan = prepareWorkflow(
    before,
    "batch-treatment",
    { ...treatment(a), animalIds: [a.id, b.id], batchConfirmed: true },
    now,
  );
  const transaction = r.db.transaction.bind(r.db);
  let writes = 0;
  r.db.transaction = (...args) => {
    const tx = transaction(...args);
    if (args[1] === "readwrite") {
      const objectStore = tx.objectStore.bind(tx);
      tx.objectStore = (name) => {
        const store = objectStore(name);
        if (name === "treatments") {
          const add = store.add.bind(store);
          store.add = (row) => {
            if (++writes === 2)
              throw new DOMException(
                "Injected device full",
                "QuotaExceededError",
              );
            return add(row);
          };
        }
        return store;
      };
    }
    return tx;
  };
  await assert.rejects(r.mutate(plan.changes, plan.options), {
    name: "QuotaExceededError",
  });
  assert.equal(writes, 2);
  assert.deepEqual(await r.snapshot(), before);
  r.close();
});
test("clock sticky flag cannot be cleared by unaudited bookkeeping", async () => {
  const { r } = await setup();
  await r.observeClock(now);
  await r.observeClock("2026-10-04T09:00:00.000Z");
  const s = await r.snapshot(),
    m = s.metadata[0];
  await assert.rejects(
    r.mutate(
      [
        {
          store: "metadata",
          record: {
            ...m,
            clockReviewRequired: false,
            revision: m.revision + 1,
            updatedAt: now,
          },
          expectedRevision: m.revision,
        },
      ],
      { bookkeeping: true },
    ),
    /audited/,
  );
  assert.deepEqual(await r.snapshot(), s);
  r.close();
});

test("blank whitespace cannot become a confirmed zero and directed times require UTC", () => {
  const r = captureRule(
    {
      "meat:state": "duration",
      "meat:value": " ",
      "meat:unit": "hours",
      "meat:zeroConfirmed": true,
    },
    "meat",
    now,
  );
  assert.equal(r.value, null);
  assert.equal(r.zeroConfirmedAt, null);
  assert.throws(
    () =>
      captureRule(
        {
          "meat:state": "manual-review",
          "meat:directedReleaseAt": "2026-10-04T10:00",
        },
        "meat",
        now,
      ),
    /UTC/,
  );
});
test("clock alert survives closing and reopening the repository", async () => {
  const factory = new IDBFactory();
  let r = await openRepository({ factory });
  await r.observeClock(now);
  await r.observeClock("2026-10-04T09:00:00.000Z");
  r.close();
  r = await openRepository({ factory });
  await r.observeClock("2026-10-05T10:00:00.000Z");
  assert.equal((await r.snapshot()).metadata[0].clockReviewRequired, true);
  r.close();
});
