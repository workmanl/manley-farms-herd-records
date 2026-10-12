import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { writeFileSync } from "node:fs";
import { generateScale, scaleClock } from "../scripts/generate-scale.mjs";
import {
  openRepository,
  transaction,
  writeDifference,
} from "../app/lib/database.js";
import {
  exportBackup,
  previewRestore,
  commitRestore,
} from "../app/lib/backup.js";
import { searchAnimals, commitWorkflow, events } from "../app/lib/workflows.js";
import { evaluateWithdrawal } from "../app/lib/withdrawal.js";
import { refreshHealth } from "../app/lib/health.js";
const times = {};
async function timed(name, fn) {
  let start = performance.now();
  const out = await fn();
  times[name] = Math.round(performance.now() - start);
  console.log(name, times[name] + "ms");
  return out;
}
test("twenty-year fixture: launch, search, p95 committed save and lossless full backup/restore", async () => {
  const s = generateScale();
  assert.equal(s.animals.length, 10000);
  assert.equal(s.animals.filter((a) => a.status === "active").length, 500);
  assert.equal(
    ["weights", "breedings", "treatments", "revisions"].reduce(
      (n, k) => n + s[k].length,
      0,
    ),
    250000,
  );
  const factory = new IDBFactory(),
    name = "scale";
  let repo = await openRepository({ factory, name });
  await timed("fixtureLoad", () =>
    transaction(repo.db, "readwrite", (before, tx) =>
      writeDifference(tx, before, s),
    ),
  );
  repo.close();
  let snapshot;
  await timed("launchToDashboard", async () => {
    repo = await openRepository({ factory, name, initialClock: scaleClock });
    assert.equal(repo.recovery, null);
    snapshot = await refreshHealth(repo, scaleClock);
    const panel = evaluateWithdrawal(snapshot, { now: scaleClock });
    assert.equal(panel.animals.length, 10000);
    events(snapshot, { limit: 5 });
  });
  await timed("commonSearch", () => {
    assert.equal(searchAnimals(snapshot, { query: "SCALE-00042" }).total, 1);
  });
  const samples = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    await commitWorkflow(repo, snapshot, "weight", {
      animalId: s.animals[0].id,
      date: "2026-10-12",
      type: "other",
      value: "700",
      unit: "lb",
    });
    samples.push(performance.now() - start);
  }
  times.saveP95 = Number(
    samples
      .sort((a, b) => a - b)
      [Math.ceil(samples.length * 0.95) - 1].toFixed(3),
  );
  console.log("saveP95", times.saveP95 + "ms");
  const progress = [];
  const backup = await timed("fullBackup", () =>
    exportBackup(repo, scaleClock, (p) => progress.push(p)),
  );
  const target = await openRepository({ factory, name: "restore" });
  await timed("fullRestore", async () => {
    const safetyBackup = await exportBackup(target);
    const plan = await previewRestore(
      target,
      backup,
      "replace",
      {},
      { now: scaleClock, onProgress: (p) => progress.push(p) },
    );
    await commitRestore(target, plan, {
      safetyBackup,
      downloadConfirmed: true,
      acknowledgeWarnings: true,
      onProgress: (p) => progress.push(p),
    });
  });
  await timed("roundTripVerification", async () => {
    const restored = await exportBackup(target, scaleClock);
    assert.deepEqual(restored.counts, backup.counts);
    assert.equal(restored.integrity.value, backup.integrity.value);
  });
  writeFileSync(
    new URL("../docs/phase6-performance.json", import.meta.url),
    JSON.stringify(
      {
        environment:
          process.version + " " + process.platform + " " + process.arch,
        proxy: "fake-indexeddb 6.2.4, Node only",
        animals: 10000,
        active: 500,
        events: 250000,
        samples: 20,
        times,
      },
      null,
      2,
    ) + "\n",
  );
  repo.close();
  target.close();
  assert.ok(times.commonSearch <= 300);
  assert.ok(times.saveP95 <= 500);
  assert.ok(times.fullBackup <= 60000);
  assert.ok(times.fullRestore <= 60000);
  assert.ok(progress.length >= 4, "backup and restore expose progress");
});
