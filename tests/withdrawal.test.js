// SPDX-License-Identifier: AGPL-3.0-only
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  evaluateWithdrawal as evaluate,
  enteredInstant,
  startOfDay,
  departurePreview,
  clockState,
} from "../app/lib/withdrawal.js";
const at = (day, time = "10:00:00.000") =>
  `2026-10-${String(day).padStart(2, "0")}T${time}Z`;
export const rule = (
  state = "duration",
  value = 48,
  unit = "hours",
  patch = {},
) => ({
  state,
  value: state === "duration" ? value : null,
  unit: state === "duration" ? unit : null,
  source: state === "unknown" ? null : "label",
  instructionReference: state === "unknown" ? null : "Synthetic label",
  instructionText: state === "not-applicable" ? "No marketed commodity" : null,
  zeroConfirmedAt: state === "duration" && value === 0 ? at(1) : null,
  directedReleaseAt: null,
  resolutionReason: null,
  resolvedAt: null,
  resolvedBy: null,
  ...patch,
});
export const dose = (
  id = "a",
  instant = at(1),
  meat = rule(),
  milk = rule("not-applicable"),
  patch = {},
) => ({
  id,
  animalId: "animal",
  courseId: null,
  product: `Demo ${id}`,
  administrationAt: instant,
  administrationDate: instant?.slice(0, 10) || "2026-10-01",
  administrationPrecision: instant ? "instant" : "date-only",
  meat,
  milk,
  voidedAt: null,
  ...patch,
});
export const dataset = (treatments = [dose()], patch = {}) => ({
  animals: [{ id: "animal", farmId: "Demo", status: "active" }],
  treatments,
  treatmentCourses: [],
  movements: [],
  metadata: [{ lastObservedClockAt: null, clockReviewRequired: false }],
  operation: [{ timeZone: "Etc/UTC" }],
  ...patch,
});
const course = (treatments, state = "closed") =>
  dataset(
    treatments.map((t) => ({
      ...t,
      courseId: "course",
      product: "Demo course",
    })),
    {
      treatmentCourses: [
        {
          id: "course",
          animalId: "animal",
          product: "Demo course",
          state,
          finalAdministrationId:
            state === "closed" ? treatments.at(-1).id : null,
        },
      ],
    },
  );
const directed = () =>
  rule("manual-review", null, null, {
    source: "vet",
    instructionText: "Fictional vet explicitly resolved unknown timing",
    instructionReference: "Demo vet instruction",
    directedReleaseAt: at(5, "12:00:00.000"),
    resolutionReason: "Timing resolved by vet",
    resolvedAt: at(4, "12:00:00.000"),
    resolvedBy: "Demo operator",
  });
const cases = [
  [
    "01",
    "48h one minute before release",
    dataset(),
    at(3, "09:59:00.000"),
    "held",
    at(3),
    "1m",
    "not-applicable",
    [1, 0, 0],
  ],
  [
    "02",
    "Exact release boundary",
    dataset(),
    at(3),
    "elapsed",
    at(3),
    null,
    "not-applicable",
    [0, 0, 0],
  ],
  [
    "03",
    "Repeat closed course",
    course([dose(), dose("b", at(2))]),
    at(3),
    "held",
    at(4),
    "1d 0h 0m",
    "not-applicable",
    [1, 0, 0],
  ],
  [
    "04",
    "Open course",
    course([dose()], "open"),
    at(10),
    "needs-review",
    null,
    null,
    "not-applicable",
    [1, 0, 1],
  ],
  [
    "05",
    "Latest independent product",
    dataset([dose(), dose("b", at(2, "08:00:00.000"), rule("duration", 72))]),
    at(3),
    "held",
    at(5, "08:00:00.000"),
    "1d 22h 0m",
    "not-applicable",
    [1, 0, 0],
  ],
  [
    "06",
    "Independent meat and milk",
    dataset([
      dose("a", at(1), rule("duration", 5, "days"), rule("duration", 36)),
    ]),
    at(3),
    "held",
    at(6),
    "3d 0h 0m",
    "elapsed",
    [1, 0, 0],
  ],
  [
    "07",
    "Unknown overrides elapsed",
    dataset([dose(), dose("b", at(2), rule("unknown"), rule("unknown"))]),
    at(3),
    "needs-review",
    null,
    null,
    "needs-review",
    [1, 1, 1],
  ],
  [
    "08",
    "Confirmed zero and explicit NA",
    dataset([dose("a", at(1), rule("duration", 0))]),
    at(1),
    "elapsed",
    at(1),
    null,
    "not-applicable",
    [0, 0, 0],
  ],
  [
    "09",
    "Prohibited never times out",
    dataset([dose("a", at(1), rule("prohibited"), rule("prohibited"))]),
    at(30),
    "needs-review",
    null,
    null,
    "needs-review",
    [1, 1, 1],
  ],
  [
    "10",
    "Date-only history",
    dataset([dose("a", null, rule("duration", 2, "days"))]),
    at(10),
    "needs-review",
    null,
    null,
    "not-applicable",
    [1, 0, 1],
  ],
  [
    "11",
    "Milkings are not hours",
    dataset([
      dose(
        "a",
        at(1),
        rule(),
        rule("manual-review", null, null, { instructionText: "6 milkings" }),
      ),
    ]),
    at(3),
    "elapsed",
    at(3),
    null,
    "needs-review",
    [0, 1, 1],
  ],
  [
    "12",
    "Documented directed release",
    dataset([dose("a", null, directed())]),
    at(5, "11:00:00.000"),
    "held",
    at(5, "12:00:00.000"),
    "1h 0m",
    "not-applicable",
    [1, 0, 0],
  ],
  [
    "13",
    "Spring DST elapsed hours",
    dataset([dose("a", "2026-03-07T20:00:00.000Z", rule("duration", 24))]),
    "2026-03-08T19:00:00.000Z",
    "held",
    "2026-03-08T20:00:00.000Z",
    "1h 0m",
    "not-applicable",
    [1, 0, 0],
  ],
  [
    "14",
    "Fall DST elapsed hours",
    dataset([dose("a", "2026-10-31T19:00:00.000Z", rule("duration", 24))]),
    "2026-11-01T18:00:00.000Z",
    "held",
    "2026-11-01T19:00:00.000Z",
    "1h 0m",
    "not-applicable",
    [1, 0, 0],
  ],
  [
    "15",
    "Leap day",
    dataset([dose("a", "2028-02-28T10:00:00.000Z")]),
    "2028-02-29T10:00:00.000Z",
    "held",
    "2028-03-01T10:00:00.000Z",
    "1d 0h 0m",
    "not-applicable",
    [1, 0, 0],
  ],
  [
    "16",
    "Backward clock",
    dataset([dose()], {
      metadata: [{ lastObservedClockAt: at(4), clockReviewRequired: false }],
    }),
    at(4, "09:00:00.000"),
    "needs-review",
    null,
    null,
    "not-applicable",
    [1, 0, 1],
  ],
  [
    "17",
    "Correction before review",
    dataset([dose("a", at(1), rule("duration", 5, "days"))]),
    at(4),
    "held",
    at(6),
    "2d 0h 0m",
    "not-applicable",
    [1, 0, 0],
  ],
  [
    "18",
    "Reviewed void retains other product",
    dataset([
      dose("a", at(1), rule("duration", 10, "days"), rule("not-applicable"), {
        voidedAt: at(4),
      }),
      dose("b", at(2), rule("duration", 5, "days")),
    ]),
    at(4),
    "held",
    at(7),
    "3d 0h 0m",
    "not-applicable",
    [1, 0, 0],
  ],
  [
    "19",
    "Date-only sale persistent warning",
    dataset([dose()], {
      animals: [{ id: "animal", status: "sold" }],
      movements: [
        {
          animalId: "animal",
          holdAcknowledgment: {
            meatStatus: "held",
            milkStatus: "not-applicable",
          },
        },
      ],
    }),
    at(3, "12:00:00.000"),
    "elapsed",
    at(3),
    null,
    "not-applicable",
    [0, 0, 0],
  ],
  [
    "20",
    "Longer earlier course instruction",
    course([dose("a", at(1), rule("duration", 72)), dose("b", at(2))]),
    at(3),
    "held",
    at(5),
    "2d 0h 0m",
    "not-applicable",
    [1, 0, 0],
  ],
];
for (const [
  id,
  label,
  s,
  now,
  status,
  release,
  remaining,
  milk,
  counts,
] of cases)
  test(`oracle ${id}: ${label}`, () => {
    const before = structuredClone(s),
      r = evaluate(s, { now }),
      a = r.animals[0];
    assert.equal(a.meat.status, status);
    assert.equal(a.meat.releaseAt, release);
    assert.equal(a.meat.remaining, remaining);
    assert.equal(a.milk.status, milk);
    assert.deepEqual(Object.values(r.counts), counts);
    assert.equal(r.calculatedAt, now);
    assert.equal(r.zone, "Etc/UTC");
    assert.deepEqual(s, before);
    if (id === "03")
      assert.ok(a.meat.contributions.every((c) => c.anchorAt === at(2)));
    if (id === "05")
      assert.deepEqual(
        a.meat.contributions.map((c) => c.status),
        ["elapsed", "held"],
      );
    if (id === "06") assert.equal(a.milk.releaseAt, at(2, "22:00:00.000"));
    if (id === "19") {
      assert.equal(a.departureAlert, true);
      const p = departurePreview(s, "animal", "2026-10-03", now);
      assert.equal(p.event.meat.status, "held");
      assert.equal(p.current.meat.status, "elapsed");
      assert.equal(p.eventAt, at(3, "00:00:00.000"));
    }
  });
test("oracle boundaries: sub-minute ceiling, equality, directed equality and after", () => {
  for (const [now, status, remaining] of [
    [at(3, "09:59:59.999"), "held", "1m"],
    [at(3), "elapsed", null],
    [at(3, "10:00:00.001"), "elapsed", null],
  ]) {
    const r = evaluate(dataset(), { now }).animals[0].meat;
    assert.equal(r.status, status);
    assert.equal(r.remaining, remaining);
  }
  assert.equal(
    evaluate(cases[11][2], { now: at(5, "12:00:00.000") }).animals[0].meat
      .status,
    "elapsed",
  );
});
test("missing zero confirmation, blank interval, prohibited shortcut and incomplete directed evidence stay unresolved", () => {
  const rules = [
    rule("duration", 0, "hours", { zeroConfirmedAt: null }),
    rule("duration", null),
    rule("prohibited", null, null, { directedReleaseAt: at(3) }),
    ...[
      "source",
      "instructionText",
      "instructionReference",
      "resolutionReason",
      "resolvedAt",
      "resolvedBy",
    ].map((key) => ({ ...directed(), [key]: null })),
  ];
  for (const r of rules) {
    const c = evaluate(dataset([dose("a", at(1), r)]), { now: at(10) })
      .animals[0].meat;
    assert.equal(c.status, "needs-review");
    assert.equal(c.releaseAt, null);
  }
});
test("directed release before a relevant dose and explicit unresolved course conflict", () => {
  const s = course([dose("a", at(1), directed()), dose("b", at(6))]);
  assert.equal(
    evaluate(s, { now: at(10) }).animals[0].meat.status,
    "needs-review",
  );
  s.treatments[0].meat = rule("manual-review", null, null, {
    instructionText: "Instructions conflict, awaiting vet reconciliation",
  });
  assert.equal(evaluate(s, { now: at(10) }).animals[0].meat.releaseAt, null);
});
test("DST input rejects gaps, requires offset, accepts both repeated instants and rejects invalid leap date", () => {
  assert.throws(() =>
    enteredInstant("2026-03-08T02:30:00", "America/Los_Angeles", -480),
  );
  assert.throws(() =>
    enteredInstant("2026-11-01T01:30:00", "America/Los_Angeles", ""),
  );
  assert.equal(
    enteredInstant("2026-11-01T01:30:00", "America/Los_Angeles", -420),
    "2026-11-01T08:30:00.000Z",
  );
  assert.equal(
    enteredInstant("2026-11-01T01:30:00", "America/Los_Angeles", -480),
    "2026-11-01T09:30:00.000Z",
  );
  assert.throws(() => enteredInstant("2026-02-29T10:00:00", "Etc/UTC", 0));
  assert.equal(
    startOfDay("2026-10-03", "America/Los_Angeles"),
    "2026-10-03T07:00:00.000Z",
  );
});
test("clock flag remains sticky after catch-up, untreated and NA animals have no clinical hold", () => {
  const m = { lastObservedClockAt: at(4), clockReviewRequired: true };
  assert.equal(clockState(m, at(5)).reviewRequired, true);
  assert.deepEqual(
    evaluate(dataset([], { metadata: [m] }), { now: at(5) }).counts,
    { meat: 0, milk: 0, review: 0 },
  );
  assert.deepEqual(
    evaluate(
      dataset([dose("a", at(1), rule("not-applicable"))], { metadata: [m] }),
      { now: at(5) },
    ).counts,
    { meat: 0, milk: 0, review: 0 },
  );
});
test("sold and archived holds continue; empty open course and future imported dose need review", () => {
  for (const status of ["sold", "archived"]) {
    const r = evaluate(
      dataset([dose()], { animals: [{ id: "animal", status }] }),
      { now: at(2) },
    );
    assert.equal(r.counts.meat, 1);
    assert.equal(r.animals[0].departureAlert, true);
  }
  assert.equal(evaluate(course([], "open"), { now: at(2) }).counts.review, 1);
  assert.equal(
    evaluate(dataset([dose("a", at(11))]), { now: at(10) }).animals[0].meat
      .status,
    "needs-review",
  );
});
test("20-case fixture reconciliation and overlapping distinct animal categories", () => {
  const s = JSON.parse(
    fs.readFileSync(new URL("./fixtures/sample-herd.json", import.meta.url)),
  ).stores;
  const r = evaluate(s, { now: "2026-10-12T12:00:00.000Z" });
  assert.deepEqual(r.counts, { meat: 6, milk: 1, review: 5 });
  assert.equal(r.animals.length, 12);
});

test("oracle 20: new longer milk-only interval changes milk independently", () => {
  const s = structuredClone(cases[19][2]);
  s.treatments.push(
    dose("milk", at(2), rule("not-applicable"), rule("duration", 10, "days")),
  );
  const r = evaluate(s, { now: at(3) });
  assert.equal(r.animals[0].meat.releaseAt, at(5));
  assert.equal(r.animals[0].milk.releaseAt, at(12));
  assert.deepEqual(r.counts, { meat: 1, milk: 1, review: 0 });
});
test("historical departure excludes later-date treatment and compares event boundary exactly in farm zone", () => {
  const s = dataset([dose(), dose("later", at(5), rule("unknown"))], {
    operation: [{ timeZone: "America/Los_Angeles" }],
  });
  const p = departurePreview(s, "animal", "2026-10-03", at(6));
  assert.equal(p.eventAt, "2026-10-03T07:00:00.000Z");
  assert.equal(p.event.meat.status, "held");
  assert.equal(p.current.meat.status, "needs-review");
  assert.deepEqual(p.treatmentIds, ["a"]);
  const boundary = dataset([dose("a", "2026-10-01T00:00:00.000Z")]);
  assert.equal(
    departurePreview(boundary, "animal", "2026-10-03", at(4)).event.meat.status,
    "elapsed",
  );
});

test("oracle 18: before void the ten-day product controls, afterwards history remains", () => {
  const s = structuredClone(cases[17][2]);
  s.treatments[0].voidedAt = null;
  let r = evaluate(s, { now: at(4) });
  assert.equal(r.animals[0].meat.releaseAt, at(11));
  assert.equal(r.animals[0].meat.remaining, "7d 0h 0m");
  assert.deepEqual(r.counts, { meat: 1, milk: 0, review: 0 });
  s.treatments[0].voidedAt = at(4);
  r = evaluate(s, { now: at(4) });
  assert.equal(r.animals[0].meat.releaseAt, at(7));
  assert.equal(s.treatments.length, 2);
});
