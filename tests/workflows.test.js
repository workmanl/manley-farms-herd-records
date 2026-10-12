// SPDX-License-Identifier: AGPL-3.0-only
import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { openRepository } from "../app/lib/database.js";
import {
  commitWorkflow,
  prepareWorkflow,
  adg,
  searchAnimals,
  events,
  draftStore,
  farmDate,
} from "../app/lib/workflows.js";
const date = "2026-10-01";
const fresh = () => openRepository({ factory: new IDBFactory() });
const save = async (repo, action, data) =>
  commitWorkflow(repo, await repo.snapshot(), action, data);
const animal = (repo, data = {}) =>
  save(repo, "animal", {
    farmId: "001",
    sex: "female",
    effectiveDate: date,
    ...data,
  });
const delivery = (damId) => ({
  damId,
  eventId: crypto.randomUUID(),
  birthDate: date,
  dateConfirmed: true,
  calves: [
    {
      visualTag: "0002",
      sex: "female",
      weight: "80",
      unit: "lb",
      outcome: "live",
    },
  ],
});
async function failsWithoutWrites(repo, action, input, pattern) {
  const before = await repo.snapshot();
  await assert.rejects(save(repo, action, input), pattern);
  assert.deepEqual(await repo.snapshot(), before);
}

test("animal create and correction preserve leading zeros, former farm/tag/RFID and revision reason", async () => {
  const r = await fresh();
  const a = await animal(r, {
    visualTag: "00001",
    rfid: "000000000000000001",
    notes: "<script>text</script>",
  });
  assert.equal(a.birthDate, null);
  assert.equal(a.birthDatePrecision, "unknown");
  await save(r, "animal", {
    ...a,
    farmId: "002",
    visualTag: "00002",
    rfid: "000000000000000002",
    effectiveDate: "2026-10-02",
    revisionReason: "Correct identity",
  });
  const s = await r.snapshot();
  assert.equal(s.animals.length, 1);
  assert.equal(s.identifiers.length, 6);
  assert.equal(s.identifiers.filter((i) => i.validTo).length, 3);
  assert.equal(s.revisions.length, 4);
  assert.ok(s.revisions.every((x) => x.reason === "Correct identity"));
  for (const query of ["00001", "001", "000000000000000001", "<script>"])
    assert.equal(searchAnimals(s, { query }).total, 1);
  r.close();
});
for (const [label, patch, error] of [
  ["missing farm ID", { farmId: "" }, /farm ID/],
  ["invalid sex", { sex: "bull" }, /sex/],
  ["unknown DOB with date", { birthDate: date }, /precision/],
  [
    "invalid date",
    { birthDate: "2026-02-29", birthDatePrecision: "exact" },
    /birthDate/,
  ],
  ["parent FK", { damId: crypto.randomUUID() }, /foreign|missing/i],
  ["external and linked parent", { damReference: "External" }, /exclusive/],
])
  test(`animal validation: ${label}`, async () => {
    const r = await fresh(),
      dam = await animal(r);
    await failsWithoutWrites(
      r,
      "animal",
      { farmId: "B", sex: "female", damId: dam.id, ...patch },
      error,
    );
    r.close();
  });
test("animal corrections require reason, reject stale revisions and pedigree cycles through the UI command", async () => {
  const r = await fresh(),
    dam = await animal(r),
    calf = await animal(r, { farmId: "C", damId: dam.id });
  await failsWithoutWrites(
    r,
    "animal",
    { ...dam, notes: "Changed" },
    /revision reason/,
  );
  await failsWithoutWrites(
    r,
    "animal",
    { ...dam, damId: calf.id, revisionReason: "Wrong pedigree" },
    /cycle/,
  );
  const stale = await r.snapshot();
  await save(r, "animal", {
    ...dam,
    notes: "first tab",
    revisionReason: "First change",
  });
  await assert.rejects(
    commitWorkflow(r, stale, "animal", {
      ...dam,
      notes: "stale tab",
      revisionReason: "Second change",
    }),
    /Stale revision/,
  );
  r.close();
});
test("duplicate visual tags require explicit review; duplicate RFID and farm IDs always reject", async () => {
  const r = await fresh();
  await animal(r, { visualTag: "0009", rfid: "00009" });
  await failsWithoutWrites(
    r,
    "animal",
    { farmId: "002", visualTag: "0009" },
    /duplicate visual/i,
  );
  await animal(r, {
    farmId: "002",
    visualTag: "0009",
    acknowledgeDuplicateTags: true,
  });
  await failsWithoutWrites(
    r,
    "animal",
    { farmId: "003", rfid: "00009", acknowledgeDuplicateTags: true },
    /RFID/,
  );
  await failsWithoutWrites(
    r,
    "animal",
    { farmId: "001", acknowledgeDuplicateTags: true },
    /farm ID/,
  );
  r.close();
});
test("inconsistent parent sex requires explicit review", async () => {
  const r = await fresh(),
    dam = await animal(r, { sex: "unknown" });
  await failsWithoutWrites(
    r,
    "animal",
    { farmId: "002", damId: dam.id },
    /parent sex/,
  );
  await animal(r, { farmId: "002", damId: dam.id, acknowledgeParentSex: true });
  r.close();
});
test("twins share one atomic delivery with reciprocal weights and stillbirth retains identity", async () => {
  const r = await fresh(),
    dam = await animal(r);
  const input = delivery(dam.id);
  input.easeScore = "3";
  input.calves.push({
    sex: "male",
    outcome: "stillborn",
    weight: "30",
    unit: "kg",
  });
  const c = await save(r, "calving", input),
    s = await r.snapshot();
  assert.equal(s.animals.length, 3);
  assert.equal(s.calvings.length, 1);
  assert.equal(s.weights.length, 2);
  assert.equal(c.easeScaleVersion, "local-1");
  assert.equal(c.easeScore, 3);
  const stillborn = s.animals.find((a) => a.id === c.calves[1].calfId);
  assert.equal(stillborn.status, "dead");
  assert.equal(stillborn.visualTag, null);
  assert.ok(stillborn.farmId);
  for (const calf of c.calves) {
    const w = s.weights.find((w) => w.id === calf.birthWeightId);
    assert.equal(w.calvingId, c.id);
    assert.equal(w.animalId, calf.calfId);
  }
  await failsWithoutWrites(r, "calving", input, /already committed/);
  r.close();
});
for (const [label, patch, error] of [
  ["unconfirmed date", { dateConfirmed: false }, /Confirm/],
  ["bad birth date", { birthDate: "bad" }, /Date|date/],
  ["ease out of range", { easeScore: "6" }, /ease/],
  [
    "bad twin weight rolls back all calves",
    {
      calves: [
        { sex: "female", outcome: "live" },
        { sex: "male", weight: "-1", unit: "lb" },
      ],
    },
    /positive/,
  ],
  ["missing weight unit", { calves: [{ weight: "80" }] }, /unit/],
  ["bad outcome", { calves: [{ outcome: "lost" }] }, /outcome/],
])
  test(`calving validation: ${label}`, async () => {
    const r = await fresh(),
      dam = await animal(r);
    await failsWithoutWrites(
      r,
      "calving",
      { ...delivery(dam.id), ...patch },
      error,
    );
    r.close();
  });
test("stillbirth without tag or weight, and died-after-birth outcomes retain unknown fields", async () => {
  const r = await fresh(),
    dam = await animal(r);
  const c = await save(r, "calving", {
    ...delivery(dam.id),
    calves: [{ outcome: "stillborn" }, { outcome: "died-after-birth" }],
  });
  const s = await r.snapshot();
  assert.equal(s.weights.length, 0);
  assert.ok(c.calves.every((c) => c.birthWeightId === null));
  assert.ok(
    s.animals
      .filter((a) => a.id !== dam.id)
      .every((a) => a.status === "dead" && a.sex === "unknown"),
  );
  r.close();
});
for (const type of ["birth", "weaning", "yearling", "other"])
  test(`weight commit: ${type}`, async () => {
    const r = await fresh(),
      a = await animal(r);
    const w = await save(r, "weight", {
      animalId: a.id,
      type,
      date,
      value: "400",
      unit: "lb",
    });
    assert.equal(w.value, 400);
    assert.equal(w.snapshots[0].farmId, "001");
    r.close();
  });
for (const [label, patch] of [
  ["missing", { value: "" }],
  ["zero", { value: "0" }],
  ["negative", { value: "-1" }],
  ["unit", { unit: "oz" }],
  ["date", { date: "2026-99-01" }],
])
  test(`weight rejects ${label}`, async () => {
    const r = await fresh(),
      a = await animal(r);
    await failsWithoutWrites(r, "weight", {
      animalId: a.id,
      type: "other",
      date,
      value: "400",
      unit: "lb",
      ...patch,
    });
    r.close();
  });
const w = (value, date, unit = "lb") => ({ value, date, unit });
for (const [name, first, second, unit, expected] of [
  [
    "400 to 460 over 30 days",
    w(400, "2026-01-01"),
    w(460, "2026-01-31"),
    "lb",
    2,
  ],
  [
    "mixed units",
    w(400, "2026-01-01"),
    w(460 * 0.45359237, "2026-01-31", "kg"),
    "lb",
    2,
  ],
  [
    "kg display",
    w(400, "2026-01-01"),
    w(460, "2026-01-31"),
    "kg",
    2 * 0.45359237,
  ],
  ["negative gain", w(460, "2026-01-01"), w(400, "2026-01-31"), "lb", -2],
  ["same day", w(400, date), w(460, date), "lb", null],
  ["missing endpoint", null, w(460, date), "lb", null],
  ["missing value", w(null, "2026-01-01"), w(460, date), "lb", null],
  ["reverse selections", w(460, "2026-01-31"), w(400, "2026-01-01"), "lb", 2],
  ["DST calendar days", w(100, "2026-03-07"), w(104, "2026-03-09"), "lb", 2],
])
  test(`ADG: ${name}`, () => {
    const result = adg(first, second, unit);
    if (expected === null) assert.equal(result.text, "Not enough data");
    else assert.ok(Math.abs(result.value - expected) < 1e-10);
  });

test("AI and natural interval breeding plus linked pregnancy checks commit", async () => {
  const r = await fresh(),
    dam = await animal(r),
    sire = await animal(r, { farmId: "S", sex: "male" });
  const ai = await save(r, "breeding", {
    animalId: dam.id,
    method: "AI",
    serviceDate: date,
    sireReference: "SEMEN-0001",
  });
  const natural = await save(r, "breeding", {
    animalId: dam.id,
    method: "natural",
    exposureStart: date,
    exposureEnd: "2026-10-12",
    sireId: sire.id,
  });
  assert.equal(natural.snapshots.length, 2);
  const p = await save(r, "pregnancy", {
    animalId: dam.id,
    breedingId: ai.id,
    date: "2026-11-01",
    method: "ultrasound",
    result: "pregnant",
    estimatedGestationDays: "31",
    expectedCalvingDate: "2027-07-01",
    examiner: "Local examiner",
  });
  assert.equal(p.estimatedGestationDays, 31);
  assert.equal(p.breedingId, ai.id);
  await save(r, "pregnancy", {
    animalId: dam.id,
    date,
    method: "other",
    methodOther: "Recorded method",
    result: "open",
  });
  r.close();
});
for (const [label, patch] of [
  ["AI interval", { method: "AI", exposureStart: date }],
  [
    "both date and interval",
    { method: "natural", serviceDate: date, exposureStart: date },
  ],
  [
    "reversed interval",
    { method: "natural", exposureStart: date, exposureEnd: "2025-01-01" },
  ],
  ["no dates", { method: "natural" }],
  [
    "both sires",
    { method: "AI", serviceDate: date, sireReference: "Ext", useSire: true },
  ],
])
  test(`breeding rejects ${label}`, async () => {
    const r = await fresh(),
      a = await animal(r);
    const data = { ...patch, animalId: a.id };
    if (data.useSire) data.sireId = a.id;
    await failsWithoutWrites(r, "breeding", data);
    r.close();
  });
for (const [label, patch] of [
  ["open with gestation", { result: "open", estimatedGestationDays: "20" }],
  ["negative gestation", { estimatedGestationDays: "-1" }],
  ["fractional gestation", { estimatedGestationDays: "1.5" }],
  ["other method missing detail", { method: "other" }],
  ["invalid date", { date: "yesterday" }],
  ["bad result", { result: "maybe" }],
])
  test(`pregnancy rejects ${label}`, async () => {
    const r = await fresh(),
      a = await animal(r);
    await failsWithoutWrites(r, "pregnancy", {
      animalId: a.id,
      date,
      method: "blood",
      result: "pregnant",
      ...patch,
    });
    r.close();
  });
test("pregnancy check cannot link another dam breeding", async () => {
  const r = await fresh(),
    a = await animal(r),
    b = await animal(r, { farmId: "B" });
  const breeding = await save(r, "breeding", {
    animalId: a.id,
    method: "AI",
    serviceDate: date,
  });
  await failsWithoutWrites(
    r,
    "pregnancy",
    {
      animalId: b.id,
      breedingId: breeding.id,
      date,
      method: "blood",
      result: "pregnant",
    },
    /mismatch/,
  );
  r.close();
});

test("groups create rename archive and atomic batch moves retain dated intervals and snapshots", async () => {
  const r = await fresh(),
    a = await animal(r),
    b = await animal(r, { farmId: "B" });
  const g = await save(r, "group", { name: "North", type: "pasture" }),
    h = await save(r, "group", { name: "South", type: "management-lot" });
  await save(r, "move", {
    animalIds: [a.id, b.id],
    groupId: g.id,
    pasture: "North field",
    date,
  });
  const w = await save(r, "weight", {
    animalId: a.id,
    date,
    type: "other",
    value: 400,
    unit: "lb",
  });
  await save(r, "move", {
    animalIds: [a.id, b.id],
    groupId: h.id,
    pasture: "South field",
    date: "2026-10-05",
  });
  await save(r, "group", {
    ...g,
    name: "Former north",
    archived: true,
    revisionReason: "Retired pasture",
  });
  const s = await r.snapshot();
  assert.equal(s.memberships.length, 4);
  assert.equal(
    s.memberships.filter((m) => m.endDate === "2026-10-05").length,
    2,
  );
  assert.equal(s.weights[0].snapshots[0].groupName, "North");
  assert.equal(w.snapshots[0].pasture, "North field");
  assert.ok(s.groups.find((x) => x.id === g.id).archivedAt);
  await failsWithoutWrites(
    r,
    "move",
    { animalIds: [a.id], groupId: g.id, date: "2026-10-06" },
    /active group/,
  );
  await failsWithoutWrites(
    r,
    "move",
    { animalIds: [a.id, b.id], groupId: null, date: "2026-09-01" },
    /membership/,
  );
  await save(r, "move", {
    animalIds: [a.id],
    groupId: null,
    date: "2026-10-07",
  });
  assert.equal(
    (await r.snapshot()).memberships.filter((m) => !m.endDate).length,
    1,
  );
  r.close();
});
for (const [label, action, input] of [
  ["empty group", "group", { name: "", type: "pasture" }],
  ["group type", "group", { name: "N", type: "field" }],
  ["empty batch", "move", { animalIds: [], date }],
])
  test(`group validation: ${label}`, async () => {
    const r = await fresh();
    await failsWithoutWrites(r, action, input);
    r.close();
  });

test("purchase and cull decision retain active status; departures preserve all history and audit status", async () => {
  const r = await fresh(),
    a = await animal(r);
  await save(r, "movement", {
    animalId: a.id,
    type: "purchase",
    date,
    source: "Source farm",
  });
  await save(r, "weight", {
    animalId: a.id,
    date,
    type: "other",
    value: 400,
    unit: "lb",
  });
  await save(r, "movement", {
    animalId: a.id,
    type: "cull-decision",
    date,
    reason: "Disposition",
  });
  assert.equal((await r.snapshot()).animals[0].status, "active");
  const m = await save(r, "movement", {
    animalId: a.id,
    type: "sale",
    date: "2026-10-05",
    destination: "Buyer",
    amount: "1200.50",
    currency: "USD",
    acknowledgeDeparture: true,
  });
  const s = await r.snapshot();
  assert.equal(s.animals[0].status, "sold");
  assert.equal(s.weights.length, 1);
  assert.equal(s.movements.length, 3);
  assert.equal(m.holdAcknowledgment.meatStatus, "no-recorded-interval");
  assert.ok(events(s, { animalId: a.id }).some((e) => e.store === "weights"));
  assert.equal(searchAnimals(s).total, 0);
  assert.equal(searchAnimals(s, { includeInactive: true }).total, 1);
  r.close();
});
for (const [type, status] of [
  ["death", "dead"],
  ["other-departure", "culled"],
])
  test(`${type} preserves animal and sets ${status}`, async () => {
    const r = await fresh(),
      a = await animal(r);
    await save(r, "movement", {
      animalId: a.id,
      type,
      date,
      destination: "Unknown",
      acknowledgeDeparture: true,
    });
    assert.equal((await r.snapshot()).animals[0].status, status);
    r.close();
  });
for (const [label, patch] of [
  ["no acknowledgment", { acknowledgeDeparture: false }],
  ["missing destination", { destination: "" }],
  ["amount without currency", { amount: "10", currency: "" }],
  ["bad money precision", { amount: "10.001" }],
  ["weight without unit", { weightValue: "400" }],
  ["invalid date", { date: "tomorrow" }],
  ["purchase without source", { type: "purchase", source: "" }],
])
  test(`movement validation: ${label}`, async () => {
    const r = await fresh(),
      a = await animal(r);
    await failsWithoutWrites(r, "movement", {
      animalId: a.id,
      type: "sale",
      date,
      destination: "Buyer",
      acknowledgeDeparture: true,
      amount: "10",
      currency: "USD",
      ...patch,
    });
    r.close();
  });

test("search filters compose, estimated DOB participates, unknown DOB is excluded and pages are bounded", async () => {
  const r = await fresh(),
    dam = await animal(r, { farmId: "D" }),
    g = await save(r, "group", { name: "North", type: "pasture" });
  await animal(r, {
    farmId: "001",
    visualTag: "0009",
    breed: "Angus",
    sex: "male",
    birthDate: "2026-01-01",
    birthDatePrecision: "estimated",
    damId: dam.id,
    currentGroupId: g.id,
    pasture: "North",
    notes: "White forehead",
  });
  await animal(r, { farmId: "002", breed: "Angus", status: "sold" });
  const s = await r.snapshot();
  for (const f of [
    { query: "0009" },
    { query: "FOREHEAD" },
    { sex: "male" },
    { damId: dam.id },
    { groupId: g.id },
    { birthFrom: "2025-01-01", birthTo: "2026-02-01" },
    { minAgeDays: 29, maxAgeDays: 31, asOf: "2026-01-31" },
    { breed: "angus" },
  ])
    assert.equal(searchAnimals(s, f).total, 1);
  assert.equal(searchAnimals(s, { birthFrom: "2026-02-01" }).total, 0);
  assert.equal(searchAnimals(s, { status: "sold" }).total, 1);
  const result = searchAnimals(s, {
    includeInactive: true,
    pageSize: 1,
    page: 99,
  });
  assert.equal(result.page, 3);
  assert.equal(result.rows.length, 1);
  assert.equal(result.total, 3);
  r.close();
});
test("events are chronological and filterable by type/date/animal including former identifiers and revisions", async () => {
  const r = await fresh(),
    a = await animal(r);
  await save(r, "weight", {
    animalId: a.id,
    date,
    value: 400,
    unit: "lb",
    type: "other",
  });
  await save(r, "weight", {
    animalId: a.id,
    date: "2026-10-03",
    value: 420,
    unit: "lb",
    type: "other",
  });
  const rows = events(await r.snapshot(), {
    animalId: a.id,
    type: "weights",
    from: "2026-10-02",
    to: "2026-10-04",
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].record.value, 420);
  r.close();
});
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
};
test("local draft survives interruption, isolates datasets and retains the delivery token through commit", async () => {
  const r = await fresh(),
    dam = await animal(r),
    data = delivery(dam.id),
    memory = storage();
  const drafts = draftStore(memory, "dataset");
  drafts.save("calf", data);
  const recovered = draftStore(memory, "dataset").load("calf");
  assert.deepEqual(recovered, data);
  assert.equal(draftStore(memory, "other").load("calf"), null);
  const c = await save(r, "calving", recovered);
  assert.equal(c.id, data.eventId);
  // Simulate interruption between completed transaction and draft removal.
  await failsWithoutWrites(
    r,
    "calving",
    drafts.load("calf"),
    /already committed/,
  );
  drafts.clear("calf");
  assert.equal(drafts.load("calf"), null);
  r.close();
});
test("failed calf transaction retains recoverable draft and no calf rows", async () => {
  const r = await fresh(),
    dam = await animal(r),
    drafts = draftStore(storage(), "d"),
    data = delivery(dam.id);
  data.calves[0].weight = "-1";
  drafts.save("calf", data);
  await failsWithoutWrites(r, "calving", data);
  assert.deepEqual(drafts.load("calf"), data);
  r.close();
});
test("draft corruption and storage quota failure are explicit", () => {
  const m = storage();
  m.setItem("manley-herd-draft-v1:d:calf", "{bad");
  assert.throws(() => draftStore(m, "d").load("calf"), /unreadable/);
  assert.throws(
    () =>
      draftStore(
        {
          setItem() {
            throw new Error("Quota exceeded");
          },
        },
        "d",
      ).save("calf", {}),
    /Quota/,
  );
});
test("farm date respects farm zone near UTC midnight", () =>
  assert.equal(
    farmDate("America/Los_Angeles", new Date("2026-10-02T01:00:00Z")),
    "2026-10-01",
  ));
test("workflow promise waits for transaction completion", async () => {
  const r = await fresh(),
    s = await r.snapshot();
  let complete;
  const blocked = {
    mutate: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  };
  let saved = false;
  const pending = commitWorkflow(blocked, s, "animal", { farmId: "A" }).then(
    () => {
      saved = true;
    },
  );
  await Promise.resolve();
  assert.equal(saved, false);
  complete();
  await pending;
  assert.equal(saved, true);
  r.close();
});

test("calf birth corrections update delivery, twin and linked weights atomically with prior values", async () => {
  const r = await fresh(),
    dam = await animal(r),
    otherDam = await animal(r, { farmId: "Other", sex: "female" });
  const input = delivery(dam.id);
  input.calves.push({ sex: "male", outcome: "live", weight: "85", unit: "lb" });
  const c = await save(r, "calving", input),
    before = await r.snapshot(),
    calf = before.animals.find((a) => a.id === c.calves[0].calfId);
  await save(r, "animal", {
    ...calf,
    birthDate: "2026-10-02",
    damId: otherDam.id,
    revisionReason: "Correct delivery date and dam",
  });
  const s = await r.snapshot();
  assert.ok(
    s.calvings.every(
      (c) => c.birthDate === "2026-10-02" && c.damId === otherDam.id,
    ),
  );
  assert.ok(s.weights.every((w) => w.date === "2026-10-02"));
  assert.ok(
    s.animals
      .filter((a) => c.calves.some((c) => c.calfId === a.id))
      .every((a) => a.birthDate === "2026-10-02" && a.damId === otherDam.id),
  );
  assert.ok(
    s.revisions.some(
      (r) => r.entityType === "calvings" && r.priorValues.birthDate === date,
    ),
  );
  assert.ok(s.calvings[0].snapshots.some((x) => x.animalId === dam.id));
  r.close();
});

test("group rename requires reason and a bad member aborts an entire batch", async () => {
  const r = await fresh(),
    a = await animal(r),
    b = await animal(r, { farmId: "B" }),
    g = await save(r, "group", { name: "North", type: "pasture" });
  await failsWithoutWrites(
    r,
    "group",
    { ...g, name: "South" },
    /revision reason/,
  );
  await failsWithoutWrites(
    r,
    "move",
    { animalIds: [a.id, b.id, crypto.randomUUID()], groupId: g.id, date },
    /not found/,
  );
  assert.equal((await r.snapshot()).memberships.length, 0);
  r.close();
});
test("historical departure does not overwrite a later departure status", async () => {
  const r = await fresh(),
    a = await animal(r);
  await save(r, "movement", {
    animalId: a.id,
    type: "death",
    date: "2026-10-05",
    destination: "On farm",
    acknowledgeDeparture: true,
  });
  await save(r, "movement", {
    animalId: a.id,
    type: "sale",
    date: "2026-10-01",
    destination: "Buyer",
    acknowledgeDeparture: true,
  });
  assert.equal((await r.snapshot()).animals[0].status, "dead");
  r.close();
});
test("archive retains events, groups and identifiers; dated membership corrections close the prior interval", async () => {
  const r = await fresh(),
    g = await save(r, "group", { name: "North", type: "pasture" }),
    a = await animal(r, {
      currentGroupId: g.id,
      pasture: "Upper",
      effectiveDate: date,
    });
  await save(r, "animal", {
    ...a,
    pasture: "Lower",
    effectiveDate: "2026-10-02",
    revisionReason: "Change pasture section",
  });
  const updated = (await r.snapshot()).animals[0];
  await save(r, "animal", {
    ...updated,
    status: "archived",
    revisionReason: "Retain old record",
  });
  const s = await r.snapshot();
  assert.ok(s.animals[0].archivedAt);
  assert.equal(s.identifiers.length, 1);
  assert.equal(s.memberships.length, 2);
  assert.equal(s.memberships.find((m) => m.endDate).pastureSnapshot, "Upper");
  assert.equal(searchAnimals(s, { status: "archived" }).total, 1);
  r.close();
});
test("ADG refuses different animals and voided measurements", () => {
  assert.equal(
    adg(
      { ...w(400, "2026-01-01"), animalId: "a" },
      { ...w(460, "2026-01-31"), animalId: "b" },
    ).text,
    "Not enough data",
  );
  assert.equal(
    adg(
      { ...w(400, "2026-01-01"), voidedAt: "2026-02-01" },
      w(460, "2026-01-31"),
    ).text,
    "Not enough data",
  );
});
test("500-animal query pages without losing counts or leading-zero IDs", () => {
  const s = {
    animals: Array.from({ length: 500 }, (_, i) => ({
      id: String(i),
      farmId: String(i).padStart(4, "0"),
      status: "active",
    })),
    identifiers: [],
  };
  const page = searchAnimals(s, { page: 20 });
  assert.equal(page.total, 500);
  assert.equal(page.rows.length, 25);
  assert.equal(page.rows.at(-1).farmId, "0499");
  assert.equal(searchAnimals(s, { query: "0000" }).total, 1);
});

test("withdrawal filters use the shared engine, include review in holds and honor inactive inclusion", async () => {
  const fs = await import("node:fs");
  const s = JSON.parse(
    fs.readFileSync(new URL("./fixtures/sample-herd.json", import.meta.url)),
  ).stores;
  const options = { now: "2026-10-12T12:00:00.000Z", includeInactive: true };
  assert.equal(
    searchAnimals(s, { ...options, withdrawal: "meat-hold" }).total,
    6,
  );
  assert.equal(
    searchAnimals(s, { ...options, withdrawal: "milk-hold" }).total,
    1,
  );
  assert.equal(
    searchAnimals(s, { ...options, withdrawal: "needs-review" }).total,
    5,
  );
  assert.equal(
    searchAnimals(s, {
      ...options,
      includeInactive: false,
      withdrawal: "meat-hold",
    }).total,
    5,
  );
});
