// SPDX-License-Identifier: AGPL-3.0-only
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { IDBFactory } from "fake-indexeddb";
import { JSDOM } from "jsdom";
import { STORES } from "../app/lib/contract.js";
import {
  exportCSV,
  decodeTable,
  exportSet,
  parseCSV,
  templateCSV,
  headers,
  ESCAPING,
  previewCSV,
  commitCSV,
  csvSetBackup,
  decodeCell,
  encodeCell,
} from "../app/lib/csv.js";
import { CSV_DICTIONARY } from "../app/lib/csv-dictionary.js";
import { openRepository, emptyDataset } from "../app/lib/database.js";
import {
  exportBackup,
  previewRestore,
  commitRestore,
} from "../app/lib/backup.js";
import { prepareWorkflow } from "../app/lib/workflows.js";
import {
  backupReminder,
  snoozeBackup,
  backupContent,
  confirmRequestedBackup,
} from "../app/lib/reminders.js";
import {
  assembleReport,
  renderReport,
  PRINT_FOOTER,
  SWITCHING_STEPS,
} from "../app/lib/reports.js";
import { OwnershipUI } from "../app/lib/ownership-ui.js";
const read = (p) =>
  fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");
const fixture = JSON.parse(read("tests/fixtures/sample-herd.json")).stores;
const now = "2026-10-12T12:00:00.000Z";
const options = { escaping: ESCAPING, now };
const fresh = () => openRepository({ factory: new IDBFactory() });
async function loaded() {
  const r = await fresh(),
    safetyBackup = await exportBackup(r);
  const files = exportSet(fixture, { now });
  const b = await csvSetBackup(
    JSON.parse(files.find((f) => f.fileName === "csv-manifest.json").text),
    Object.fromEntries(files.map((f) => [f.fileName, f.text])),
  );
  const p = await previewRestore(r, b, "replace", {}, { now });
  await commitRestore(r, p, {
    safetyBackup,
    downloadConfirmed: true,
    acknowledgeWarnings: true,
  });
  return r;
}
for (const store of STORES)
  test(`CSV ${store}: complete record round trip and frozen template header`, () => {
    const csv = exportCSV(store, fixture[store]);
    const result = decodeTable(store, csv, {
      ...options,
      existing: fixture[store],
    });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(
      result.rows.map((r) => r.record),
      fixture[store],
    );
    const section = CSV_DICTIONARY.split(`### \`${store}.csv\``)[1];
    const expected = /```csv\n([^\n]+)/.exec(section)[1].split(",");
    assert.deepEqual(parseCSV(templateCSV(store)).headers, expected);
    assert.deepEqual(headers(store), expected);
    assert.match(csv, /\r\n$/);
  });
for (const value of [
  "00001",
  "000123456789012345678901",
  "Élodie 牛",
  "a,b",
  "two\nlines\r\nthree",
  '"quote"',
  "=2+2",
  " \t+42",
  "-formula",
  "@SUM(A1)",
  "'001",
  "\tstart",
  "\nstart",
])
  test(`CSV text preserves ${JSON.stringify(value)}`, () => {
    const descriptor = { type: "Text" },
      encoded = encodeCell(value, descriptor);
    assert.equal(decodeCell(encoded, descriptor, options), value);
    const row = { ...fixture.groups[0], description: value };
    assert.equal(
      decodeTable("groups", exportCSV("groups", [row]), {
        ...options,
        existing: [row],
      }).rows[0].record.description,
      value,
    );
  });
test("CSV full set preserves all 14 tables, archived, voided and revisions through validated restore", async () => {
  const r = await loaded(),
    actual = await r.snapshot();
  for (const store of STORES)
    assert.deepEqual(
      [...actual[store]].sort((a, b) => a.id.localeCompare(b.id)),
      [...fixture[store]].sort((a, b) => a.id.localeCompare(b.id)),
    );
  r.close();
});
test("CSV scope manifest and dictionary are included, and filtered sets cannot restore", async () => {
  const full = exportSet(fixture, { now });
  assert.equal(full.length, 16);
  assert.match(full.at(-1).text, /apostrophe-prefix-v1/);
  assert.match(full.at(-1).text, /WithdrawalRule/);
  const files = exportSet(fixture, {
    stores: ["animals"],
    filters: { status: "active" },
    select: (_, r) => r.status === "active",
    now,
  });
  const manifest = JSON.parse(files[1].text);
  assert.equal(manifest.scope, "filtered");
  assert.deepEqual(manifest.filters, { status: "active" });
  assert.equal(
    manifest.files[0].rowCount,
    fixture.animals.filter((a) => a.status === "active").length,
  );
  await assert.rejects(csvSetBackup(manifest, {}), /filtered/);
  assert.throws(() => exportSet(fixture, { stores: ["animals"] }), /scope/);
});
for (const csv of [
  "a,a\n1,2",
  "a,b\n1",
  'a\n"bad',
  'a\n"ok"bad',
  "a\nx\ry",
  "",
  '{"format":"manley-farm-records"}',
])
  test(`CSV rejects malformed or wrong-format input ${JSON.stringify(csv)}`, () =>
    assert.throws(() => parseCSV(csv)));
test("BOM accepted, blank null differs from false and zero, formula decode requires explicit mode", () => {
  assert.equal(parseCSV('\uFEFFa\n"b"').rows[0][0], "b");
  assert.equal(decodeCell("", { type: "Number?" }), null);
  assert.equal(decodeCell("0", { type: "Number" }), 0);
  assert.equal(decodeCell("false", { type: "Boolean" }), false);
  assert.equal(
    decodeCell("'=2+2", { type: "Text" }, { escaping: "none" }),
    "'=2+2",
  );
  assert.throws(() => decodeTable("animals", "farmId\n001"), /escaping/);
});
test("Mapping, explicit dates and decimal units are converted, nonempty unmapped columns fail visibly", () => {
  const r = decodeTable(
    "weights",
    'cow,day,weight,kind\nabc,10/11/2026,"12,5",other',
    {
      ...options,
      dateFormat: "DMY",
      decimal: "comma",
      weightUnit: "kg",
      mapping: { cow: "animalId", day: "date", weight: "value", kind: "type" },
    },
  );
  assert.equal(r.rows[0].record.date, "2026-11-10");
  assert.equal(r.rows[0].record.value, 12.5);
  assert.equal(r.rows[0].record.unit, "kg");
  assert.match(
    decodeTable("groups", "name,extra\nTest,keep me", {
      ...options,
      mapping: { name: "name" },
    }).errors[0].message,
    /Unmapped/,
  );
  assert.throws(
    () =>
      decodeTable("groups", "a,b\nx,y", {
        ...options,
        mapping: { a: "name", b: "name" },
      }),
    /same field/,
  );
});
test("Animal import generates stable downloadable IDs and mirrors, never merges tags", async () => {
  const r = await fresh(),
    tables = [
      {
        store: "animals",
        text: 'farmId,visualTag,notes\n0001,007,"=2+2"\n0002,007,"牛, calf"',
      },
    ];
  const p = await previewCSV(r, tables, { escaping: "none", now });
  assert.equal(p.ready, true, JSON.stringify(p.errors));
  assert.equal(p.generated.length, 2);
  assert.match(p.warnings.join(), /Duplicate/);
  await assert.rejects(commitCSV(r, p, { confirmed: true }), /warnings/);
  await commitCSV(r, p, { confirmed: true, acknowledgeWarnings: true });
  const s = await r.snapshot();
  assert.equal(s.animals.length, 2);
  assert.equal(s.identifiers.length, 4);
  assert.equal(s.animals.find((a) => a.farmId === "0001").notes, "=2+2");
  r.close();
});
test("Unknown parents remain errors; explicit external references import intact", async () => {
  const r = await fresh();
  const p = await previewCSV(
    r,
    [{ store: "animals", text: `farmId,damId\n001,${crypto.randomUUID()}` }],
    { escaping: "none", now },
  );
  assert.equal(p.ready, false);
  assert.match(p.errors.at(-1).message, /reference/);
  const q = await previewCSV(
    r,
    [{ store: "animals", text: "farmId,damReference\n001,External 00007" }],
    { escaping: "none", now },
  );
  assert.equal(q.ready, true);
  await commitCSV(r, q, { confirmed: true });
  assert.equal((await r.snapshot()).animals[0].damReference, "External 00007");
  r.close();
});
test("Same-ID identical imports skip; corrections are explicit and append prior/new history", async () => {
  const r = await loaded(),
    g = fixture.groups[0];
  const p = await previewCSV(
    r,
    [{ store: "groups", text: exportCSV("groups", [g]) }],
    options,
  );
  assert.equal(p.rows[0].action, "identical: skip");
  const changed = { ...g, description: "Imported correction" };
  const tables = [{ store: "groups", text: exportCSV("groups", [changed]) }];
  const q = await previewCSV(r, tables, options);
  assert.equal(q.ready, false);
  const v = await previewCSV(r, tables, {
    ...options,
    decisions: {
      [`groups:${g.id}`]: { choice: "correct", reason: "Correct source" },
    },
  });
  assert.equal(v.ready, true, JSON.stringify(v.errors));
  await commitCSV(r, v, { confirmed: true, acknowledgeWarnings: true });
  const s = await r.snapshot(),
    rev = s.revisions.find(
      (x) => x.entityId === g.id && x.reason === "Correct source",
    );
  assert.deepEqual(rev.priorValues, g);
  assert.equal(rev.newValues.description, "Imported correction");
  r.close();
});
test("Existing IDs cannot silently clear omitted columns, incoming duplicate IDs rejected", async () => {
  const r = await loaded(),
    g = fixture.groups[0];
  const p = await previewCSV(
    r,
    [{ store: "groups", text: `id,name\n${g.id},Changed` }],
    options,
  );
  assert.match(p.errors[0].message, /every field/);
  const q = await previewCSV(
    r,
    [{ store: "groups", text: exportCSV("groups", [g, g]) }],
    options,
  );
  assert.match(q.errors[0].message, /Duplicate incoming/);
  r.close();
});
test("Clinical corrections require hold review, preserve unresolved rules and prior values", async () => {
  const r = await loaded(),
    t = fixture.treatments.find((t) => t.meat.state === "duration");
  const incoming = { ...t, meat: { ...t.meat, value: t.meat.value + 1 } };
  const tables = [
      { store: "treatments", text: exportCSV("treatments", [incoming]) },
    ],
    key = `treatments:${t.id}`;
  const decision = { choice: "correct", reason: "Correct instructions" };
  const p = await previewCSV(r, tables, {
    ...options,
    decisions: { [key]: decision },
  });
  assert.match(p.errors[0].message, /hold review/);
  decision.holdReview = {
    reviewedAt: now,
    reviewedBy: "Demo",
    reason: "Review",
    instructionReference: "Demo reference",
  };
  const q = await previewCSV(r, tables, {
    ...options,
    decisions: { [key]: decision },
  });
  assert.equal(q.ready, true, JSON.stringify(q.errors));
  await commitCSV(r, q, { confirmed: true, acknowledgeWarnings: true });
  assert.ok(
    (await r.snapshot()).revisions.some(
      (v) => v.entityId === t.id && v.holdReview,
    ),
  );
  r.close();
});
test("Import confirmation, private plan, stale preview and mid-commit failure preserve atomicity", async () => {
  const r = await fresh(),
    before = await r.snapshot();
  const p = await previewCSV(
    r,
    [{ store: "animals", text: "farmId\n001\n002" }],
    { escaping: "none", now },
  );
  assert.equal(p.ready, true, JSON.stringify(p.errors));
  await assert.rejects(commitCSV(r, p), /Confirm/);
  p.rows[0].record.farmId = "tampered";
  const transaction = r.db.transaction.bind(r.db);
  let writes = 0;
  r.db.transaction = (...args) => {
    const tx = transaction(...args);
    if (args[1] === "readwrite") {
      const objectStore = tx.objectStore.bind(tx);
      tx.objectStore = (name) => {
        const store = objectStore(name);
        if (name === "animals") {
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
  await assert.rejects(commitCSV(r, p, { confirmed: true }), {
    name: "QuotaExceededError",
  });
  assert.equal(writes, 2);
  assert.deepEqual(await r.snapshot(), before);
  r.db.transaction = transaction;
  await commitCSV(r, p, { confirmed: true });
  assert.deepEqual((await r.snapshot()).animals.map((a) => a.farmId).sort(), [
    "001",
    "002",
  ]);
  await assert.rejects(commitCSV(r, p, { confirmed: true }), /invalid/);
  const q = await previewCSV(r, [{ store: "animals", text: "farmId\n003" }], {
    escaping: "none",
    now,
  });
  const workflow = prepareWorkflow(
    await r.snapshot(),
    "animal",
    { farmId: "004" },
    now,
  );
  await r.mutate(workflow.changes, workflow.options);
  await assert.rejects(commitCSV(r, q, { confirmed: true }), /Stale/);
  assert.equal((await r.snapshot()).animals.length, 3);
  r.close();
});
test("Missing historical snapshots need visible confirmation and staged converted values", async () => {
  const r = await loaded(),
    a = fixture.animals[0],
    tables = [
      {
        store: "weights",
        text: `animalId,date,type,value\n${a.id},10/01/2026,other,125`,
      },
    ];
  const opts = { escaping: "none", now, dateFormat: "MDY", weightUnit: "kg" };
  const p = await previewCSV(r, tables, opts);
  assert.match(p.errors[0].message, /snapshots/);
  const q = await previewCSV(r, tables, {
    ...opts,
    confirmCurrentSnapshots: true,
  });
  assert.equal(q.ready, true, JSON.stringify(q.errors));
  assert.equal(q.rows[0].record.date, "2026-10-01");
  assert.equal(q.rows[0].record.snapshots[0].animalId, a.id);
  r.close();
});
test("Singleton and audit table imports require full set, and corrupt full counts reject", async () => {
  const r = await fresh();
  for (const store of ["operation", "metadata", "revisions"])
    await assert.rejects(
      previewCSV(
        r,
        [{ store, text: exportCSV(store, fixture[store]) }],
        options,
      ),
      /complete export set/,
    );
  const files = exportSet(fixture, { now }),
    contents = Object.fromEntries(files.map((f) => [f.fileName, f.text])),
    manifest = JSON.parse(contents["csv-manifest.json"]);
  manifest.files[0].rowCount++;
  await assert.rejects(csvSetBackup(manifest, contents), /count mismatch/);
  r.close();
});
test("Reminder clock: first saved session, interval boundary, unbacked changes and snooze", async () => {
  const s = emptyDataset(now);
  assert.equal(backupReminder(s, { now }).due, false);
  s.groups = [{ updatedAt: now }];
  assert.equal(backupReminder(s, { now }).reason, "first-saved-session");
  assert.equal(backupReminder(s, { now }).due, true);
  s.metadata[0].lastExportAttemptAt = now;
  assert.equal(backupReminder(s, { now }).due, true);
  s.metadata[0].lastUserConfirmedBackupAt = now;
  assert.equal(
    backupReminder(s, { now: "2026-10-20T12:00:00.000Z" }).due,
    false,
  );
  s.groups[0].updatedAt = "2026-10-13T12:00:00.000Z";
  assert.equal(
    backupReminder(s, { now: "2026-10-19T11:59:59.999Z" }).due,
    false,
  );
  assert.equal(
    backupReminder(s, { now: "2026-10-19T12:00:00.000Z" }).due,
    true,
  );
  s.operation[0].backupReminderDays = 2;
  assert.equal(
    backupReminder(s, { now: "2026-10-14T12:00:00.000Z" }).due,
    true,
  );
  s.operation[0].backupSnoozedUntil = "2026-10-15T12:00:00.000Z";
  assert.equal(
    backupReminder(s, { now: "2026-10-15T11:59:59.999Z" }).due,
    false,
  );
  assert.equal(
    backupReminder(s, { now: "2026-10-15T12:00:00.000Z" }).due,
    true,
  );
  for (const reason of ["restore-replace", "schema-upgrade"])
    assert.equal(backupReminder(s, { now, reason }).due, true);
  const r = await fresh();
  await snoozeBackup(r, { now });
  assert.equal(
    (await r.snapshot()).metadata[0].lastUserConfirmedBackupAt,
    null,
  );
  assert.equal(
    backupReminder(await r.snapshot(), { now: "2026-10-14T12:00:00.000Z" }).due,
    false,
  );
  r.close();
});
test("Bookkeeping does not change backup content; actual records do", () => {
  const s = structuredClone(fixture),
    other = structuredClone(s);
  other.metadata[0].lastExportAttemptAt = now;
  other.metadata[0].revision++;
  other.metadata[0].lastObservedClockAt = now;
  assert.deepEqual(backupContent(s), backupContent(other));
  other.animals[0].notes = "New work";
  assert.notDeepEqual(backupContent(s), backupContent(other));
});
test("Treatment report ranges retain all holds, clinical fields and historical departure warnings", () => {
  const report = assembleReport(fixture, {
    type: "treatments",
    from: "2026-10-01",
    to: "2026-10-05",
    now,
  });
  assert.equal(
    report.rows.length,
    fixture.treatments.filter(
      (t) =>
        t.administrationDate >= "2026-10-01" &&
        t.administrationDate <= "2026-10-05",
    ).length,
  );
  assert.equal(report.holds.length, fixture.animals.length);
  assert.match(JSON.stringify(report.holds), /Needs review/);
  assert.ok(report.departures.length);
  const all = assembleReport(fixture, { type: "treatments", now });
  assert.equal(all.rows.length, fixture.treatments.length);
  assert.match(JSON.stringify(all.rows), /Administrator/);
  assert.match(JSON.stringify(all.rows), /Lot:/);
});
test("Calving report season, dates, twins, units and ease legend; animal card full retained history", () => {
  const date = fixture.calvings[0].birthDate,
    report = assembleReport(fixture, {
      type: "calvings",
      from: date,
      to: date,
      season: "Fall calves",
      unit: "kg",
      now,
    });
  assert.equal(
    report.rows.length,
    fixture.calvings
      .filter((c) => c.birthDate === date)
      .reduce((n, c) => n + c.calves.length, 0),
  );
  assert.match(report.range, /Fall calves/);
  assert.match(report.legend, /5 abnormal/);
  assert.match(JSON.stringify(report.rows), /kg/);
  const animalId = fixture.animals[0].id,
    card = assembleReport(fixture, { type: "animal", animalId, now });
  assert.equal(card.animal.id, animalId);
  assert.equal(card.holds.length, 1);
  assert.ok(card.rows.some((r) => r.id.startsWith("identifiers:")));
  assert.throws(
    () => assembleReport(fixture, { from: "2026-02-30", now }),
    /valid/,
  );
  assert.throws(
    () =>
      assembleReport(fixture, { from: "2026-10-02", to: "2026-10-01", now }),
    /valid/,
  );
});
test("Report preview is accessible text, footer exact, print isolated with repeated headers and landscape", () => {
  const dom = new JSDOM("<article></article>"),
    root = dom.window.document.querySelector("article"),
    s = structuredClone(fixture);
  s.operation[0].name = "<img src=x onerror=alert(1)>";
  const report = assembleReport(s, { now });
  renderReport(root, report);
  assert.equal(root.querySelector("img"), null);
  assert.equal(root.querySelector("[aria-hidden]"), null);
  assert.equal(
    root.querySelector(".report-print-footer p:last-child").textContent,
    PRINT_FOOTER,
  );
  assert.match(root.textContent, /<img/);
  const css = read("app/styles.css");
  assert.match(css, /@page treatment\s*\{\s*size: landscape/);
  assert.match(css, /table-header-group/);
  assert.match(css, /break-inside: avoid/);
  assert.match(css, /report-print-footer\s*\{\s*position: fixed/);
  assert.match(css, /main > :not\(#ownership\)/);
  assert.equal(SWITCHING_STEPS.length, 5);
  assert.match(SWITCHING_STEPS.join(), /yearly/);
  assert.match(SWITCHING_STEPS.join(), /file:\/\//);
  dom.window.close();
});
test("Reports UI renders working controls, safe previews, imports and offline switching guide", async () => {
  const dom = new JSDOM("<main></main>"),
    root = dom.window.document.querySelector("main");
  const ui = new OwnershipUI(root, {
    repository: () => ({ snapshot: async () => fixture }),
    refresh: async () => {},
    message: () => {},
    advancedRestore: async () => {},
  });
  ui.render(fixture);
  assert.ok(root.querySelector("#report-print-area table"));
  assert.equal(
    root.querySelector("#report-print-area").getAttribute("aria-hidden"),
    null,
  );
  for (const text of [
    "Print / Save as PDF",
    "Preview / apply decisions",
    "Confirm atomic CSV import",
    "Switching away",
    "Full CSV set and manifest",
  ])
    assert.ok(root.textContent.includes(text));
  const print = [...root.querySelectorAll("button")].find(
    (b) => b.textContent === "Print / Save as PDF",
  );
  let printed = false;
  dom.window.print = () => {
    printed = true;
  };
  await print.onclick();
  assert.equal(printed, true);
  dom.window.close();
});
test("Every ordinary entity imports together atomically with exact canonical rows, including reciprocal links", async () => {
  const r = await fresh(),
    stores = STORES.filter(
      (k) => !["operation", "metadata", "revisions"].includes(k),
    );
  const tables = stores.map((store) => ({
    store,
    text: exportCSV(store, fixture[store]),
  }));
  const plan = await previewCSV(r, tables, options);
  assert.equal(plan.ready, true, JSON.stringify(plan.errors));
  await commitCSV(r, plan, { confirmed: true, acknowledgeWarnings: true });
  const s = await r.snapshot();
  for (const k of stores)
    assert.deepEqual(
      [...s[k]].sort((a, b) => a.id.localeCompare(b.id)),
      [...fixture[k]].sort((a, b) => a.id.localeCompare(b.id)),
      k,
    );
  const identical = await previewCSV(r, tables, options);
  assert.equal(identical.ready, true);
  assert.ok(identical.rows.every((r) => r.action === "identical: skip"));
  await commitCSV(r, identical, { confirmed: true, acknowledgeWarnings: true });
  assert.deepEqual(await r.snapshot(), s);
  r.close();
});
test("Historical import counts as new unbacked work despite old record timestamps", async () => {
  const r = await fresh(),
    s = await r.snapshot(),
    m = s.metadata[0],
    confirmed = "2026-10-10T12:00:00.000Z";
  await r.mutate(
    [
      {
        store: "metadata",
        expectedRevision: m.revision,
        record: {
          ...m,
          revision: m.revision + 1,
          updatedAt: confirmed,
          lastUserConfirmedBackupAt: confirmed,
        },
      },
    ],
    { bookkeeping: true },
  );
  const g = {
    ...fixture.groups[0],
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    revision: 1,
  };
  const p = await previewCSV(
    r,
    [{ store: "groups", text: exportCSV("groups", [g]) }],
    options,
  );
  assert.equal(p.ready, true, JSON.stringify(p.errors));
  await commitCSV(r, p, { confirmed: true });
  const reminder = backupReminder(await r.snapshot(), {
    now: "2026-10-17T12:00:00.000Z",
  });
  assert.equal(reminder.unbacked, true);
  assert.equal(reminder.due, true);
  r.close();
});
test("Schema upgrade reminder happens before mutation and can defer with data retained", async () => {
  const factory = new IDBFactory(),
    r = await openRepository({ factory }),
    before = await r.snapshot();
  r.close();
  let called = false;
  const result = await openRepository({
    factory,
    targetVersion: 2,
    steps: {
      2: {
        upgrade: () => {
          throw new Error("must not run");
        },
      },
    },
    onBeforeUpgrade: ({ fromVersion, toVersion, snapshot }) => {
      called = true;
      assert.equal(fromVersion, 1);
      assert.equal(toVersion, 2);
      assert.deepEqual(snapshot, before);
      return false;
    },
  });
  assert.equal(called, true);
  assert.match(result.recovery, /upgrade deferred/);
  assert.equal(result.db.version, 1);
  assert.deepEqual(await result.snapshot(), before);
  result.close();
});
test("CSV mapping decisions retain generated IDs across previews and skip only selected rows", async () => {
  const r = await fresh(),
    tables = [{ store: "animals", text: "farmId\n0001\n0002" }],
    opts = { escaping: "none", now };
  const p = await previewCSV(r, tables, opts),
    generatedIds = Object.fromEntries(
      p.generated.map((g) => [`${g.store}:${g.row}`, g.id]),
    );
  const q = await previewCSV(r, tables, {
    ...opts,
    generatedIds,
    decisions: { [`animals:${p.generated[0].id}`]: { choice: "skip" } },
  });
  assert.equal(q.ready, true);
  assert.equal(q.rows[0].action, "skip new row");
  assert.equal(q.rows[1].record.id, p.generated[1].id);
  await commitCSV(r, q, { confirmed: true });
  assert.deepEqual(
    (await r.snapshot()).animals.map((a) => a.farmId),
    ["0002"],
  );
  r.close();
});

test("Saved-backup confirmation checks the live content inside its write transaction", async () => {
  const r = await fresh(),
    requested = backupContent(await r.snapshot());
  const p = prepareWorkflow(
    await r.snapshot(),
    "animal",
    { farmId: "After download" },
    now,
  );
  await r.mutate(p.changes, p.options);
  await assert.rejects(
    confirmRequestedBackup(r, requested, { now }),
    /Records changed/,
  );
  assert.equal(
    (await r.snapshot()).metadata[0].lastUserConfirmedBackupAt,
    null,
  );
  await confirmRequestedBackup(r, backupContent(await r.snapshot()), { now });
  assert.equal((await r.snapshot()).metadata[0].lastUserConfirmedBackupAt, now);
  r.close();
});
test("Advanced CSV restore rejects histories inconsistent with their current target", async () => {
  const s = structuredClone(fixture),
    audit = s.revisions[0],
    target = s[audit.entityType].find((r) => r.id === audit.entityId);
  target.revision = audit.newValues.revision;
  target.updatedAt = "2026-10-10T10:00:00.000Z";
  const files = exportSet(s, { now }),
    contents = Object.fromEntries(files.map((f) => [f.fileName, f.text]));
  await assert.rejects(
    csvSetBackup(JSON.parse(contents["csv-manifest.json"]), contents),
    /Revision history/,
  );
});
test("Rendered CSV import maps columns, previews errors and commits only after explicit confirmation", async () => {
  const r = await fresh(),
    dom = new JSDOM("<main></main>"),
    root = dom.window.document.querySelector("main"),
    messages = [];
  let refreshed = 0;
  const ui = new OwnershipUI(root, {
    repository: () => r,
    refresh: async () => {
      refreshed++;
    },
    message: (text, error) => messages.push({ text, error }),
    advancedRestore: async () => {},
  });
  ui.render(await r.snapshot());
  const file = root.querySelector("input[type=file]");
  Object.defineProperty(file, "files", {
    value: [
      {
        name: "animals.csv",
        text: async () =>
          'Identifier,Tag,Notes\n00007,001,"<script>bad()</script>"',
      },
    ],
  });
  await file.onchange();
  const select = (label) =>
    [...root.querySelectorAll("label")]
      .find((l) => l.firstChild?.textContent === label)
      ?.querySelector("select");
  const sourceMode = select("Formula protection (explicit choice required)");
  sourceMode.value = "none";
  sourceMode.onchange();
  for (const [source, target] of [
    ["Identifier", "farmId"],
    ["Tag", "visualTag"],
    ["Notes", "notes"],
  ]) {
    const s = select(`Source column: ${source}`);
    s.value = target;
    s.onchange();
  }
  const button = (text) =>
    [...root.querySelectorAll("button")].find((b) => b.textContent === text);
  await button("Preview / apply decisions and validate again").onclick();
  assert.match(root.textContent, /0 errors/);
  assert.equal(root.querySelector("script"), null);
  assert.equal((await r.snapshot()).animals.length, 0);
  await button("Confirm atomic CSV import").onclick();
  assert.match(messages.at(-1).text, /Confirm/);
  assert.equal((await r.snapshot()).animals.length, 0);
  const confirm = [...root.querySelectorAll("label")]
    .find((l) => l.textContent.startsWith("I reviewed every staged row"))
    .querySelector("input");
  confirm.checked = true;
  await button("Confirm atomic CSV import").onclick();
  assert.equal(refreshed, 1);
  assert.equal((await r.snapshot()).animals[0].farmId, "00007");
  assert.equal((await r.snapshot()).animals[0].notes, "<script>bad()</script>");
  for (const url of ui.urls) URL.revokeObjectURL(url);
  r.close();
  dom.window.close();
});
test("Decimal currency import retains precision and string type under explicit comma convention", () => {
  assert.equal(
    decodeCell("123,40", { type: "Decimal" }, { decimal: "comma" }),
    "123.40",
  );
  assert.throws(
    () => decodeCell("1,234,56", { type: "Decimal" }, { decimal: "comma" }),
    /without grouping/,
  );
});
