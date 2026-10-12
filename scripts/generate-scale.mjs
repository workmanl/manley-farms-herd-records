// Deterministic synthetic twenty-year fixture. No real herd data.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const seed = JSON.parse(
  readFileSync(new URL("../tests/fixtures/sample-herd.json", import.meta.url)),
).stores;
export const scaleClock = "2026-10-12T12:00:00.000Z";
const id = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
export function generateScale({
  animals = 10000,
  active = 500,
  events = 250000,
} = {}) {
  const s = Object.fromEntries(Object.keys(seed).map((k) => [k, []]));
  let serial = 1;
  const common = (date = "2006-10-13") => ({
    id: id(serial++),
    createdAt: date + "T00:00:00.000Z",
    updatedAt: date + "T00:00:00.000Z",
    revision: 1,
    archivedAt: null,
    voidedAt: null,
  });
  s.operation = [
    { ...seed.operation[0], ...common(), name: "Twenty-year fictional herd" },
  ];
  s.metadata = [
    {
      ...seed.metadata[0],
      ...common(),
      datasetId: id(999999999),
      lastObservedClockAt: null,
    },
  ];
  for (let n = 0; n < animals; n++) {
    const farmId = `SCALE-${String(n).padStart(5, "0")}`;
    const a = {
      ...seed.animals[0],
      ...common(),
      farmId,
      farmIdKey: farmId.toLowerCase(),
      visualTag: null,
      rfid: null,
      birthDate: "2006-10-13",
      damId: null,
      sireId: null,
      sireReference: null,
      currentGroupId: null,
      pasture: null,
      status: n < active ? "active" : "archived",
      archivedAt: n < active ? null : scaleClock,
    };
    s.animals.push(a);
    s.identifiers.push({
      ...seed.identifiers[0],
      ...common(),
      animalId: a.id,
      value: farmId,
      normalizedValue: a.farmIdKey,
      validFrom: "2006-10-13",
    });
  }
  // 160k weights, 40k breeding events, 25k date-only historical treatments,
  // 25k revisions. Clinical records include unresolved timing, as real history may.
  const revisions = Math.floor(events / 10),
    treatments = Math.floor(events / 10),
    breedings = Math.floor(events * 0.16),
    weights = events - revisions - treatments - breedings;
  const date = (n) =>
    new Date(
      Date.UTC(2006, 9, 13) +
        Math.floor((n / Math.max(1, events - revisions - 1)) * 7304) * 86400000,
    )
      .toISOString()
      .slice(0, 10);
  const snap = (a) => [
    {
      animalId: a.id,
      farmId: a.farmId,
      visualTag: null,
      rfid: null,
      groupId: null,
      groupName: null,
      pasture: null,
    },
  ];
  for (let n = 0; n < events - revisions; n++) {
    const a = s.animals[n % animals],
      d = date(n),
      base = { ...common(d), snapshots: snap(a) };
    if (n < weights)
      s.weights.push({
        ...seed.weights[0],
        ...base,
        animalId: a.id,
        date: d,
        type: "other",
        value: 400 + (n % 800),
        calvingId: null,
      });
    else if (n < weights + breedings)
      s.breedings.push({
        ...seed.breedings[0],
        ...base,
        damId: a.id,
        serviceDate: d,
      });
    else
      s.treatments.push({
        ...seed.treatments[0],
        ...base,
        animalId: a.id,
        batchId: null,
        administrationDate: d,
        administrationAt: null,
        administrationPrecision: "date-only",
        enteredLocalTime: null,
        offsetMinutes: null,
      });
  }
  for (let n = 0; n < revisions; n++) {
    const w = s.weights[n],
      prior = structuredClone(w);
    w.revision = 2;
    w.notes = "Corrected synthetic weight note";
    s.revisions.push({
      ...common(w.date),
      entityType: "weights",
      entityId: w.id,
      priorValues: prior,
      newValues: structuredClone(w),
      changedAt: w.updatedAt,
      operator: "Fixture generator",
      reason: "Synthetic note correction",
      holdReview: null,
    });
  }
  return s;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const file = process.argv[2] || "/tmp/herd-twenty-year.json";
  writeFileSync(file, JSON.stringify(generateScale()));
  console.log(file);
}
