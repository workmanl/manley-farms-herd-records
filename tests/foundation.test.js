// SPDX-License-Identifier: AGPL-3.0-only
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { IDBFactory } from "fake-indexeddb";
import { STORES, indexes, models } from "../app/lib/contract.js";
import {
  openRepository,
  transaction,
  common,
  recoverySnapshot,
} from "../app/lib/database.js";
import {
  envelope,
  verifyBackup,
  exportBackup,
  previewRestore as realPreviewRestore,
  commitRestore,
  sha256,
} from "../app/lib/backup.js";
import {
  validateDataset,
  validateRecord,
  canonical,
  same,
} from "../app/lib/validation.js";
import { acknowledge, hasAccepted, storageStatus } from "../app/lib/terms.js";
import { TERMS_TEXT, TERMS_VERSION } from "../app/lib/terms-copy.js";
const fixture = JSON.parse(
  fs.readFileSync(new URL("./fixtures/sample-herd.json", import.meta.url)),
);
const previewRestore = (repo, input, mode, decisions) =>
  realPreviewRestore(repo, input, mode, decisions, {
    now: "2026-10-12T12:00:00.000Z",
  });
const copy = () => structuredClone(fixture.stores);
const opts = { acknowledgeDuplicateTags: true, acknowledgeParentSex: true };
async function fresh() {
  return openRepository({ factory: new IDBFactory() });
}
async function loaded() {
  const repo = await fresh();
  const backup = await exportBackup(repo);
  const plan = await previewRestore(repo, fixture);
  await commitRestore(repo, plan, {
    safetyBackup: backup,
    downloadConfirmed: true,
  });
  return repo;
}
const update = (r) => ({
  ...r,
  revision: r.revision + 1,
  updatedAt: new Date().toISOString(),
});

test("exact v1 stores and all index flags/key paths", async () => {
  const repo = await fresh();
  assert.equal(repo.db.version, 1);
  assert.deepEqual([...repo.db.objectStoreNames].sort(), [...STORES].sort());
  const tx = repo.db.transaction(STORES);
  for (const name of STORES) {
    const s = tx.objectStore(name);
    assert.equal(s.keyPath, "id");
    assert.equal(s.autoIncrement, false);
    assert.deepEqual(
      [...s.indexNames].sort(),
      indexes[name].map((i) => i[0]).sort(),
    );
    for (const [n, path, unique] of indexes[name]) {
      const i = s.index(n);
      assert.deepEqual(i.keyPath, path);
      assert.equal(i.unique, unique);
      assert.equal(i.multiEntry, false);
    }
  }
  repo.close();
});
test("full sample fixture verify/export/restore preserves every field, ID and count", async () => {
  await verifyBackup(fixture);
  const repo = await loaded();
  const exported = await exportBackup(repo, fixture.exportedAt);
  assert.deepEqual(exported.stores, fixture.stores);
  assert.deepEqual(exported.counts, fixture.counts);
  const other = await fresh();
  await commitRestore(other, await previewRestore(other, exported), {
    safetyBackup: await exportBackup(other),
    downloadConfirmed: true,
  });
  assert.deepEqual(
    (await exportBackup(other, fixture.exportedAt)).stores,
    fixture.stores,
  );
  repo.close();
  other.close();
});
test("verification never writes, including success", async () => {
  const repo = await loaded();
  const before = await repo.snapshot();
  await verifyBackup(await exportBackup(repo));
  assert.deepEqual(await repo.snapshot(), before);
  repo.close();
});

const cases = {
  "unique farm IDs across inactive animals": (s) => {
    s.animals[1].farmId = s.animals[0].farmId;
    s.animals[1].farmIdKey = s.animals[0].farmIdKey;
  },
  "normalized farm ID key": (s) => (s.animals[0].farmIdKey = "wrong"),
  "missing parent FK": (s) => (s.animals[0].damId = crypto.randomUUID()),
  "self pedigree cycle": (s) => (s.animals[0].damId = s.animals[0].id),
  "indirect pedigree cycle": (s) => {
    s.animals[0].damId = s.animals[1].id;
    s.animals[1].damId = s.animals[0].id;
  },
  "mutually exclusive parent reference": (s) => {
    s.animals[0].damId = s.animals[1].id;
    s.animals[0].damReference = "External";
  },
  "birth date precision": (s) => (s.animals[0].birthDatePrecision = "unknown"),
  "archive date required": (s) => {
    s.animals[0].status = "archived";
    s.animals[0].archivedAt = null;
  },
  "identifier normalization": (s) => (s.identifiers[0].normalizedValue = "bad"),
  "duplicate active RFID": (s) => {
    const rows = s.identifiers.filter((i) => i.activeRfidKey);
    rows[1].value = rows[0].value;
    rows[1].normalizedValue = rows[0].normalizedValue;
    rows[1].activeRfidKey = rows[0].activeRfidKey;
  },
  "RFID partial unique key": (s) =>
    (s.identifiers.find((i) => i.activeRfidKey).activeRfidKey = null),
  "current identifier mirror": (s) => (s.animals[0].visualTag = "unmirrored"),
  "identifier date range": (s) => {
    s.identifiers[0].validFrom = "2026-02-01";
    s.identifiers[0].validTo = "2026-01-01";
  },
  "identifier replacement reason": (s) => {
    const r = s.identifiers.find((i) => i.validTo);
    r.replacementReason = null;
  },
  "membership FK": (s) => (s.memberships[0].groupId = crypto.randomUUID()),
  "membership date range": (s) => (s.memberships[0].endDate = "0001-01-01"),
  "overlapping memberships": (s) =>
    s.memberships.push({ ...s.memberships[0], id: crypto.randomUUID() }),
  "membership current cache": (s) => (s.animals[0].currentGroupId = null),
  "calving requires calf": (s) => (s.calvings[0].calves = []),
  "calving ease scale": (s) => (s.calvings[0].easeScaleVersion = "registry"),
  "calving ease score": (s) => (s.calvings[0].easeScore = 6),
  "calving calf duplicate": (s) =>
    s.calvings[0].calves.push(s.calvings[0].calves[0]),
  "calf single birth event": (s) =>
    s.calvings.push({ ...s.calvings[0], id: crypto.randomUUID() }),
  "calf birth date agreement": (s) => (s.calvings[0].birthDate = "2026-09-01"),
  "stillborn status": (s) => {
    const c = s.calvings
      .flatMap((c) => c.calves)
      .find((c) => c.outcome === "stillborn");
    s.animals.find((a) => a.id === c.calfId).status = "active";
  },
  "birth weight reciprocal": (s) =>
    (s.weights.find((w) => w.calvingId).calvingId = null),
  "birth weight unique": (s) =>
    s.weights.push({
      ...s.weights.find((w) => w.type === "birth"),
      id: crypto.randomUUID(),
    }),
  "weight positive": (s) => (s.weights[0].value = 0),
  "linked weight type": (s) =>
    (s.weights.find((w) => w.calvingId).type = "other"),
  "snapshot required": (s) => (s.weights[0].snapshots = []),
  "snapshot unique": (s) =>
    s.weights[0].snapshots.push(s.weights[0].snapshots[0]),
  "snapshot FK": (s) =>
    (s.weights[0].snapshots[0].groupId = crypto.randomUUID()),
  "snapshot involved animal": (s) =>
    (s.weights[0].snapshots[0].animalId = s.animals.find(
      (a) => a.id !== s.weights[0].animalId,
    ).id),
  "course final required": (s) => {
    const c = s.treatmentCourses.find((c) => c.state === "closed");
    c.finalAdministrationId = null;
  },
  "course latest dose": (s) => {
    const c = s.treatmentCourses.find((c) => c.state === "closed");
    c.finalAdministrationId = s.treatments.find(
      (t) => t.courseId === c.id && t.id !== c.finalAdministrationId,
    ).id;
  },
  "course product match": (s) => (s.treatmentCourses[0].product = "wrong"),
  "course animal match": (s) =>
    (s.treatmentCourses[0].animalId = s.animals.find(
      (a) => a.id !== s.treatmentCourses[0].animalId,
    ).id),
  "dose paired": (s) => (s.treatments[0].doseUnit = null),
  "unknown dose documented": (s) => {
    s.treatments[0].doseValue = null;
    s.treatments[0].doseUnit = null;
    s.treatments[0].notes = null;
  },
  "route other text": (s) => (s.treatments[0].route = "other"),
  "date-only no instant": (s) =>
    (s.treatments[0].administrationPrecision = "date-only"),
  "timezone offset conflict": (s) => {
    s.treatments.find((t) => t.administrationAt).offsetMinutes = 60;
  },
  "instant local date match": (s) =>
    (s.treatments.find((t) => t.administrationAt).administrationDate =
      "2020-01-01"),
  "negative duration": (s) =>
    (s.treatments.find((t) => t.meat.state === "duration").meat.value = -1),
  "duration unit required": (s) =>
    (s.treatments.find((t) => t.meat.state === "duration").meat.unit = null),
  "zero requires confirmation": (s) => {
    const r = s.treatments.find((t) => t.meat.state === "duration").meat;
    r.value = 0;
    r.zeroConfirmedAt = null;
  },
  "fractional millisecond interval": (s) =>
    (s.treatments.find((t) => t.meat.state === "duration").meat.value =
      0.00000000001),
  "non-duration no value": (s) =>
    (s.treatments.find((t) => t.meat.state === "unknown").meat.value = 0),
  "known source required": (s) =>
    (s.treatments.find((t) => t.meat.state === "duration").meat.source = null),
  "directed release restriction": (s) =>
    (s.treatments.find((t) => t.meat.directedReleaseAt).meat.state =
      "prohibited"),
  "directed release vet required": (s) =>
    (s.treatments.find((t) => t.meat.directedReleaseAt).meat.source = "label"),
  "partial resolution": (s) =>
    (s.treatments.find((t) => t.meat.directedReleaseAt).meat.directedReleaseAt =
      null),
  "breeding exclusive date range": (s) =>
    (s.breedings[0].exposureStart = "2026-01-01"),
  "AI service required": (s) => (s.breedings[0].serviceDate = null),
  "exposure ordering": (s) => {
    Object.assign(s.breedings[0], {
      method: "natural",
      serviceDate: null,
      exposureStart: "2026-02-01",
      exposureEnd: "2026-01-01",
    });
  },
  "pregnancy breeding same animal": (s) =>
    (s.pregnancyChecks[0].animalId = s.animals.find(
      (a) => a.id !== s.pregnancyChecks[0].animalId,
    ).id),
  "pregnancy other method": (s) => (s.pregnancyChecks[0].method = "other"),
  "pregnancy only due when pregnant": (s) =>
    (s.pregnancyChecks[0].result = "open"),
  "pregnancy gestation nonnegative": (s) =>
    (s.pregnancyChecks[0].estimatedGestationDays = -1),
  "movement weight pair": (s) =>
    (s.movements.find((m) => m.weightValue).weightUnit = null),
  "movement amount pair": (s) =>
    (s.movements.find((m) => m.amount).currency = null),
  "movement currency precision": (s) =>
    (s.movements.find((m) => m.amount).amount = "1.001"),
  "movement ISO currency": (s) =>
    (s.movements.find((m) => m.amount).currency = "ZZZ"),
  "purchase source explained": (s) => {
    const m = s.movements.find((m) => m.type === "purchase");
    m.source = null;
    m.notes = null;
  },
  "sale destination explained": (s) => {
    const m = s.movements.find((m) => m.type === "sale");
    m.destination = null;
    m.notes = null;
  },
  "sale acknowledgment": (s) =>
    (s.movements.find((m) => m.type === "sale").holdAcknowledgment = null),
  "movement status": (s) => {
    const m = s.movements.find((m) => m.type === "sale");
    s.animals.find((a) => a.id === m.animalId).status = "active";
  },
  "cull decision active": (s) => {
    const m = s.movements.find((m) => m.type === "cull-decision");
    s.animals.find((a) => a.id === m.animalId).status = "culled";
  },
  "acknowledgment treatment FK": (s) =>
    (s.movements.find(
      (m) => m.holdAcknowledgment,
    ).holdAcknowledgment.treatmentIds = [crypto.randomUUID()]),
  "revision immutable flags": (s) => (s.revisions[0].revision = 2),
  "revision target": (s) => (s.revisions[0].entityId = crypto.randomUUID()),
  "revision sequence": (s) => (s.revisions[0].newValues.revision = 5),
  "clinical review": (s) => (s.revisions[0].holdReview = null),
  "revision cannot target revisions": (s) =>
    (s.revisions[0].entityType = "revisions"),
  "metadata singleton": (s) =>
    s.metadata.push({ ...s.metadata[0], id: crypto.randomUUID() }),
  "operation singleton": (s) => (s.operation = []),
  "metadata literal": (s) => (s.metadata[0].singletonKey = "other"),
  "metadata app semver": (s) => (s.metadata[0].appVersion = "1"),
  "metadata clock review pair": (s) =>
    (s.metadata[0].clockReviewedAt = "2026-01-01T00:00:00.000Z"),
  "metadata receipt active version": (s) =>
    (s.metadata[0].activeTermsVersion = "fake"),
  "migration sequence": (s) =>
    (s.metadata[0].migrationHistory = [
      {
        fromVersion: 1,
        toVersion: 3,
        completedAt: "2026-01-01T00:00:00.000Z",
        appVersion: "0.2.0",
      },
    ]),
  "backup reminder range": (s) => (s.operation[0].backupReminderDays = 0),
  "safe integer revision": (s) =>
    (s.animals[0].revision = Number.MAX_SAFE_INTEGER + 1),
  "valid Gregorian date": (s) => (s.animals[0].birthDate = "2026-02-29"),
  "canonical UUID": (s) => (s.animals[0].id = s.animals[0].id.toUpperCase()),
  "unknown field": (s) => (s.animals[0].extra = "x"),
  "missing field": (s) => delete s.animals[0].notes,
  "unknown enum": (s) => (s.animals[0].status = "missing"),
  "nonfinite number": (s) => (s.weights[0].value = Infinity),
  "empty text": (s) => (s.operation[0].name = ""),
  "unknown store": (s) => (s.other = []),
};
for (const [name, alter] of Object.entries(cases))
  test("constraint: " + name, () => {
    const s = copy();
    alter(s);
    assert.throws(() => validateDataset(s, opts));
  });

for (const name of STORES)
  test("all required fields and unknown keys: " + name, () => {
    for (const field of Object.keys({ ...models.Common, ...models[name] })) {
      const s = copy();
      delete s[name][0][field];
      assert.throws(() => validateDataset(s, opts), field);
    }
    const s = copy();
    s[name][0].unknownKey = true;
    assert.throws(() => validateDataset(s, opts));
  });
test("duplicate visual tags need explicit acknowledgment", () => {
  const s = copy();
  const a = s.animals[0],
    b = s.animals[1];
  a.visualTag = b.visualTag;
  const i = s.identifiers.find(
    (i) => i.animalId === a.id && i.type === "visual-tag" && !i.validTo,
  );
  i.value = b.visualTag;
  i.normalizedValue = b.visualTag.toLowerCase();
  assert.throws(() => validateDataset(s));
  assert.ok(validateDataset(s, opts).warnings.length);
});
test("parent sex changes require review while retaining pedigree", () => {
  const s = copy();
  const parent = s.animals.find((a) => s.animals.some((b) => b.damId === a.id));
  parent.sex = "male";
  assert.throws(() => validateDataset(s));
  assert.ok(validateDataset(s, opts).warnings.length);
});
test("atomic batch rollback including attempted valid change", async () => {
  const repo = await loaded(),
    before = await repo.snapshot();
  const a = update(before.animals[0]),
    b = update(before.animals[1]);
  a.notes = "valid change";
  b.damId = crypto.randomUUID();
  await assert.rejects(
    repo.mutate(
      [
        { store: "animals", record: a, expectedRevision: a.revision - 1 },
        { store: "animals", record: b, expectedRevision: b.revision - 1 },
      ],
      { reason: "Batch correction" },
    ),
  );
  assert.deepEqual(await repo.snapshot(), before);
  repo.close();
});
test("IndexedDB write failure rolls back clearing and inserts", async () => {
  const repo = await loaded(),
    before = await repo.snapshot();
  await assert.rejects(
    transaction(repo.db, "readwrite", (s, tx) => {
      const store = tx.objectStore("animals");
      store.clear();
      store.add(s.animals[0]);
      store.add(s.animals[0]);
    }),
  );
  assert.deepEqual(await repo.snapshot(), before);
  repo.close();
});
test("stale revisions across separate tab connections", async () => {
  const factory = new IDBFactory();
  const a = await openRepository({ factory }),
    b = await openRepository({ factory });
  const r = (await a.snapshot()).operation[0],
    first = update(r);
  first.name = "One";
  await a.mutate(
    [{ store: "operation", record: first, expectedRevision: r.revision }],
    { reason: "Rename" },
  );
  const stale = update(r);
  stale.name = "Two";
  await assert.rejects(
    b.mutate(
      [{ store: "operation", record: stale, expectedRevision: r.revision }],
      { reason: "Stale rename" },
    ),
    /Stale/,
  );
  assert.equal((await b.snapshot()).operation[0].name, "One");
  assert.equal((await b.snapshot()).revisions.length, 1);
  a.close();
  b.close();
});
test("corrections append complete history; direct revision mutation rejected", async () => {
  const repo = await loaded();
  const prior = (await repo.snapshot()).animals[0],
    next = update(prior);
  next.notes = "Corrected";
  await repo.mutate(
    [{ store: "animals", record: next, expectedRevision: prior.revision }],
    { reason: "Clarify note" },
  );
  const s = await repo.snapshot(),
    audit = s.revisions.find((r) => r.entityId === prior.id);
  assert.deepEqual(audit.priorValues, prior);
  assert.deepEqual(audit.newValues, next);
  await assert.rejects(
    repo.mutate([{ store: "revisions", record: audit, expectedRevision: 1 }], {
      reason: "Overwrite",
    }),
    /append-only/,
  );
  repo.close();
});
test("verify rejects corrupt/unsupported files with no live writes", async () => {
  const repo = await loaded(),
    before = await repo.snapshot();
  for (const alter of [
    (b) => (b.stores.animals[0].notes = "corrupt"),
    (b) => (b.schemaVersion = 2),
    (b) => (b.format = "manley-farm-records"),
    (b) => b.counts.animals++,
    (b) => (b.extra = true),
  ]) {
    const b = structuredClone(fixture);
    alter(b);
    await assert.rejects(verifyBackup(b));
    await assert.rejects(previewRestore(repo, b));
    assert.deepEqual(await repo.snapshot(), before);
  }
  repo.close();
});
test("valid checksum does not bypass schema, count or reference validation", async () => {
  for (const alter of [
    (b) => b.counts.animals++,
    (b) => (b.stores.animals[0].damId = crypto.randomUUID()),
    (b) => (b.stores.animals[0].extra = true),
  ]) {
    const b = structuredClone(fixture);
    alter(b);
    const { integrity, ...body } = b;
    b.integrity.value = await sha256(canonical(body));
    await assert.rejects(verifyBackup(b));
  }
});
test("merge identical data skips; conflict has no timestamp winner", async () => {
  const repo = await loaded();
  let plan = await previewRestore(repo, fixture, "merge");
  assert.equal(plan.conflicts.length, 0);
  const s = copy();
  s.animals[0].notes = "Incoming differs";
  const incoming = await envelope(s);
  plan = await previewRestore(repo, incoming, "merge");
  assert.equal(plan.ready, false);
  assert.equal(plan.conflicts.length, 1);
  await assert.rejects(commitRestore(repo, plan));
  const key = plan.conflicts[0].key;
  plan = await previewRestore(repo, incoming, "merge", {
    [key]: { choice: "incoming", reason: "Reviewed incoming note" },
  });
  assert.equal(plan.ready, true);
  await commitRestore(repo, plan);
  const final = await repo.snapshot();
  assert.equal(
    final.animals.find((a) => a.id === s.animals[0].id).notes,
    "Incoming differs",
  );
  assert.equal(final.revisions.length, 2);
  repo.close();
});
test("restore preview cancel and stale commit have no effect", async () => {
  const repo = await loaded(),
    before = await repo.snapshot();
  const plan = await previewRestore(repo, fixture);
  assert.deepEqual(await repo.snapshot(), before);
  const backup = await exportBackup(repo);
  const r = update(before.operation[0]);
  r.name = "New";
  await repo.mutate(
    [{ store: "operation", record: r, expectedRevision: r.revision - 1 }],
    { reason: "Rename" },
  );
  const now = await repo.snapshot();
  await assert.rejects(
    commitRestore(repo, plan, {
      safetyBackup: backup,
      downloadConfirmed: true,
    }),
    /Stale/,
  );
  assert.deepEqual(await repo.snapshot(), now);
  repo.close();
});
test("replace requires matching verified safety backup and download confirmation", async () => {
  const repo = await fresh(),
    before = await repo.snapshot();
  const plan = await previewRestore(repo, fixture);
  await assert.rejects(commitRestore(repo, plan));
  await assert.rejects(
    commitRestore(repo, plan, {
      safetyBackup: fixture,
      downloadConfirmed: true,
    }),
    /does not match/,
  );
  assert.deepEqual(await repo.snapshot(), before);
  repo.close();
});
test("disclaimer gate requires checked box and successful local audit receipt", async () => {
  const repo = await fresh();
  assert.equal(await hasAccepted(await repo.snapshot()), false);
  await assert.rejects(acknowledge(repo, false));
  await acknowledge(repo, true, { timeZone: "Etc/UTC" });
  const s = await repo.snapshot();
  assert.equal(await hasAccepted(s), true);
  assert.equal(s.metadata[0].activeTermsVersion, TERMS_VERSION);
  assert.equal(
    s.metadata[0].termsAcknowledgments[0].textSha256,
    await sha256(TERMS_TEXT),
  );
  assert.equal(s.revisions.length, 1);
  const bad = structuredClone(s);
  bad.metadata[0].termsAcknowledgments[0].textSha256 = "0".repeat(64);
  assert.equal(await hasAccepted(bad), false);
  repo.close();
  await assert.rejects(acknowledge(repo, true));
});
test("replacement keeps receipt history but resets active acceptance and backup receipts", async () => {
  const source = await loaded();
  await acknowledge(source, true);
  const backup = await exportBackup(source);
  const dest = await fresh();
  await commitRestore(dest, await previewRestore(dest, backup), {
    safetyBackup: await exportBackup(dest),
    downloadConfirmed: true,
  });
  const s = await dest.snapshot();
  assert.equal(await hasAccepted(s), false);
  assert.equal(s.metadata[0].termsAcknowledgments.length, 1);
  assert.ok(s.revisions.some((r) => r.reason.startsWith("Restore:")));
  source.close();
  dest.close();
});
test("storage availability and persistent grant are reported honestly", async () => {
  assert.equal((await storageStatus(null)).supported, false);
  assert.deepEqual(
    await storageStatus({
      persist: async () => false,
      persisted: async () => false,
      estimate: async () => ({ usage: 123, quota: 456 }),
    }),
    { supported: true, persisted: false, usage: 123, quota: 456 },
  );
});

test("migration v1 to test-only v2 commits sequentially, retains durable snapshot and closes old tabs", async () => {
  const { v2 } = await import("./fixtures/migration-v2.js");
  const factory = new IDBFactory();
  let notified = false;
  const old = await openRepository({
    factory,
    onVersionChange: () => {
      notified = true;
    },
  });
  const before = await old.snapshot();
  const upgraded = await openRepository({
    factory,
    targetVersion: 2,
    steps: { 2: v2 },
    downloadedBackup: true,
  });
  assert.equal(upgraded.recovery, null);
  assert.equal(upgraded.db.version, 2);
  assert.equal(notified, true);
  assert.equal(old.closed, true);
  assert.equal((await upgraded.snapshot()).metadata[0].schemaVersion, 2);
  assert.deepEqual((await recoverySnapshot({ factory })).snapshot, before);
  assert.ok(
    upgraded.db
      .transaction("groups")
      .objectStore("groups")
      .indexNames.contains("testByType"),
  );
  upgraded.close();
  const reopened = await openRepository({
    factory,
    targetVersion: 2,
    steps: { 2: v2 },
  });
  assert.equal(reopened.recovery, null);
  reopened.close();
});
test("failed migration rolls back schema and data, returns exportable read-only recovery", async () => {
  const { v2 } = await import("./fixtures/migration-v2.js");
  const factory = new IDBFactory();
  const old = await openRepository({ factory });
  const before = await old.snapshot();
  old.close();
  const failed = {
    ...v2,
    transform(s) {
      v2.transform(s);
      throw new Error("Injected migration failure");
    },
  };
  const repo = await openRepository({
    factory,
    targetVersion: 2,
    steps: { 2: failed },
    downloadedBackup: true,
  });
  assert.match(repo.recovery, /Injected migration failure/);
  assert.equal(repo.db.version, 1);
  assert.deepEqual(await repo.snapshot(), before);
  assert.equal(
    repo.db
      .transaction("groups")
      .objectStore("groups")
      .indexNames.contains("testByType"),
    false,
  );
  await verifyBackup(await exportBackup(repo));
  await assert.rejects(repo.mutate([]), /Recovery mode/);
  assert.deepEqual((await recoverySnapshot({ factory })).snapshot, before);
  repo.close();
});
test("destructive migration requires downloaded backup; missing steps never reset", async () => {
  const { v2 } = await import("./fixtures/migration-v2.js");
  const factory = new IDBFactory();
  let repo = await openRepository({ factory });
  const before = await repo.snapshot();
  repo.close();
  repo = await openRepository({ factory, targetVersion: 2, steps: { 2: v2 } });
  assert.match(repo.recovery, /Download and verify/);
  assert.deepEqual(await repo.snapshot(), before);
  repo.close();
  repo = await openRepository({
    factory,
    targetVersion: 3,
    steps: { 2: v2 },
    downloadedBackup: true,
  });
  assert.match(repo.recovery, /Missing sequential migration v3/);
  assert.deepEqual(await repo.snapshot(), before);
  repo.close();
});
test("newer database opens read-only recovery instead of downgrading", async () => {
  const { v2 } = await import("./fixtures/migration-v2.js");
  const factory = new IDBFactory();
  let repo = await openRepository({
    factory,
    targetVersion: 2,
    steps: { 2: v2 },
    downloadedBackup: true,
  });
  const before = await repo.snapshot();
  repo.close();
  repo = await openRepository({ factory });
  assert.match(repo.recovery, /newer/);
  assert.deepEqual(await repo.snapshot(), before);
  repo.close();
});
test("late migration transaction failure rolls back successful transformations", async () => {
  const { v2 } = await import("./fixtures/migration-v2.js");
  const factory = new IDBFactory();
  let repo = await openRepository({ factory });
  const before = await repo.snapshot();
  repo.close();
  const broken = {
    ...v2,
    upgrade(db, tx) {
      v2.upgrade(db, tx);
      tx.objectStore("groups").createIndex("testUniqueName", "name", {
        unique: true,
      });
    },
    validate(s) {
      v2.validate(s);
      s.groups.push({
        ...common(),
        name: "X",
        type: "pasture",
        description: null,
      });
      s.groups.push({ ...s.groups[0], id: crypto.randomUUID() });
    },
  };
  repo = await openRepository({
    factory,
    targetVersion: 2,
    steps: { 2: broken },
    downloadedBackup: true,
  });
  assert.ok(repo.recovery);
  assert.deepEqual(await repo.snapshot(), before);
  assert.equal(repo.db.version, 1);
  repo.close();
});
test("restore private staged plan cannot be altered by caller", async () => {
  const repo = await loaded();
  const s = copy();
  s.animals[0].notes = "conflict";
  const plan = await previewRestore(repo, await envelope(s), "merge");
  plan.ready = true;
  plan.conflicts = [];
  await assert.rejects(commitRestore(repo, plan), /incomplete/);
  repo.close();
});
test("future imported clock is sticky review with original metadata retained in audit", async () => {
  const repo = await fresh();
  const b = await exportBackup(repo);
  const plan = await realPreviewRestore(
    repo,
    fixture,
    "replace",
    {},
    { now: "2026-10-11T00:00:00.000Z" },
  );
  await commitRestore(repo, plan, { safetyBackup: b, downloadConfirmed: true });
  const s = await repo.snapshot();
  assert.equal(s.metadata[0].clockReviewRequired, true);
  assert.ok(
    s.revisions.some(
      (r) =>
        r.entityType === "metadata" &&
        same(r.priorValues, fixture.stores.metadata[0]),
    ),
  );
  repo.close();
});

test("new animal and identifier commit together; missing mirror rolls back", async () => {
  const repo = await loaded();
  const before = await repo.snapshot();
  const animal = {
    ...before.animals[0],
    ...common(),
    farmId: "NEW-001",
    farmIdKey: "new-001",
    visualTag: null,
    rfid: null,
    birthDate: null,
    birthDatePrecision: "unknown",
    damId: null,
    sireId: null,
    sireReference: null,
    currentGroupId: null,
    pasture: null,
  };
  const identifier = {
    ...common(),
    animalId: animal.id,
    type: "farm-id",
    value: animal.farmId,
    normalizedValue: animal.farmIdKey,
    validFrom: null,
    validTo: null,
    replacementReason: null,
    activeRfidKey: null,
  };
  await assert.rejects(
    repo.mutate([{ store: "animals", record: animal, expectedRevision: null }]),
    /mirror/,
  );
  assert.deepEqual(await repo.snapshot(), before);
  await repo.mutate([
    { store: "identifiers", record: identifier, expectedRevision: null },
    { store: "animals", record: animal, expectedRevision: null },
  ]);
  assert.equal((await repo.snapshot()).animals.length, 13);
  repo.close();
});
test("group change closes membership and updates animal atomically without changing historical snapshots", async () => {
  const repo = await loaded(),
    before = await repo.snapshot();
  const animal = before.animals.find((a) => a.farmId === "MEADOW-001");
  const old = before.memberships.find(
      (m) => m.animalId === animal.id && !m.endDate,
    ),
    group = before.groups.find((g) => g.id !== old.groupId);
  const closed = { ...update(old), endDate: "2026-10-13" };
  const next = {
    ...common(),
    animalId: animal.id,
    groupId: group.id,
    startDate: "2026-10-13",
    endDate: null,
    pastureSnapshot: "New pasture",
  };
  const moved = {
    ...update(animal),
    currentGroupId: group.id,
    pasture: "New pasture",
  };
  await repo.mutate(
    [
      { store: "animals", record: moved, expectedRevision: animal.revision },
      { store: "memberships", record: closed, expectedRevision: old.revision },
      { store: "memberships", record: next, expectedRevision: null },
    ],
    { reason: "Move group" },
  );
  assert.deepEqual((await repo.snapshot()).treatments, before.treatments);
  repo.close();
});
test("clinical correction fails without holdReview; reviewed correction preserves prior rules", async () => {
  const repo = await loaded();
  const prior = (await repo.snapshot()).treatments.find(
    (t) => t.meat.state === "duration",
  );
  const next = update(prior);
  next.meat = { ...next.meat, value: 1 };
  await assert.rejects(
    repo.mutate(
      [{ store: "treatments", record: next, expectedRevision: prior.revision }],
      { reason: "Correct entered interval" },
    ),
    /hold review/,
  );
  await repo.mutate(
    [{ store: "treatments", record: next, expectedRevision: prior.revision }],
    {
      reason: "Correct entered interval",
      holdReview: {
        reviewedAt: next.updatedAt,
        reviewedBy: "Test operator",
        reason: "Fictional corrected instructions",
        instructionReference: "TEST-VET",
      },
    },
  );
  const s = await repo.snapshot();
  assert.ok(
    s.revisions.some(
      (r) => r.entityId === prior.id && same(r.priorValues, prior),
    ),
  );
  repo.close();
});
test("current RFID remains unique on sold and archived animals", () => {
  const s = copy();
  const sold = s.animals.find((a) => a.status === "sold"),
    other = s.animals.find((a) => a.id !== sold.id);
  const a = s.identifiers.find(
      (i) => i.type === "rfid" && i.animalId === sold.id,
    ),
    b = s.identifiers.find((i) => i.type === "rfid" && i.animalId === other.id);
  b.value = a.value;
  b.normalizedValue = a.normalizedValue;
  b.activeRfidKey = a.activeRfidKey;
  other.rfid = sold.rfid;
  assert.throws(() => validateDataset(s, opts), /active RFID/);
  sold.status = "archived";
  sold.archivedAt = "2026-10-12T12:00:00.000Z";
  assert.throws(() => validateDataset(s, opts), /active RFID/);
});
test("NFC and ASCII normalization preserves identifier text and long leading-zero RFID", async () => {
  const { normalize } = await import("../app/lib/validation.js");
  assert.equal(normalize("  E\u0301-ABC  "), "É-abc");
  assert.equal(normalize("000000000000001"), "000000000000001");
  assert.equal(normalize("A  B"), "a  b");
  const s = copy();
  s.identifiers[0].value = 123;
  assert.throws(() => validateDataset(s, opts));
});
test("DST nonexistent time rejected and both explicit fall offsets accepted", () => {
  const original = copy().treatments.find((t) => t.administrationAt);
  const spring = {
    ...original,
    administrationDate: "2026-03-08",
    administrationAt: "2026-03-08T10:30:00.000Z",
    enteredLocalTime: "2026-03-08T02:30:00",
    timeZone: "America/Los_Angeles",
    offsetMinutes: -480,
  };
  assert.throws(() => validateRecord("treatments", spring), /nonexistent/);
  for (const [at, offset] of [
    ["2026-11-01T08:30:00.000Z", -420],
    ["2026-11-01T09:30:00.000Z", -480],
  ])
    validateRecord("treatments", {
      ...original,
      administrationDate: "2026-11-01",
      administrationAt: at,
      enteredLocalTime: "2026-11-01T01:30:00",
      timeZone: "America/Los_Angeles",
      offsetMinutes: offset,
    });
});
test("bookkeeping cannot suppress terms or domain audit", async () => {
  const repo = await fresh(),
    s = await repo.snapshot();
  const next = update(s.operation[0]);
  next.name = "No audit";
  await assert.rejects(
    repo.mutate([{ store: "operation", record: next, expectedRevision: 1 }], {
      bookkeeping: true,
    }),
  );
  await acknowledge(repo, true);
  const m = (await repo.snapshot()).metadata[0],
    changed = update(m);
  changed.activeTermsVersion = null;
  await assert.rejects(
    repo.mutate(
      [{ store: "metadata", record: changed, expectedRevision: m.revision }],
      { bookkeeping: true },
    ),
  );
  const removed = update(m);
  removed.termsAcknowledgments = [];
  removed.activeTermsVersion = null;
  await assert.rejects(
    repo.mutate(
      [{ store: "metadata", record: removed, expectedRevision: m.revision }],
      { reason: "Remove receipt" },
    ),
    /append-only/,
  );
  repo.close();
});
test("merge preserves target dataset and local acceptance while retaining incoming receipts", async () => {
  const repo = await loaded();
  await acknowledge(repo, true);
  const before = await repo.snapshot();
  const incoming = copy();
  incoming.metadata[0].termsAcknowledgments = [
    {
      version: "older-terms",
      acceptedAt: "2026-01-01T00:00:00.000Z",
      timeZone: "Etc/UTC",
      textSha256: "f".repeat(64),
      appVersion: "0.1.0",
    },
  ];
  const b = await envelope(incoming);
  let p = await previewRestore(repo, b, "merge");
  const decisions = Object.fromEntries(
    p.conflicts.map((c) => [c.key, { choice: "local" }]),
  );
  p = await previewRestore(repo, b, "merge", decisions);
  await commitRestore(repo, p);
  const after = await repo.snapshot();
  assert.equal(after.metadata[0].datasetId, before.metadata[0].datasetId);
  assert.equal(await hasAccepted(after), true);
  assert.equal(after.metadata[0].termsAcknowledgments.length, 2);
  repo.close();
});
test("nested unknown keys, null array elements, strict booleans and malformed UTC rejected", () => {
  for (const change of [
    (s) => (s.treatments[0].meat.extra = true),
    (s) => s.weights[0].snapshots.push(null),
    (s) => (s.metadata[0].clockReviewRequired = "false"),
    (s) => (s.animals[0].createdAt = "2026-01-01T00:00:00Z"),
  ]) {
    const s = copy();
    change(s);
    assert.throws(() => validateDataset(s, opts));
  }
});
test("two concurrent corrections serialize and only one succeeds", async () => {
  const repo = await loaded();
  const r = (await repo.snapshot()).animals[0];
  const changes = ["A", "B"].map((notes) =>
    repo.mutate(
      [
        {
          store: "animals",
          record: { ...update(r), notes },
          expectedRevision: r.revision,
        },
      ],
      { reason: "Concurrent correction" },
    ),
  );
  const result = await Promise.allSettled(changes);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(result.filter((r) => r.status === "rejected").length, 1);
  repo.close();
});
test("transaction abort and quota-like failure cannot report success", async () => {
  const repo = await loaded(),
    before = await repo.snapshot();
  await assert.rejects(
    transaction(repo.db, "readwrite", (s, tx) => {
      tx.objectStore("animals").clear();
      throw new DOMException("Injected full device", "QuotaExceededError");
    }),
    { name: "QuotaExceededError" },
  );
  assert.deepEqual(await repo.snapshot(), before);
  repo.close();
});
test("corrupt persisted records reopen in read-only recovery without reset", async () => {
  const factory = new IDBFactory();
  let repo = await openRepository({ factory });
  await transaction(repo.db, "readwrite", (s, tx) =>
    tx.objectStore("operation").put({ ...s.operation[0], name: "" }),
  );
  repo.close();
  repo = await openRepository({ factory });
  assert.match(repo.recovery, /Validation failed/);
  assert.equal((await repo.snapshot()).operation[0].name, "");
  repo.close();
});

test("identifier replacement retains ended history and requires a new reasoned row", async () => {
  const repo = await loaded(),
    s = await repo.snapshot();
  const a = s.animals[0],
    old = s.identifiers.find(
      (i) => i.animalId === a.id && i.type === "visual-tag" && !i.validTo,
    );
  const changed = { ...update(a), visualTag: "RETAG" };
  const overwrite = {
    ...update(old),
    value: "RETAG",
    normalizedValue: "retag",
  };
  await assert.rejects(
    repo.mutate(
      [
        { store: "animals", record: changed, expectedRevision: a.revision },
        {
          store: "identifiers",
          record: overwrite,
          expectedRevision: old.revision,
        },
      ],
      { reason: "Retag" },
    ),
    /close and preserve/,
  );
  const ended = {
    ...update(old),
    validTo: "2026-10-13",
    replacementReason: "Retag",
  };
  const replacement = {
    ...old,
    ...common(),
    value: "RETAG",
    normalizedValue: "retag",
    validFrom: "2026-10-13",
    replacementReason: "Retag",
  };
  await repo.mutate(
    [
      { store: "animals", record: changed, expectedRevision: a.revision },
      { store: "identifiers", record: ended, expectedRevision: old.revision },
      { store: "identifiers", record: replacement, expectedRevision: null },
    ],
    { reason: "Retag" },
  );
  const result = await repo.snapshot();
  assert.equal(
    result.identifiers.find((i) => i.id === old.id).value,
    old.value,
  );
  assert.equal(result.identifiers.length, s.identifiers.length + 1);
  repo.close();
});

test("future completed doses cannot be saved, imported inconsistencies require visible review", async () => {
  const repo = await loaded(),
    before = await repo.snapshot();
  const prior = before.treatments.find(
    (t) => !t.courseId && t.administrationAt,
  );
  const future = {
    ...prior,
    ...common(),
    administrationAt: "2099-01-01T10:00:00.000Z",
    administrationDate: "2099-01-01",
    enteredLocalTime: "2099-01-01T10:00:00",
    timeZone: "Etc/UTC",
    offsetMinutes: 0,
  };
  await assert.rejects(
    repo.mutate([
      { store: "treatments", record: future, expectedRevision: null },
    ]),
    /future dose/,
  );
  assert.deepEqual(await repo.snapshot(), before);
  const stores = copy();
  stores.treatments.push(future);
  const verified = await verifyBackup(await envelope(stores));
  assert.ok(verified.warnings.some((w) => w.includes("Future completed")));
  repo.close();
});
